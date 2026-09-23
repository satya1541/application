import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  StatusBar,
  BackHandler,
  Platform,
  Share,
  AppState,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import {
  searchYouTubeVideos,
  resolveYouTubeStandaloneVideoStream,
  getCachedVideoStream,
  fetchYouTubeSearchSuggestions,
  fetchTrendingYouTubeVideos,
  TRENDING_CATEGORIES,
  TrendingCategory,
  YouTubeVideoSearchResult,
  StandaloneVideoStreamDetails,
} from '@/services/youtubeVideoSearchService';
import {
  fetchUserSubscriptionsFeed,
  fetchUserLikedVideos,
  UserFeedResult,
} from '@/services/youtubeUserFeedService';
import { useAuth } from '@/contexts/AuthContext';
import { FullscreenVideoOverlay } from '../player/FullscreenVideoOverlay';
import {
  lockLandscapeAsync,
  lockPortraitAsync,
  addOrientationListener,
} from '@/services/orientationManager';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

interface YSearchScreenProps {
  onBack?: () => void;
  initialQuery?: string;
}

export const YSearchScreen: React.FC<YSearchScreenProps> = ({
  onBack,
  initialQuery = '',
}) => {
  const insets = useSafeAreaInsets();
  const { bgHex, surfaceHex, themeMode } = useAppTheme();
  const { isPlaying: isAudioPlaying, pause: pauseBackgroundAudio } = useAudio();
  const { isYouTubeLinked, isGuest, connectYouTubeAccount, openAuthModal } = useAuth();

  // YouTube user feed category IDs
  const USER_FEED_CATEGORIES = useMemo(() => [
    { id: 'my_feed', name: 'My Feed', icon: 'person-circle-outline' as const },
    { id: 'liked', name: 'Liked', icon: 'heart' as const },
  ], []);

  // Merge trending + user feed categories into one chip list
  const allCategories = useMemo(() => {
    if (isYouTubeLinked && !isGuest) {
      return [...USER_FEED_CATEGORIES, ...TRENDING_CATEGORIES];
    }
    return TRENDING_CATEGORIES;
  }, [isYouTubeLinked, isGuest, USER_FEED_CATEGORIES]);

  // Search query, suggestions & results state
  const [query, setQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const suggestionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trending / Discover category & video list state
  const [selectedCategory, setSelectedCategory] = useState<string>('trending');
  const [trendingVideos, setTrendingVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [userFeedNeedsReauth, setUserFeedNeedsReauth] = useState(false);
  const [userFeedNotConnected, setUserFeedNotConnected] = useState(false);
  const [userFeedError, setUserFeedError] = useState<string | null>(null);
  const [userFeedEmpty, setUserFeedEmpty] = useState(false);
  const watchVideoViewRef = useRef<VideoView>(null);

  // Active playing video state
  const [activeVideo, setActiveVideo] = useState<YouTubeVideoSearchResult | null>(null);
  const [videoStream, setVideoStream] = useState<StandaloneVideoStreamDetails | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);

  // Player presentation modes:
  // 'full': YouTube portrait watch view (Screenshot 1)
  // 'mini': YouTube floating miniplayer in bottom-right corner (Screenshot 2)
  const [playerMode, setPlayerMode] = useState<'full' | 'mini'>('full');
  const [showWatchControls, setShowWatchControls] = useState(true);
  const watchControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Landscape Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [watchRemountKey, setWatchRemountKey] = useState<number>(0);
  const [miniRemountKey, setMiniRemountKey] = useState<number>(0);

  // Timeline & scrubbing state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls in full watch view after 3.5s
  const resetWatchControlsTimer = useCallback(() => {
    if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
    watchControlsTimerRef.current = setTimeout(() => {
      setShowWatchControls(false);
    }, 3500);
  }, []);

  const toggleWatchControls = useCallback(() => {
    if (showWatchControls) {
      if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
      setShowWatchControls(false);
    } else {
      setShowWatchControls(true);
      resetWatchControlsTimer();
    }
  }, [showWatchControls, resetWatchControlsTimer]);

  // AppState tracking: freeze React UI re-renders while phone is locked or in background
  const appStateRef = useRef(AppState.currentState);

  // Auto-advance guard to prevent duplicate triggers
  const hasAdvancedRef = useRef(false);
  const handleNextVideoRef = useRef<() => void>(() => {});

  // Reset advance guard whenever active video changes
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [activeVideo?.videoId]);

  const advanceToNextVideo = useCallback(() => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    handleNextVideoRef.current();
  }, []);

  // Setup standalone video player with expo-video
  // Initialized with null so useVideoPlayer maintains a SINGLE, persistent native ExoPlayer instance.
  // timeUpdateEventInterval = 1.0s cuts JS wakeups and re-renders by 75% compared to 0.25s, keeping device cool.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
    p.audioMixingMode = 'doNotMix';
    p.staysActiveInBackground = true; // Enables background playback when screen locks
    p.showNowPlayingNotification = true; // Shows system media notification
    p.timeUpdateEventInterval = 1.0; // 1 second interval: stops high-frequency thermal re-rendering
    try {
      p.bufferOptions = {
        preferredForwardBufferDuration: 15,
        minBufferForPlayback: 0.1, // 100ms start buffer for instant playback
        waitsToMinimizeStalling: false,
        prioritizeTimeOverSizeThreshold: true,
        maxBufferBytes: 20 * 1024 * 1024,
      };
    } catch {}
  });

  // Track AppState to freeze UI updates when screen is locked
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      // Resync timeline once on screen unlock
      if (nextState === 'active' && player) {
        try {
          if (!isScrubbingRef.current) {
            setCurrentTime(player.currentTime);
          }
        } catch {}
      }
    });
    return () => sub.remove();
  }, [player]);

  // Ensure background play & thermal interval stay active on player instance
  useEffect(() => {
    if (!player) return;
    try {
      player.timeUpdateEventInterval = 1.0;
      player.staysActiveInBackground = true;
      player.showNowPlayingNotification = true;
      player.bufferOptions = {
        preferredForwardBufferDuration: 15,
        minBufferForPlayback: 0.1,
        waitsToMinimizeStalling: false,
        prioritizeTimeOverSizeThreshold: true,
        maxBufferBytes: 20 * 1024 * 1024,
      };
    } catch {}
  }, [player]);

  // Clean up player and timeouts on unmount to prevent thermal drain in background
  useEffect(() => {
    return () => {
      try {
        if (player) {
          player.pause();
        }
      } catch {}
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
      if (suggestionsTimeoutRef.current) clearTimeout(suggestionsTimeoutRef.current);
    };
  }, [player]);

  // Track video player events with triple-redundant auto-advance & thermal protection
  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (payload) => {
      setIsVideoPlaying(payload.isPlaying);
    });

    // Time update: only trigger React state updates when screen is active
    const subTime = player.addListener('timeUpdate', (payload) => {
      if (appStateRef.current === 'active' && !isScrubbingRef.current) {
        setCurrentTime(payload.currentTime);
      }
      const dur = player.duration || activeVideo?.durationSeconds || 0;
      if (dur > 0) {
        setDuration(dur);
        // Safety auto-advance: if within 0.75s of duration, auto-advance
        if (dur > 3 && payload.currentTime >= dur - 0.75) {
          advanceToNextVideo();
        }
      }
    });

    const subStatus = player.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay') {
        const dur = player.duration || activeVideo?.durationSeconds || 0;
        if (dur > 0) setDuration(dur);
        if (!isScrubbingRef.current) {
          player.play();
        }
      } else if (payload.status === 'idle') {
        // Redundancy: if player transitions to idle near the end, auto-advance
        const cur = player.currentTime;
        const dur = player.duration || activeVideo?.durationSeconds || 0;
        if (dur > 3 && cur >= dur - 2.0) {
          advanceToNextVideo();
        }
      }
    });

    const subSourceLoad = player.addListener('sourceLoad', (payload) => {
      if (payload.duration > 0) {
        setDuration(payload.duration);
      }
      if (!isScrubbingRef.current) {
        player.play();
      }
    });

    // Primary auto-advance: fires when stream reaches end
    const subEnded = player.addListener('playToEnd', () => {
      setIsVideoPlaying(false);
      advanceToNextVideo();
    });

    return () => {
      subPlaying.remove();
      subTime.remove();
      subStatus.remove();
      subSourceLoad.remove();
      subEnded.remove();
    };
  }, [player, activeVideo, advanceToNextVideo]);

  // Sync duration once stream metadata loads
  useEffect(() => {
    if (player && player.duration > 0) {
      setDuration(player.duration);
    } else if (activeVideo?.durationSeconds) {
      setDuration(activeVideo.durationSeconds);
    }
  }, [player, activeVideo]);

  // YouTube video search
  const performSearch = useCallback(async (searchQuery: string) => {
    const clean = searchQuery.trim();
    if (!clean) {
      setVideos([]);
      setIsSearching(false);
      setShowSuggestions(false);
      return;
    }
    setIsSearching(true);
    setShowSuggestions(false);
    try {
      const results = await searchYouTubeVideos(clean, 35);
      setVideos(results);
      // Pre-warm top 2 search results in background so tapping them plays INSTANTLY
      if (results[0]?.videoId) {
        resolveYouTubeStandaloneVideoStream(results[0].videoId).catch(() => {});
      }
      if (results[1]?.videoId) {
        resolveYouTubeStandaloneVideoStream(results[1].videoId).catch(() => {});
      }
    } catch (err) {
      console.warn('YSearch performSearch failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) {
      performSearch(initialQuery);
    }
  }, [performSearch, initialQuery]);

  // Load Trending videos from official InnerTube Charts or User Feed
  const loadTrending = useCallback(async (catId: string) => {
    setIsLoadingTrending(true);
    setUserFeedNeedsReauth(false);
    setUserFeedNotConnected(false);
    setUserFeedError(null);
    setUserFeedEmpty(false);
    try {
      // Handle user feed categories
      if (catId === 'my_feed' || catId === 'liked') {
        let feedResult: UserFeedResult;
        if (catId === 'my_feed') {
          feedResult = await fetchUserSubscriptionsFeed(30);
        } else {
          feedResult = await fetchUserLikedVideos(30);
        }

        if (feedResult.notConnected) {
          setUserFeedNotConnected(true);
          setTrendingVideos([]);
        } else if (feedResult.requiresReauth) {
          setUserFeedNeedsReauth(true);
          setUserFeedError(feedResult.error || null);
          setTrendingVideos([]);
        } else if (feedResult.error) {
          setUserFeedError(feedResult.error);
          setTrendingVideos([]);
        } else if (feedResult.emptyFeed || feedResult.videos.length === 0) {
          setUserFeedEmpty(true);
          setTrendingVideos([]);
        } else {
          setTrendingVideos(feedResult.videos);
          // Pre-warm top 2
          if (feedResult.videos[0]?.videoId) {
            resolveYouTubeStandaloneVideoStream(feedResult.videos[0].videoId).catch(() => {});
          }
          if (feedResult.videos[1]?.videoId) {
            resolveYouTubeStandaloneVideoStream(feedResult.videos[1].videoId).catch(() => {});
          }
        }
      } else {
        const results = await fetchTrendingYouTubeVideos(catId, 30);
        setTrendingVideos(results);
        if (results[0]?.videoId) {
          resolveYouTubeStandaloneVideoStream(results[0].videoId).catch(() => {});
        }
        if (results[1]?.videoId) {
          resolveYouTubeStandaloneVideoStream(results[1].videoId).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('loadTrending failed:', err);
      if (catId === 'my_feed' || catId === 'liked') {
        setUserFeedError(err?.message || 'Failed to load personal feed');
        setTrendingVideos([]);
      }
    } finally {
      setIsLoadingTrending(false);
    }
  }, []);

  useEffect(() => {
    loadTrending(selectedCategory);
  }, [loadTrending, selectedCategory]);

  const handleSelectCategory = useCallback(
    (catId: string) => {
      setSelectedCategory(catId);
      if (query.trim()) {
        setQuery('');
        setVideos([]);
      }
      loadTrending(catId);
    },
    [query, loadTrending]
  );

  // Handle typing with real-time YouTube search suggestions
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);

    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current);
    }

    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionsTimeoutRef.current = setTimeout(async () => {
      try {
        const list = await fetchYouTubeSearchSuggestions(text);
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 180);
  }, []);

  const handleSelectSuggestion = useCallback(
    (suggestionText: string) => {
      setQuery(suggestionText);
      setShowSuggestions(false);
      Keyboard.dismiss();
      performSearch(suggestionText);
    },
    [performSearch]
  );

  const handleFillSuggestion = useCallback(
    (suggestionText: string) => {
      setQuery(suggestionText);
      handleQueryChange(suggestionText);
    },
    [handleQueryChange]
  );

  // Memoize Up Next queue to avoid re-filtering items on every time update
  const upNextVideos: YouTubeVideoSearchResult[] = useMemo(() => {
    const list = videos.length > 0 ? videos : trendingVideos;
    if (!activeVideo || list.length === 0) return [];
    return list.filter((v) => v.videoId !== activeVideo.videoId).slice(0, 15);
  }, [videos, trendingVideos, activeVideo?.videoId]);

  // Play a video in the standalone player
  const handleSelectVideo = useCallback(
    async (item: YouTubeVideoSearchResult) => {
      if (activeVideo?.videoId === item.videoId && videoStream) {
        setPlayerMode('full');
        setShowWatchControls(true);
        resetWatchControlsTimer();
        if (player && !isVideoPlaying) {
          if (isAudioPlaying) pauseBackgroundAudio();
          player.play();
        }
        return;
      }

      // Pause global background music player so it doesn't overlap
      if (isAudioPlaying) {
        pauseBackgroundAudio();
      }

      setActiveVideo(item);
      setPlayerMode('full'); // Opens in Full Watch View (Screenshot 1)
      setShowWatchControls(true);
      resetWatchControlsTimer();
      setCurrentTime(0);
      setDuration(item.durationSeconds || 0);

      // 1. Instant playback from cache (0ms lookup)
      const cached = getCachedVideoStream(item.videoId);
      if (cached) {
        setVideoStream(cached);
        if (cached.durationSeconds > 0) {
          setDuration(cached.durationSeconds);
        }
        setIsLoadingStream(false);
        if (player) {
          try {
            player.bufferOptions = {
              preferredForwardBufferDuration: 15,
              minBufferForPlayback: 0.1,
              waitsToMinimizeStalling: false,
              prioritizeTimeOverSizeThreshold: true,
              maxBufferBytes: 20 * 1024 * 1024,
            };
          } catch {}
          player.replace({
            uri: cached.hlsUrl,
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

      // 2. Resolve stream if not yet cached
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
              player.bufferOptions = {
                preferredForwardBufferDuration: 15,
                minBufferForPlayback: 0.1,
                waitsToMinimizeStalling: false,
                prioritizeTimeOverSizeThreshold: true,
                maxBufferBytes: 20 * 1024 * 1024,
              };
            } catch {}
            player.replace({
              uri: streamDetails.hlsUrl,
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
    [activeVideo, videoStream, player, isVideoPlaying, isAudioPlaying, pauseBackgroundAudio, resetWatchControlsTimer]
  );

  // Next & Previous Video in playlist/results
  const handleNextVideo = useCallback(() => {
    if (!activeVideo) return;
    const currentList = videos.length > 0 ? videos : trendingVideos;
    if (currentList.length > 0) {
      const currentIndex = currentList.findIndex((v) => v.videoId === activeVideo.videoId);
      if (currentIndex >= 0 && currentIndex < currentList.length - 1) {
        handleSelectVideo(currentList[currentIndex + 1]);
        return;
      }
      if (upNextVideos.length > 0) {
        handleSelectVideo(upNextVideos[0]);
        return;
      }
      // Loop back to beginning if at the end of the queue
      if (currentIndex >= currentList.length - 1 && currentList[0]) {
        handleSelectVideo(currentList[0]);
        return;
      }
    } else if (upNextVideos.length > 0) {
      handleSelectVideo(upNextVideos[0]);
    }
  }, [activeVideo, videos, trendingVideos, upNextVideos, handleSelectVideo]);

  const handlePrevVideo = useCallback(() => {
    if (!activeVideo) return;
    const currentList = videos.length > 0 ? videos : trendingVideos;
    if (currentList.length === 0) return;
    const currentIndex = currentList.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex > 0) {
      handleSelectVideo(currentList[currentIndex - 1]);
    } else {
      try {
        if (player) player.currentTime = 0;
        setCurrentTime(0);
      } catch {}
    }
  }, [activeVideo, videos, trendingVideos, handleSelectVideo, player]);

  // Fullscreen Handlers
  const handleEnterFullscreen = useCallback(async () => {
    await lockLandscapeAsync();
    setIsFullscreen(true);
  }, []);

  const handleExitFullscreen = useCallback(async () => {
    await lockPortraitAsync();
    setIsFullscreen(false);
    setWatchRemountKey((prev) => prev + 1);
    // Ensure smooth playback resumes without freeze when returning to portrait
    setTimeout(() => {
      try {
        if (player && isVideoPlaying) {
          player.play();
        }
      } catch {}
    }, 120);
  }, [player, isVideoPlaying]);

  // Player mode transitions
  const handleCollapseToMini = useCallback(() => {
    setPlayerMode('mini');
    setMiniRemountKey((prev) => prev + 1);
  }, []);

  const handleTriggerPiP = useCallback(async () => {
    try {
      if (watchVideoViewRef.current) {
        await watchVideoViewRef.current.startPictureInPicture();
      } else {
        handleCollapseToMini();
      }
    } catch (err) {
      console.warn('PiP start error in watch view, falling back to floating miniplayer:', err);
      handleCollapseToMini();
    }
  }, [handleCollapseToMini]);

  const handleMaximizeToWatch = useCallback(() => {
    setPlayerMode('full');
    setWatchRemountKey((prev) => prev + 1);
    setShowWatchControls(true);
    resetWatchControlsTimer();
    // Ensure player resumes immediately without freeze
    setTimeout(() => {
      try {
        if (player && isVideoPlaying) {
          player.play();
        }
      } catch {}
    }, 120);
  }, [player, isVideoPlaying, resetWatchControlsTimer]);

  // Listen for physical device orientation (only auto-enter landscape fullscreen if in full watch view)
  useEffect(() => {
    const unsubscribe = addOrientationListener((isLand) => {
      if (isLand && activeVideo && !isFullscreen && playerMode === 'full') {
        setIsFullscreen(true);
      } else if (!isLand && isFullscreen) {
        handleExitFullscreen();
      }
    });
    return () => unsubscribe();
  }, [activeVideo, isFullscreen, playerMode, handleExitFullscreen]);

  // Keep handleNextVideoRef updated for automatic playToEnd transition
  useEffect(() => {
    handleNextVideoRef.current = handleNextVideo;
  }, [handleNextVideo]);

  // Pre-fetch next video in queue in background for INSTANT next video playback (0ms wait)
  useEffect(() => {
    if (!activeVideo) return;
    const currentList = videos.length > 0 ? videos : trendingVideos;
    if (currentList.length === 0) return;
    const currentIndex = currentList.findIndex((v) => v.videoId === activeVideo.videoId);
    const nextVideo =
      currentIndex >= 0 && currentIndex < currentList.length - 1
        ? currentList[currentIndex + 1]
        : upNextVideos.length > 0
        ? upNextVideos[0]
        : null;

    if (nextVideo?.videoId) {
      resolveYouTubeStandaloneVideoStream(nextVideo.videoId).catch(() => {});
    }
  }, [activeVideo?.videoId, videos, trendingVideos, upNextVideos]);

  // Android Back Button handling:
  // 1. If in landscape fullscreen -> exit landscape fullscreen
  // 2. If in full watch screen -> collapse to miniplayer (Screenshot 2)
  // 3. If in search suggestions -> close suggestions
  // 4. Else -> navigate back (onBack)
  useEffect(() => {
    const onBackPress = () => {
      if (isFullscreen) {
        handleExitFullscreen();
        return true;
      }
      if (playerMode === 'full' && activeVideo) {
        handleCollapseToMini();
        return true;
      }
      if (showSuggestions) {
        setShowSuggestions(false);
        return true;
      }
      if (onBack) {
        if (player) player.pause();
        setActiveVideo(null);
        setVideoStream(null);
        onBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isFullscreen, playerMode, activeVideo, showSuggestions, player, handleExitFullscreen, handleCollapseToMini, onBack]);

  // Toggle video play/pause
  const handleTogglePlay = useCallback(() => {
    if (!player) return;
    if (isVideoPlaying) {
      player.pause();
    } else {
      if (isAudioPlaying) pauseBackgroundAudio();
      player.play();
    }
  }, [player, isVideoPlaying, isAudioPlaying, pauseBackgroundAudio]);

  const effectiveDuration =
    duration > 0
      ? duration
      : (activeVideo?.durationSeconds || (player?.duration > 0 ? player.duration : 0));

  const currentDisplayTime =
    isScrubbing && scrubValue !== null ? scrubValue : currentTime;

  // Video seek with safety clamp
  const handleSeek = useCallback(
    (seconds: number) => {
      if (!player) return;
      try {
        const maxDur = effectiveDuration > 0 ? effectiveDuration : seconds;
        const clamped = Math.max(0, Math.min(seconds, maxDur));
        player.currentTime = clamped;
        setCurrentTime(clamped);
      } catch (err) {
        console.warn('handleSeek error:', err);
      }
    },
    [player, effectiveDuration]
  );

  // Rubber-band protected slider scrub handlers
  const handleSlidingStart = useCallback(
    (val?: number) => {
      if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      isScrubbingRef.current = true;
      setIsScrubbing(true);
      setScrubValue(val !== undefined ? val : currentTime);
    },
    [currentTime]
  );

  const handleValueChange = useCallback((val: number) => {
    setScrubValue(val);
  }, []);

  const handleSlidingComplete = useCallback(
    (val: number) => {
      setScrubValue(val);
      handleSeek(val);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        setScrubValue(null);
      }, 400);
      resetWatchControlsTimer();
    },
    [handleSeek, resetWatchControlsTimer]
  );

  // Render YouTube Search Result Video Card
  const renderVideoCard = ({ item }: { item: YouTubeVideoSearchResult }) => {
    const isThisActive = activeVideo?.videoId === item.videoId;

    return (
      <TouchableOpacity
        style={[
          styles.videoCard,
          { backgroundColor: themeMode === 'oled' ? '#0a0a0a' : surfaceHex },
          isThisActive && { borderColor: '#FF0000', borderWidth: 1.5 },
        ]}
        onPress={() => handleSelectVideo(item)}
        activeOpacity={0.85}
      >
        {/* 16:9 Video Thumbnail */}
        <View style={styles.thumbnailContainer}>
          <ExpoImage
            source={{ uri: item.thumbnail }}
            style={styles.thumbnailImage}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />

          {/* YouTube Duration Badge */}
          {item.duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{item.duration}</Text>
            </View>
          ) : null}

          {/* Optional Rank Badge for ranked lists */}
          {item.rank ? (
            <View
              style={[
                styles.rankBadge,
                item.rank === 1 && styles.rankBadgeGold,
                item.rank === 2 && styles.rankBadgeSilver,
                item.rank === 3 && styles.rankBadgeBronze,
              ]}
            >
              <Text
                style={[
                  styles.rankBadgeText,
                  item.rank <= 3 && styles.rankBadgeTextTop,
                ]}
              >
                #{item.rank}
              </Text>
            </View>
          ) : null}

          {/* Active Playing Badge */}
          {isThisActive && (
            <View style={styles.nowPlayingIndicator}>
              <Ionicons
                name={isVideoPlaying ? 'volume-high' : 'pause'}
                size={14}
                color="#ffffff"
              />
              <Text style={styles.nowPlayingText}>
                {isVideoPlaying ? 'PLAYING' : 'PAUSED'}
              </Text>
            </View>
          )}
        </View>

        {/* Video Info Row */}
        <View style={styles.videoInfoRow}>
          {/* Channel Avatar */}
          {item.channelAvatar ? (
            <ExpoImage
              source={{ uri: item.channelAvatar }}
              style={styles.channelAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.channelAvatarPlaceholder}>
              <Ionicons name="logo-youtube" size={16} color="#FF0000" />
            </View>
          )}

          {/* Title & Channel Subtitle */}
          <View style={styles.videoMetaCol}>
            <Text
              style={[
                styles.videoTitle,
                isThisActive && { color: '#FF0000', fontWeight: '700' },
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text style={styles.videoSubtitle} numberOfLines={1}>
              {item.author}
              {item.viewCount ? ` • ${item.viewCount}` : ''}
              {item.publishedTime ? ` • ${item.publishedTime}` : ''}
            </Text>
          </View>

          {/* Quick Play Icon */}
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => handleSelectVideo(item)}
          >
            <Ionicons
              name={isThisActive && isVideoPlaying ? 'pause-circle' : 'play-circle'}
              size={32}
              color={isThisActive ? '#FF0000' : '#ffffff'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Active Category Object
  const currentCategoryObj = useMemo(() => {
    const allCats = [...(isYouTubeLinked ? USER_FEED_CATEGORIES : []), ...TRENDING_CATEGORIES];
    return allCats.find((c) => c.id === selectedCategory) || TRENDING_CATEGORIES[0];
  }, [selectedCategory, isYouTubeLinked, USER_FEED_CATEGORIES]);

  // Render Trending Carousel Card (Horizontal)
  const renderTrendingCard = ({ item }: { item: YouTubeVideoSearchResult }) => {
    const isThisActive = activeVideo?.videoId === item.videoId;
    const rank = item.rank || 1;
    const isTop1 = rank === 1;
    const isTop2 = rank === 2;
    const isTop3 = rank === 3;

    return (
      <TouchableOpacity
        style={[
          styles.trendingCard,
          { backgroundColor: themeMode === 'oled' ? '#141414' : surfaceHex },
          isThisActive && { borderColor: '#FF0000', borderWidth: 1.5 },
        ]}
        onPress={() => handleSelectVideo(item)}
        activeOpacity={0.85}
      >
        <View style={styles.trendingThumbContainer}>
          <ExpoImage
            source={{ uri: item.thumbnail }}
            style={styles.trendingThumb}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />

          {/* Rank Badge */}
          <View
            style={[
              styles.rankBadge,
              isTop1 && styles.rankBadgeGold,
              isTop2 && styles.rankBadgeSilver,
              isTop3 && styles.rankBadgeBronze,
            ]}
          >
            <Text
              style={[
                styles.rankBadgeText,
                (isTop1 || isTop2 || isTop3) && styles.rankBadgeTextTop,
              ]}
            >
              #{rank}
            </Text>
          </View>

          {/* Duration Badge */}
          {item.duration ? (
            <View style={styles.trendingDurationBadge}>
              <Text style={styles.trendingDurationText}>{item.duration}</Text>
            </View>
          ) : null}

          {/* Active Playing Badge */}
          {isThisActive && (
            <View style={styles.trendingPlayingOverlay}>
              <Ionicons
                name={isVideoPlaying ? 'volume-high' : 'pause'}
                size={14}
                color="#ffffff"
              />
              <Text style={styles.trendingPlayingText}>
                {isVideoPlaying ? 'PLAYING' : 'PAUSED'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.trendingMeta}>
          <Text
            style={[
              styles.trendingTitle,
              isThisActive && { color: '#FF0000', fontWeight: '700' },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={styles.trendingAuthor} numberOfLines={1}>
            {item.author}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgHex }]}
      edges={['top']}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* YouTube-Styled Search Header */}
      <View style={[styles.headerContainer, { backgroundColor: bgHex }]}>
        <View style={styles.searchTopRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* YouTube Branding */}
          <View style={styles.brandRow}>
            <Ionicons name="logo-youtube" size={24} color="#FF0000" />
            <Text style={styles.brandText}>YSearch</Text>
          </View>

          {/* Search Capsule Input matching YouTube reference */}
          <View
            style={[
              styles.searchInputWrapper,
              {
                backgroundColor: themeMode === 'oled' ? '#161616' : '#222222',
                borderColor: isInputFocused ? '#FF0000' : 'rgba(255, 255, 255, 0.12)',
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={isInputFocused ? '#FF0000' : '#999999'}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Search YouTube videos..."
              placeholderTextColor="#777777"
              value={query}
              onChangeText={handleQueryChange}
              onFocus={() => {
                setIsInputFocused(true);
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                setIsInputFocused(false);
              }}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                setShowSuggestions(false);
                performSearch(query);
              }}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                  performSearch('');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color="#aaaaaa" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* YouTube Autocomplete Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <View
            style={[
              styles.suggestionsDropdown,
              {
                backgroundColor: themeMode === 'oled' ? '#181818' : surfaceHex,
                borderColor: themeMode === 'oled' ? '#2e2e2e' : 'rgba(255, 255, 255, 0.15)',
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              style={styles.suggestionsScroll}
            >
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  key={`${item}-${idx}`}
                  style={[
                    styles.suggestionRow,
                    idx < suggestions.length - 1 && styles.suggestionBorderBottom,
                  ]}
                  onPress={() => handleSelectSuggestion(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="search-outline"
                    size={18}
                    color="#888888"
                    style={styles.suggestionIcon}
                  />
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {item}
                  </Text>
                  <TouchableOpacity
                    style={styles.suggestionArrowBtn}
                    onPress={() => handleFillSuggestion(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name="arrow-up-outline"
                      size={17}
                      color="#777777"
                      style={{ transform: [{ rotate: '-45deg' }] }}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Category Filter Chips Bar */}
      <View style={[styles.categoryBarContainer, { backgroundColor: bgHex }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryBarScroll}
        >
          {allCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id && !query.trim();
            const isUserFeedChip = cat.id === 'my_feed' || cat.id === 'liked';
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipActive,
                  {
                    backgroundColor: isSelected
                      ? isUserFeedChip ? '#1a73e8' : '#FF0000'
                      : themeMode === 'oled'
                      ? '#181818'
                      : '#282828',
                  },
                  isUserFeedChip && !isSelected && {
                    borderColor: 'rgba(26, 115, 232, 0.4)',
                  },
                ]}
                onPress={() => handleSelectCategory(cat.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isSelected ? '#ffffff' : isUserFeedChip ? '#8ab4f8' : '#aaaaaa'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextActive,
                    isUserFeedChip && !isSelected && { color: '#8ab4f8' },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Connect YouTube chip shown when NOT linked and NOT guest */}
          {!isYouTubeLinked && !isGuest && (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                {
                  backgroundColor: themeMode === 'oled' ? '#181818' : '#282828',
                  borderColor: 'rgba(26, 115, 232, 0.5)',
                  borderStyle: 'dashed' as any,
                },
              ]}
              onPress={async () => {
                const result = await connectYouTubeAccount();
                if (result.error) {
                  console.warn('[YSearch] Connect YouTube error:', result.error);
                }
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="logo-youtube" size={14} color="#FF0000" style={{ marginRight: 6 }} />
              <Text style={[styles.categoryChipText, { color: '#8ab4f8' }]}>Connect YouTube</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Main Content: Search Results OR Trending / Discover Feed */}
      <View style={styles.content}>
        {isSearching ? (
          <View style={styles.centerLoadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.searchingText}>Searching YouTube videos...</Text>
          </View>
        ) : query.trim() ? (
          /* Search Results Mode */
          <FlatList
            data={videos}
            keyExtractor={(item) => item.videoId}
            renderItem={renderVideoCard}
            contentContainerStyle={[
              styles.videoListContent,
              { paddingBottom: activeVideo && playerMode === 'mini' ? 170 : 80 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              setShowSuggestions(false);
              Keyboard.dismiss();
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search" size={48} color="#666666" />
                <Text style={styles.emptyTitle}>No videos found</Text>
                <Text style={styles.emptySubtitle}>
                  We couldn't find matches for "{query}". Try checking your spelling or search terms.
                </Text>
                <TouchableOpacity
                  style={styles.exploreTrendingBtn}
                  onPress={() => {
                    setQuery('');
                    setVideos([]);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flame" size={16} color="#ffffff" />
                  <Text style={styles.exploreTrendingBtnText}>Back to Trending</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ) : (
          /* Discover / Trending Charts Mode */
          <FlatList
            data={trendingVideos}
            keyExtractor={(item) => `trending-${item.videoId}`}
            renderItem={renderVideoCard}
            contentContainerStyle={[
              styles.videoListContent,
              { paddingBottom: activeVideo && playerMode === 'mini' ? 170 : 80 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              trendingVideos.length > 0 ? (
                <View>
                  {/* Horizontal Trending Highlights Carousel */}
                  <View style={styles.carouselSection}>
                    <View style={styles.carouselHeaderRow}>
                      <View style={styles.carouselTitleBox}>
                        <Ionicons
                          name={currentCategoryObj.icon as any}
                          size={18}
                          color={(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? '#1a73e8' : '#FF0000'}
                        />
                        <Text style={styles.carouselTitle}>
                          {currentCategoryObj.name}{(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? '' : ' Highlights'}
                        </Text>
                      </View>
                      <View style={[
                        styles.carouselBadge,
                        (selectedCategory === 'my_feed' || selectedCategory === 'liked') && {
                          backgroundColor: 'rgba(26, 115, 232, 0.15)',
                          borderColor: 'rgba(26, 115, 232, 0.4)',
                        },
                      ]}>
                        <Ionicons
                          name={(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? 'logo-google' : 'musical-notes'}
                          size={10}
                          color={(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? '#1a73e8' : '#FF0000'}
                        />
                        <Text style={[
                          styles.carouselBadgeText,
                          (selectedCategory === 'my_feed' || selectedCategory === 'liked') && { color: '#1a73e8' },
                        ]}>
                          {(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? 'Your Account' : 'Official Charts'}
                        </Text>
                      </View>
                    </View>

                    <FlatList
                      data={trendingVideos.slice(0, 10)}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item) => `carousel-${item.videoId}`}
                      renderItem={renderTrendingCard}
                      contentContainerStyle={styles.carouselScroll}
                    />
                  </View>

                  {/* Section Title for Full Chart List */}
                  <View style={styles.trendingListHeader}>
                    <Text style={styles.trendingListTitle}>
                      {selectedCategory === 'my_feed'
                        ? 'Latest from Subscriptions'
                        : selectedCategory === 'liked'
                        ? 'Your Liked Videos'
                        : `Top 30 ${currentCategoryObj.name} Videos`}
                    </Text>
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              isLoadingTrending ? (
                <View style={styles.centerLoadingContainer}>
                  <ActivityIndicator size="large" color={(selectedCategory === 'my_feed' || selectedCategory === 'liked') ? '#1a73e8' : '#FF0000'} />
                  <Text style={styles.searchingText}>
                    {selectedCategory === 'my_feed'
                      ? 'Loading your subscriptions feed...'
                      : selectedCategory === 'liked'
                      ? 'Loading your liked videos...'
                      : `Loading ${currentCategoryObj.name} on YouTube Charts...`}
                  </Text>
                </View>
              ) : (selectedCategory === 'my_feed' || selectedCategory === 'liked') ? (
                userFeedNeedsReauth ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="key-outline" size={48} color="#FFA726" />
                    <Text style={styles.emptyTitle}>YouTube Authorization Required</Text>
                    <Text style={styles.emptySubtitle}>
                      {userFeedError || 'Your YouTube access token expired or needs read permission. Connect your YouTube account to view your feed.'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.exploreTrendingBtn, { backgroundColor: '#1a73e8' }]}
                      onPress={async () => {
                        const result = await connectYouTubeAccount();
                        if (!result.error) loadTrending(selectedCategory);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-google" size={16} color="#ffffff" />
                      <Text style={styles.exploreTrendingBtnText}>Grant YouTube Access</Text>
                    </TouchableOpacity>
                  </View>
                ) : userFeedNotConnected ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="logo-youtube" size={48} color="#FF0000" />
                    <Text style={styles.emptyTitle}>YouTube Not Connected</Text>
                    <Text style={styles.emptySubtitle}>
                      Connect your Google account to see your subscriptions and liked videos here.
                    </Text>
                    <TouchableOpacity
                      style={[styles.exploreTrendingBtn, { backgroundColor: '#1a73e8' }]}
                      onPress={async () => {
                        if (isGuest) {
                          openAuthModal('signin');
                        } else {
                          const result = await connectYouTubeAccount();
                          if (!result.error) loadTrending(selectedCategory);
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-google" size={16} color="#ffffff" />
                      <Text style={styles.exploreTrendingBtnText}>
                        {isGuest ? 'Sign In First' : 'Connect YouTube'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : userFeedEmpty ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons
                      name={selectedCategory === 'my_feed' ? 'albums-outline' : 'heart-dislike-outline'}
                      size={48}
                      color="#8ab4f8"
                    />
                    <Text style={styles.emptyTitle}>
                      {selectedCategory === 'my_feed' ? 'No Subscriptions Found' : 'No Liked Videos'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                      {selectedCategory === 'my_feed'
                        ? 'Subscribe to channels on YouTube to see their latest uploads here.'
                        : 'Like videos on YouTube to see them in this collection.'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.exploreTrendingBtn, { backgroundColor: '#1a73e8' }]}
                      onPress={() => loadTrending(selectedCategory)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#ffffff" />
                      <Text style={styles.exploreTrendingBtnText}>Refresh Feed</Text>
                    </TouchableOpacity>
                  </View>
                ) : userFeedError ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={48} color="#FFA726" />
                    <Text style={styles.emptyTitle}>Feed Unavailable</Text>
                    <Text style={styles.emptySubtitle}>{userFeedError}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.exploreTrendingBtn, { backgroundColor: '#1a73e8', flex: 1 }]}
                        onPress={async () => {
                          const result = await connectYouTubeAccount();
                          if (!result.error) loadTrending(selectedCategory);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-google" size={16} color="#ffffff" />
                        <Text style={styles.exploreTrendingBtnText}>Reconnect</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.exploreTrendingBtn, { backgroundColor: '#333333', flex: 1 }]}
                        onPress={() => loadTrending(selectedCategory)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="refresh" size={16} color="#ffffff" />
                        <Text style={styles.exploreTrendingBtnText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="videocam-outline" size={48} color="#888888" />
                    <Text style={styles.emptyTitle}>No Videos in Feed</Text>
                    <Text style={styles.emptySubtitle}>
                      No recent videos found. Tap below to reload.
                    </Text>
                    <TouchableOpacity
                      style={[styles.exploreTrendingBtn, { backgroundColor: '#1a73e8' }]}
                      onPress={() => loadTrending(selectedCategory)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#ffffff" />
                      <Text style={styles.exploreTrendingBtnText}>Reload Feed</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="#888888" />
                  <Text style={styles.emptyTitle}>Charts unavailable</Text>
                  <Text style={styles.emptySubtitle}>
                    Could not connect to YouTube Charts. Tap below to retry.
                  </Text>
                  <TouchableOpacity
                    style={styles.exploreTrendingBtn}
                    onPress={() => loadTrending(selectedCategory)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color="#ffffff" />
                    <Text style={styles.exploreTrendingBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        )}
      </View>

      {/* Floating Miniplayer (matching Screenshot 2: docked in bottom right corner) */}
      {activeVideo && playerMode === 'mini' && (
        <View
          style={[
            styles.miniplayerContainer,
            { bottom: Math.max(insets.bottom, 12) + 12 },
          ]}
        >
          {/* Video View Box with separate tap-to-maximize touchable & close button */}
          <View style={styles.miniplayerVideoBox}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleMaximizeToWatch}
              style={StyleSheet.absoluteFill}
            >
              {videoStream && player ? (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <VideoView
                    key={`mini-video-${activeVideo.videoId}-${miniRemountKey}`}
                    style={StyleSheet.absoluteFill}
                    player={player}
                    contentFit="contain"
                    nativeControls={false}
                    surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
                    allowsPictureInPicture={true}
                    startsPictureInPictureAutomatically={true}
                  />
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: activeVideo.thumbnail }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}
            </TouchableOpacity>

            {/* Small Dimmer Overlay for Close Button */}
            <TouchableOpacity
              style={styles.miniplayerCloseBtn}
              onPress={() => {
                if (player) player.pause();
                setActiveVideo(null);
                setVideoStream(null);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={15} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Thin Red Progress Bar Indicator (tapping also maximizes) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleMaximizeToWatch}
            style={styles.miniplayerProgressTrack}
          >
            <View
              style={[
                styles.miniplayerProgressFill,
                {
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      effectiveDuration > 0
                        ? (currentDisplayTime / effectiveDuration) * 100
                        : 0
                    )
                  )}%`,
                },
              ]}
            />
          </TouchableOpacity>

          {/* Mini Control Bar: Replay 10s, Play/Pause, Forward 10s */}
          <View style={styles.miniplayerControlsBar}>
            <TouchableOpacity
              onPress={() => handleSeek(Math.max(0, currentTime - 10))}
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="replay-10" size={20} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTogglePlay}
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isVideoPlaying ? 'pause' : 'play'}
                size={22}
                color="#ffffff"
                style={!isVideoPlaying ? { marginLeft: 2 } : undefined}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                handleSeek(Math.min(effectiveDuration, currentTime + 10))
              }
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="forward-10" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Full Portrait Watch Screen (matching Screenshot 1: full watch page with channel name, no comments/like/dislike) */}
      {activeVideo && playerMode === 'full' && (
        <View style={styles.watchScreenOverlay}>
          <SafeAreaView
            style={[styles.watchScreenContainer, { backgroundColor: '#0f0f0f' }]}
            edges={['top', 'bottom']}
          >
            {/* 16:9 Video Canvas Frame */}
            <View style={styles.watchVideoCanvas}>
              {videoStream && player ? (
                <View style={StyleSheet.absoluteFill}>
                  {/* Unmount portrait VideoView while in fullscreen so FullscreenVideoOverlay owns surface without freeze */}
                  {!isFullscreen && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <VideoView
                        ref={watchVideoViewRef}
                        key={`watch-video-${activeVideo.videoId}-${watchRemountKey}`}
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="contain"
                        nativeControls={false}
                        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
                        allowsPictureInPicture={true}
                        startsPictureInPictureAutomatically={true}
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={toggleWatchControls}
                    style={StyleSheet.absoluteFill}
                  >
                    {/* Watch Controls Overlay */}
                    {showWatchControls && (
                      <View style={styles.watchControlsOverlay}>
                        <LinearGradient
                          colors={['rgba(0,0,0,0.65)', 'transparent', 'rgba(0,0,0,0.7)']}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />

                        {/* Top Bar: Chevron-down (collapse to miniplayer) & Actions */}
                        <View style={styles.watchTopBar}>
                          <TouchableOpacity
                            onPress={handleCollapseToMini}
                            style={styles.watchChevronBtn}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons name="chevron-down" size={28} color="#ffffff" />
                          </TouchableOpacity>

                        <View style={styles.watchTopRightActions}>
                          <TouchableOpacity
                            style={styles.watchTopActionBtn}
                            onPress={handleTriggerPiP}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="picture-in-picture-alt" size={22} color="#ffffff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.watchTopActionBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="cast" size={20} color="#ffffff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.watchTopActionBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="closed-caption-off" size={22} color="#ffffff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.watchTopActionBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="settings-outline" size={20} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Center Controls: Previous, Big Circular Play/Pause, Next */}
                      <View style={styles.watchCenterControls}>
                        <TouchableOpacity
                          onPress={() => {
                            handlePrevVideo();
                            resetWatchControlsTimer();
                          }}
                          style={styles.watchPrevNextBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="play-skip-back" size={28} color="#ffffff" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            handleSeek(Math.max(0, currentTime - 10));
                            resetWatchControlsTimer();
                          }}
                          style={styles.watchSecondarySeekBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="replay-10" size={30} color="#ffffff" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            handleTogglePlay();
                            resetWatchControlsTimer();
                          }}
                          style={styles.watchPlayPauseBtn}
                        >
                          <Ionicons
                            name={isVideoPlaying ? 'pause' : 'play'}
                            size={36}
                            color="#ffffff"
                            style={!isVideoPlaying ? { marginLeft: 3 } : undefined}
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            handleSeek(Math.min(effectiveDuration, currentTime + 10));
                            resetWatchControlsTimer();
                          }}
                          style={styles.watchSecondarySeekBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="forward-10" size={30} color="#ffffff" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            handleNextVideo();
                            resetWatchControlsTimer();
                          }}
                          style={styles.watchPrevNextBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="play-skip-forward" size={28} color="#ffffff" />
                        </TouchableOpacity>
                      </View>

                      {/* Bottom Row of Video: Time Text & Fullscreen Button */}
                      <View style={styles.watchBottomBar}>
                        <Text style={styles.watchTimeText}>
                          {formatTime(currentDisplayTime)} / {formatTime(effectiveDuration)}
                        </Text>

                        <TouchableOpacity
                          onPress={handleEnterFullscreen}
                          style={styles.watchFullscreenBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="fullscreen" size={26} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              ) : (
                <View style={styles.loadingStreamPlaceholder}>
                  <ExpoImage
                    source={{ uri: activeVideo.thumbnail }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                  <View style={styles.loadingDimmer}>
                    <ActivityIndicator size="large" color="#FF0000" />
                    <Text style={styles.resolvingStreamText}>
                      {isLoadingStream ? 'Connecting video stream...' : 'Preparing playback...'}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Red Scrub Slider right below Video Canvas */}
            <View style={styles.watchScrubberContainer}>
              <Slider
                style={styles.watchSlider}
                minimumValue={0}
                maximumValue={Math.max(1, effectiveDuration)}
                value={currentDisplayTime}
                minimumTrackTintColor="#FF0000"
                maximumTrackTintColor="rgba(255, 255, 255, 0.25)"
                thumbTintColor="#FF0000"
                onSlidingStart={handleSlidingStart}
                onValueChange={handleValueChange}
                onSlidingComplete={handleSlidingComplete}
              />
            </View>

            {/* Watch Details & Up Next ScrollView */}
            <ScrollView
              style={styles.watchDetailsScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Video Title */}
              <Text style={styles.watchVideoTitle} numberOfLines={3}>
                {activeVideo.title}
              </Text>

              {/* Video Stats */}
              <Text style={styles.watchVideoStats}>
                {activeVideo.viewCount || '10K views'}
                {activeVideo.publishedTime ? ` • ${activeVideo.publishedTime}` : ''}
              </Text>

              {/* Channel Row (Strictly Channel info, NO like/dislike/comments) */}
              <View style={styles.watchChannelRow}>
                {activeVideo.channelAvatar ? (
                  <ExpoImage
                    source={{ uri: activeVideo.channelAvatar }}
                    style={styles.watchChannelAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.watchChannelAvatarPlaceholder}>
                    <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                  </View>
                )}

                <View style={styles.watchChannelTextCol}>
                  <Text style={styles.watchChannelName} numberOfLines={1}>
                    {activeVideo.author}
                  </Text>
                  <Text style={styles.watchChannelSubBadge}>Official Channel</Text>
                </View>
              </View>

              <View style={styles.watchDivider} />

              {/* Up Next / Related Videos Header */}
              <View style={styles.upNextSectionHeader}>
                <Text style={styles.upNextSectionTitle}>Up Next</Text>
              </View>

              {/* Up Next Cards */}
              {upNextVideos.map((item: YouTubeVideoSearchResult) => (
                <TouchableOpacity
                  key={`upnext-${item.videoId}`}
                  style={styles.upNextCard}
                  onPress={() => handleSelectVideo(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.upNextThumbContainer}>
                    <ExpoImage
                      source={{ uri: item.thumbnail }}
                      style={styles.upNextThumb}
                      contentFit="cover"
                    />
                    {item.duration ? (
                      <View style={styles.upNextDurationBadge}>
                        <Text style={styles.upNextDurationText}>{item.duration}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.upNextMetaCol}>
                    <Text style={styles.upNextTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.upNextSubtitle} numberOfLines={1}>
                      {item.author}
                      {item.viewCount ? ` • ${item.viewCount}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Shared Fullscreen Video Overlay - Exact same logic, UI, and gestures */}
      {isFullscreen && player && activeVideo && (
        <FullscreenVideoOverlay
          player={player}
          isVisible={isFullscreen}
          qualityBadge={videoStream?.qualityBadge || '1080p HD'}
          title={activeVideo.title}
          artist={activeVideo.author}
          isPlaying={isVideoPlaying}
          position={currentTime}
          duration={effectiveDuration}
          onTogglePlay={handleTogglePlay}
          onSeekTo={handleSeek}
          onExitFullscreen={handleExitFullscreen}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  brandText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    maxHeight: 280,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  suggestionsScroll: {
    paddingVertical: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  suggestionBorderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  suggestionIcon: {
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  suggestionArrowBtn: {
    padding: 4,
  },
  categoryBarContainer: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryBarScroll: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  categoryChipActive: {
    borderColor: '#FF0000',
    backgroundColor: '#FF0000',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 3,
  },
  categoryChipText: {
    color: '#cccccc',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // Carousel Styles
  carouselSection: {
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  carouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  carouselTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carouselTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  carouselBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    borderColor: 'rgba(255, 0, 0, 0.4)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  carouselBadgeText: {
    color: '#FF0000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  carouselScroll: {
    paddingHorizontal: 14,
  },
  trendingCard: {
    width: Math.min(SCREEN_WIDTH * 0.68, 250),
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  trendingThumbContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  trendingThumb: {
    width: '100%',
    height: '100%',
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  rankBadgeGold: {
    backgroundColor: '#FFD700',
    borderColor: '#FFF8DC',
  },
  rankBadgeSilver: {
    backgroundColor: '#C0C0C0',
    borderColor: '#FFFFFF',
  },
  rankBadgeBronze: {
    backgroundColor: '#CD7F32',
    borderColor: '#FFA07A',
  },
  rankBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  rankBadgeTextTop: {
    color: '#000000',
    fontWeight: '900',
  },
  trendingDurationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  trendingDurationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  trendingPlayingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  trendingPlayingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trendingMeta: {
    padding: 10,
  },
  trendingTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 4,
  },
  trendingAuthor: {
    color: '#aaaaaa',
    fontSize: 11,
    fontWeight: '500',
  },
  trendingListHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  trendingListTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  exploreTrendingBtn: {
    marginTop: 14,
    backgroundColor: '#FF0000',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exploreTrendingBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  content: {
    flex: 1,
  },
  videoListContent: {
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  videoCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1f1f1f',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  nowPlayingIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  nowPlayingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  videoInfoRow: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  channelAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#333333',
  },
  channelAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoMetaCol: {
    flex: 1,
  },
  videoTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 3,
  },
  videoSubtitle: {
    color: '#888888',
    fontSize: 12,
  },
  cardActionBtn: {
    paddingLeft: 8,
  },
  centerLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchingText: {
    color: '#aaaaaa',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#777777',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Floating Miniplayer Styles (Screenshot 2)
  miniplayerContainer: {
    position: 'absolute',
    right: 14,
    width: 185,
    borderRadius: 12,
    backgroundColor: '#181818',
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    zIndex: 9999,
  },
  miniplayerVideoBox: {
    width: '100%',
    height: 104,
    backgroundColor: '#000000',
  },
  miniplayerCloseBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  miniplayerProgressTrack: {
    width: '100%',
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  miniplayerProgressFill: {
    height: '100%',
    backgroundColor: '#FF0000',
  },
  miniplayerControlsBar: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#161616',
    paddingHorizontal: 4,
  },
  miniControlBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Full Portrait Watch Screen Styles (Screenshot 1)
  watchScreenOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    backgroundColor: '#0f0f0f',
  },
  watchScreenContainer: {
    flex: 1,
  },
  watchVideoCanvas: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
    backgroundColor: '#000000',
  },
  watchControlsOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  watchTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watchChevronBtn: {
    padding: 4,
  },
  watchTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  watchTopActionBtn: {
    padding: 4,
  },
  watchCenterControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  watchPrevNextBtn: {
    padding: 8,
  },
  watchSecondarySeekBtn: {
    padding: 6,
  },
  watchPlayPauseBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(24, 24, 24, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 2,
  },
  watchTimeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  watchFullscreenBtn: {
    padding: 4,
  },
  watchScrubberContainer: {
    width: '100%',
    height: 18,
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  watchSlider: {
    width: SCREEN_WIDTH + 20,
    marginLeft: -10,
    height: 20,
  },
  watchDetailsScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  watchVideoTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  watchVideoStats: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 12,
  },
  watchChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  watchChannelAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    backgroundColor: '#262626',
  },
  watchChannelAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchChannelTextCol: {
    flex: 1,
  },
  watchChannelName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  watchChannelSubBadge: {
    color: '#777777',
    fontSize: 11,
    marginTop: 1,
  },
  watchDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  upNextSectionHeader: {
    marginBottom: 12,
  },
  upNextSectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  upNextCard: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 12,
  },
  upNextThumbContainer: {
    width: 130,
    height: 73,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222222',
  },
  upNextThumb: {
    width: '100%',
    height: '100%',
  },
  upNextDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  upNextDurationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  upNextMetaCol: {
    flex: 1,
    justifyContent: 'center',
  },
  upNextTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    marginBottom: 3,
  },
  upNextSubtitle: {
    color: '#888888',
    fontSize: 11,
  },
  loadingStreamPlaceholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDimmer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resolvingStreamText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  },
});
