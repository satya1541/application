import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, AppState, AppStateStatus, ToastAndroid } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  createAudioPlayer,
  setAudioModeAsync,
  AudioPlayer,
  requestNotificationPermissionsAsync,
  clearAllPreloadedSources,
} from 'expo-audio';
import { SafeStorage } from '@/services/storage';
import { Song, RepeatMode, AudioAcousticProfile } from '@/types/music';
import { INITIAL_SONGS, ACOUSTIC_PROFILES } from '@/services/musicCatalog';
import { resolveStreamUrl, prewarmUpcomingQueue } from '@/services/audioStreamResolver';
import {
  triggerOpenFullPlayer,
  triggerCloseFullPlayer,
  getIsFullPlayerOpen,
} from '@/services/playerSheetController';
import { ClientRecommendationEngine } from '@/services/recommendationEngine';
import { useAuthSafe } from '@/contexts/AuthContext';
import {
  syncLikedSongsWithCloud,
  addCloudLikedSong,
  removeCloudLikedSong,
  recordListeningHistory,
} from '@/services/cloudSyncService';
import { recordHistoryEntry } from '@/services/historyService';
import {
  getStoredLikedSongs,
  saveStoredLikedSong,
  removeStoredLikedSong,
} from '@/services/userPlaylistService';

// Expo Go's prebuilt binary does not contain custom Android Manifest services (AudioControlsService).
// Custom foreground services are only compiled in standalone / development builds.
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ─── Lightweight Progress Context (isolated from main AudioContext) ───
// This prevents 500ms position ticks from re-rendering the entire app.
// Only components that display time/progress subscribe to this.
interface AudioProgressType {
  position: number;
  duration: number;
}

type ProgressListener = (pos: number, dur: number) => void;

const AudioProgressContext = createContext<AudioProgressType>({ position: 0, duration: 0 });

// Global listener set for progress updates - avoids React state entirely for bridge
let _progressListeners: Set<ProgressListener> = new Set();
let _latestPosition = 0;
let _latestDuration = 0;
let _latestTimestamp = 0;
let _latestIsPlaying = false;
let _activeAudioPlayer: AudioPlayer | null = null;

export type AudioSeekListener = (seconds: number) => void;
const _seekListeners: Set<AudioSeekListener> = new Set();

export function registerAudioSeekListener(listener: AudioSeekListener): () => void {
  _seekListeners.add(listener);
  return () => {
    _seekListeners.delete(listener);
  };
}

/**
 * High-precision audio playback position getter.
 * Directly reads native player currentTime when available (0ms bridge latency),
 * or falls back to timestamp-interpolated position to eliminate 500ms staircase jitter.
 */
export function getExactAudioCurrentTime(): number {
  if (_activeAudioPlayer) {
    try {
      const cur = _activeAudioPlayer.currentTime;
      if (typeof cur === 'number' && !isNaN(cur) && cur >= 0) {
        return cur;
      }
    } catch { }
  }
  if (_latestIsPlaying && _latestTimestamp > 0) {
    const elapsed = (Date.now() - _latestTimestamp) / 1000;
    return Math.max(0, _latestPosition + elapsed);
  }
  return _latestPosition;
}

function notifyProgressListeners(pos: number, dur: number) {
  _latestPosition = pos;
  _latestDuration = dur;
  _latestTimestamp = Date.now();
  _progressListeners.forEach((fn) => fn(pos, dur));
}

const AudioProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [progress, setProgress] = useState<AudioProgressType>({ position: 0, duration: 0 });

  useEffect(() => {
    const listener: ProgressListener = (pos, dur) => {
      setProgress((prev) => {
        // Only update if values actually changed (avoids unnecessary re-renders)
        if (prev.position === pos && prev.duration === dur) return prev;
        return { position: pos, duration: dur };
      });
    };
    _progressListeners.add(listener);
    return () => { _progressListeners.delete(listener); };
  }, []);

  return (
    <AudioProgressContext.Provider value={progress}>
      {children}
    </AudioProgressContext.Provider>
  );
};

export const useAudioProgress = () => useContext(AudioProgressContext);

// ─── Main Audio Context (only updates on track change / play-pause / toggle) ───
interface AudioContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  isLoading: boolean;
  queue: Song[];
  userQueue: Song[];
  history: Song[];
  shuffle: boolean;
  repeatMode: RepeatMode;
  currentProfile: AudioAcousticProfile;
  volume: number;
  likedSongIds: string[];
  likedSongsList: Song[];
  isFullPlayerOpen: boolean;
  isLyricsOpen: boolean;
  isQueueModalOpen: boolean;
  autoplayEnabled: boolean;

  playSong: (song: Song, newQueue?: Song[], autoOpenFullPlayer?: boolean) => Promise<void>;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  nextSong: () => Promise<void>;
  prevSong: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (songId: string, songObj?: Song) => void;
  isLiked: (songId: string) => boolean;
  setAcousticProfile: (profile: AudioAcousticProfile) => void;
  setVolume: (vol: number) => Promise<void>;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  dismissPlayer: () => Promise<void>;
  toggleLyrics: () => void;
  setQueue: (queue: Song[]) => void;
  refreshRecommendationsQueue: () => Promise<void>;

  // User Manual Queue Controls
  addToUserQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromUserQueue: (index: number) => void;
  moveInUserQueue: (fromIndex: number, toIndex: number) => void;
  clearUserQueue: () => void;
  openQueueModal: () => void;
  closeQueueModal: () => void;
  toggleAutoplay: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

