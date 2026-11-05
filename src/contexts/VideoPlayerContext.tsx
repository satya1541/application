import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { AppState, Platform, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAudio } from '@/contexts/AudioContext';
import {
  resolveYouTubeStandaloneVideoStream,
  getCachedVideoStream,
  fetchRelatedYouTubeVideos,
  fetchWatchNextDetails,
  YouTubeWatchNextDetails,
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
  preferredForwardBufferDuration: 18.0, // 18s provides rock-solid buffer against jitter while allowing cellular modem / WiFi to enter low-power sleep states
  minBufferForPlayback: 1.5, // 1.5s quick initial startup
  waitsToMinimizeStalling: true, // Auto-buffers & resumes smoothly without stalling
  prioritizeTimeOverSizeThreshold: true, // Strict time bound prevents memory bloating & thermal accumulation
  maxBufferBytes: 25 * 1024 * 1024, // 25 MB max buffer ceiling eliminates memory/VPU thermal stress
};

export interface VideoProgressType {
  currentTime: number;
  duration: number;
}

const VideoProgressContext = createContext<VideoProgressType>({ currentTime: 0, duration: 0 });

export const useVideoProgress = (): VideoProgressType => {
  return useContext(VideoProgressContext);
};

interface VideoPlayerContextType {
  player: VideoPlayer | null;
  activeVideo: YouTubeVideoSearchResult | null;
  videoStream: StandaloneVideoStreamDetails | null;
  playerMode: VideoPlayerMode;
  isVideoPlaying: boolean;
  duration: number;
  isLoadingStream: boolean;
  isFullscreen: boolean;
  playlist: YouTubeVideoSearchResult[];
  relatedVideos: YouTubeVideoSearchResult[];
  isLoadingRelated: boolean;
  activeChannelMeta: {
    channelTitle?: string;
    channelAvatar?: string;
    subscriberCount?: string;
    channelId?: string;
  } | null;
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
  handlePiPStart: () => void;
  handlePiPStop: () => void;
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
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState<boolean>(false);
  const [activeChannelMeta, setActiveChannelMeta] = useState<{
    channelTitle?: string;
    channelAvatar?: string;
    subscriberCount?: string;
    channelId?: string;
  } | null>(null);

