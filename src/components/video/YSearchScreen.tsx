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
  Animated,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import { useVideoPlayerContext } from '@/contexts/VideoPlayerContext';
import splashVideoSource from '@/../assets/videos/ysearch_splash.mp4';
import {
  searchYouTubeVideosWithContinuation,
  fetchNextYouTubeSearchVideos,
  resolveYouTubeStandaloneVideoStream,
  fetchYouTubeSearchSuggestions,
  fetchTrendingYouTubeVideos,
  TRENDING_CATEGORIES,
  YouTubeVideoSearchResult,
} from '@/services/youtubeVideoSearchService';
import {
  fetchUserSubscriptionsFeed,
  fetchUserLikedVideos,
  UserFeedResult,
} from '@/services/youtubeUserFeedService';
import { useAuth } from '@/contexts/AuthContext';
import { YouTubeChannelScreen } from './YouTubeChannelScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 24;
const CARD_THUMB_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
const TRENDING_CARD_WIDTH = Math.round(Math.min(SCREEN_WIDTH * 0.68, 250));
const TRENDING_THUMB_HEIGHT = Math.round((TRENDING_CARD_WIDTH * 9) / 16);

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

  // Merge trending + user feed categories into one chip list - My Feed always first
  const allCategories = useMemo(() => {
    return [...USER_FEED_CATEGORIES, ...TRENDING_CATEGORIES];
  }, [USER_FEED_CATEGORIES]);

  // Search query, suggestions & results state
  const [query, setQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const suggestionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trending / Discover category & video list state - Default to My Feed
  const [selectedCategory, setSelectedCategory] = useState<string>('my_feed');
  const [trendingVideos, setTrendingVideos] = useState<YouTubeVideoSearchResult[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [userFeedNeedsReauth, setUserFeedNeedsReauth] = useState(false);
  const [userFeedNotConnected, setUserFeedNotConnected] = useState(false);
  const [userFeedError, setUserFeedError] = useState<string | null>(null);
  const [userFeedEmpty, setUserFeedEmpty] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<{
    channelId: string;
    title: string;
    avatar?: string;
  } | null>(null);

  const handleOpenChannel = useCallback((video: YouTubeVideoSearchResult) => {
    const resolvedChannelId = video.channelId || (video.id.startsWith('UC') ? video.id : video.author);
    setSelectedChannel({
      channelId: resolvedChannelId,
      title: video.author,
      avatar: video.channelAvatar,
    });
  }, []);

  const {
    activeVideo,
    isVideoPlaying,
    playerMode,
    playVideo,
    togglePlay,
  } = useVideoPlayerContext();

  // Intro splash video for YSearch (plays once when opening YSearch, then closes automatically)
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashDismissedRef = useRef(false);

  const splashPlayer = useVideoPlayer(splashVideoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  // Pause background audio when splash begins
  useEffect(() => {
    if (isAudioPlaying) {
      try {
        pauseBackgroundAudio();
      } catch {}
    }
  }, []);

  const dismissSplash = useCallback(() => {
    if (splashDismissedRef.current) return;
    splashDismissedRef.current = true;
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      setShowSplash(false);
      try {
        splashPlayer.pause();
        splashPlayer.replace(null); // Free hardware MediaCodec and memory immediately
      } catch {}
    });
  }, [splashOpacity, splashPlayer]);

  useEffect(() => {
    if (!splashPlayer) return;
    const sub = splashPlayer.addListener('playToEnd', () => {
      dismissSplash();
    });
    // Safety auto-dismiss fallback timer (9.5s since video duration is 8.0s)
    const fallbackTimer = setTimeout(() => {
      dismissSplash();
    }, 9500);

    return () => {
      sub.remove();
      clearTimeout(fallbackTimer);
    };
  }, [splashPlayer, dismissSplash]);

  // Back handler during splash to dismiss smoothly instead of abruptly exiting
  useEffect(() => {
    if (!showSplash) return;
    const backAction = () => {
      dismissSplash();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showSplash, dismissSplash]);

  // Back handler when active in YSearch: clear channel modal / suggestions / search query first, or delegate to onBack
  useEffect(() => {
    if (showSplash) return;
    const backAction = () => {
      if (selectedChannel) {
        setSelectedChannel(null);
        return true;
      }
      if (showSuggestions) {
        setShowSuggestions(false);
        Keyboard.dismiss();
        return true;
      }
      if (query.trim().length > 0 || videos.length > 0) {
        setQuery('');
        setVideos([]);
        setNextPageToken(null);
        setShowSuggestions(false);
        Keyboard.dismiss();
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showSplash, selectedChannel, showSuggestions, query, videos.length, onBack]);

  const handleHeaderBack = useCallback(() => {
    if (showSuggestions) {
      setShowSuggestions(false);
      Keyboard.dismiss();
      return;
    }
    if (query.trim().length > 0 || videos.length > 0) {
      setQuery('');
      setVideos([]);
      setNextPageToken(null);
      setShowSuggestions(false);
      Keyboard.dismiss();
      return;
    }
    onBack?.();
  }, [showSuggestions, query, videos.length, onBack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        splashPlayer.pause();
        splashPlayer.replace(null); // Free hardware MediaCodec decoder and resources
      } catch {}
    };
  }, [splashPlayer]);

  // YouTube video search
  const performSearch = useCallback(async (searchQuery: string) => {
    const clean = searchQuery.trim();
    if (!clean) {
      setVideos([]);
      setNextPageToken(null);
      setIsSearching(false);
      setShowSuggestions(false);
      return;
    }
    setIsSearching(true);
    setShowSuggestions(false);
    setNextPageToken(null);
    try {
      const page = await searchYouTubeVideosWithContinuation(clean, 35);
      setVideos(page.videos);
      setNextPageToken(page.continuationToken);
    } catch (err) {
      console.warn('YSearch performSearch failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Infinite scroll: load next page of search results
  const loadMoreResults = useCallback(async () => {
    if (!nextPageToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchNextYouTubeSearchVideos(nextPageToken, 25);
      if (page.videos.length > 0) {
        setVideos((prev) => {
          // Deduplicate by videoId
          const existingIds = new Set(prev.map((v) => v.videoId));
          const newVideos = page.videos.filter((v) => !existingIds.has(v.videoId));
          return [...prev, ...newVideos];
        });
      }
      setNextPageToken(page.continuationToken);
    } catch (err) {
      console.warn('YSearch loadMore failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextPageToken, isLoadingMore]);

  useEffect(() => {
    if (initialQuery.trim()) {
      performSearch(initialQuery);
    }
  }, [performSearch, initialQuery]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load Trending videos from official InnerTube Charts or User Feed
  const loadTrending = useCallback(async (catId: string, forceRefresh = false) => {
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
          feedResult = await fetchUserSubscriptionsFeed(30, forceRefresh);
        } else {
          feedResult = await fetchUserLikedVideos(30, forceRefresh);
        }

        if (feedResult.videos && feedResult.videos.length > 0) {
          setTrendingVideos(feedResult.videos);
          setUserFeedEmpty(false);
          setUserFeedNeedsReauth(false);
          setUserFeedError(null);
        } else {
          setTrendingVideos([]);
          if (feedResult.notConnected) {
            setUserFeedNotConnected(true);
          } else if (feedResult.requiresReauth) {
            setUserFeedNeedsReauth(true);
            setUserFeedError(feedResult.error || null);
          } else if (feedResult.error) {
            setUserFeedError(feedResult.error);
          } else {
            setUserFeedEmpty(true);
          }
        }
      } else {
        const results = await fetchTrendingYouTubeVideos(catId, 30, forceRefresh);
        setTrendingVideos(results);
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (query.trim()) {
        await performSearch(query);
      } else {
        await loadTrending(selectedCategory, true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [query, performSearch, loadTrending, selectedCategory]);

  useEffect(() => {
    loadTrending(selectedCategory);
  }, [loadTrending, selectedCategory]);

  const handleSelectCategory = useCallback(
    (catId: string) => {
      setSelectedCategory(catId);
      if (query.trim()) {
        setQuery('');
        setVideos([]);
        setNextPageToken(null);
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
  // Play video via global player context
  const handleSelectVideo = useCallback(
    (item: YouTubeVideoSearchResult) => {
      const currentList = videos.length > 0 ? videos : trendingVideos;
      playVideo(item, currentList);
    },
    [videos, trendingVideos, playVideo]
  );

  const handleCardPlayPress = useCallback(
    (item: YouTubeVideoSearchResult) => {
      if (activeVideo?.videoId === item.videoId) {
        togglePlay();
      } else {
        handleSelectVideo(item);
      }
    },
    [activeVideo?.videoId, togglePlay, handleSelectVideo]
  );

  // Android Back Button handling:
  // 1. If in search suggestions -> close suggestions
  // 2. Else -> navigate back (onBack)
  useEffect(() => {
    const onBackPress = () => {
      if (showSuggestions) {
        setShowSuggestions(false);
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [showSuggestions, onBack]);

  // Render YouTube Search Result Video Card (delegates to memoized VideoCardItem)
  const renderVideoCard = useCallback(
    ({ item }: { item: YouTubeVideoSearchResult }) => {
      const isThisActive = activeVideo?.videoId === item.videoId;
      return (
        <VideoCardItem
          item={item}
          isActive={isThisActive}
          isPlaying={isThisActive && isVideoPlaying}
          themeMode={themeMode}
          surfaceHex={surfaceHex}
          onSelect={handleSelectVideo}
          onPlayPress={handleCardPlayPress}
          onChannelPress={handleOpenChannel}
        />
      );
    },
    [activeVideo?.videoId, isVideoPlaying, themeMode, surfaceHex, handleSelectVideo, handleCardPlayPress, handleOpenChannel]
  );

  // Active Category Object
  const currentCategoryObj = useMemo(() => {
    const allCats = [...(isYouTubeLinked ? USER_FEED_CATEGORIES : []), ...TRENDING_CATEGORIES];
    return allCats.find((c) => c.id === selectedCategory) || TRENDING_CATEGORIES[0];
  }, [selectedCategory, isYouTubeLinked, USER_FEED_CATEGORIES]);

  // Render Trending Carousel Card (Horizontal, delegates to memoized TrendingCardItem)
  const renderTrendingCard = useCallback(
    ({ item }: { item: YouTubeVideoSearchResult }) => {
      const isThisActive = activeVideo?.videoId === item.videoId;
      return (
        <TrendingCardItem
          item={item}
          isActive={isThisActive}
          themeMode={themeMode}
          surfaceHex={surfaceHex}
          onSelect={handleSelectVideo}
        />
      );
    },
    [activeVideo?.videoId, themeMode, surfaceHex, handleSelectVideo]
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000000"
        translucent={Platform.OS === 'android'}
      />

      <SafeAreaView
        style={[styles.container, { backgroundColor: bgHex }]}
        edges={['top']}
      >
        {/* YouTube-Styled Search Header */}
        <View style={[styles.headerContainer, { backgroundColor: bgHex }]}>
        <View style={styles.searchTopRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleHeaderBack}
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
            extraData={`${activeVideo?.videoId}-${isVideoPlaying}-${playerMode}`}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={[
              styles.videoListContent,
              { paddingBottom: activeVideo && playerMode === 'mini' ? 140 + insets.bottom : 24 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
            windowSize={11}
            maxToRenderPerBatch={10}
            initialNumToRender={8}
            onScrollBeginDrag={() => {
              setShowSuggestions(false);
              Keyboard.dismiss();
            }}
            onEndReached={loadMoreResults}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.loadMoreContainer}>
                  <ActivityIndicator size="small" color="#FF0000" />
                  <Text style={styles.loadMoreText}>Loading more videos...</Text>
                </View>
              ) : null
            }
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
                    setNextPageToken(null);
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
            extraData={`${activeVideo?.videoId}-${isVideoPlaying}-${playerMode}`}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={[
              styles.videoListContent,
              { paddingBottom: activeVideo && playerMode === 'mini' ? 140 + insets.bottom : 24 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
            windowSize={11}
            maxToRenderPerBatch={10}
            initialNumToRender={8}
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
                      <TouchableOpacity
                        style={[
                          styles.carouselBadge,
                          (selectedCategory === 'my_feed' || selectedCategory === 'liked') && {
                            backgroundColor: 'rgba(26, 115, 232, 0.15)',
                            borderColor: 'rgba(26, 115, 232, 0.4)',
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={async () => {
                          if (selectedCategory === 'my_feed' || selectedCategory === 'liked') {
                            const res = await connectYouTubeAccount();
                            if (!res.error) loadTrending(selectedCategory);
                          }
                        }}
                      >
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
                      </TouchableOpacity>
                    </View>

                    <FlatList
                      data={trendingVideos.slice(0, 10)}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item) => `carousel-${item.videoId}`}
                      renderItem={renderTrendingCard}
                      contentContainerStyle={styles.carouselScroll}
                      removeClippedSubviews={false}
                      extraData={`${activeVideo?.videoId}-${isVideoPlaying}`}
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

      {/* Full Channel View Modal Overlay */}
      {selectedChannel && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 99999 }]}>
          <YouTubeChannelScreen
            channelId={selectedChannel.channelId}
            initialTitle={selectedChannel.title}
            initialAvatar={selectedChannel.avatar}
            onClose={() => setSelectedChannel(null)}
          />
        </View>
      )}

    </SafeAreaView>

    {/* 100% Edge-to-Edge Fullscreen Intro Splash Video (No Modal, Seamless In-Hierarchy Dissolve) */}
    {showSplash && (
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000000',
            opacity: splashOpacity,
            zIndex: 999999,
          },
        ]}
        pointerEvents={splashDismissedRef.current ? 'none' : 'auto'}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={dismissSplash}
          style={StyleSheet.absoluteFill}
        >
          <VideoView
            player={splashPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
            allowsPictureInPicture={false}
            startsPictureInPictureAutomatically={false}
          />
        </TouchableOpacity>
      </Animated.View>
    )}
  </View>
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
    width: TRENDING_CARD_WIDTH,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  trendingThumbContainer: {
    width: TRENDING_CARD_WIDTH,
    height: TRENDING_THUMB_HEIGHT,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  trendingThumb: {
    width: TRENDING_CARD_WIDTH,
    height: TRENDING_THUMB_HEIGHT,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
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
    borderWidth: 1.5,
  },
  thumbnailContainer: {
    width: CARD_WIDTH,
    height: CARD_THUMB_HEIGHT,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
    position: 'relative',
  },
  thumbnailImage: {
    width: CARD_WIDTH,
    height: CARD_THUMB_HEIGHT,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
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
  liveBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#CC0000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  liveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trendingLiveBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#CC0000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
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
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadMoreText: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '500',
  },
  reauthNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 167, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 167, 38, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  reauthNoticeText: {
    color: '#FFA726',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
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
  upNextLiveBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#CC0000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  watchLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#CC0000',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  watchLiveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  watchStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#CC0000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  livePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  miniLiveBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#CC0000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    zIndex: 10,
  },
  miniLiveText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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

// ============================================================================
// MEMOIZED VIDEO CARD COMPONENTS (Prevent Android Card/Thumbnail Blanking)
// ============================================================================

interface VideoCardItemProps {
  item: YouTubeVideoSearchResult;
  isActive: boolean;
  isPlaying: boolean;
  themeMode: string;
  surfaceHex: string;
  onSelect: (item: YouTubeVideoSearchResult) => void;
  onPlayPress: (item: YouTubeVideoSearchResult) => void;
  onChannelPress?: (item: YouTubeVideoSearchResult) => void;
}

const VideoCardItem = React.memo<VideoCardItemProps>(
  ({ item, isActive, isPlaying, themeMode, surfaceHex, onSelect, onPlayPress, onChannelPress }) => {
    const [thumbError, setThumbError] = useState(false);
    const thumbUri = thumbError
      ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
      : (item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`);

    return (
      <TouchableOpacity
        style={[
          styles.videoCard,
          {
            backgroundColor: themeMode === 'oled' ? '#0a0a0a' : surfaceHex,
            borderColor: isActive ? '#FF0000' : 'rgba(255, 255, 255, 0.06)',
          },
        ]}
        onPress={() => onSelect(item)}
        activeOpacity={0.85}
      >
        {/* 16:9 Video Thumbnail with explicit width & height */}
        <View style={styles.thumbnailContainer}>
          <ExpoImage
            key={`thumb-${item.videoId}-${thumbError ? 'fb' : 'main'}`}
            source={{ uri: thumbUri }}
            style={styles.thumbnailImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            onError={() => setThumbError(true)}
          />

          {/* YouTube Duration or LIVE Badge */}
          {item.isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : item.duration ? (
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
          {isActive && (
            <View style={styles.nowPlayingIndicator}>
              <Ionicons
                name={isPlaying ? 'volume-high' : 'pause'}
                size={14}
                color="#ffffff"
              />
              <Text style={styles.nowPlayingText}>
                {isPlaying ? 'PLAYING' : 'PAUSED'}
              </Text>
            </View>
          )}
        </View>

        {/* Video Info Row */}
        <View
          style={[
            styles.videoInfoRow,
            {
              backgroundColor: themeMode === 'oled' ? '#0a0a0a' : surfaceHex,
            },
          ]}
        >
          {/* Channel Avatar */}
          <TouchableOpacity
            onPress={() => onChannelPress?.(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {item.channelAvatar ? (
              <ExpoImage
                source={{ uri: item.channelAvatar }}
                style={styles.channelAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : (
              <View style={styles.channelAvatarPlaceholder}>
                <Ionicons name="logo-youtube" size={16} color="#FF0000" />
              </View>
            )}
          </TouchableOpacity>

          {/* Title & Channel Subtitle */}
          <View style={styles.videoMetaCol}>
            <Text
              style={[
                styles.videoTitle,
                isActive && { color: '#FF0000', fontWeight: '700' },
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <TouchableOpacity onPress={() => onChannelPress?.(item)} activeOpacity={0.7}>
              <Text style={styles.videoSubtitle} numberOfLines={1}>
                {item.author}
                {item.viewCount ? ` • ${item.viewCount}` : ''}
                {item.publishedTime ? ` • ${item.publishedTime}` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Play Icon */}
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => onPlayPress(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isActive && isPlaying ? 'pause-circle' : 'play-circle'}
              size={32}
              color={isActive ? '#FF0000' : '#ffffff'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }
);

interface TrendingCardItemProps {
  item: YouTubeVideoSearchResult;
  isActive: boolean;
  themeMode: string;
  surfaceHex: string;
  onSelect: (item: YouTubeVideoSearchResult) => void;
}

const TrendingCardItem = React.memo<TrendingCardItemProps>(
  ({ item, isActive, themeMode, surfaceHex, onSelect }) => {
    const rank = item.rank || 1;
    const isTop1 = rank === 1;
    const isTop2 = rank === 2;
    const isTop3 = rank === 3;
    const [thumbError, setThumbError] = useState(false);
    const thumbUri = thumbError
      ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
      : (item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`);

    return (
      <TouchableOpacity
        style={[
          styles.trendingCard,
          {
            backgroundColor: themeMode === 'oled' ? '#141414' : surfaceHex,
            borderColor: isActive ? '#FF0000' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
        onPress={() => onSelect(item)}
        activeOpacity={0.85}
      >
        <View style={styles.trendingThumbContainer}>
          <ExpoImage
            key={`trend-${item.videoId}-${thumbError ? 'fb' : 'main'}`}
            source={{ uri: thumbUri }}
            style={styles.trendingThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            onError={() => setThumbError(true)}
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

          {/* Duration or LIVE Badge */}
          {item.isLive ? (
            <View style={styles.trendingLiveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : item.duration ? (
            <View style={styles.trendingDurationBadge}>
              <Text style={styles.trendingDurationText}>{item.duration}</Text>
            </View>
          ) : null}

          {/* Active Playing Badge */}
          {isActive && (
            <View style={styles.trendingPlayingOverlay}>
              <Ionicons name="volume-high" size={14} color="#ffffff" />
              <Text style={styles.trendingPlayingText}>PLAYING</Text>
            </View>
          )}
        </View>

        <View style={styles.trendingMeta}>
          <Text
            style={[
              styles.trendingTitle,
              isActive && { color: '#FF0000', fontWeight: '700' },
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
  }
);
