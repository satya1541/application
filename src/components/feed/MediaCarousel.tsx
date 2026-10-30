import React, { memo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Song, Playlist, Artist } from '@/types/music';
import { CanonicalAlbum, CanonicalArtist, AudioSourcePlatform } from '@/types/explore';
import { SourceBadge } from '../common/SourceBadge';
import { SongActionController } from '@/services/songActionController';
import { useAppTheme } from '@/contexts/ThemeContext';

const LOSSLESS_LOGO_WHITE = require('@/assets/images/lossless_white.png');
const LOSSLESS_LOGO_BLACK = require('@/assets/images/lossless_black.png');
const OPUS_LOGO_CIRCLE = require('@/assets/images/opus_circle.png');

const CARD_WIDTH_SONG = 148;
const CARD_WIDTH_ARTIST = 132;
const CARD_GAP = 12;

interface MediaCarouselProps {
  title: string;
  subtitle?: string;
  items: (Song | Playlist | Artist | CanonicalAlbum | CanonicalArtist | any)[];
  type?: 'song' | 'playlist' | 'artist' | 'album';
  activeSource?: AudioSourcePlatform;
  onToggleSource?: (source: AudioSourcePlatform) => void;
  showRank?: boolean;
  loading?: boolean;
  onPressArtist?: (artist: any) => void;
  onPressAlbum?: (album: any) => void;
  onPlaySong?: (song: Song, queue?: Song[]) => void;
  currentSongId?: string;
  isPlaying?: boolean;
}

interface CoverflowCardProps {
  item: any;
  index: number;
  scrollX: Animated.Value;
  interval: number;
  cardWidth: number;
  type: string;
  showRank: boolean;
  isCurrentSong: boolean;
  isPlaying: boolean;
  accentHex: string;
  onPress: (item: any) => void;
}

