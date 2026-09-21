import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Share,
  Dimensions,
  Linking,
  BackHandler,
  PanResponder,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import { Song } from '@/types/music';
import { YOUTUBE_OPUS_BADGE } from '@/services/youtubeMusicApi';
import {
  YouTubePost,
  YouTubePostsResult,
  fetchYouTubePosts,
  fetchNextYouTubePosts,
  getCachedYouTubePosts,
  MUSIC_AVATAR,
  normalizeUrl,
} from '@/services/youtubePostsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HORIZONTAL_PADDING = 16;
const MEDIA_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_PADDING * 2;

interface MobilePostsScreenProps {
  onNavigateHome?: () => void;
}

export const MobilePostsScreen: React.FC<MobilePostsScreenProps> = ({ onNavigateHome }) => {
  const { bgHex, surfaceHex, accent, themeMode } = useAppTheme();
  const { playSong } = useAudio();

  const [posts, setPosts] = useState<YouTubePost[]>([]);
  const [channelTitle, setChannelTitle] = useState('YouTube Music');
  const [channelAvatar, setChannelAvatar] = useState('');
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  const seenIdsRef = useRef<Set<string>>(new Set());

  // Handle hardware back navigation
  const handleBack = useCallback(() => {
    if (onNavigateHome) {
      onNavigateHome();
      return true;
    }
    return false;
  }, [onNavigateHome]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  // Swipe-to-go-back gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 25 && gestureState.dx > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50 && (gestureState.vx > 0.12 || gestureState.dx > 100)) {
          handleBack();
        }
      },
    })
  ).current;

  // Load initial posts
  const loadPosts = useCallback(async (forceRefresh: boolean = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      const cached = await getCachedYouTubePosts();
      if (cached && cached.posts.length > 0) {
        setPosts(cached.posts);
        setChannelTitle(cached.channelTitle);
        setChannelAvatar(cached.channelAvatar);
        setContinuationToken(cached.continuationToken);
        seenIdsRef.current = new Set(cached.posts.map((p) => p.postId));
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }

    try {
      const result = await fetchYouTubePosts(undefined, forceRefresh);
      if (result && result.posts.length > 0) {
        setPosts(result.posts);
        setChannelTitle(result.channelTitle);
        setChannelAvatar(result.channelAvatar);
        setContinuationToken(result.continuationToken);
        seenIdsRef.current = new Set(result.posts.map((p) => p.postId));
      }
    } catch (err) {
      console.warn('[MobilePostsScreen] Error loading posts:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(false);
  }, [loadPosts]);

  // Infinite pagination
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isFetchingMore || isLoading) return;

    setIsFetchingMore(true);
    try {
      const next = await fetchNextYouTubePosts(
        continuationToken,
        channelTitle,
        channelAvatar,
        seenIdsRef.current
      );

      if (next.posts.length > 0) {
        setPosts((prev) => [...prev, ...next.posts]);
        setContinuationToken(next.nextContinuationToken);
      } else {
        setContinuationToken(null);
      }
    } catch (err) {
      console.warn('[MobilePostsScreen] Error fetching more posts:', err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [continuationToken, isFetchingMore, isLoading, channelTitle, channelAvatar]);

  // Toggle local like state
  const handleToggleLike = useCallback((postId: string) => {
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  // Share post URL
  const handleShare = useCallback(async (post: YouTubePost) => {
    try {
      await Share.share({
        title: `${post.author} on YouTube`,
        message: `${post.text ? post.text.slice(0, 140) + '... ' : ''}${post.url}`,
        url: post.url,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  }, []);

  // Open post or external link in browser/YouTube app
  const handleOpenLink = useCallback(async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn('Cannot open URL:', url, err);
    }
  }, []);

  // Play attached video track in app player
  const handlePlayAttachedVideo = useCallback(
    (video: NonNullable<YouTubePost['video']>) => {
      const songItem: Song = {
        id: `yt_${video.videoId}`,
        name: video.title,
        artist: channelTitle,
        album: 'YouTube Music Community',
        duration: 215,
        cover: video.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
        streamUrl: video.url,
        quality: 'Opus',
        source: 'youtube',
        sourceBadge: YOUTUBE_OPUS_BADGE,
        hasLyrics: false,
      };
      playSong(songItem, [songItem]);
    },
    [channelTitle, playSong]
  );

  const renderHeader = useMemo(() => {
    return (
      <View style={styles.topHeader}>
        <View style={styles.titleRow}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.screenTitle}>Posts</Text>
            <View style={[styles.liveDot, { backgroundColor: accent.hex }]} />
          </View>
          <TouchableOpacity
            style={[styles.refreshIconButton, { backgroundColor: surfaceHex }]}
            activeOpacity={0.7}
            onPress={() => loadPosts(true)}
          >
            <Ionicons name="refresh" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={styles.channelBannerRow}>
          <ExpoImage
            source={{ uri: normalizeUrl(channelAvatar) || MUSIC_AVATAR }}
            style={styles.channelAvatarSmall}
            contentFit="cover"
            transition={150}
          />
          <View style={styles.channelMeta}>
            <View style={styles.channelNameRow}>
              <Text style={styles.channelNameText}>{channelTitle}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#3ea6ff" style={{ marginLeft: 4 }} />
            </View>
            <Text style={styles.channelSubtitleText}>Official Community Feed & Music Highlights</Text>
          </View>
        </View>
      </View>
    );
  }, [channelTitle, channelAvatar, accent.hex, surfaceHex, loadPosts]);

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return <View style={{ height: 110 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={accent.hex} />
        <Text style={styles.footerLoaderText}>Loading more posts...</Text>
      </View>
    );
  }, [isFetchingMore, accent.hex]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent.hex} />
          <Text style={styles.loadingText}>Fetching YouTube Music Posts...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="chatbubbles-outline" size={36} color="#666666" />
        </View>
        <Text style={styles.emptyTitle}>No Posts Available</Text>
        <Text style={styles.emptySubtitle}>Unable to load community posts right now. Please check your connection.</Text>
        <TouchableOpacity style={[styles.retryBtn, { borderColor: accent.hex }]} onPress={() => loadPosts(true)}>
          <Ionicons name="refresh" size={16} color={accent.hex} style={{ marginRight: 6 }} />
          <Text style={[styles.retryBtnText, { color: accent.hex }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }, [isLoading, accent.hex, loadPosts]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']} {...panResponder.panHandlers}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.postId}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isLiked={likedPostIds.has(item.postId)}
            onToggleLike={() => handleToggleLike(item.postId)}
            onShare={() => handleShare(item)}
            onOpenLink={handleOpenLink}
            onPlayVideo={handlePlayAttachedVideo}
            surfaceColor={surfaceHex}
            accentColor={accent.hex}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadPosts(true)}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      />
    </SafeAreaView>
  );
};

interface PostCardProps {
  post: YouTubePost;
  isLiked: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onOpenLink: (url: string) => void;
  onPlayVideo: (video: NonNullable<YouTubePost['video']>) => void;
  surfaceColor: string;
  accentColor: string;
}

const PostCard: React.FC<PostCardProps> = React.memo(
  ({ post, isLiked, onToggleLike, onShare, onOpenLink, onPlayVideo, surfaceColor, accentColor }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [avatarError, setAvatarError] = useState(false);

    const isLongText = post.text && post.text.length > 220;
    const displayText = isLongText && !isExpanded ? `${post.text.slice(0, 220)}...` : post.text;

    const avatarUri = useMemo(() => {
      if (avatarError) return MUSIC_AVATAR;
      return normalizeUrl(post.avatar) || MUSIC_AVATAR;
    }, [post.avatar, avatarError]);

    return (
      <View style={[styles.cardContainer, { backgroundColor: surfaceColor }]}>
        {/* Post Header */}
        <View style={styles.cardHeader}>
          <View style={styles.authorRow}>
            {avatarError ? (
              <View style={[styles.authorAvatarFallback, { backgroundColor: '#FF0000' }]}>
                <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
              </View>
            ) : (
              <ExpoImage
                source={{ uri: avatarUri }}
                style={styles.authorAvatar}
                contentFit="cover"
                transition={150}
                onError={() => setAvatarError(true)}
              />
            )}
            <View style={styles.authorInfo}>
              <View style={styles.authorNameRow}>
                <Text style={styles.authorName} numberOfLines={1}>
                  {post.author || 'YouTube Music'}
                </Text>
                <Ionicons name="checkmark-circle" size={13} color="#3ea6ff" style={{ marginLeft: 3 }} />
              </View>
              <Text style={styles.publishedTime}>{post.publishedTime}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerActionBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => onOpenLink(post.url)}
          >
            <Ionicons name="logo-youtube" size={18} color="#FF0000" />
          </TouchableOpacity>
        </View>

        {/* Post Text Content */}
        {post.text ? (
          <View style={styles.textContainer}>
            <Text style={styles.postText}>
              {displayText}
            </Text>
            {isLongText && (
              <TouchableOpacity
                onPress={() => setIsExpanded((prev) => !prev)}
                style={styles.expandToggleBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.expandToggleText, { color: accentColor }]}>
                  {isExpanded ? 'Show less' : 'Read more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Media: Multi-Image Carousel or Single Image */}
        {post.images && post.images.length > 1 ? (
          <View style={styles.carouselWrapper}>
            <FlatList
              data={post.images}
              keyExtractor={(_, idx) => `${post.postId}_img_${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / MEDIA_WIDTH);
                setActiveImageIndex(newIndex);
              }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => onOpenLink(post.url)}
                  style={styles.carouselImageContainer}
                >
                  <ExpoImage source={{ uri: item }} style={styles.carouselImage} contentFit="cover" />
                </TouchableOpacity>
              )}
            />
            {/* Carousel Dot Indicator */}
            <View style={styles.carouselDotBar}>
              {post.images.map((_, dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    styles.carouselDot,
                    dotIdx === activeImageIndex && [styles.carouselDotActive, { backgroundColor: accentColor }],
                  ]}
                />
              ))}
            </View>
          </View>
        ) : post.images && post.images.length === 1 ? (
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => onOpenLink(post.url)}
            style={styles.singleImageContainer}
          >
            <ExpoImage source={{ uri: post.images[0] }} style={styles.singleImage} contentFit="cover" />
          </TouchableOpacity>
        ) : null}

        {/* Media: Attached Video Preview */}
        {post.video ? (
          <TouchableOpacity
            style={styles.videoCard}
            activeOpacity={0.88}
            onPress={() => onPlayVideo(post.video!)}
          >
            <View style={styles.videoThumbWrapper}>
              <ExpoImage source={{ uri: post.video.thumbnail }} style={styles.videoThumb} contentFit="cover" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
              <View style={styles.videoPlayOverlay}>
                <View style={[styles.playIconCircle, { backgroundColor: accentColor }]}>
                  <Ionicons name="play" size={20} color="#000000" style={{ marginLeft: 2 }} />
                </View>
              </View>
              {post.video.duration ? (
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{post.video.duration}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.videoMetaContainer}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {post.video.title}
              </Text>
              <Text style={styles.videoSublabel}>Official YouTube Video • Tap to play</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Media: Attached Community Poll */}
        {post.poll && post.poll.choices && post.poll.choices.length > 0 ? (
          <View style={styles.pollContainer}>
            <View style={styles.pollHeader}>
              <Ionicons name="stats-chart" size={14} color={accentColor} style={{ marginRight: 6 }} />
              <Text style={styles.pollHeaderText}>Community Poll</Text>
              {post.poll.totalVotes ? (
                <Text style={styles.pollTotalVotes}>• {post.poll.totalVotes}</Text>
              ) : null}
            </View>
            {post.poll.choices.map((choice, cIdx) => (
              <View key={cIdx} style={styles.pollChoiceRow}>
                <View style={styles.pollChoiceBg} />
                <Text style={styles.pollChoiceText}>{choice.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Action Footer Bar */}
        <View style={styles.cardFooter}>
          {/* Like Button */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={onToggleLike}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={19}
              color={isLiked ? '#FF3B30' : '#b3b3b3'}
            />
            <Text style={[styles.actionButtonText, isLiked && { color: '#FF3B30', fontWeight: '700' }]}>
              {post.likes}
            </Text>
          </TouchableOpacity>

          {/* Comment Counter */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => onOpenLink(post.url)}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#b3b3b3" />
            <Text style={styles.actionButtonText}>{post.comments}</Text>
          </TouchableOpacity>

          {/* Native Share */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={onShare}
          >
            <Ionicons name="share-social-outline" size={19} color="#b3b3b3" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>

          {/* Open on YouTube link */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => onOpenLink(post.url)}
          >
            <Ionicons name="open-outline" size={18} color="#808080" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  listContent: {
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 8,
  },
  topHeader: {
    marginBottom: 16,
    paddingTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  refreshIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  channelBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  channelAvatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
  },
  channelAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelMeta: {
    flex: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelNameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  channelSubtitleText: {
    color: '#9e9e9e',
    fontSize: 11,
    marginTop: 2,
  },
  cardContainer: {
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    backgroundColor: '#1c1c1c',
    overflow: 'hidden',
  },
  authorAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarLetter: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  authorInfo: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '85%',
  },
  publishedTime: {
    color: '#808080',
    fontSize: 11,
    marginTop: 1,
  },
  headerActionBtn: {
    padding: 6,
  },
  textContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  postText: {
    color: '#e5e5e5',
    fontSize: 14,
    lineHeight: 20,
  },
  expandToggleBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  expandToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  carouselWrapper: {
    width: MEDIA_WIDTH,
    marginBottom: 10,
  },
  carouselImageContainer: {
    width: MEDIA_WIDTH,
    height: MEDIA_WIDTH * 0.95,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1c1c1c',
  },
  carouselDotBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  carouselDotActive: {
    width: 16,
    height: 6,
    borderRadius: 3,
  },
  singleImageContainer: {
    width: '100%',
    height: MEDIA_WIDTH * 0.95,
    marginBottom: 8,
  },
  singleImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1c1c1c',
  },
  videoCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  videoThumbWrapper: {
    width: '100%',
    height: MEDIA_WIDTH * 0.52,
    position: 'relative',
    backgroundColor: '#000000',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  videoMetaContainer: {
    padding: 10,
  },
  videoTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 3,
  },
  videoSublabel: {
    color: '#9e9e9e',
    fontSize: 11,
  },
  pollContainer: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pollHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  pollTotalVotes: {
    color: '#808080',
    fontSize: 11,
    marginLeft: 6,
  },
  pollChoiceRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#262626',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pollChoiceBg: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
  },
  pollChoiceText: {
    color: '#e5e5e5',
    fontSize: 13,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  actionButtonText: {
    color: '#b3b3b3',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: {
    color: '#9e9e9e',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#808080',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingBottom: 120,
    gap: 8,
  },
  footerLoaderText: {
    color: '#808080',
    fontSize: 12,
  },
});
