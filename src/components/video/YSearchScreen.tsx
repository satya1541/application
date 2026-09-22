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
  fetchYouTubeSearchSuggestions,
  YouTubeVideoSearchResult,
  StandaloneVideoStreamDetails,
} from '@/services/youtubeVideoSearchService';
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

  // Search query, suggestions & results state
  const [query, setQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const suggestionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Setup standalone video player with expo-video
  // Stays active in background when phone is locked
  const videoSource = React.useMemo(() => {
    if (!videoStream?.hlsUrl) return null;
    return {
      uri: videoStream.hlsUrl,
      metadata: {
        title: activeVideo?.title || 'YouTube Video',
        artist: activeVideo?.author || 'YouTube',
        artwork: activeVideo?.thumbnail,
      },
    };
  }, [videoStream?.hlsUrl, activeVideo?.title, activeVideo?.author, activeVideo?.thumbnail]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.audioMixingMode = 'doNotMix';
    p.staysActiveInBackground = true; // Enables background playback when screen locks
    p.showNowPlayingNotification = true; // Shows system media notification
    p.timeUpdateEventInterval = 0.5; // 500ms interval for smooth progression with low battery/CPU usage
    try {
      p.bufferOptions = {
        preferredForwardBufferDuration: 15, // 15 seconds forward buffer reduces aggressive radio awake time
        minBufferForPlayback: 1.5,
        prioritizeTimeOverSizeThreshold: true,
        maxBufferBytes: 20 * 1024 * 1024, // 20MB lightweight buffer prevents memory & thermal pressure
      };
    } catch {}
    p.play();
  });

  // Ensure background play stays active on player instance
  useEffect(() => {
    if (!player) return;
    try {
      player.timeUpdateEventInterval = 0.5;
      player.staysActiveInBackground = true;
      player.showNowPlayingNotification = true;
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

  // Track video player events
  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (payload) => {
      setIsVideoPlaying(payload.isPlaying);
    });

    const subTime = player.addListener('timeUpdate', (payload) => {
      if (!isScrubbingRef.current) {
        setCurrentTime(payload.currentTime);
      }
      if (player.duration > 0) {
        setDuration(player.duration);
      }
    });

    const subStatus = player.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay') {
        const dur = player.duration || activeVideo?.durationSeconds || 0;
        if (dur > 0) setDuration(dur);
      }
    });

    const subSourceLoad = player.addListener('sourceLoad', (payload) => {
      if (payload.duration > 0) {
        setDuration(payload.duration);
      }
    });

    const subEnded = player.addListener('playToEnd', () => {
      setIsVideoPlaying(false);
    });

    return () => {
      subPlaying.remove();
      subTime.remove();
      subStatus.remove();
      subSourceLoad.remove();
      subEnded.remove();
    };
  }, [player, activeVideo]);

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
      setVideoStream(null);
      setIsLoadingStream(true);
      setCurrentTime(0);
      setDuration(item.durationSeconds || 0);

      try {
        const streamDetails = await resolveYouTubeStandaloneVideoStream(item.videoId);
        if (streamDetails) {
          setVideoStream(streamDetails);
          if (streamDetails.durationSeconds > 0) {
            setDuration(streamDetails.durationSeconds);
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
    if (!activeVideo || videos.length === 0) return;
    const currentIndex = videos.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex >= 0 && currentIndex < videos.length - 1) {
      handleSelectVideo(videos[currentIndex + 1]);
    }
  }, [activeVideo, videos, handleSelectVideo]);

  const handlePrevVideo = useCallback(() => {
    if (!activeVideo || videos.length === 0) return;
    const currentIndex = videos.findIndex((v) => v.videoId === activeVideo.videoId);
    if (currentIndex > 0) {
      handleSelectVideo(videos[currentIndex - 1]);
    } else {
      handleSeek(0);
    }
  }, [activeVideo, videos, handleSelectVideo]);

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

  // Memoize Up Next queue to avoid re-filtering 35 items on every time update
  const upNextVideos: YouTubeVideoSearchResult[] = useMemo(() => {
    if (!activeVideo || videos.length === 0) return [];
    return videos.filter((v) => v.videoId !== activeVideo.videoId).slice(0, 15);
  }, [videos, activeVideo?.videoId]);

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

      {/* Search Results List */}
      <View style={styles.content}>
        {isSearching ? (
          <View style={styles.centerLoadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.searchingText}>Searching YouTube videos...</Text>
          </View>
        ) : (
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
                <Ionicons name="logo-youtube" size={56} color="#FF0000" />
                <Text style={styles.emptyTitle}>
                  {query.trim() ? 'No videos found' : 'Search YouTube'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {query.trim()
                    ? 'Try searching with different keywords or artist names'
                    : 'Search for songs, music videos, live concerts, and creators'}
                </Text>
              </View>
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
                        key={`watch-video-${activeVideo.videoId}-${watchRemountKey}`}
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="contain"
                        nativeControls={false}
                        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
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
