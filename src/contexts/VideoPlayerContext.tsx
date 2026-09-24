import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAudio } from '@/contexts/AudioContext';
import {
  resolveYouTubeStandaloneVideoStream,
  getCachedVideoStream,
  YouTubeVideoSearchResult,
  StandaloneVideoStreamDetails,
} from '@/services/youtubeVideoSearchService';
import {
  lockLandscapeAsync,
  lockPortraitAsync,
  addOrientationListener,
} from '@/services/orientationManager';

export type VideoPlayerMode = 'hidden' | 'mini' | 'full';

const VIDEO_BUFFER_OPTIONS = {
  preferredForwardBufferDuration: 60, // 60s forward buffer keeps playback completely uninterrupted
  minBufferForPlayback: 2.0, // Buffer 2.0s before initial play / resume to absorb network jitter
  waitsToMinimizeStalling: true, // Auto-buffers & resumes smoothly without stalling
  prioritizeTimeOverSizeThreshold: false,
  maxBufferBytes: 0, // 0 = automatic system-managed memory allocation
};

interface VideoPlayerContextType {
  player: VideoPlayer | null;
  activeVideo: YouTubeVideoSearchResult | null;
  videoStream: StandaloneVideoStreamDetails | null;
  playerMode: VideoPlayerMode;
  isVideoPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoadingStream: boolean;
  isFullscreen: boolean;
  playlist: YouTubeVideoSearchResult[];
  watchVideoViewRef: React.RefObject<VideoView | null>;
  miniVideoViewRef: React.RefObject<VideoView | null>;
  playVideo: (item: YouTubeVideoSearchResult, queue?: YouTubeVideoSearchResult[]) => Promise<void>;
  pauseVideo: () => void;
  resumeVideo: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  collapseToMini: () => void;
  maximizeToFull: () => void;
  closePlayer: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  triggerPiP: () => Promise<void>;
}

const VideoPlayerContext = createContext<VideoPlayerContextType | null>(null);

