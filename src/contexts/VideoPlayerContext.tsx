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
  fetchYouTubeNextRecommendations,
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
  recommendations: YouTubeVideoSearchResult[];
  isLoadingRecommendations: boolean;
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
  const [recommendations, setRecommendations] = useState<YouTubeVideoSearchResult[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);

  const appStateRef = useRef(AppState.currentState);
  const hasAdvancedRef = useRef<boolean>(false);
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
    } catch {}
  });

  // Track AppState for background/active resync and PiP restore
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        if (player) {
          try {
            setCurrentTime(player.currentTime);
          } catch {}
        }
        if (isPiPActiveRef.current) {
          isPiPActiveRef.current = false;
          pipExitCooldownRef.current = true;
          setTimeout(() => {
            pipExitCooldownRef.current = false;
          }, 600);
          setIsFullscreen(false);
          lockPortraitAsync().catch(() => {});
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
    } catch {}
  }, [player]);

  // Screen keep-awake when video is actively playing in full watch view only
  useEffect(() => {
    if (isVideoPlaying && playerMode === 'full') {
      activateKeepAwakeAsync('global_video_player').catch(() => {});
    } else {
      deactivateKeepAwake('global_video_player').catch(() => {});
    }
    return () => {
      deactivateKeepAwake('global_video_player').catch(() => {});
    };
  }, [isVideoPlaying, playerMode]);

  // When audio songs from any other screen start playing, immediately pause video player
  useEffect(() => {
    if (isAudioPlaying && isVideoPlaying && player) {
      try {
        player.pause();
      } catch {}
    }
  }, [isAudioPlaying, isVideoPlaying, player]);

  // Real-time YouTube "Up Next" & Recommendation resolution via InnerTube v1/next
  useEffect(() => {
    if (!activeVideo?.videoId) {
      setRecommendations([]);
      setIsLoadingRecommendations(false);
      return;
    }

    let isMounted = true;
    setIsLoadingRecommendations(true);

    fetchYouTubeNextRecommendations(activeVideo.videoId, 20)
      .then((recs) => {
        if (isMounted) {
          setRecommendations(recs);
          setIsLoadingRecommendations(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingRecommendations(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeVideo?.videoId]);

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

  // Next Video with continuous YouTube Auto-Play
  const nextVideo = useCallback(() => {
    if (!activeVideo) return;

    // 1. Advance in current playlist if available
    if (playlist.length > 0) {
      const currentIndex = playlist.findIndex((v) => v.videoId === activeVideo.videoId);
      if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
        playVideo(playlist[currentIndex + 1], playlist);
        return;
      }
    }

    // 2. Seamless continuous YouTube auto-play: advance to first recommendation
    if (recommendations.length > 0) {
      const nextRec =
        recommendations.find((r) => r.videoId !== activeVideo.videoId) || recommendations[0];
      if (nextRec && nextRec.videoId !== activeVideo.videoId) {
        playVideo(nextRec, recommendations);
      }
    }
  }, [activeVideo, playlist, recommendations, playVideo]);

  const prevVideo = useCallback(() => {
    if (!activeVideo || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex > 0) {
      playVideo(playlist[currentIndex - 1], playlist);
    } else {
      seekTo(0);
    }
  }, [activeVideo, playlist, playVideo, seekTo]);

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
    isPiPActiveRef.current = false;
    pipExitCooldownRef.current = false;
    if (player) {
      try {
        player.pause();
        player.replace(null); // Release hardware MediaCodec decoder and tear down network streaming
      } catch {}
    }
    deactivateKeepAwake('global_video_player').catch(() => {});
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

  const handlePiPStart = useCallback(() => {
    isPiPActiveRef.current = true;
    if (isFullscreen) {
      setIsFullscreen(false);
      lockPortraitAsync().catch(() => {});
    }
  }, [isFullscreen]);

  const handlePiPStop = useCallback(() => {
    isPiPActiveRef.current = false;
    pipExitCooldownRef.current = true;
    setTimeout(() => {
      pipExitCooldownRef.current = false;
    }, 600);
    setIsFullscreen(false);
    lockPortraitAsync().catch(() => {});
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
    const unsub = addOrientationListener((isLand) => {
      // Never trigger orientation changes while app is in background, in PiP, or during PiP restore cooldown
      if (appStateRef.current !== 'active' || isPiPActiveRef.current || pipExitCooldownRef.current) {
        return;
      }
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
      duration,
      isLoadingStream,
      isFullscreen,
      playlist,
      recommendations,
      isLoadingRecommendations,
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
      recommendations,
      isLoadingRecommendations,
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
