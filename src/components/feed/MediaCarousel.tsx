import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Song, Playlist, Artist } from '@/types/music';
import { CanonicalAlbum, CanonicalArtist, AudioSourcePlatform } from '@/types/explore';
import { SourceBadge } from '../common/SourceBadge';
import { SongActionController } from '@/services/songActionController';
import { useResponsive } from '@/hooks/useResponsive';

const LOSSLESS_LOGO_WHITE = require('@/assets/images/lossless_white.png');
const LOSSLESS_LOGO_BLACK = require('@/assets/images/lossless_black.png');
const OPUS_LOGO_CIRCLE = require('@/assets/images/opus_circle.png');

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

interface CarouselCardProps {
  item: any;
  index: number;
  type: string;
  showRank: boolean;
  isCurrentSong: boolean;
  isPlaying: boolean;
  isTablet?: boolean;
  onPress: (item: any) => void;
}

// Highly optimized memoized card: skips re-rendering untouched cards when playback changes
const CarouselCard = memo<CarouselCardProps>(
  ({ item, index, type, showRank, isCurrentSong, isPlaying, isTablet, onPress }) => {
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
      <TouchableOpacity
        style={[
          styles.card,
          isArtist && styles.artistCard,
          isTablet && (isArtist ? styles.tabletArtistCard : styles.tabletCard),
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => {
          if (isSong) {
            handleMorePress({ stopPropagation: () => {} });
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.imageWrapper}>
          <ExpoImage
            source={{ uri: imageUri }}
            style={[
              styles.image,
              isArtist && styles.artistImage,
              isTablet && (isArtist ? styles.tabletArtistImage : styles.tabletImage),
            ]}
            contentFit="cover"
            transition={80}
            cachePolicy="memory-disk"
            recyclingKey={item.id || imageUri}
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
            <View style={styles.activePlayingOverlay}>
              <Ionicons
                name={isPlaying ? 'musical-notes' : 'pause'}
                size={20}
                color="#1DB954"
              />
            </View>
          )}
        </View>

        {/* Title & 3-Dot Options Row */}
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.itemTitle,
              isCurrentSong && styles.activeText,
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
              <Ionicons name="ellipsis-vertical" size={15} color="#9E9E9E" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.itemSubtitle} numberOfLines={1}>
          {itemSubtitle}
        </Text>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    if (prev.item !== next.item) return false;
    if (prev.index !== next.index) return false;
    if (prev.isCurrentSong !== next.isCurrentSong) return false;
    if (next.isCurrentSong && prev.isPlaying !== next.isPlaying) return false;
    if (prev.showRank !== next.showRank) return false;
    if (prev.type !== next.type) return false;
    if (prev.isTablet !== next.isTablet) return false;
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
  const { isTablet, contentPadding } = useResponsive();

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
        // It's a Song
        onPlaySong?.(item, items.filter((i): i is Song => 'streamUrl' in i));
      } else if ('songs' in item && item.songs.length > 0) {
        // It's a Playlist
        onPlaySong?.(item.songs[0], item.songs);
      }
    },
    [type, items, onPressArtist, onPressAlbum, onPlaySong]
  );

  const cardWidth = type === 'artist' ? (isTablet ? 140 : 126) + 14 : (isTablet ? 164 : 144) + 14;
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: cardWidth,
      offset: cardWidth * index,
      index,
    }),
    [cardWidth]
  );

  const keyExtractor = useCallback(
    (item: any, index: number) => item?.id || `${item?.name || item?.title || 'item'}-${index}`,
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <CarouselCard
        item={item}
        index={index}
        type={type}
        showRank={showRank}
        isCurrentSong={'streamUrl' in item && !!currentSongId && currentSongId === item.id}
        isPlaying={isPlaying}
        isTablet={isTablet}
        onPress={handleItemPress}
      />
    ),
    [type, showRank, currentSongId, isPlaying, isTablet, handleItemPress]
  );

  // If loading with no items yet, render skeleton placeholder
  if (loading && (!items || items.length === 0)) {
    return (
      <View style={styles.section}>
        <View style={[styles.header, { paddingHorizontal: contentPadding }]}>
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

        <View style={[styles.skeletonContainer, { paddingHorizontal: contentPadding }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={`skel-${i}`} style={[styles.card, isTablet && styles.tabletCard]}>
              <View style={[styles.image, isTablet && styles.tabletImage, styles.skeletonImage]}>
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
      <View style={[styles.header, { paddingHorizontal: contentPadding }]}>
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

      {/* Virtualized Horizontal FlatList */}
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.carouselContainer, { paddingHorizontal: contentPadding }]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        decelerationRate="fast"
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
    marginBottom: 12,
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
    color: '#a0a0a0',
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
    paddingHorizontal: 16,
    gap: 14,
  },
  card: {
    width: 144,
    marginRight: 2,
  },
  artistCard: {
    width: 126,
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: 144,
    height: 144,
    borderRadius: 8,
    backgroundColor: '#242424',
  },
  artistImage: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: '#242424',
  },
  tabletCard: {
    width: 164,
  },
  tabletArtistCard: {
    width: 140,
  },
  tabletImage: {
    width: 164,
    height: 164,
  },
  tabletArtistImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  // Glowing Rank Badges
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
    backgroundColor: 'rgba(255, 215, 0, 0.28)',
    borderColor: '#ffd700',
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  rankSilver: {
    backgroundColor: 'rgba(224, 231, 255, 0.28)',
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  rankBronze: {
    backgroundColor: 'rgba(245, 158, 11, 0.28)',
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  rankStandard: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  rankText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  rankTextGold: {
    color: '#ffd700',
  },
  rankTextSilver: {
    color: '#ffffff',
  },
  rankTextBronze: {
    color: '#f59e0b',
  },
  rankTextStandard: {
    color: '#d1d5db',
  },
  badgePosition: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 6,
    backgroundColor: '#121212',
    borderRadius: 10,
    padding: 1,
  },
  activePlayingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  itemTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
    lineHeight: 17,
  },
  itemTitleWithMenu: {
    flex: 1,
    marginRight: 4,
    marginBottom: 0,
  },
  moreButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSubtitle: {
    color: '#9e9e9e',
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 1,
  },
  activeText: {
    color: '#1DB954',
  },
  // Skeleton styles
  skeletonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 14,
  },
  skeletonImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
  },
  skeletonTextLine: {
    height: 12,
    backgroundColor: '#242424',
    borderRadius: 4,
    marginTop: 6,
    width: '85%',
  },
});