export const VideoPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isPlaying: isAudioPlaying, pause: pauseBackgroundAudio } = useAudio();

  const [activeVideo, setActiveVideo] = useState<YouTubeVideoSearchResult | null>(null);
  const [videoStream, setVideoStream] = useState<StandaloneVideoStreamDetails | null>(null);
  const [playerMode, setPlayerMode] = useState<VideoPlayerMode>('hidden');
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playlist, setPlaylist] = useState<YouTubeVideoSearchResult[]>([]);

  const appStateRef = useRef(AppState.currentState);
  const hasAdvancedRef = useRef<boolean>(false);
  const watchVideoViewRef = useRef<VideoView | null>(null);
  const miniVideoViewRef = useRef<VideoView | null>(null);

  // Initialize single persistent native player
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
    p.audioMixingMode = 'doNotMix';
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1.0;
    try {
      p.bufferOptions = VIDEO_BUFFER_OPTIONS;
    } catch {}
  });

  // Track AppState for background/active resync
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active' && player) {
        try {
          setCurrentTime(player.currentTime);
        } catch {}
      }
    });
    return () => sub.remove();
  }, [player]);

  // Keep player config synced
  useEffect(() => {
    if (!player) return;
    try {
      player.timeUpdateEventInterval = 1.0;
      player.staysActiveInBackground = true;
      player.showNowPlayingNotification = true;
      player.bufferOptions = VIDEO_BUFFER_OPTIONS;
    } catch {}
  }, [player]);

  // Screen keep-awake when video is playing
  useEffect(() => {
    if (isVideoPlaying) {
      activateKeepAwakeAsync('global_video_player').catch(() => {});
    } else {
      deactivateKeepAwake('global_video_player').catch(() => {});
    }
    return () => {
      deactivateKeepAwake('global_video_player').catch(() => {});
    };
  }, [isVideoPlaying]);

  // When audio songs from any other screen start playing, immediately pause video player
  useEffect(() => {
    if (isAudioPlaying && isVideoPlaying && player) {
      try {
        player.pause();
      } catch {}
    }
  }, [isAudioPlaying, isVideoPlaying, player]);

  // Next / Previous Video implementation
  const nextVideo = useCallback(() => {
    if (!activeVideo || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      playVideo(playlist[currentIndex + 1], playlist);
    }
  }, [activeVideo, playlist]);

  const prevVideo = useCallback(() => {
    if (!activeVideo || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex > 0) {
      playVideo(playlist[currentIndex - 1], playlist);
    } else {
      seekTo(0);
    }
  }, [activeVideo, playlist]);

  // Native player event listeners
  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (payload) => {
      setIsVideoPlaying(payload.isPlaying);
    });

    const subTime = player.addListener('timeUpdate', (payload) => {
      if (appStateRef.current === 'active') {
        setCurrentTime(payload.currentTime);
      }
      const actualDuration =
        activeVideo?.durationSeconds && activeVideo.durationSeconds > 0
          ? activeVideo.durationSeconds
          : player.duration > 0
          ? player.duration
          : 0;
      if (actualDuration > 0) {
        setDuration(actualDuration);
      }
    });

    const subStatus = player.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay') {
        const actualDuration =
          activeVideo?.durationSeconds && activeVideo.durationSeconds > 0
            ? activeVideo.durationSeconds
            : player.duration > 0
            ? player.duration
            : 0;
        if (actualDuration > 0) setDuration(actualDuration);
        player.play();
      }
    });

    const subSourceLoad = player.addListener('sourceLoad', (payload) => {
      if (payload.duration > 0) {
        setDuration(payload.duration);
      }
      player.play();
    });

    // Authoritative end-of-stream advance
    const subEnded = player.addListener('playToEnd', () => {
      setIsVideoPlaying(false);
      if (!hasAdvancedRef.current) {
        hasAdvancedRef.current = true;
        nextVideo();
      }
    });

    return () => {
      subPlaying.remove();
      subTime.remove();
      subStatus.remove();
      subSourceLoad.remove();
      subEnded.remove();
    };
  }, [player, activeVideo, nextVideo]);

  // Sync duration on active video change
  useEffect(() => {
    hasAdvancedRef.current = false;
    if (player && player.duration > 0) {
      setDuration(player.duration);
    } else if (activeVideo?.durationSeconds) {
      setDuration(activeVideo.durationSeconds);
    }
  }, [player, activeVideo]);

  // Play video with cached / live stream resolution
  const playVideo = useCallback(
    async (item: YouTubeVideoSearchResult, queue?: YouTubeVideoSearchResult[]) => {
      if (activeVideo?.videoId === item.videoId && videoStream) {
        setPlayerMode('full');
        if (player && !isVideoPlaying) {
          if (isAudioPlaying) pauseBackgroundAudio();
          player.play();
        }
        return;
      }

      // Stop background music player
      if (isAudioPlaying) {
        pauseBackgroundAudio();
      }

      setActiveVideo(item);
      setPlayerMode('full');
      setCurrentTime(0);
      setDuration(item.durationSeconds || 0);

      if (queue && queue.length > 0) {
        setPlaylist(queue);
      }

      // 1. Instant cache lookup (0ms)
      const cached = getCachedVideoStream(item.videoId);
      if (cached) {
        setVideoStream(cached);
        if (cached.durationSeconds > 0) {
          setDuration(cached.durationSeconds);
        }
        setIsLoadingStream(false);
        if (player) {
          try {
            player.bufferOptions = VIDEO_BUFFER_OPTIONS;
          } catch {}
          player.replace({
            uri: cached.hlsUrl,
            contentType: 'hls',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
              Origin: 'https://www.youtube.com',
              Referer: 'https://www.youtube.com/',
            },
            metadata: {
              title: item.title,
              artist: item.author,
              artwork: item.thumbnail,
            },
          });
          player.play();
        }
        return;
      }

      // 2. Resolve stream
      setIsLoadingStream(true);
      try {
        const streamDetails = await resolveYouTubeStandaloneVideoStream(item.videoId);
        if (streamDetails) {
          setVideoStream(streamDetails);
          if (streamDetails.durationSeconds > 0) {
            setDuration(streamDetails.durationSeconds);
          }
          if (player) {
            try {
              player.bufferOptions = VIDEO_BUFFER_OPTIONS;
            } catch {}
            player.replace({
              uri: streamDetails.hlsUrl,
              contentType: 'hls',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
                Origin: 'https://www.youtube.com',
                Referer: 'https://www.youtube.com/',
              },
              metadata: {
                title: item.title,
                artist: item.author,
                artwork: item.thumbnail,
              },
            });
            player.play();
          }
        }
      } catch (err) {
        console.warn('Failed to resolve video stream:', err);
      } finally {
        setIsLoadingStream(false);
      }
    },
    [activeVideo, videoStream, player, isVideoPlaying, isAudioPlaying, pauseBackgroundAudio]
  );

  const pauseVideo = useCallback(() => {
    if (player) player.pause();
  }, [player]);

  const resumeVideo = useCallback(() => {
    if (player) {
      if (isAudioPlaying) pauseBackgroundAudio();
      player.play();
    }
  }, [player, isAudioPlaying, pauseBackgroundAudio]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    if (isVideoPlaying) {
      player.pause();
    } else {
      if (isAudioPlaying) pauseBackgroundAudio();
      player.play();
    }
  }, [player, isVideoPlaying, isAudioPlaying, pauseBackgroundAudio]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player) return;
      try {
        const maxDur = duration > 0 ? duration : seconds;
        const clamped = Math.max(0, Math.min(seconds, maxDur));
        player.currentTime = clamped;
        setCurrentTime(clamped);
      } catch (err) {
        console.warn('Video seek error:', err);
      }
    },
    [player, duration]
  );

  const collapseToMini = useCallback(() => {
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => {});
    }
    setPlayerMode('mini');
  }, [isFullscreen]);

  const maximizeToFull = useCallback(() => {
    setPlayerMode('full');
  }, []);

  const closePlayer = useCallback(() => {
    if (player) {
      try {
        player.pause();
      } catch {}
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => {});
    }
    setActiveVideo(null);
    setVideoStream(null);
    setPlayerMode('hidden');
  }, [player, isFullscreen]);

  const enterFullscreen = useCallback(async () => {
    await lockLandscapeAsync();
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(async () => {
    await lockPortraitAsync();
    setIsFullscreen(false);
  }, []);

  const triggerPiP = useCallback(async () => {
    try {
      const activeRef = playerMode === 'full' ? watchVideoViewRef.current : miniVideoViewRef.current;
      if (activeRef) {
        await activeRef.startPictureInPicture();
      } else {
        collapseToMini();
      }
    } catch (err) {
      console.warn('PiP start error, falling back to miniplayer:', err);
      collapseToMini();
    }
  }, [playerMode, collapseToMini]);

  // Physical screen orientation listener
  useEffect(() => {
    if (playerMode === 'hidden') return;
    const unsub = addOrientationListener((isLand) => {
      if (isLand && !isFullscreen) {
        enterFullscreen().catch(() => {});
      } else if (!isLand && isFullscreen) {
        exitFullscreen().catch(() => {});
      }
    });
    return () => unsub();
  }, [playerMode, isFullscreen, enterFullscreen, exitFullscreen]);

  const value = useMemo(
    () => ({
      player,
      activeVideo,
      videoStream,
      playerMode,
      isVideoPlaying,
      currentTime,
      duration,
      isLoadingStream,
      isFullscreen,
      playlist,
      watchVideoViewRef,
      miniVideoViewRef,
      playVideo,
      pauseVideo,
      resumeVideo,
      togglePlay,
      seekTo,
      collapseToMini,
      maximizeToFull,
      closePlayer,
      nextVideo,
      prevVideo,
      enterFullscreen,
      exitFullscreen,
      triggerPiP,
    }),
    [
      player,
      activeVideo,
      videoStream,
      playerMode,
      isVideoPlaying,
      currentTime,
      duration,
      isLoadingStream,
      isFullscreen,
      playlist,
      playVideo,
      pauseVideo,
      resumeVideo,
      togglePlay,
      seekTo,
      collapseToMini,
      maximizeToFull,
      closePlayer,
      nextVideo,
      prevVideo,
      enterFullscreen,
      exitFullscreen,
      triggerPiP,
    ]
  );

  return <VideoPlayerContext.Provider value={value}>{children}</VideoPlayerContext.Provider>;
};

export const useVideoPlayerContext = (): VideoPlayerContextType => {
  const context = useContext(VideoPlayerContext);
  if (!context) {
    throw new Error('useVideoPlayerContext must be used within a VideoPlayerProvider');
  }
  return context;
};