// 3D Liquid Glass Coverflow Card Component
const CoverflowCard = memo<CoverflowCardProps>(
  ({
    item,
    index,
    scrollX,
    interval,
    cardWidth,
    type,
    showRank,
    isCurrentSong,
    isPlaying,
    accentHex,
    onPress,
  }) => {
    const isArtist = type === 'artist' || item.type === 'artist' || 'monthlyListeners' in item;
    const isAlbum = type === 'album' || item.type === 'album';
    const isSong = !isArtist && !isAlbum && (type === 'song' || 'streamUrl' in item || 'artist' in item);
    const imageUri =
      item.cover || item.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
    const itemTitle = item.name || item.title || 'Untitled';
    const itemSubtitle = isArtist
      ? 'Verified Artist'
      : isAlbum
      ? `${item.year || 'Album'} • ${item.artist || 'Artist'}`
      : item.artist || item.description || 'Deluxe Track';

    const rank = index + 1;

    // 3D Coverflow Interpolation based on distance from center viewport
    const inputRange = [
      (index - 2) * interval,
      (index - 1) * interval,
      index * interval,
      (index + 1) * interval,
      (index + 2) * interval,
    ];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.88, 0.94, 1.04, 0.94, 0.88],
      extrapolate: 'clamp',
    });

    const rotateY = scrollX.interpolate({
      inputRange: [
        (index - 1) * interval,
        index * interval,
        (index + 1) * interval,
      ],
      outputRange: ['24deg', '0deg', '-24deg'],
      extrapolate: 'clamp',
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.65, 0.85, 1, 0.85, 0.65],
      extrapolate: 'clamp',
    });

    const translateY = scrollX.interpolate({
      inputRange: [
        (index - 1) * interval,
        index * interval,
        (index + 1) * interval,
      ],
      outputRange: [5, -4, 5],
      extrapolate: 'clamp',
    });

    const handleMorePress = useCallback(
      (e: any) => {
        e.stopPropagation?.();
        const songPayload: Song = {
          id: item.id || String(Date.now()),
          name: itemTitle,
          artist: isArtist ? '' : (item.artist || itemSubtitle),
          album: item.album || 'Shorty',
          duration: item.duration || 0,
          cover: imageUri,
          streamUrl: item.streamUrl || '',
          quality: item.quality || 'Lossless',
          source: item.source || 'jiosaavn',
          ...item,
        };
        SongActionController.open(songPayload);
      },
      [item, itemTitle, isArtist, itemSubtitle, imageUri]
    );

    return (
      <Animated.View
        style={[
          styles.coverflowCardWrapper,
          {
            width: cardWidth,
            marginRight: CARD_GAP,
            opacity,
            transform: [
              { perspective: 850 },
              { rotateY },
              { scale },
              { translateY },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.glassCard,
            isArtist && styles.artistGlassCard,
            isCurrentSong && {
              borderColor: accentHex,
              shadowColor: accentHex,
              shadowOpacity: 0.6,
              shadowRadius: 14,
            },
          ]}
          onPress={() => onPress(item)}
          onLongPress={() => {
            if (isSong) {
              handleMorePress({ stopPropagation: () => {} });
            }
          }}
          activeOpacity={0.82}
        >
          {/* Liquid Glass Top Highlight Sheen */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.03)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.7 }}
            style={styles.cardSpecularOverlay}
            pointerEvents="none"
          />

          {/* Image Wrapper */}
          <View style={[styles.imageWrapper, isArtist && styles.artistImageWrapper]}>
            <ExpoImage
              source={{ uri: imageUri }}
              style={[styles.image, isArtist && styles.artistImage]}
              contentFit="cover"
              transition={80}
              cachePolicy="memory-disk"
              recyclingKey={item.id || imageUri}
            />

            {/* Subtle bottom shadow vignette on image */}
            <LinearGradient
              colors={['transparent', 'rgba(0, 0, 0, 0.45)']}
              style={styles.imageBottomShade}
              pointerEvents="none"
            />

            {/* Sleek Glowing Rank Badge on Top-Left Corner */}
            {showRank && !isArtist && (
              <View
                style={[
                  styles.rankBadge,
                  rank === 1
                    ? styles.rankGold
                    : rank === 2
                    ? styles.rankSilver
                    : rank === 3
                    ? styles.rankBronze
                    : styles.rankStandard,
                ]}
              >
                <Text
                  style={[
                    styles.rankText,
                    rank === 1
                      ? styles.rankTextGold
                      : rank === 2
                      ? styles.rankTextSilver
                      : rank === 3
                      ? styles.rankTextBronze
                      : styles.rankTextStandard,
                  ]}
                >
                  #{rank}
                </Text>
              </View>
            )}

            {/* Quality / Platform Source Badge on Top-Right Corner */}
            {!isArtist && 'source' in item && (
              <View style={styles.badgePosition}>
                <SourceBadge source={item.source} quality={item.quality} />
              </View>
            )}

            {/* Verified Artist Checkmark */}
            {isArtist && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#1DB954" />
              </View>
            )}

            {/* Active Equalizer Overlay when playing */}
            {isCurrentSong && (
              <View style={[styles.activePlayingOverlay, { borderColor: accentHex }]}>
                <Ionicons
                  name={isPlaying ? 'musical-notes' : 'pause'}
                  size={18}
                  color="#FFFFFF"
                />
              </View>
            )}
          </View>

          {/* Caption Container */}
          <View style={styles.captionContainer}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.itemTitle,
                  isCurrentSong && { color: accentHex, fontWeight: '800' },
                  isSong && styles.itemTitleWithMenu,
                ]}
                numberOfLines={1}
              >
                {itemTitle}
              </Text>

              {isSong && (
                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={handleMorePress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.65}
                  accessibilityLabel={`More options for ${itemTitle}`}
                >
                  <Ionicons name="ellipsis-vertical" size={14} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.itemSubtitle} numberOfLines={1}>
              {itemSubtitle}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  },
  (prev, next) => {
    if (prev.item !== next.item) return false;
    if (prev.index !== next.index) return false;
    if (prev.isCurrentSong !== next.isCurrentSong) return false;
    if (next.isCurrentSong && prev.isPlaying !== next.isPlaying) return false;
    if (prev.showRank !== next.showRank) return false;
    if (prev.type !== next.type) return false;
    if (prev.accentHex !== next.accentHex) return false;
    return true;
  }
);