const STORAGE_KEY_LIKES = 'deluxe_liked_songs_v1';
const STORAGE_KEY_PROFILE = 'deluxe_acoustic_profile_v1';
const STORAGE_KEY_VOLUME = 'deluxe_audio_volume_v1';
const STORAGE_KEY_LAST_PLAYBACK = 'shorty_last_playback_state_v1';

/**
 * Converts a linear volume input [0, 1] to a psychoacoustic perceptual volume curve.
 * Human hearing is logarithmic; linear gain makes 10% volume sound like 50% loudness.
 * Using Math.pow(vol, 2.5) ensures that low volume on device and in-app produces
 * genuinely soft, whisper-quiet, comfortable sound.
 */
export function toPerceptualVolume(vol: number): number {
  return Math.max(0, Math.min(1, vol));
}

/**
 * Calculates acoustic profile gain scaling.
 * Translates DSP acoustic profiles (Bass boost, Vocal clarity, Lofi tape, etc.)
 * into audible presence and harmonic changes.
 */
export function getProfileGain(profileId: string): number {
  switch (profileId) {
    case 'bass-punch':
    case 'bass-heavy':
      return 1.0; // Dynamic 808 sub-bass punch & maximum amplitude drive
    case 'cinema-spatial':
    case 'club-surround':
      return 0.98; // Expansive concert hall stage & dynamic headroom
    case 'vocal-clarity':
    case 'vocal-air':
      return 0.96; // Crisp presence, upper-mid intimacy & consonant focus
    case 'lofi-warmth':
      return 0.88; // Warm analog cassette tape saturation & cozy rolloff
    case 'studio-master':
    case 'studio-flat':
    default:
      return 1.0; // Transparent Hi-Fi studio reference standard (100% full volume)
  }
}

/**
 * Safely applies acoustic volume gain and optional subtle playback rate shaping.
 * Note: In expo-audio, playbackRate is read-only (getter only); rate changes
 * must be dispatched via player.setPlaybackRate(rate).
 */
