import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  BackHandler,
  Share,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useVideoPlayerContext } from '@/contexts/VideoPlayerContext';
import {
  fetchYouTubeChannelDetails,
  YouTubeChannelDetails,
} from '@/services/youtubeChannelService';
import { YouTubeVideoSearchResult } from '@/services/youtubeVideoSearchService';
import { SafeStorage } from '@/services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 120;
const AVATAR_SIZE = 76;

interface YouTubeChannelScreenProps {
  channelId: string;
  initialTitle?: string;
  initialAvatar?: string;
  onClose: () => void;
}

export const YouTubeChannelScreen: React.FC<YouTubeChannelScreenProps> = ({
  channelId,
  initialTitle = 'YouTube Channel',
  initialAvatar,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { bgHex, surfaceHex, themeMode } = useAppTheme();
  const { activeVideo, isVideoPlaying, playerMode, playVideo } = useVideoPlayerContext();

  const [channelDetails, setChannelDetails] = useState<YouTubeChannelDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check saved subscription status
  useEffect(() => {
    async function checkSub() {
      try {
        const raw = await SafeStorage.getItem('@shorty_user_subscribed_channels');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const exists = list.some((c: any) => c.channelId === channelId);
            setIsSubscribed(exists);
          }
        }
      } catch {}
    }
    checkSub();
  }, [channelId]);

  // Load channel details
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetchYouTubeChannelDetails(channelId, initialTitle, initialAvatar)
      .then((data) => {
        if (isMounted) {
          setChannelDetails(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to load channel details:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId, initialTitle, initialAvatar]);

  // Handle hardware back press
  useEffect(() => {
    const backAction = () => {
      onClose();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [onClose]);

  // Toggle subscription state
  const handleToggleSubscribe = useCallback(async () => {
    const newSubState = !isSubscribed;
    setIsSubscribed(newSubState);

    try {
      const raw = await SafeStorage.getItem('@shorty_user_subscribed_channels');
      let list: any[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];

      if (newSubState) {
        if (!list.some((c) => c.channelId === channelId)) {
          list.push({
            channelId,
            title: channelDetails?.title || initialTitle,
            thumbnail: channelDetails?.avatarUrl || initialAvatar,
            lastUpdated: Date.now(),
          });
        }
      } else {
        list = list.filter((c) => c.channelId !== channelId);
      }
      await SafeStorage.setItem('@shorty_user_subscribed_channels', JSON.stringify(list));
    } catch (err) {
      console.warn('Failed to save subscription:', err);
    }
  }, [isSubscribed, channelId, channelDetails, initialTitle, initialAvatar]);

  // Share Channel
  const handleShareChannel = useCallback(async () => {
    try {
      const url = channelId.startsWith('UC')
        ? `https://www.youtube.com/channel/${channelId}`
        : `https://www.youtube.com/${channelId}`;
      await Share.share({
        message: `Check out ${channelDetails?.title || initialTitle} on YouTube: ${url}`,
        url,
      });
    } catch {}
  }, [channelId, channelDetails, initialTitle]);

  const renderHeader = () => {
    const title = channelDetails?.title || initialTitle;
    const avatar = channelDetails?.avatarUrl || initialAvatar;
    const banner = channelDetails?.bannerUrl;
    const handle = channelDetails?.handle;
    const subCount = channelDetails?.subscriberCount;
    const videoCount = channelDetails?.videoCount;

    return (
      <View style={styles.headerContainer}>
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {banner ? (
            <ExpoImage
              source={{ uri: banner }}
              style={styles.bannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient
              colors={['#1a1a2e', '#16213e', '#0f3460']}
              style={styles.bannerFallback}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.bannerGradient}
          />
        </View>

        {/* Channel Info Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarRow}>
            {/* Avatar */}
            <View style={styles.avatarWrapper}>
              {avatar ? (
                <ExpoImage
                  source={{ uri: avatar }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={36} color="#FF0000" />
                </View>
              )}
            </View>

            {/* Subscribe Button */}
            <TouchableOpacity
              style={[
                styles.subscribeBtn,
                isSubscribed && styles.subscribedBtn,
              ]}
              onPress={handleToggleSubscribe}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSubscribed ? 'checkmark-circle' : 'notifications'}
                size={16}
                color={isSubscribed ? '#ffffff' : '#ffffff'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.subscribeBtnText,
                  isSubscribed && styles.subscribedBtnText,
                ]}
              >
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Channel Name & Handle */}
          <Text style={styles.channelTitle} numberOfLines={1}>
            {title}{' '}
            <Ionicons name="checkmark-circle" size={16} color="#1a73e8" />
          </Text>

          {handle && <Text style={styles.channelHandle}>{handle}</Text>}

          {/* Stats Bar */}
          <View style={styles.statsRow}>
            {subCount && (
              <View style={styles.statBadge}>
                <Ionicons name="people-outline" size={14} color="#aaaaaa" style={{ marginRight: 4 }} />
                <Text style={styles.statText}>{subCount}</Text>
              </View>
            )}
            {videoCount && (
              <View style={styles.statBadge}>
                <Ionicons name="film-outline" size={14} color="#aaaaaa" style={{ marginRight: 4 }} />
                <Text style={styles.statText}>{videoCount}</Text>
              </View>
            )}
          </View>

          {channelDetails?.description && (
            <Text style={styles.channelDescription} numberOfLines={2}>
              {channelDetails.description}
            </Text>
          )}

          <View style={styles.divider} />
          <Text style={styles.sectionHeaderTitle}>Uploads</Text>
        </View>
      </View>
    );
  };

  const renderVideoItem = ({ item }: { item: YouTubeVideoSearchResult }) => {
    const isActive = activeVideo?.videoId === item.videoId;
    return (
      <TouchableOpacity
        style={[
          styles.videoCard,
          {
            backgroundColor: themeMode === 'oled' ? '#121212' : surfaceHex,
            borderColor: isActive ? '#FF0000' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
        onPress={() => playVideo(item, channelDetails?.uploads || [item])}
        activeOpacity={0.85}
      >
        <View style={styles.thumbContainer}>
          <ExpoImage
            source={{ uri: item.thumbnail }}
            style={styles.thumbImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {item.duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{item.duration}</Text>
            </View>
          ) : null}
          {isActive && (
            <View style={styles.playingBadge}>
              <Ionicons name={isVideoPlaying ? 'volume-high' : 'pause'} size={12} color="#ffffff" />
              <Text style={styles.playingText}>{isVideoPlaying ? 'PLAYING' : 'PAUSED'}</Text>
            </View>
          )}
        </View>
        <View style={styles.metaCol}>
          <Text style={[styles.videoTitle, isActive && { color: '#FF0000' }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.videoMetaText}>
            {item.viewCount ? `${item.viewCount} • ` : ''}
            {item.publishedTime || 'Recently'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgHex }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {/* Top Navigation Bar */}
      <SafeAreaView edges={['top']} style={styles.topBarContainer}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.topBarBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {channelDetails?.title || initialTitle}
          </Text>
          <TouchableOpacity onPress={handleShareChannel} style={styles.topBarBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="share-social-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>Loading channel details...</Text>
        </View>
      ) : (
        <FlatList
          data={channelDetails?.uploads || []}
          keyExtractor={(item) => item.videoId}
          renderItem={renderVideoItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: activeVideo && playerMode === 'mini' ? 130 + insets.bottom : 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={42} color="#666666" />
              <Text style={styles.emptyText}>No video uploads found for this channel</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBarContainer: {
    backgroundColor: '#0a0a0a',
    zIndex: 10,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  topBarBtn: {
    padding: 4,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerContainer: {
    backgroundColor: 'transparent',
  },
  bannerContainer: {
    height: BANNER_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
  bannerFallback: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
  bannerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BANNER_HEIGHT / 2,
  },
  profileSection: {
    paddingHorizontal: 16,
    marginTop: -(AVATAR_SIZE / 2),
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: '#0a0a0a',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222222',
  },
  subscribeBtn: {
    backgroundColor: '#FF0000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  subscribedBtn: {
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  subscribeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  subscribedBtnText: {
    color: '#aaaaaa',
  },
  channelTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  channelHandle: {
    fontSize: 14,
    color: '#aaaaaa',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 12,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statText: {
    fontSize: 12,
    color: '#dddddd',
    fontWeight: '600',
  },
  channelDescription: {
    fontSize: 13,
    color: '#bbbbbb',
    lineHeight: 18,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 12,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 40,
  },
  videoCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 8,
  },
  thumbContainer: {
    width: 124,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  playingBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#FF0000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  playingText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  metaCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 18,
    marginBottom: 6,
  },
  videoMetaText: {
    fontSize: 12,
    color: '#888888',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#aaaaaa',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
});