export const MediaCarousel: React.FC<MediaCarouselProps> = memo(({
  title,
  subtitle,
  items,
  type = 'song',
  activeSource,
  onToggleSource,
  showRank = false,
  loading = false,
  onPressArtist,
  onPressAlbum,
  onPlaySong,
  currentSongId,
  isPlaying = false,
}) => {
  const { accent } = useAppTheme();
  const scrollX = useRef(new Animated.Value(0)).current;

  const cardWidth = type === 'artist' ? CARD_WIDTH_ARTIST : CARD_WIDTH_SONG;
  const cardInterval = cardWidth + CARD_GAP;

  const handleItemPress = useCallback(
    (item: any) => {
      if (type === 'artist' || item.type === 'artist' || 'monthlyListeners' in item) {
        if (onPressArtist) {
          onPressArtist(item);
          return;
        }
        if ('topSongs' in item && item.topSongs.length > 0) {
          onPlaySong?.(item.topSongs[0], item.topSongs);
        }
        return;
      }

      if (type === 'album' || item.type === 'album') {
        if (onPressAlbum) {
          onPressAlbum(item);
          return;
        }
      }

      if ('streamUrl' in item) {
        onPlaySong?.(item, items.filter((i): i is Song => 'streamUrl' in i));
      } else if ('songs' in item && item.songs.length > 0) {
        onPlaySong?.(item.songs[0], item.songs);
      }
    },
    [type, items, onPressArtist, onPressAlbum, onPlaySong]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: cardInterval,
      offset: cardInterval * index,
      index,
    }),
    [cardInterval]
  );

  const keyExtractor = useCallback(
    (item: any, index: number) => item?.id || `${item?.name || item?.title || 'item'}-${index}`,
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <CoverflowCard
        item={item}
        index={index}
        scrollX={scrollX}
        interval={cardInterval}
        cardWidth={cardWidth}
        type={type}
        showRank={showRank}
        isCurrentSong={'streamUrl' in item && !!currentSongId && currentSongId === item.id}
        isPlaying={isPlaying}
        accentHex={accent.hex}
        onPress={handleItemPress}
      />
    ),
    [scrollX, cardInterval, cardWidth, type, showRank, currentSongId, isPlaying, accent.hex, handleItemPress]
  );

  // Skeleton view during loading
  if (loading && (!items || items.length === 0)) {
    return (
      <View style={styles.section}>
        <View style={styles.header}>
          <View style={styles.titleCol}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {onToggleSource && activeSource && (
            <View style={styles.sourceToggleRow}>
              <View style={[styles.toggleBtn, activeSource === 'jiosaavn' && styles.activeLosslessBtn]}>
                <ExpoImage
                  source={activeSource === 'jiosaavn' ? LOSSLESS_LOGO_BLACK : LOSSLESS_LOGO_WHITE}
                  style={[styles.toggleLosslessLogo, activeSource !== 'jiosaavn' && styles.inactiveToggleLogo]}
                  contentFit="contain"
                />
              </View>
              <View style={[styles.toggleBtn, activeSource === 'youtube' && styles.activeOpusBtn]}>
                <View style={styles.toggleOpusContent}>
                  <ExpoImage
                    source={OPUS_LOGO_CIRCLE}
                    style={[styles.toggleOpusIcon, activeSource !== 'youtube' && styles.inactiveToggleLogo]}
                    contentFit="contain"
                  />
                  <Text style={[styles.toggleText, activeSource === 'youtube' && styles.activeOpusText]}>
                    Opus
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.skeletonContainer}>
          {[0, 1, 2, 3].map((i) => (
            <View key={`skel-${i}`} style={[styles.glassCard, { width: cardWidth, marginRight: CARD_GAP }]}>
              <View style={[styles.image, styles.skeletonImage]}>
                <ActivityIndicator size="small" color="#444444" />
              </View>
              <View style={styles.skeletonTextLine} />
              <View style={[styles.skeletonTextLine, { width: '60%' }]} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.section}>
      {/* Section Header with Independent [Lossless] [Opus] Toggle */}
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {onToggleSource && activeSource && (
          <View style={styles.sourceToggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                activeSource === 'jiosaavn' && styles.activeLosslessBtn,
              ]}
              onPress={() => onToggleSource('jiosaavn')}
              activeOpacity={0.8}
            >
              <ExpoImage
                source={activeSource === 'jiosaavn' ? LOSSLESS_LOGO_BLACK : LOSSLESS_LOGO_WHITE}
                style={[
                  styles.toggleLosslessLogo,
                  activeSource !== 'jiosaavn' && styles.inactiveToggleLogo,
                ]}
                contentFit="contain"
                transition={80}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleBtn,
                activeSource === 'youtube' && styles.activeOpusBtn,
              ]}
              onPress={() => onToggleSource('youtube')}
              activeOpacity={0.8}
            >
              <View style={styles.toggleOpusContent}>
                <ExpoImage
                  source={OPUS_LOGO_CIRCLE}
                  style={[
                    styles.toggleOpusIcon,
                    activeSource !== 'youtube' && styles.inactiveToggleLogo,
                  ]}
                  contentFit="contain"
                  transition={80}
                />
                <Text
                  style={[
                    styles.toggleText,
                    activeSource === 'youtube' && styles.activeOpusText,
                  ]}
                >
                  Opus
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 3D Liquid Glass Coverflow FlatList */}
      <Animated.FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContainer}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        snapToInterval={cardInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginVertical: 14,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleCol: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  sourceToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 3,
  },
  toggleBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  activeLosslessBtn: {
    backgroundColor: '#1DB954',
  },
  activeOpusBtn: {
    backgroundColor: '#ff4e45',
  },
  toggleLosslessLogo: {
    width: 48,
    height: 12.5,
  },
  toggleOpusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleOpusIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  inactiveToggleLogo: {
    opacity: 0.5,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999999',
  },
  activeLosslessText: {
    color: '#000000',
    fontWeight: '800',
  },
  activeOpusText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  carouselContainer: {
    paddingLeft: 16,
    paddingRight: 28,
    paddingVertical: 10,
  },
  coverflowCardWrapper: {
    paddingVertical: 4,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    padding: 7,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  artistGlassCard: {
    alignItems: 'center',
    borderRadius: 22,
  },
  cardSpecularOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#161B22',
  },
  artistImageWrapper: {
    borderRadius: 60,
    alignSelf: 'center',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#1E293B',
  },
  artistImage: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#1E293B',
  },
  imageBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 38,
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 10,
  },
  rankGold: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    borderColor: 'rgba(245, 158, 11, 0.65)',
  },
  rankSilver: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  rankBronze: {
    backgroundColor: 'rgba(217, 119, 6, 0.3)',
    borderColor: 'rgba(217, 119, 6, 0.65)',
  },
  rankStandard: {
    backgroundColor: 'rgba(15, 20, 28, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  rankText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  rankTextGold: {
    color: '#FDE68A',
  },
  rankTextSilver: {
    color: '#FFFFFF',
  },
  rankTextBronze: {
    color: '#FDBA74',
  },
  rankTextStandard: {
    color: '#CBD5E1',
  },
  badgePosition: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#000000',
    borderRadius: 9,
  },
  activePlayingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 14,
  },
  captionContainer: {
    paddingTop: 8,
    paddingHorizontal: 3,
    paddingBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: -0.2,
    flex: 1,
  },
  itemTitleWithMenu: {
    marginRight: 4,
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  moreButton: {
    padding: 3,
  },
  skeletonContainer: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingVertical: 10,
  },
  skeletonImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonTextLine: {
    height: 10,
    backgroundColor: '#242424',
    borderRadius: 5,
    marginTop: 8,
    width: '80%',
  },
});