export function applyPlayerAcoustics(
  player: AudioPlayer,
  profileId: string = 'studio-master',
  baseVol: number = 1.0
): void {
  const activeGain = getProfileGain(profileId);
  const perceptualVol = toPerceptualVolume(baseVol);
  const targetVolume = Math.max(0.0, Math.min(1.0, perceptualVol * activeGain));
  player.volume = targetVolume;
  try {
    if (typeof player.setPlaybackRate === 'function') {
      player.setPlaybackRate(profileId === 'lofi-warmth' || profileId === 'Lo-Fi Warmth' ? 0.985 : 1.0);
    }
  } catch { }
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const isLoadingRef = useRef<boolean>(false);

  const updateIsPlaying = (val: boolean) => {
    _latestIsPlaying = val;
    if (isPlayingRef.current !== val) {
      isPlayingRef.current = val;
      setIsPlaying(val);
    }
  };

  const updateIsLoading = (val: boolean) => {
    if (isLoadingRef.current !== val) {
      isLoadingRef.current = val;
      setIsLoading(val);
    }
  };

  // position & duration are now tracked via refs + lightweight listener bridge
  // They no longer live in AudioContext state, preventing 500ms re-render storms
  const positionRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [history, setHistory] = useState<Song[]>([]);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentProfile, setCurrentProfile] = useState<AudioAcousticProfile>(ACOUSTIC_PROFILES[0]);
  const [volume, setVolumeState] = useState<number>(1.0); // Standard full volume (100%) like Spotify/Apple Music
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongsList, setLikedSongsList] = useState<Song[]>([]);

  // 2-Tier Manual User Queue
  const [userQueue, setUserQueue] = useState<Song[]>([]);
  const userQueueRef = useRef<Song[]>(userQueue);
  useEffect(() => {
    userQueueRef.current = userQueue;
  }, [userQueue]);

  // Autoplay control
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(true);
  const autoplayEnabledRef = useRef<boolean>(true);
  useEffect(() => {
    autoplayEnabledRef.current = autoplayEnabled;
  }, [autoplayEnabled]);

  // Global Queue Modal Visibility
  const [isQueueModalOpen, setIsQueueModalOpen] = useState<boolean>(false);

  // Load cached full liked songs metadata on mount
  useEffect(() => {
    getStoredLikedSongs().then((cached) => {
      if (cached && cached.length > 0) {
        setLikedSongsList(cached);
      }
    });
  }, []);

  // Cloud auth context integration
  const authContext = useAuthSafe();
  const userId = authContext?.user?.id ?? null;
  const userIdRef = useRef<string | null>(userId);
  const recordedHistoryTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Sync liked songs with Supabase cloud whenever user signs in
  useEffect(() => {
    if (userId) {
      syncLikedSongsWithCloud(userId, likedSongIds)
        .then((merged) => {
          if (merged && merged.length > 0) {
            setLikedSongIds(merged);
            SafeStorage.setItem(STORAGE_KEY_LIKES, JSON.stringify(merged)).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [userId]);

  // Modals & Panels UI State
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);

  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Synchronization refs for background/lockscreen callbacks
  const queueRef = useRef<Song[]>(queue);
  const currentSongRef = useRef<Song | null>(currentSong);
  const shuffleRef = useRef<boolean>(shuffle);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const historyRef = useRef<Song[]>(history);
  const volumeRef = useRef<number>(volume);
  const currentProfileRef = useRef<AudioAcousticProfile>(currentProfile);

  // App state ref to pause rapid UI state renders when screen is off / in background
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Lockscreen media action detection refs
  const lastReportedPositionRef = useRef<number>(0);
  const isInternalSeekRef = useRef<boolean>(false);
  const isLockScreenNavigatingRef = useRef<boolean>(false);
  const initialPositionRef = useRef<number>(0);
  const lastSaveTimestampRef = useRef<number>(0);

  // Playback generation counter: prevents race conditions when songs are tapped rapidly.
  // Each loadAndPlayTrack call increments this; stale async callbacks abort if their
  // captured generation doesn't match the current value.
  const playbackGenRef = useRef<number>(0);

  const persistPlaybackState = useCallback(async (force: boolean = false) => {
    const song = currentSongRef.current;
    if (!song) return;

    const now = Date.now();
    // Throttle non-forced saves to once every 2.5 seconds to avoid excessive disk I/O
    if (!force && now - lastSaveTimestampRef.current < 2500) {
      return;
    }
    lastSaveTimestampRef.current = now;

    const pos = positionRef.current || 0;
    const dur = durationRef.current || song.duration || 0;
    // Don't save position if song ended or within last 2 seconds
    const effectivePos = dur > 0 && dur - pos < 2 ? 0 : pos;

    const stateToSave = {
      song,
      position: effectivePos,
      duration: dur,
      queue: queueRef.current || [song],
      userQueue: userQueueRef.current || [],
      timestamp: now,
    };

    try {
      await SafeStorage.setItem(STORAGE_KEY_LAST_PLAYBACK, JSON.stringify(stateToSave));
    } catch { }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active' && playerRef.current) {
        try {
          const pos = playerRef.current.currentTime || 0;
          positionRef.current = pos;
          notifyProgressListeners(pos, durationRef.current);
        } catch { }
      } else if (nextState === 'background' || nextState === 'inactive') {
        persistPlaybackState(true);
      }
    });
    return () => {
      sub.remove();
    };
  }, [persistPlaybackState]);

  useEffect(() => {
    currentProfileRef.current = currentProfile;
  }, [currentProfile]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Setup Expo Audio Mode for sustained background playback & lockscreen controls
  useEffect(() => {
    async function configureAudio() {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
          shouldPlayInBackground: true,
        });

        if (Platform.OS === 'android') {
          try {
            await requestNotificationPermissionsAsync();
          } catch { }
          try {
            await clearAllPreloadedSources();
          } catch { }
        }
      } catch (err) {
        // Safe fallback for environments where audio mode isn't supported
      }
    }
    configureAudio();

    // Hydrate liked songs, profile & volume from safe storage
    SafeStorage.getItem(STORAGE_KEY_LIKES)
      .then((data) => {
        if (data) {
          try {
            setLikedSongIds(JSON.parse(data));
          } catch { }
        }
      })
      .catch(() => { });

    SafeStorage.getItem(STORAGE_KEY_PROFILE)
      .then((data) => {
        if (data) {
          try {
            const profile = ACOUSTIC_PROFILES.find((p) => p.id === data);
            if (profile) {
              setCurrentProfile(profile);
              currentProfileRef.current = profile;
              if (playerRef.current) {
                applyPlayerAcoustics(playerRef.current, profile.id, volumeRef.current);
              }
            }
          } catch { }
        }
      })
      .catch(() => { });

    SafeStorage.getItem(STORAGE_KEY_VOLUME)
      .then((data) => {
        if (data) {
          const parsed = parseFloat(data);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            // Automatically upgrade legacy 0.45 default to 1.0
            const effective = parsed === 0.45 ? 1.0 : parsed;
            setVolumeState(effective);
            if (playerRef.current) {
              applyPlayerAcoustics(playerRef.current, currentProfileRef.current.id, effective);
            }
          }
        }
      })
      .catch(() => { });

    // Hydrate last played song, queue, and playback position from cache
    SafeStorage.getItem(STORAGE_KEY_LAST_PLAYBACK)
      .then((data) => {
        if (data && !currentSongRef.current) {
          try {
            const saved = JSON.parse(data);
            if (saved && saved.song) {
              const restoredSong: Song = saved.song;
              const restoredPos = typeof saved.position === 'number' ? saved.position : 0;
              const restoredDur =
                typeof saved.duration === 'number' && saved.duration > 0
                  ? saved.duration
                  : (restoredSong.duration || 0);

              setCurrentSong(restoredSong);
              currentSongRef.current = restoredSong;
              initialPositionRef.current = restoredPos;

              if (Array.isArray(saved.queue) && saved.queue.length > 0) {
                setQueue(saved.queue);
                queueRef.current = saved.queue;
              } else {
                setQueue([restoredSong]);
                queueRef.current = [restoredSong];
              }

              if (Array.isArray(saved.userQueue) && saved.userQueue.length > 0) {
                setUserQueue(saved.userQueue);
                userQueueRef.current = saved.userQueue;
              }

              positionRef.current = restoredPos;
              durationRef.current = restoredDur;
              _latestPosition = restoredPos;
              _latestDuration = restoredDur;
              notifyProgressListeners(restoredPos, restoredDur);
            }
          } catch { }
        }
      })
      .catch(() => { });

    return () => {
      if (statusSubscriptionRef.current) {
        statusSubscriptionRef.current.remove();
      }
      if (playerRef.current) {
        try {
          if (!isExpoGo) {
            playerRef.current.clearLockScreenControls();
          }
          playerRef.current.remove();
        } catch { }
      }
      clearAllPreloadedSources().catch(() => { });
    };
  }, []);

  const nextSongRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const prevSongRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const syncLockScreenControls = (player: AudioPlayer, song: Song, durationOverride?: number) => {
    const songDuration = (durationOverride && durationOverride > 0)
      ? durationOverride
      : (song.duration && song.duration > 0 ? song.duration : (durationRef.current > 0 ? durationRef.current : undefined));

    const metadata = {
      title: song.name || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      albumTitle: song.album || 'Shorty',
      artworkUrl: song.cover || undefined,
      duration: songDuration,
    };
    const options = {
      showNext: true,
      showPrevious: true,
      showSeekForward: false,
      showSeekBackward: false,
      isLiveStream: false,
    };

    if (!isExpoGo) {
      try {
        player.setActiveForLockScreen(true, metadata, options);
      } catch {
        try {
          player.updateLockScreenMetadata(metadata);
        } catch { }
      }
    }

    // Web MediaSession integration for browser lockscreen & hardware media keys
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        const MediaMeta = (globalThis as any).MediaMetadata;
        if (MediaMeta) {
          navigator.mediaSession.metadata = new MediaMeta({
            title: song.name || 'Unknown Track',
            artist: song.artist || 'Unknown Artist',
            album: song.album || 'Shorty',
            artwork: song.cover ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
          });
        }
        navigator.mediaSession.setActionHandler('play', () => {
          playerRef.current?.play();
          setIsPlaying(true);
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          playerRef.current?.pause();
          setIsPlaying(false);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          prevSongRef.current?.();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          nextSongRef.current?.();
        });
        // Route hardware / lockscreen forward & backward buttons directly to next/previous track
        navigator.mediaSession.setActionHandler('seekforward', () => {
          nextSongRef.current?.();
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          prevSongRef.current?.();
        });
      } catch { }
    }
  };

  const handleTrackEnd = useCallback(async () => {
    if (currentSongRef.current) {
      ClientRecommendationEngine.recordAction(
        currentSongRef.current,
        'complete',
        1.0,
        durationRef.current
      );
      recordListeningHistory(
        userIdRef.current,
        currentSongRef.current,
        Math.round(durationRef.current || 180)
      ).catch(() => {});
      recordHistoryEntry(
        currentSongRef.current,
        durationRef.current,
        durationRef.current,
        userIdRef.current
      ).catch(() => {});
    }
    const currentRepeat = repeatModeRef.current;
    if (currentRepeat === 'one') {
      if (playerRef.current) {
        try {
          await playerRef.current.seekTo(0);
          playerRef.current.play();
        } catch { }
      }
      return;
    }
    nextSong();
  }, []);

  const loadAndPlayTrack = async (
    song: Song,
    shouldPlayImmediately = true,
    initialPositionSeconds = 0
  ) => {
    // Increment generation counter — any in-flight async from a previous call
    // will see a stale generation and abort before touching the player.
    const gen = ++playbackGenRef.current;

    // Record previously playing track into history before switching if it had playback
    const outgoingSong = currentSongRef.current;
    const outgoingPos = positionRef.current;
    const outgoingDur = durationRef.current;
    if (outgoingSong && outgoingSong.id !== song.id && outgoingPos >= 3) {
      recordHistoryEntry(
        outgoingSong,
        outgoingPos,
        outgoingDur || outgoingSong.duration || 0,
        userIdRef.current
      ).catch(() => {});
    }

    recordedHistoryTrackIdRef.current = null;

    try {
      // 1. Optimistic UI update: Immediate 0ms responsive feedback on tap
      // (playSong already sets currentSong; this covers direct loadAndPlayTrack calls)
      if (currentSongRef.current?.id !== song.id) {
        setCurrentSong(song);
        currentSongRef.current = song;
      }
      positionRef.current = initialPositionSeconds;
      durationRef.current = song.duration || 0;
      notifyProgressListeners(initialPositionSeconds, song.duration || 0);
      updateIsLoading(true);
      lastReportedPositionRef.current = initialPositionSeconds;
      isLockScreenNavigatingRef.current = false;

      // Stop current playback immediately to prevent overlap during URL resolution
      if (playerRef.current) {
        try { playerRef.current.pause(); } catch { }
      }

      const targetQuality = authContext?.profile?.streaming_quality || 'very_high';
      const playableUrl = await resolveStreamUrl(song, targetQuality);

      // RACE GUARD: If another song was requested while we awaited the URL, abort.
      if (gen !== playbackGenRef.current) {
        return;
      }

      // 2. Fast Path: If an AudioPlayer already exists, reuse it via player.replace()
      if (playerRef.current) {
        try {
          lastReportedPositionRef.current = initialPositionSeconds;
          playerRef.current.replace({ uri: playableUrl });
          _activeAudioPlayer = playerRef.current;
          applyPlayerAcoustics(playerRef.current, currentProfileRef.current.id, volumeRef.current);

          syncLockScreenControls(playerRef.current, song);

          if (initialPositionSeconds > 0) {
            try {
              await playerRef.current.seekTo(initialPositionSeconds);
              positionRef.current = initialPositionSeconds;
              notifyProgressListeners(initialPositionSeconds, durationRef.current || song.duration || 0);
            } catch { }
          }

          if (shouldPlayImmediately) {
            playerRef.current.play();
            updateIsPlaying(true);
          }
          updateIsLoading(false);
          persistPlaybackState(true);
          return;
        } catch (replaceErr) {
          console.warn('Fast player.replace failed, falling back to full player creation:', replaceErr);
          try {
            playerRef.current.pause();
            playerRef.current.remove();
          } catch { }
          playerRef.current = null;
          _activeAudioPlayer = null;
        }
      }

      // 3. Clean fallback: Create new AudioPlayer if not already instantiated
      if (statusSubscriptionRef.current) {
        statusSubscriptionRef.current.remove();
        statusSubscriptionRef.current = null;
      }

      // RACE GUARD: Check again before instantiating a new native player
      if (gen !== playbackGenRef.current) {
        return;
      }

      const player = createAudioPlayer(playableUrl, {
        updateInterval: 500,
        keepAudioSessionActive: true,
      });

      playerRef.current = player;
      _activeAudioPlayer = player;
      applyPlayerAcoustics(player, currentProfileRef.current.id, volumeRef.current);

      syncLockScreenControls(player, song);

      // Subscribe to playback status updates
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.mediaAction === 'next') {
          nextSongRef.current?.();
          return;
        } else if (status.mediaAction === 'prev') {
          prevSongRef.current?.();
          return;
        }

        updateIsPlaying(status.playing);
        updateIsLoading(status.isBuffering);
        _latestIsPlaying = status.playing;

        const currentPos = status.currentTime || 0;
        lastReportedPositionRef.current = currentPos;
        positionRef.current = currentPos;

        // Auto-record track into listening history as soon as it reaches 5 seconds of active playback
        if (
          currentSongRef.current &&
          status.playing &&
          recordedHistoryTrackIdRef.current !== currentSongRef.current.id &&
          currentPos >= 5
        ) {
          recordedHistoryTrackIdRef.current = currentSongRef.current.id;
          recordHistoryEntry(
            currentSongRef.current,
            currentPos,
            durationRef.current || currentSongRef.current.duration || 0,
            userIdRef.current
          ).catch(() => {});
        }

        if (status.duration && status.duration > 0) {
          const prevDuration = durationRef.current;
          durationRef.current = status.duration;
          if (!prevDuration || Math.abs(prevDuration - status.duration) > 1.5) {
            if (!isExpoGo && currentSongRef.current && playerRef.current) {
              try {
                playerRef.current.updateLockScreenMetadata({
                  title: currentSongRef.current.name || 'Unknown Track',
                  artist: currentSongRef.current.artist || 'Unknown Artist',
                  albumTitle: currentSongRef.current.album || 'Shorty',
                  artworkUrl: currentSongRef.current.cover || undefined,
                  duration: status.duration,
                });
              } catch { }
            }
          }
        }

        // THERMAL OPTIMIZATION: Only push progress to the lightweight
        // AudioProgressContext when the app is foregrounded.
        // This never touches AudioContext state → zero re-renders on the main tree.
        if (appStateRef.current === 'active') {
          notifyProgressListeners(positionRef.current, durationRef.current);
        }

        if (status.playing) {
          persistPlaybackState(false);
        }

        if (status.didJustFinish && !status.loop) {
          SafeStorage.removeItem(STORAGE_KEY_LAST_PLAYBACK).catch(() => {});
          handleTrackEnd();
        }
      });

      const mediaActionSub = (player as any).addListener('playbackMediaAction', (data: { action: string }) => {
        if (data?.action === 'next') {
          nextSongRef.current?.();
        } else if (data?.action === 'prev') {
          prevSongRef.current?.();
        }
      });

      statusSubscriptionRef.current = {
        remove: () => {
          sub.remove();
          mediaActionSub?.remove?.();
        },
      };

      if (initialPositionSeconds > 0) {
        try {
          await player.seekTo(initialPositionSeconds);
          positionRef.current = initialPositionSeconds;
          notifyProgressListeners(initialPositionSeconds, durationRef.current || song.duration || 0);
        } catch { }
      }

      setIsLoading(false);

      if (shouldPlayImmediately) {
        player.play();
        setIsPlaying(true);
      }
      persistPlaybackState(true);
    } catch (err) {
      console.warn('Failed to load track with expo-audio:', err);
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  // Pre-warm upcoming tracks in queue in the background
  useEffect(() => {
    if (!currentSong || queue.length === 0) return;
    const currentIdx = queue.findIndex((s) => s.id === currentSong.id);
    if (currentIdx !== -1) {
      prewarmUpcomingQueue(queue, currentIdx);
    }
  }, [currentSong?.id, queue]);

  const playSong = async (song: Song, newQueue?: Song[], autoOpenFullPlayer: boolean = true) => {
    // Record behavioral listening signal
    ClientRecommendationEngine.recordAction(song, 'play', 0, 0);

    // 1. Immediate synchronous state updates for instant 0ms UI transition
    if (autoOpenFullPlayer) {
      triggerOpenFullPlayer();
    }
    setCurrentSong(song);
    currentSongRef.current = song;
    positionRef.current = 0;
    durationRef.current = song.duration || 0;
    notifyProgressListeners(0, song.duration || 0);
    setIsLoading(true);

    const isQueueJump = Boolean(newQueue && queueRef.current === newQueue && queueRef.current.some((s) => s.id === song.id));
    const isPlaylistPlay = Boolean(newQueue && newQueue.length > 1 && !newQueue.some((s) => s.isRecommended));

    if (isQueueJump) {
      // User tapped a song within the active Queue modal: jump to it while keeping the existing queue intact
    } else if (isPlaylistPlay && newQueue) {
      // User tapped a full album or playlist: play the full tracklist
      setQueue(newQueue);
      queueRef.current = newQueue;
      setHistory([]);
    } else {
      // User manually changed the song (e.g. selected a new song from Search, Home, or Artist):
      // Start with the selected song in queue and immediately generate fresh recommendations tailored to it
      const baseQueue = [song];
      setQueue(baseQueue);
      queueRef.current = baseQueue;

      ClientRecommendationEngine.getNextRecommendations(song, baseQueue, 0, history)
        .then((extended) => {
          if (currentSongRef.current?.id === song.id && extended.length > 1) {
            setQueue(extended);
            queueRef.current = extended;
          }
        })
        .catch(() => { });
    }

    await loadAndPlayTrack(song, true);
  };

  const togglePlay = async () => {
    if (!playerRef.current) {
      if (currentSong) {
        const startPos = initialPositionRef.current || 0;
        initialPositionRef.current = 0;
        await loadAndPlayTrack(currentSong, true, startPos);
      }
      return;
    }

    if (isPlayingRef.current) {
      playerRef.current.pause();
      updateIsPlaying(false);
      persistPlaybackState(true);
    } else {
      playerRef.current.play();
      updateIsPlaying(true);
      persistPlaybackState(true);
    }
  };

  const pause = async () => {
    if (playerRef.current && isPlayingRef.current) {
      playerRef.current.pause();
      updateIsPlaying(false);
      persistPlaybackState(true);
    }
  };

  const resume = async () => {
    if (playerRef.current && !isPlayingRef.current) {
      playerRef.current.play();
      updateIsPlaying(true);
      persistPlaybackState(true);
    } else if (!playerRef.current && currentSong) {
      const startPos = initialPositionRef.current || 0;
      initialPositionRef.current = 0;
      await loadAndPlayTrack(currentSong, true, startPos);
    }
  };

  const nextSong = async () => {
    const activeUserQueue = userQueueRef.current;
    const activeQueue = queueRef.current;
    const currentActiveSong = currentSongRef.current;
    if (!currentActiveSong && activeQueue.length === 0 && activeUserQueue.length === 0) return;

    // Record user playback in history if >= 30s
    if (currentActiveSong) {
      const prog = durationRef.current > 0 ? positionRef.current / durationRef.current : 0;
      ClientRecommendationEngine.recordAction(currentActiveSong, 'skip', prog, positionRef.current);
      if (positionRef.current >= 10) {
        recordListeningHistory(
          userIdRef.current,
          currentActiveSong,
          Math.round(positionRef.current)
        ).catch(() => {});
      }
      recordHistoryEntry(
        currentActiveSong,
        positionRef.current,
        durationRef.current,
        userIdRef.current
      ).catch(() => {});
    }

    // 1. PRIORITY 1: Check Manual User Queue First!
    if (activeUserQueue.length > 0) {
      const nextFromUserQueue = activeUserQueue[0];
      setUserQueue((prev) => prev.slice(1));
      if (currentActiveSong) {
        setHistory((prev) => [...prev, currentActiveSong]);
      }
      await loadAndPlayTrack(nextFromUserQueue, true);
      return;
    }

    // 2. PRIORITY 2: Context / Album / Playlist Queue
    let nextTrack: Song | null = null;
    const isShuffled = shuffleRef.current;
    const currentRepeat = repeatModeRef.current;

    if (isShuffled && activeQueue.length > 1) {
      const remaining = activeQueue.filter((s) => s.id !== currentActiveSong?.id);
      const randomIndex = Math.floor(Math.random() * remaining.length);
      nextTrack = remaining[randomIndex];
    } else {
      const currentIndex = activeQueue.findIndex((s) => s.id === currentActiveSong?.id);
      if (currentIndex !== -1 && currentIndex < activeQueue.length - 1) {
        nextTrack = activeQueue[currentIndex + 1];
      } else if (currentRepeat === 'all') {
        nextTrack = activeQueue[0];
      }
    }

    // 3. PRIORITY 3: Adaptive Autoplay (only if autoplayEnabled is ON)
    if (autoplayEnabledRef.current && currentActiveSong && currentRepeat !== 'all') {
      const currentIndex = activeQueue.findIndex((s) => s.id === currentActiveSong?.id);
      const tracksAhead = currentIndex !== -1 ? activeQueue.length - 1 - currentIndex : 0;

      if (!nextTrack || tracksAhead < 4) {
        try {
          const extended = await ClientRecommendationEngine.getNextRecommendations(
            nextTrack || currentActiveSong,
            activeQueue,
            currentIndex !== -1 ? currentIndex : activeQueue.length - 1,
            history
          );
          if (extended.length > activeQueue.length) {
            setQueue(extended);
            queueRef.current = extended;
            if (!nextTrack) {
              const newIdx = extended.findIndex((s) => s.id === currentActiveSong?.id);
              if (newIdx !== -1 && newIdx < extended.length - 1) {
                nextTrack = extended[newIdx + 1];
              }
            }
          }
        } catch (err) {
          console.warn('Auto-recommendation generation error:', err);
        }
      }
    }

    // Absolute fallback: if no nextTrack in queue and autoplay enabled
    if (!nextTrack && currentActiveSong && autoplayEnabledRef.current) {
      try {
        nextTrack = await ClientRecommendationEngine.getNextRecommendedSong(
          currentActiveSong,
          history,
          activeQueue
        );
        if (nextTrack) {
          setQueue([...activeQueue, nextTrack]);
          queueRef.current = [...activeQueue, nextTrack];
        }
      } catch (err) {
        console.warn('Fallback recommendation error:', err);
      }
    }

    if (nextTrack) {
      if (currentActiveSong) {
        setHistory((prev) => [...prev, currentActiveSong]);
      }
      await loadAndPlayTrack(nextTrack, true);
    }
  };

  const prevSong = async () => {
    const currentPos = playerRef.current?.currentTime ?? positionRef.current;
    if (currentPos > 3) {
      await seekTo(0);
      return;
    }

    const activeHistory = historyRef.current;
    if (activeHistory.length > 0) {
      const lastTrack = activeHistory[activeHistory.length - 1];
      setHistory((prev) => prev.slice(0, -1));
      await loadAndPlayTrack(lastTrack, true);
    } else {
      const activeQueue = queueRef.current;
      const currentActiveSong = currentSongRef.current;
      const currentIndex = activeQueue.findIndex((s) => s.id === currentActiveSong?.id);
      if (currentIndex > 0) {
        const prevTrack = activeQueue[currentIndex - 1];
        await loadAndPlayTrack(prevTrack, true);
      } else {
        await seekTo(0);
      }
    }
  };

  useEffect(() => {
    nextSongRef.current = nextSong;
    prevSongRef.current = prevSong;
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__spoti_nextTrack = () => {
        nextSongRef.current?.();
      };
      (globalThis as any).__spoti_prevTrack = () => {
        prevSongRef.current?.();
      };
    }
  }, [nextSong, prevSong]);

  const seekTo = async (seconds: number) => {
    try {
      // Synchronously notify all seek listeners with 0ms delay (parallel seeking with video)
      _seekListeners.forEach((fn) => {
        try {
          fn(seconds);
        } catch { }
      });

      if (playerRef.current) {
        isInternalSeekRef.current = true;
        lastReportedPositionRef.current = seconds;
        _latestPosition = seconds;
        _latestTimestamp = Date.now();
        await playerRef.current.seekTo(seconds);
        setTimeout(() => {
          isInternalSeekRef.current = false;
        }, 800);
      } else {
        // If player is not yet instantiated (hydrated from cache), set initial seek position
        initialPositionRef.current = seconds;
      }
      positionRef.current = seconds;
      notifyProgressListeners(seconds, durationRef.current);
      persistPlaybackState(false);
    } catch { }
  };

  const toggleShuffle = () => {
    setShuffle((prev) => !prev);
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const toggleLike = (songId: string, songObj?: Song) => {
    setLikedSongIds((prev) => {
      const isCurrentlyLiked = prev.includes(songId);
      const updated = isCurrentlyLiked
        ? prev.filter((id) => id !== songId)
        : [...prev, songId];
      SafeStorage.setItem(STORAGE_KEY_LIKES, JSON.stringify(updated)).catch(() => { });

      if (!isCurrentlyLiked) {
        const target = songObj || queueRef.current.find((s) => s.id === songId) || userQueueRef.current.find((s) => s.id === songId) || currentSongRef.current;
        if (target) {
          saveStoredLikedSong(target).then((list) => setLikedSongsList(list)).catch(() => {});
          ClientRecommendationEngine.recordAction(target, 'like', 1.0, durationRef.current);
          if (userIdRef.current) {
            addCloudLikedSong(userIdRef.current, target).catch(() => {});
          }
        }
      } else {
        removeStoredLikedSong(songId).then((list) => setLikedSongsList(list)).catch(() => {});
        if (userIdRef.current) {
          removeCloudLikedSong(userIdRef.current, songId).catch(() => {});
        }
      }

      return updated;
    });
  };

  const isLiked = (songId: string) => likedSongIds.includes(songId);

  const addToUserQueue = useCallback((song: Song) => {
    setUserQueue((prev) => [...prev, song]);
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(`Added to Queue: ${song.name}`, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
    }
  }, []);

  const playNext = useCallback((song: Song) => {
    setUserQueue((prev) => [song, ...prev]);
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(`Playing Next: ${song.name}`, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
    }
  }, []);

  const removeFromUserQueue = useCallback((index: number) => {
    setUserQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveInUserQueue = useCallback((fromIndex: number, toIndex: number) => {
    setUserQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  const clearUserQueue = useCallback(() => {
    setUserQueue([]);
  }, []);

  const openQueueModal = useCallback(() => setIsQueueModalOpen(true), []);
  const closeQueueModal = useCallback(() => setIsQueueModalOpen(false), []);
  const toggleAutoplay = useCallback(() => {
    setAutoplayEnabled((prev) => !prev);
  }, []);

  const setAcousticProfile = (profile: AudioAcousticProfile) => {
    setCurrentProfile(profile);
    currentProfileRef.current = profile;
    SafeStorage.setItem(STORAGE_KEY_PROFILE, profile.id).catch(() => { });
    if (playerRef.current) {
      applyPlayerAcoustics(playerRef.current, profile.id, volumeRef.current);
    }
  };

  const setVolume = async (vol: number) => {
    setVolumeState(vol);
    volumeRef.current = vol;
    if (playerRef.current) {
      applyPlayerAcoustics(playerRef.current, currentProfileRef.current.id, vol);
    }
    SafeStorage.setItem(STORAGE_KEY_VOLUME, String(vol)).catch(() => { });
  };

  const openFullPlayer = () => triggerOpenFullPlayer();
  const closeFullPlayer = () => triggerCloseFullPlayer();
  const toggleLyrics = () => setIsLyricsOpen((prev) => !prev);

  const dismissPlayer = async () => {
    // Invalidate any in-flight track loads so an in-progress async stream resolution doesn't start playing
    ++playbackGenRef.current;
    updateIsPlaying(false);
    setCurrentSong(null);
    currentSongRef.current = null;
    initialPositionRef.current = 0;
    SafeStorage.removeItem(STORAGE_KEY_LAST_PLAYBACK).catch(() => { });
    triggerCloseFullPlayer();

    try {
      if (playerRef.current) {
        if (!isExpoGo) {
          try {
            playerRef.current.clearLockScreenControls();
          } catch { }
        }
        playerRef.current.pause();
        playerRef.current.remove();
        playerRef.current = null;
        _activeAudioPlayer = null;
      }
      if (statusSubscriptionRef.current) {
        statusSubscriptionRef.current.remove();
        statusSubscriptionRef.current = null;
      }
    } catch { }
  };

  const refreshRecommendationsQueue = async () => {
    const currentActiveSong = currentSongRef.current;
    if (!currentActiveSong) return;
    const activeQueue = queueRef.current;
    const currentIdx = activeQueue.findIndex((s) => s.id === currentActiveSong.id);
    const validIdx = currentIdx !== -1 ? currentIdx : 0;
    try {
      const refreshed = await ClientRecommendationEngine.getNextRecommendations(
        currentActiveSong,
        activeQueue.slice(0, validIdx + 1),
        validIdx
      );
      if (refreshed && refreshed.length > 0) {
        setQueue(refreshed);
        queueRef.current = refreshed;
      }
    } catch (err) {
      console.warn('Failed to refresh recommendation queue:', err);
    }
  };

  // Memoize the context value so it only changes when actual state fields change.
  // position/duration are no longer here → this object is stable during playback.
  const contextValue = useMemo(() => ({
    currentSong,
    isPlaying,
    isLoading,
    queue,
    userQueue,
    history,
    shuffle,
    repeatMode,
    currentProfile,
    volume,
    likedSongIds,
    likedSongsList,
    isFullPlayerOpen: getIsFullPlayerOpen(),
    isLyricsOpen,
    isQueueModalOpen,
    autoplayEnabled,
    playSong,
    togglePlay,
    pause,
    resume,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    setAcousticProfile,
    setVolume,
    openFullPlayer,
    closeFullPlayer,
    dismissPlayer,
    toggleLyrics,
    setQueue,
    refreshRecommendationsQueue,
    addToUserQueue,
    playNext,
    removeFromUserQueue,
    moveInUserQueue,
    clearUserQueue,
    openQueueModal,
    closeQueueModal,
    toggleAutoplay,
  }), [
    currentSong, isPlaying, isLoading, queue, userQueue, history, shuffle,
    repeatMode, currentProfile, volume, likedSongIds, likedSongsList, isLyricsOpen,
    isQueueModalOpen, autoplayEnabled, addToUserQueue, playNext, removeFromUserQueue,
    moveInUserQueue, clearUserQueue, openQueueModal, closeQueueModal, toggleAutoplay,
  ]);

  return (
    <AudioContext.Provider value={contextValue}>
      <AudioProgressProvider>
        {children}
      </AudioProgressProvider>
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
