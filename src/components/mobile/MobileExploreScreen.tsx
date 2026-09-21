import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  FlatList,
  BackHandler,
  PanResponder,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import {
  ExploreSong,
  ExploreAlbum,
  ExploreVideo,
  MoodOrGenre,
  CategoryShelf,
  CategoryDetailResult,
  fetchExploreOverview,
  fetchCategoryDetails,
  exploreSongToSong,
  OFFICIAL_MOODS,
  OFFICIAL_GENRES,
  normalizeExploreUrl,
} from '@/services/youtubeExploreService';
import { Song } from '@/types/music';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const ALBUM_CARD_WIDTH = 145;
const VIDEO_CARD_WIDTH = 220;

type FilterChip = 'all' | 'trending' | 'moods' | 'genres' | 'albums' | 'videos';

interface MobileExploreScreenProps {
  onNavigateHome?: () => void;
}

export const MobileExploreScreen: React.FC<MobileExploreScreenProps> = ({ onNavigateHome }) => {
  const { bgHex, surfaceHex, accent, themeMode } = useAppTheme();
  const { playSong, currentSong, isPlaying } = useAudio();

  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  const [trendingSongs, setTrendingSongs] = useState<ExploreSong[]>([]);
  const [newAlbums, setNewAlbums] = useState<ExploreAlbum[]>([]);
  const [newMusicVideos, setNewMusicVideos] = useState<ExploreVideo[]>([]);
  const [moods, setMoods] = useState<MoodOrGenre[]>(OFFICIAL_MOODS);
  const [genres, setGenres] = useState<MoodOrGenre[]>(OFFICIAL_GENRES);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Category Detail Modal State
  const [selectedCategory, setSelectedCategory] = useState<MoodOrGenre | null>(null);
  const [categoryDetail, setCategoryDetail] = useState<CategoryDetailResult | null>(null);
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);

  // Back handling
  const handleBack = useCallback(() => {
    if (selectedCategory) {
      setSelectedCategory(null);
      setCategoryDetail(null);
      return true;
    }
    if (onNavigateHome) {
      onNavigateHome();
      return true;
    }
    return false;
  }, [selectedCategory, onNavigateHome]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  // Swipe-to-go-back gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 25 && gestureState.dx > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 60 && (gestureState.vx > 0.12 || gestureState.dx > 110)) {
          handleBack();
        }
      },
    })
  ).current;

  // Load explore overview
  const loadExplore = useCallback(async (force = false) => {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await fetchExploreOverview(force);
      setTrendingSongs(data.trendingSongs);
      setNewAlbums(data.newAlbums);
      setNewMusicVideos(data.newMusicVideos);
      if (data.moods?.length) setMoods(data.moods);
      if (data.genres?.length) setGenres(data.genres);
    } catch (e) {
      console.warn('[MobileExploreScreen] Error loading explore:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExplore(false);
  }, [loadExplore]);

  // Open Category detail
  const handleOpenCategory = useCallback(async (cat: MoodOrGenre) => {
    setSelectedCategory(cat);
    setIsLoadingCategory(true);
    try {
      const res = await fetchCategoryDetails(cat.params, cat.text);
      setCategoryDetail(res);
    } catch (err) {
      console.warn('[MobileExploreScreen] Error loading category:', err);
    } finally {
      setIsLoadingCategory(false);
    }
  }, []);

  // Play a trending song
  const handlePlayTrendingSong = useCallback(
    (item: ExploreSong) => {
      const song = exploreSongToSong(item);
      const queue = trendingSongs.map(exploreSongToSong);
      playSong(song, queue);
    },
    [trendingSongs, playSong]
  );

  // Play a video/song from a category shelf
  const handlePlayShelfItem = useCallback(
    (item: { id: string; title: string; subtitle: string; thumbnail: string; isVideo?: boolean }) => {
      const song: Song = {
        id: `yt_${item.id}`,
        name: item.title,
        artist: item.subtitle.split('•')[0]?.trim() || item.subtitle,
        album: 'YouTube Music Explore',
        duration: 215,
        cover: item.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
        streamUrl: `https://www.youtube.com/watch?v=${item.id}`,
        quality: 'Opus',
        source: 'youtube',
        hasLyrics: false,
      };
      playSong(song, [song]);
    },
    [playSong]
  );

  const chips: Array<{ id: FilterChip; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'all', label: 'All', icon: 'apps-outline' },
    { id: 'trending', label: 'Trending', icon: 'flame-outline' },
    { id: 'moods', label: 'Moods & Moments', icon: 'heart-outline' },
    { id: 'genres', label: 'Genres', icon: 'musical-notes-outline' },
    { id: 'albums', label: 'New Releases', icon: 'disc-outline' },
    { id: 'videos', label: 'Music Videos', icon: 'videocam-outline' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']} {...panResponder.panHandlers}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.screenTitle}>YT Music Explore</Text>
            <View style={[styles.liveDot, { backgroundColor: '#FF0000' }]} />
          </View>
          <TouchableOpacity
            style={[styles.refreshBtn, { backgroundColor: surfaceHex }]}
            onPress={() => loadExplore(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.screenSubtitle}>Trending Hits, Moods, Genres & Official Releases</Text>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.chipsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {chips.map((chip) => {
            const isActive = activeChip === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.chip,
                  { backgroundColor: surfaceHex },
                  isActive && [styles.chipActive, { backgroundColor: accent.hex }],
                ]}
                onPress={() => setActiveChip(chip.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={chip.icon}
                  size={14}
                  color={isActive ? '#000000' : '#CCCCCC'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Body */}
      {isLoading && !isRefreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={accent.hex} />
          <Text style={styles.loaderText}>Exploring YouTube Music...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadExplore(true)}
              tintColor={accent.hex}
              colors={[accent.hex]}
            />
          }
        >
          {/* 1. Moods & Moments (Horizontal Cards) */}
          {(activeChip === 'all' || activeChip === 'moods') && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="sparkles" size={18} color="#FF6584" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>Moods & Moments</Text>
                </View>
                <Text style={styles.sectionBadge}>{moods.length}</Text>
              </View>

              <View style={styles.moodsGrid}>
                {moods.map((m) => (
                  <TouchableOpacity
                    key={m.text}
                    style={[styles.moodCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() => handleOpenCategory(m)}
                  >
                    <View style={[styles.moodStripe, { backgroundColor: m.color }]} />
                    <View style={styles.moodContent}>
                      <Ionicons
                        name={(m.icon as any) || 'musical-note-outline'}
                        size={18}
                        color={m.color}
                        style={{ marginBottom: 6 }}
                      />
                      <Text style={styles.moodTitle} numberOfLines={1}>
                        {m.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 2. Trending Songs (Live #1 - #20) */}
          {(activeChip === 'all' || activeChip === 'trending') && trendingSongs.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="flame" size={18} color="#FF4500" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>Trending Hits</Text>
                </View>
                <Text style={styles.sectionBadge}>Top {trendingSongs.length}</Text>
              </View>

              <View style={styles.trendingList}>
                {trendingSongs.slice(0, activeChip === 'trending' ? 20 : 6).map((item, index) => {
                  const isCurrent = currentSong?.id === `yt_${item.videoId}`;
                  return (
                    <TouchableOpacity
                      key={item.videoId}
                      style={[
                        styles.trendingCard,
                        { backgroundColor: surfaceHex },
                        isCurrent && { borderColor: accent.hex, borderWidth: 1 },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handlePlayTrendingSong(item)}
                    >
                      {/* Rank Number */}
                      <Text style={[styles.rankNumber, index < 3 && { color: accent.hex, fontWeight: '900' }]}>
                        {index + 1}
                      </Text>

                      {/* Artwork Thumbnail */}
                      <View style={styles.thumbWrapper}>
                        <ExpoImage source={{ uri: item.thumbnail }} style={styles.songThumb} contentFit="cover" />
                        <View style={styles.playOverlay}>
                          <Ionicons
                            name={isCurrent && isPlaying ? 'pause' : 'play'}
                            size={16}
                            color="#FFFFFF"
                          />
                        </View>
                      </View>

                      {/* Song Details */}
                      <View style={styles.songMeta}>
                        <Text style={[styles.songTitle, isCurrent && { color: accent.hex }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.songArtist} numberOfLines={1}>
                          {item.artist}
                        </Text>
                      </View>

                      <Ionicons name="ellipsis-vertical" size={16} color="#777777" style={{ paddingHorizontal: 6 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 3. New Albums & Singles Carousel */}
          {(activeChip === 'all' || activeChip === 'albums') && newAlbums.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="disc" size={18} color="#3ea6ff" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>New Albums & Singles</Text>
                </View>
                <Text style={styles.sectionBadge}>{newAlbums.length}</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {newAlbums.map((album) => (
                  <TouchableOpacity
                    key={album.id}
                    style={[styles.albumCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() =>
                      handleOpenCategory({
                        text: album.title,
                        color: accent.hex,
                        params: album.id,
                        browseId: album.id,
                      })
                    }
                  >
                    <View style={styles.albumCoverWrapper}>
                      <ExpoImage source={{ uri: album.thumbnail }} style={styles.albumCover} contentFit="cover" />
                      <View style={styles.albumTypeBadge}>
                        <Text style={styles.albumTypeBadgeText}>{album.type}</Text>
                      </View>
                    </View>
                    <Text style={styles.albumTitle} numberOfLines={1}>
                      {album.title}
                    </Text>
                    <Text style={styles.albumArtist} numberOfLines={1}>
                      {album.artist}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 4. New Music Videos */}
          {(activeChip === 'all' || activeChip === 'videos') && newMusicVideos.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="videocam" size={18} color="#FF0000" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>New Music Videos</Text>
                </View>
                <Text style={styles.sectionBadge}>{newMusicVideos.length}</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {newMusicVideos.map((vid) => (
                  <TouchableOpacity
                    key={vid.videoId}
                    style={[styles.videoCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() =>
                      handlePlayShelfItem({
                        id: vid.videoId,
                        title: vid.title,
                        subtitle: `${vid.artist} • ${vid.views}`,
                        thumbnail: vid.thumbnail,
                        isVideo: true,
                      })
                    }
                  >
                    <View style={styles.videoThumbWrapper}>
                      <ExpoImage source={{ uri: vid.thumbnail }} style={styles.videoThumb} contentFit="cover" />
                      <View style={styles.videoPlayBtn}>
                        <Ionicons name="play" size={16} color="#FFFFFF" />
                      </View>
                    </View>
                    <View style={styles.videoInfo}>
                      <Text style={styles.videoTitle} numberOfLines={2}>
                        {vid.title}
                      </Text>
                      <Text style={styles.videoArtist} numberOfLines={1}>
                        {vid.artist} {vid.views ? `• ${vid.views}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 5. Genres Grid (38 Hubs) */}
          {(activeChip === 'all' || activeChip === 'genres') && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="musical-notes" size={18} color={accent.hex} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>Genres & Languages</Text>
                </View>
                <Text style={styles.sectionBadge}>{genres.length}</Text>
              </View>

              <View style={styles.genresGrid}>
                {genres.map((g) => (
                  <TouchableOpacity
                    key={g.text}
                    style={[styles.genreTile, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() => handleOpenCategory(g)}
                  >
                    <View style={[styles.genreStripe, { backgroundColor: g.color }]} />
                    <Text style={styles.genreText} numberOfLines={1}>
                      {g.text}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="#666666" style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      )}

      {/* Category Detail Modal */}
      <Modal visible={!!selectedCategory} animationType="slide" transparent onRequestClose={() => setSelectedCategory(null)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={[styles.modalContent, { backgroundColor: bgHex }]} edges={['top', 'bottom']}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: surfaceHex }]}>
              <View style={styles.modalTitleRow}>
                <View style={[styles.modalDot, { backgroundColor: selectedCategory?.color || accent.hex }]} />
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedCategory?.text || 'Explore Category'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: surfaceHex }]}
                onPress={() => {
                  setSelectedCategory(null);
                  setCategoryDetail(null);
                }}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            {isLoadingCategory ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color={accent.hex} />
                <Text style={styles.modalLoaderText}>Loading {selectedCategory?.text} collections...</Text>
              </View>
            ) : categoryDetail && categoryDetail.shelves.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {categoryDetail.shelves.map((shelf, sIdx) => (
                  <View key={`${shelf.title}_${sIdx}`} style={styles.shelfBlock}>
                    <Text style={styles.shelfTitle}>{shelf.title}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                      {shelf.items.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.shelfCard, { backgroundColor: surfaceHex }]}
                          activeOpacity={0.8}
                          onPress={() => handlePlayShelfItem(item)}
                        >
                          <View style={styles.shelfCoverWrapper}>
                            <ExpoImage source={{ uri: item.thumbnail }} style={styles.shelfCover} contentFit="cover" />
                            <View style={styles.shelfPlayIcon}>
                              <Ionicons name="play" size={14} color="#FFFFFF" />
                            </View>
                          </View>
                          <Text style={styles.shelfItemTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.shelfItemSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ))}
                <View style={{ height: 40 }} />
              </ScrollView>
            ) : (
              <View style={styles.modalEmpty}>
                <Ionicons name="musical-notes-outline" size={48} color="#666666" />
                <Text style={styles.modalEmptyTitle}>No Content Found</Text>
                <Text style={styles.modalEmptySubtitle}>Could not load items for this category right now.</Text>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: CARD_PADDING,
    paddingTop: 8,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  screenSubtitle: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '500',
  },
  chipsContainer: {
    marginVertical: 8,
  },
  chipsScroll: {
    paddingHorizontal: CARD_PADDING,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  chipActive: {
    borderColor: 'transparent',
  },
  chipText: {
    color: '#BBBBBB',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  loaderText: {
    color: '#AAAAAA',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingTop: 4,
  },
  sectionBlock: {
    marginTop: 18,
    paddingHorizontal: CARD_PADDING,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionBadge: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
  },
  moodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moodCard: {
    width: (SCREEN_WIDTH - CARD_PADDING * 2 - 20) / 3,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  moodStripe: {
    height: 4,
    width: '100%',
  },
  moodContent: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  trendingList: {
    gap: 8,
  },
  trendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  rankNumber: {
    width: 24,
    color: '#777777',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginRight: 6,
  },
  thumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  songThumb: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songMeta: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  songArtist: {
    color: '#9E9E9E',
    fontSize: 12,
    fontWeight: '500',
  },
  horizontalScroll: {
    gap: 12,
    paddingRight: CARD_PADDING,
  },
  albumCard: {
    width: ALBUM_CARD_WIDTH,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  albumCoverWrapper: {
    width: ALBUM_CARD_WIDTH - 16,
    height: ALBUM_CARD_WIDTH - 16,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  albumCover: {
    width: '100%',
    height: '100%',
  },
  albumTypeBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  albumTypeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  albumArtist: {
    color: '#999999',
    fontSize: 11,
    fontWeight: '500',
  },
  videoCard: {
    width: VIDEO_CARD_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  videoThumbWrapper: {
    width: VIDEO_CARD_WIDTH,
    height: 124,
    position: 'relative',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoPlayBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    padding: 8,
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  videoArtist: {
    color: '#8E8E8E',
    fontSize: 11,
    fontWeight: '500',
  },
  genresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreTile: {
    width: (SCREEN_WIDTH - CARD_PADDING * 2 - 8) / 2,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  genreStripe: {
    width: 5,
    height: '100%',
    marginRight: 10,
  },
  genreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  modalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  modalLoaderText: {
    color: '#999999',
    fontSize: 13,
    fontWeight: '600',
  },
  modalScroll: {
    paddingVertical: 12,
  },
  shelfBlock: {
    marginBottom: 22,
    paddingLeft: 16,
  },
  shelfTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  shelfCard: {
    width: 140,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  shelfCoverWrapper: {
    width: 124,
    height: 124,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 6,
  },
  shelfCover: {
    width: '100%',
    height: '100%',
  },
  shelfPlayIcon: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelfItemTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  shelfItemSubtitle: {
    color: '#8E8E8E',
    fontSize: 10,
    fontWeight: '500',
  },
  modalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  modalEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalEmptySubtitle: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
  },
});