  const appStateRef = useRef(AppState.currentState);
  const hasAdvancedRef = useRef<boolean>(false);
  const userExitedFullscreenRef = useRef<boolean>(false);
  const watchVideoViewRef = useRef<VideoView | null>(null);
  const miniVideoViewRef = useRef<VideoView | null>(null);
  const isPiPActiveRef = useRef<boolean>(false);
  const pipExitCooldownRef = useRef<boolean>(false);

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
    } catch { }
  });

  // Track AppState for background/active resync and PiP restore
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        if (player) {
          try {
            setCurrentTime(player.currentTime);
          } catch { }
        }
        if (isPiPActiveRef.current) {
          isPiPActiveRef.current = false;
          pipExitCooldownRef.current = true;
          setTimeout(() => {
            pipExitCooldownRef.current = false;
          }, 600);
          setIsFullscreen(false);
          lockPortraitAsync().catch(() => { });
          setPlayerMode('full');
        }
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
    } catch { }
  }, [player]);

  // Screen keep-awake when video is actively playing in full watch view only
  useEffect(() => {
    if (isVideoPlaying && playerMode === 'full') {
      activateKeepAwakeAsync('global_video_player').catch(() => { });
    } else {
      deactivateKeepAwake('global_video_player').catch(() => { });
    }
    return () => {
      deactivateKeepAwake('global_video_player').catch(() => { });
    };
  }, [isVideoPlaying, playerMode]);

  // When audio songs from any other screen start playing, immediately pause video player
  useEffect(() => {
    if (isAudioPlaying && isVideoPlaying && player) {
      try {
        player.pause();
      } catch { }
    }
  }, [isAudioPlaying, isVideoPlaying, player]);

  const nextVideoRef = useRef<() => void>(() => { });

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
        nextVideoRef.current();
      }
    });

    return () => {
      subPlaying.remove();
      subTime.remove();
      subStatus.remove();
      subSourceLoad.remove();
      subEnded.remove();
    };
  }, [player, activeVideo]);

  // Sync duration on active video change
  useEffect(() => {
    hasAdvancedRef.current = false;
    if (player && player.duration > 0) {
      setDuration(player.duration);
    } else if (activeVideo?.durationSeconds) {
      setDuration(activeVideo.durationSeconds);
    }
  }, [player, activeVideo]);

  // Automatically fetch genuine YouTube Channel Details & Up Next recommendations when video changes
  useEffect(() => {
    if (!activeVideo?.videoId) {
      setRelatedVideos([]);
      setActiveChannelMeta(null);
      setIsLoadingRelated(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingRelated(true);

    fetchWatchNextDetails(activeVideo.videoId)
      .then((details) => {
        if (!isCancelled) {
          if (details.channelAvatar || details.channelTitle || details.subscriberCount) {
            setActiveChannelMeta({
              channelTitle: details.channelTitle,
              channelAvatar: details.channelAvatar,
              subscriberCount: details.subscriberCount,
              channelId: details.channelId,
            });
          }
          if (details.relatedVideos && details.relatedVideos.length > 0) {
            setRelatedVideos(details.relatedVideos);
          } else {
            setRelatedVideos(playlist.filter((v) => v.videoId !== activeVideo.videoId));
          }
          setIsLoadingRelated(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRelatedVideos(playlist.filter((v) => v.videoId !== activeVideo.videoId));
          setIsLoadingRelated(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeVideo?.videoId]);

  // Play video with cached / live stream resolution
  const playVideo = useCallback(
    async (item: YouTubeVideoSearchResult, queue?: YouTubeVideoSearchResult[]) => {
      if (activeVideo?.videoId === item.videoId && videoStream) {
        setPlayerMode('full');
        const { width: winW, height: winH } = Dimensions.get('window');
        const { width: scrW, height: scrH } = Dimensions.get('screen');
        if ((winW > winH || scrW > scrH) && !isFullscreen) {
          enterFullscreen().catch(() => { });
        }
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

      userExitedFullscreenRef.current = false;
      setActiveVideo(item);
      setPlayerMode('full');
      setCurrentTime(0);
      setDuration(item.durationSeconds || 0);

      // If device is in landscape (e.g. tablet landscape), immediately trigger fullscreen
      const { width: winW, height: winH } = Dimensions.get('window');
      const { width: scrW, height: scrH } = Dimensions.get('screen');
      if (winW > winH || scrW > scrH) {
        enterFullscreen().catch(() => { });
      }

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
          } catch { }
          const sourceObj = {
            uri: cached.hlsUrl,
            contentType: 'hls' as const,
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
          };
          try {
            if (typeof (player as any).replaceAsync === 'function') {
              (player as any).replaceAsync(sourceObj).catch(() => { });
            } else {
              player.replace(sourceObj);
            }
            player.play();
          } catch (e) {
            console.warn('[VideoPlayerContext] replace source error:', e);
          }
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
            } catch { }
            const sourceObj = {
              uri: streamDetails.hlsUrl,
              contentType: 'hls' as const,
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
            };
            try {
              if (typeof (player as any).replaceAsync === 'function') {
                (player as any).replaceAsync(sourceObj).catch(() => { });
              } else {
                player.replace(sourceObj);
              }
              player.play();
            } catch (e) {
              console.warn('[VideoPlayerContext] replace source error:', e);
            }
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

  // Next / Previous Video implementation with infinite Up Next auto-play
  const nextVideo = useCallback(async () => {
    if (!activeVideo) return;

    // 1. If we have real YouTube algorithmic recommendations, auto-play the top recommended video!
    if (relatedVideos && relatedVideos.length > 0) {
      const nextTarget = relatedVideos.find((v) => v.videoId !== activeVideo.videoId) || relatedVideos[0];
      if (nextTarget) {
        playVideo(nextTarget, relatedVideos);
        return;
      }
    }

    // 2. Fall back to current playlist queue if available
    const currentIndex = playlist.length > 0 ? playlist.findIndex((v) => v.videoId === activeVideo.videoId) : -1;
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      playVideo(playlist[currentIndex + 1], playlist);
      return;
    }

    // 3. Last resort: fetch on demand
    try {
      const related = await fetchRelatedYouTubeVideos(activeVideo.videoId, 15);
      if (related.length > 0) {
        const updatedPlaylist = [...playlist, ...related];
        playVideo(related[0], updatedPlaylist);
      }
    } catch (err) {
      console.warn('Auto-play nextVideo related fetch failed:', err);
    }
  }, [activeVideo, relatedVideos, playlist, playVideo]);

  nextVideoRef.current = nextVideo;

  const prevVideo = useCallback(() => {
    if (!activeVideo || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex > 0) {
      playVideo(playlist[currentIndex - 1], playlist);
    } else {
      seekTo(0);
    }
  }, [activeVideo, playlist, playVideo, seekTo]);

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

  const collapseToMini = useCallback(() => {
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => { });
    }
    setPlayerMode('mini');
  }, [isFullscreen]);

  const maximizeToFull = useCallback(() => {
    setPlayerMode('full');
  }, []);

  const closePlayer = useCallback(() => {
    isPiPActiveRef.current = false;
    pipExitCooldownRef.current = false;
    if (player) {
      try {
        player.pause();
      } catch { }
    }
    deactivateKeepAwake('global_video_player').catch(() => { });
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => { });
    }
    setActiveVideo(null);
    setActiveChannelMeta(null);
    setVideoStream(null);
    setPlayerMode('hidden');
  }, [player, isFullscreen]);

  const enterFullscreen = useCallback(async () => {
    userExitedFullscreenRef.current = false;
    setIsFullscreen(true);
    lockLandscapeAsync().catch(() => { });
  }, []);

  const exitFullscreen = useCallback(async () => {
    userExitedFullscreenRef.current = true;
    setIsFullscreen(false);
    lockPortraitAsync().catch(() => { });
  }, []);

  const handlePiPStart = useCallback(() => {
    isPiPActiveRef.current = true;
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => { });
    }
  }, [isFullscreen]);

  const handlePiPStop = useCallback(() => {
    isPiPActiveRef.current = false;
    pipExitCooldownRef.current = true;
    setTimeout(() => {
      pipExitCooldownRef.current = false;
    }, 600);
    setIsFullscreen(false);
    lockPortraitAsync().catch(() => { });
    setPlayerMode('full');
  }, []);

  const triggerPiP = useCallback(async () => {
    try {
      if (isFullscreen) {
        await exitFullscreen();
      }
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
  }, [playerMode, isFullscreen, exitFullscreen, collapseToMini]);

  // Physical screen orientation listener
  useEffect(() => {
    if (playerMode === 'hidden') return;

    // Check current orientation immediately on active player mode if user hasn't explicitly exited fullscreen
    const { width: winW, height: winH } = Dimensions.get('window');
    const { width: scrW, height: scrH } = Dimensions.get('screen');
    if ((winW > winH || scrW > scrH) && !isFullscreen && !isPiPActiveRef.current && !userExitedFullscreenRef.current) {
      enterFullscreen().catch(() => { });
    }

    const unsub = addOrientationListener((isLand) => {
      // Never trigger orientation changes while app is in background, in PiP, or during PiP restore cooldown
      if (appStateRef.current !== 'active' || isPiPActiveRef.current || pipExitCooldownRef.current) {
        return;
      }
      if (isLand && !isFullscreen) {
        userExitedFullscreenRef.current = false;
        enterFullscreen().catch(() => { });
      } else if (!isLand && isFullscreen) {
        userExitedFullscreenRef.current = false;
        exitFullscreen().catch(() => { });
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
      duration,
      isLoadingStream,
      isFullscreen,
      playlist,
      relatedVideos,
      isLoadingRelated,
      activeChannelMeta,
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
      handlePiPStart,
      handlePiPStop,
    }),
    [
      player,
      activeVideo,
      videoStream,
      playerMode,
      isVideoPlaying,
      duration,
      isLoadingStream,
      isFullscreen,
      playlist,
      relatedVideos,
      isLoadingRelated,
      activeChannelMeta,
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
      handlePiPStart,
      handlePiPStop,
    ]
  );

  const progressValue = useMemo(
    () => ({ currentTime, duration }),
    [currentTime, duration]
  );

  return (
    <VideoPlayerContext.Provider value={value}>
      <VideoProgressContext.Provider value={progressValue}>
        {children}
      </VideoProgressContext.Provider>
    </VideoPlayerContext.Provider>
  );
};

export const useVideoPlayerContext = (): VideoPlayerContextType => {
  const context = useContext(VideoPlayerContext);
  if (!context) {
    throw new Error('useVideoPlayerContext must be used within a VideoPlayerProvider');
  }
  return context;
};
