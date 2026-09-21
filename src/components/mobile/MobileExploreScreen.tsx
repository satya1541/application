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
  Share,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import { YOUTUBE_OPUS_BADGE } from '@/services/youtubeMusicApi';
import {
  ExploreSong,
  ExploreAlbum,
  ExploreVideo,
  MoodOrGenre,
  CategoryShelf,
  CategoryDetailResult,
  CategoryShelfItem,
  ExplorePlaylistDetail,
  ExplorePlaylistTrack,
  fetchExploreOverview,
  fetchCategoryDetails,
  fetchPlaylistDetails,
  exploreSongToSong,
  explorePlaylistTrackToSong,
  OFFICIAL_MOODS,
  OFFICIAL_GENRES,
  normalizeExploreUrl,
} from '@/services/youtubeExploreService';
import { Song } from '@/types/music';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const ALBUM_CARD_WIDTH = 145;
const VIDEO_CARD_WIDTH = 220;
const PLAYLIST_CARD_WIDTH = 150;

type FilterChip = 'all' | 'trending' | 'moods' | 'genres' | 'albums' | 'videos';

function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

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

  // Category Shelves Modal State (e.g. Hindi -> "Songs", "Featured playlists", "Community playlists")
  const [selectedCategory, setSelectedCategory] = useState<MoodOrGenre | null>(null);
  const [categoryDetail, setCategoryDetail] = useState<CategoryDetailResult | null>(null);
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);

  // Playlist Detail Modal State (e.g. Coffee Shop Blend -> 96 tracks)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistDetail, setPlaylistDetail] = useState<ExplorePlaylistDetail | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);

  // Back handling (Stacked: Playlist Modal -> Category Modal -> Home Tab)
  const handleBack = useCallback(() => {
    if (selectedPlaylistId) {
      setSelectedPlaylistId(null);
      setPlaylistDetail(null);
      return true;
    }
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
  }, [selectedPlaylistId, selectedCategory, onNavigateHome]);

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

  // Open Category detail (Mood or Genre)
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

  // Open Playlist detail (e.g. Coffee Shop Blend)
  const handleOpenPlaylist = useCallback(
    async (playlistId: string, initialTitle?: string, initialThumb?: string) => {
      setSelectedPlaylistId(playlistId);
      setIsLoadingPlaylist(true);
      // Optimistic initial view
      setPlaylistDetail({
        id: playlistId,
        title: initialTitle || 'Playlist',
        subtitle: 'Loading playlist...',
        secondSubtitle: '',
        description: '',
        thumbnail: initialThumb || '',
        trackCount: 0,
        tracks: [],
      });

      try {
        const detail = await fetchPlaylistDetails(playlistId);
        setPlaylistDetail(detail);
      } catch (err) {
        console.warn('[MobileExploreScreen] Error loading playlist detail:', err);
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    []
  );

  // Play a trending song
  const handlePlayTrendingSong = useCallback(
    (item: ExploreSong) => {
      const song = exploreSongToSong(item);
      const queue = trendingSongs.map(exploreSongToSong);
      playSong(song, queue);
    },
    [trendingSongs, playSong]
  );

  // Play a song directly from category's "Songs" shelf
  const handlePlayCategorySong = useCallback(
    (item: CategoryShelfItem, shelfItems: CategoryShelfItem[]) => {
      const videoId = item.videoId || item.id.replace(/^yt_/, '');
      const song: Song = {
        id: `yt_${videoId}`,
        name: item.title,
        artist: item.subtitle.split('•')[0]?.trim() || item.subtitle,
        album: item.album || (selectedCategory ? `${selectedCategory.text} Songs` : 'YouTube Music'),
        duration: 215,
        cover: item.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
        quality: 'Opus',
        source: 'youtube',
        sourceBadge: YOUTUBE_OPUS_BADGE,
        hasLyrics: false,
      };

      const songQueue: Song[] = shelfItems
        .filter((it) => it.isSong || !it.isPlaylist)
        .map((it) => {
          const vId = it.videoId || it.id.replace(/^yt_/, '');
          return {
            id: `yt_${vId}`,
            name: it.title,
            artist: it.subtitle.split('•')[0]?.trim() || it.subtitle,
            album: it.album || (selectedCategory ? `${selectedCategory.text} Songs` : 'YouTube Music'),
            duration: 215,
            cover: it.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
            streamUrl: `https://www.youtube.com/watch?v=${vId}`,
            quality: 'Opus' as const,
            source: 'youtube' as const,
            sourceBadge: YOUTUBE_OPUS_BADGE,
            hasLyrics: false,
          };
        });

      const clickedIdx = songQueue.findIndex((s) => s.id === song.id);
      const orderedQueue =
        clickedIdx > 0 ? [...songQueue.slice(clickedIdx), ...songQueue.slice(0, clickedIdx)] : songQueue;

      playSong(song, orderedQueue);
    },
    [selectedCategory, playSong]
  );

  // Play a track from a playlist
  const handlePlayPlaylistTrack = useCallback(
    (track: ExplorePlaylistTrack, playlist: ExplorePlaylistDetail) => {
      const song = explorePlaylistTrackToSong(track, playlist.title);
      const queue = playlist.tracks.map((t) => explorePlaylistTrackToSong(t, playlist.title));
      // Queue entire playlist with this track first
      const clickedIdx = playlist.tracks.findIndex((t) => t.videoId === track.videoId);
      const orderedQueue =
        clickedIdx > 0 ? [...queue.slice(clickedIdx), ...queue.slice(0, clickedIdx)] : queue;
      playSong(song, orderedQueue);
    },
    [playSong]
  );

  // Play All or Shuffle from a playlist
  const handlePlayAllFromPlaylist = useCallback(
    (playlist: ExplorePlaylistDetail, shuffle = false) => {
      if (!playlist.tracks.length) return;
      let tracks = [...playlist.tracks];
      if (shuffle) {
        tracks = tracks.sort(() => Math.random() - 0.5);
      }
      const queue = tracks.map((t) => explorePlaylistTrackToSong(t, playlist.title));
      playSong(queue[0], queue);
    },
    [playSong]
  );

  // Share playlist
  const handleSharePlaylist = useCallback((playlist: ExplorePlaylistDetail) => {
    const rawId = playlist.id.replace(/^VL/, '');
    Share.share({
      title: playlist.title,
      message: `Listen to "${playlist.title}" on YouTube Music: https://music.youtube.com/playlist?list=${rawId}`,
    }).catch(() => {});
  }, []);

  const chips: Array<{ id: FilterChip; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'all', label: 'All', icon: 'apps-outline' },
    { id: 'trending', label: 'Trending', icon: 'flame-outline' },
    { id: 'moods', label: 'Moods & Moments', icon: 'heart-outline' },
    { id: 'genres', label: 'Genres', icon: 'musical-notes-outline' },
    { id: 'albums', label: 'New Releases', icon: 'disc-outline' },
    { id: 'videos', label: 'Music Videos', icon: 'videocam-outline' },
  ];

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: bgHex }]}
      edges={['top']}
      {...panResponder.panHandlers}
    >
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
        <Text style={styles.screenSubtitle}>Trending Hits, Songs, Genres & Official Playlists</Text>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
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
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {chip.label}
                </Text>
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
          {/* 1. Moods & Moments (Curated Hubs with Playlists) */}
          {(activeChip === 'all' || activeChip === 'moods') && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="heart" size={18} color="#ffa4c5" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>Moods & Moments</Text>
                </View>
                <Text style={styles.sectionBadge}>11 Categories</Text>
              </View>

              <View style={styles.moodsGrid}>
                {moods.map((mood) => (
                  <TouchableOpacity
                    key={mood.text}
                    style={[styles.moodCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.75}
                    onPress={() => handleOpenCategory(mood)}
                  >
                    <View style={[styles.moodStripe, { backgroundColor: mood.color }]} />
                    <View style={styles.moodContent}>
                      <Ionicons
                        name={(mood.icon as any) || 'musical-note'}
                        size={20}
                        color={mood.color}
                        style={{ marginBottom: 4 }}
                      />
                      <Text style={styles.moodTitle} numberOfLines={1}>
                        {mood.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 2. Trending Songs (#1 to #20) */}
          {(activeChip === 'all' || activeChip === 'trending') && trendingSongs.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="flame" size={18} color="#FF5722" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>Trending Songs</Text>
                </View>
                <Text style={styles.sectionBadge}>Top {trendingSongs.length}</Text>
              </View>

              <View style={styles.songsList}>
                {trendingSongs.map((song, idx) => {
                  const isCurrent = currentSong?.id === song.id;
                  return (
                    <TouchableOpacity
                      key={song.id}
                      style={[
                        styles.songRow,
                        { backgroundColor: surfaceHex },
                        isCurrent && [styles.songRowActive, { borderColor: accent.hex }],
                      ]}
                      activeOpacity={0.7}
                      onPress={() => handlePlayTrendingSong(song)}
                    >
                      <View style={styles.rankBadge}>
                        <Text
                          style={[
                            styles.rankNumber,
                            idx < 3 && [styles.topRankNumber, { color: accent.hex }],
                          ]}
                        >
                          #{idx + 1}
                        </Text>
                      </View>

                      <View style={styles.songThumbWrapper}>
                        <ExpoImage
                          source={{ uri: song.thumbnail }}
                          style={styles.songThumb}
                          contentFit="cover"
                        />
                        <View style={styles.playOverlay}>
                          <Ionicons
                            name={isCurrent && isPlaying ? 'pause' : 'play'}
                            size={14}
                            color="#FFFFFF"
                          />
                        </View>
                      </View>

                      <View style={styles.songMeta}>
                        <Text
                          style={[styles.songTitle, isCurrent && { color: accent.hex }]}
                          numberOfLines={1}
                        >
                          {song.title}
                        </Text>
                        <Text style={styles.songArtist} numberOfLines={1}>
                          {song.artist}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.moreBtn}
                        onPress={() => handlePlayTrendingSong(song)}
                      >
                        <Ionicons
                          name={isCurrent && isPlaying ? 'volume-high' : 'play-circle-outline'}
                          size={24}
                          color={isCurrent ? accent.hex : '#AAAAAA'}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 3. New Releases & Albums (Tapping opens Album/Playlist screen) */}
          {(activeChip === 'all' || activeChip === 'albums') && newAlbums.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="disc" size={18} color="#4CAF50" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>New Albums & Singles</Text>
                </View>
                <Text style={styles.sectionBadge}>{newAlbums.length} Releases</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {newAlbums.map((album) => (
                  <TouchableOpacity
                    key={album.id}
                    style={[styles.albumCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() => handleOpenPlaylist(album.id, album.title, album.thumbnail)}
                  >
                    <View style={styles.albumCoverWrapper}>
                      <ExpoImage
                        source={{ uri: album.thumbnail }}
                        style={styles.albumCover}
                        contentFit="cover"
                      />
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

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {newMusicVideos.map((vid) => (
                  <TouchableOpacity
                    key={vid.videoId}
                    style={[styles.videoCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() =>
                      handlePlayTrendingSong({
                        id: `yt_${vid.videoId}`,
                        videoId: vid.videoId,
                        title: vid.title,
                        artist: vid.artist,
                        thumbnail: vid.thumbnail,
                      })
                    }
                  >
                    <View style={styles.videoThumbWrapper}>
                      <ExpoImage
                        source={{ uri: vid.thumbnail }}
                        style={styles.videoThumb}
                        contentFit="cover"
                      />
                      <View style={styles.videoPlayBtn}>
                        <Ionicons name="play" size={16} color="#FFFFFF" />
                      </View>
                    </View>
                    <View style={styles.videoInfo}>
                      <Text style={styles.videoTitle} numberOfLines={1}>
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

          {/* 5. Genres Hub (38 Regional & Global Genres that lead to Songs & Playlists) */}
          {(activeChip === 'all' || activeChip === 'genres') && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons
                    name="musical-notes"
                    size={18}
                    color="#FFD700"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.sectionTitle}>Genres & Languages</Text>
                </View>
                <Text style={styles.sectionBadge}>{genres.length} Genres</Text>
              </View>

              <View style={styles.genresGrid}>
                {genres.map((genre) => (
                  <TouchableOpacity
                    key={genre.text}
                    style={[styles.genreCard, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() => handleOpenCategory(genre)}
                  >
                    <View style={[styles.genreLeftBar, { backgroundColor: genre.color }]} />
                    <Text style={styles.genreTitle} numberOfLines={1}>
                      {genre.text}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="#666666" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* 1. Category Shelves Modal: Shows "Songs" AND "Playlists" Shelves          */}
      {/* ========================================================================= */}
      <Modal
        visible={selectedCategory !== null && selectedPlaylistId === null}
        animationType="slide"
        transparent={false}
        onRequestClose={handleBack}
      >
        <SafeAreaView style={[styles.modalContent, { backgroundColor: bgHex }]} edges={['top']}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: surfaceHex }]}>
            <TouchableOpacity
              style={styles.modalBackBtn}
              onPress={() => {
                setSelectedCategory(null);
                setCategoryDetail(null);
              }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.modalTitleRow}>
              <View
                style={[
                  styles.modalDot,
                  { backgroundColor: selectedCategory?.color || accent.hex },
                ]}
              />
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedCategory?.text || 'Explore Category'}
              </Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Modal Shelves Content */}
          {isLoadingCategory ? (
            <View style={styles.modalLoader}>
              <ActivityIndicator size="large" color={accent.hex} />
              <Text style={styles.modalLoaderText}>
                Loading {selectedCategory?.text} content...
              </Text>
            </View>
          ) : categoryDetail && categoryDetail.shelves.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {categoryDetail.shelves.map((shelf, sIdx) => {
                // If this is a Songs shelf (like in Hindi, Punjabi, Pop, etc.)
                if (shelf.isSongsShelf) {
                  return (
                    <View key={`${shelf.title}_${sIdx}`} style={styles.shelfBlock}>
                      <View style={styles.shelfHeaderRow}>
                        <View style={styles.sectionTitleWithIcon}>
                          <Ionicons
                            name="musical-notes"
                            size={18}
                            color={accent.hex}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.shelfTitle}>{shelf.title}</Text>
                        </View>
                        <Text style={styles.sectionBadge}>{shelf.items.length} songs</Text>
                      </View>

                      {/* 4-row Horizontal Carousel of Songs */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.songsShelfScroll}
                      >
                        {chunkArray(shelf.items, 4).map((chunk, cIdx) => (
                          <View key={`chunk_${cIdx}`} style={styles.songColumnChunk}>
                            {chunk.map((songItem) => {
                              const isCurrent =
                                currentSong?.id === songItem.id ||
                                (songItem.videoId &&
                                  currentSong?.streamUrl?.includes(songItem.videoId));
                              return (
                                <TouchableOpacity
                                  key={songItem.id}
                                  style={[
                                    styles.categorySongRow,
                                    { backgroundColor: surfaceHex },
                                    isCurrent && [
                                      styles.categorySongRowActive,
                                      { borderColor: accent.hex },
                                    ],
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => handlePlayCategorySong(songItem, shelf.items)}
                                >
                                  <View style={styles.categorySongThumbWrapper}>
                                    <ExpoImage
                                      source={{ uri: songItem.thumbnail }}
                                      style={styles.categorySongThumb}
                                      contentFit="cover"
                                    />
                                    <View style={styles.categorySongPlayOverlay}>
                                      <Ionicons
                                        name={isCurrent && isPlaying ? 'pause' : 'play'}
                                        size={12}
                                        color="#FFFFFF"
                                      />
                                    </View>
                                  </View>

                                  <View style={styles.categorySongMeta}>
                                    <Text
                                      style={[
                                        styles.categorySongTitle,
                                        isCurrent && { color: accent.hex },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {songItem.title}
                                    </Text>
                                    <Text
                                      style={styles.categorySongSubtitle}
                                      numberOfLines={1}
                                    >
                                      {songItem.subtitle}
                                    </Text>
                                  </View>

                                  <Ionicons
                                    name={
                                      isCurrent && isPlaying
                                        ? 'volume-high'
                                        : 'play-circle-outline'
                                    }
                                    size={20}
                                    color={isCurrent ? accent.hex : '#777777'}
                                    style={{ marginLeft: 6 }}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  );
                }

                // Otherwise, this is a Playlists shelf ("Featured playlists", "Community playlists", etc.)
                return (
                  <View key={`${shelf.title}_${sIdx}`} style={styles.shelfBlock}>
                    <View style={styles.shelfHeaderRow}>
                      <View style={styles.sectionTitleWithIcon}>
                        <Ionicons
                          name="albums"
                          size={17}
                          color="#AAAAAA"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.shelfTitle}>{shelf.title}</Text>
                      </View>
                      <Text style={styles.sectionBadge}>{shelf.items.length} playlists</Text>
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalScroll}
                    >
                      {shelf.items.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.shelfCard, { backgroundColor: surfaceHex }]}
                          activeOpacity={0.8}
                          onPress={() => handleOpenPlaylist(item.id, item.title, item.thumbnail)}
                        >
                          <View style={styles.shelfCoverWrapper}>
                            <ExpoImage
                              source={{ uri: item.thumbnail }}
                              style={styles.shelfCover}
                              contentFit="cover"
                            />
                            <View style={styles.playlistTagBadge}>
                              <Ionicons
                                name="list"
                                size={10}
                                color="#FFFFFF"
                                style={{ marginRight: 3 }}
                              />
                              <Text style={styles.playlistTagText}>PLAYLIST</Text>
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
                );
              })}
              <View style={{ height: 80 }} />
            </ScrollView>
          ) : (
            <View style={styles.modalEmpty}>
              <Ionicons name="musical-notes-outline" size={48} color="#666666" />
              <Text style={styles.modalEmptyTitle}>No Content Found</Text>
              <Text style={styles.modalEmptySubtitle}>
                Could not load content for this category right now.
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ========================================================================= */}
      {/* 2. Playlist Detail Modal: Full Screen matching YouTube Music Official UI  */}
      {/* ========================================================================= */}
      <Modal
        visible={selectedPlaylistId !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={handleBack}
      >
        <SafeAreaView style={[styles.modalContent, { backgroundColor: bgHex }]} edges={['top']}>
          {/* Top Bar */}
          <View style={[styles.playlistTopBar, { borderBottomColor: surfaceHex }]}>
            <TouchableOpacity
              style={styles.playlistBackBtn}
              onPress={() => {
                setSelectedPlaylistId(null);
                setPlaylistDetail(null);
              }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.playlistTopBarTitle} numberOfLines={1}>
              {playlistDetail?.title || 'Playlist'}
            </Text>

            {playlistDetail && (
              <TouchableOpacity
                style={styles.playlistShareBtn}
                onPress={() => handleSharePlaylist(playlistDetail)}
              >
                <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Body */}
          {isLoadingPlaylist && !playlistDetail?.tracks?.length ? (
            <View style={styles.modalLoader}>
              <ActivityIndicator size="large" color={accent.hex} />
              <Text style={styles.modalLoaderText}>Loading playlist songs...</Text>
            </View>
          ) : playlistDetail ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.playlistScroll}>
              {/* Hero Section: Artwork, Title, Creator, Count, Actions */}
              <View style={styles.playlistHero}>
                <View style={styles.playlistArtWrapper}>
                  <ExpoImage
                    source={{
                      uri:
                        playlistDetail.thumbnail ||
                        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
                    }}
                    style={styles.playlistArt}
                    contentFit="cover"
                  />
                </View>

                <Text style={styles.playlistMainTitle} numberOfLines={2}>
                  {playlistDetail.title}
                </Text>

                <Text style={styles.playlistMainSubtitle} numberOfLines={1}>
                  {playlistDetail.subtitle || 'YouTube Music'}
                </Text>

                {playlistDetail.secondSubtitle ? (
                  <Text style={styles.playlistSecondSubtitle} numberOfLines={1}>
                    {playlistDetail.secondSubtitle}
                  </Text>
                ) : playlistDetail.trackCount ? (
                  <Text style={styles.playlistSecondSubtitle} numberOfLines={1}>
                    {playlistDetail.trackCount} songs
                  </Text>
                ) : null}

                {playlistDetail.description ? (
                  <Text style={styles.playlistDescription} numberOfLines={3}>
                    {playlistDetail.description}
                  </Text>
                ) : null}

                {/* Play All & Shuffle Buttons Row */}
                <View style={styles.playlistActionRow}>
                  <TouchableOpacity
                    style={[styles.playlistPlayAllBtn, { backgroundColor: accent.hex }]}
                    activeOpacity={0.8}
                    onPress={() => handlePlayAllFromPlaylist(playlistDetail, false)}
                  >
                    <Ionicons name="play" size={22} color="#000000" style={{ marginLeft: 2 }} />
                    <Text style={styles.playlistPlayAllText}>Play All</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.playlistShuffleBtn, { backgroundColor: surfaceHex }]}
                    activeOpacity={0.8}
                    onPress={() => handlePlayAllFromPlaylist(playlistDetail, true)}
                  >
                    <Ionicons name="shuffle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.playlistShuffleText}>Shuffle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tracks Section Header */}
              <View style={styles.tracksHeaderRow}>
                <Text style={styles.tracksHeaderTitle}>Tracks</Text>
                <Text style={styles.tracksHeaderCount}>
                  {playlistDetail.tracks.length} songs
                </Text>
              </View>

              {/* Track List */}
              <View style={styles.tracksList}>
                {playlistDetail.tracks.map((track, tIdx) => {
                  const isCurrent =
                    currentSong?.id === track.id || currentSong?.streamUrl?.includes(track.videoId);
                  return (
                    <TouchableOpacity
                      key={`${track.videoId}_${tIdx}`}
                      style={[
                        styles.trackItemRow,
                        isCurrent && [styles.trackItemRowActive, { backgroundColor: surfaceHex }],
                      ]}
                      activeOpacity={0.7}
                      onPress={() => handlePlayPlaylistTrack(track, playlistDetail)}
                    >
                      <View style={styles.trackIndexCol}>
                        {isCurrent && isPlaying ? (
                          <Ionicons name="volume-high" size={16} color={accent.hex} />
                        ) : (
                          <Text
                            style={[
                              styles.trackIndexText,
                              isCurrent && { color: accent.hex, fontWeight: '800' },
                            ]}
                          >
                            {tIdx + 1}
                          </Text>
                        )}
                      </View>

                      <ExpoImage
                        source={{ uri: track.thumbnail }}
                        style={styles.trackThumbnail}
                        contentFit="cover"
                      />

                      <View style={styles.trackInfoCol}>
                        <Text
                          style={[styles.trackName, isCurrent && { color: accent.hex }]}
                          numberOfLines={1}
                        >
                          {track.title}
                        </Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </View>

                      {track.duration ? (
                        <Text style={styles.trackDurationText}>{track.duration}</Text>
                      ) : null}

                      <TouchableOpacity
                        style={styles.trackPlayBtn}
                        onPress={() => handlePlayPlaylistTrack(track, playlistDetail)}
                      >
                        <Ionicons
                          name={isCurrent && isPlaying ? 'pause-circle' : 'play-circle-outline'}
                          size={22}
                          color={isCurrent ? accent.hex : '#888888'}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ height: 90 }} />
            </ScrollView>
          ) : (
            <View style={styles.modalEmpty}>
              <Ionicons name="alert-circle-outline" size={48} color="#666666" />
              <Text style={styles.modalEmptyTitle}>Failed to Load Playlist</Text>
              <Text style={styles.modalEmptySubtitle}>
                Check your network connection and try again.
              </Text>
            </View>
          )}
        </SafeAreaView>
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
  songsList: {
    gap: 8,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  songRowActive: {
    borderColor: '#1DB954',
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    color: '#777777',
    fontSize: 13,
    fontWeight: '700',
  },
  topRankNumber: {
    fontWeight: '900',
    fontSize: 14,
  },
  songThumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 6,
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
    color: '#888888',
    fontSize: 12,
    fontWeight: '500',
  },
  moreBtn: {
    padding: 8,
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
    width: '100%',
    height: ALBUM_CARD_WIDTH - 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
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
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  albumArtist: {
    color: '#888888',
    fontSize: 11.5,
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
    width: '100%',
    height: (VIDEO_CARD_WIDTH * 9) / 16,
    position: 'relative',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoPlayBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    padding: 8,
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  videoArtist: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '500',
  },
  genresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  genreCard: {
    width: (SCREEN_WIDTH - CARD_PADDING * 2 - 10) / 2,
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  genreLeftBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  genreTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  // Category Shelves Modal
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: SCREEN_WIDTH - 100,
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
  },
  modalLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  modalLoaderText: {
    color: '#888888',
    fontSize: 13,
  },
  modalScroll: {
    paddingVertical: 16,
    paddingHorizontal: CARD_PADDING,
  },
  shelfBlock: {
    marginBottom: 24,
  },
  shelfHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shelfTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  // 4-row song shelf layout
  songsShelfScroll: {
    paddingRight: CARD_PADDING,
    gap: 12,
  },
  songColumnChunk: {
    width: SCREEN_WIDTH * 0.82,
    gap: 8,
  },
  categorySongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categorySongRowActive: {
    borderColor: '#1DB954',
  },
  categorySongThumbWrapper: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  categorySongThumb: {
    width: '100%',
    height: '100%',
  },
  categorySongPlayOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySongMeta: {
    flex: 1,
    marginLeft: 10,
  },
  categorySongTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  categorySongSubtitle: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '500',
  },
  // Playlist cards
  shelfCard: {
    width: PLAYLIST_CARD_WIDTH,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  shelfCoverWrapper: {
    width: '100%',
    height: PLAYLIST_CARD_WIDTH - 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },
  shelfCover: {
    width: '100%',
    height: '100%',
  },
  playlistTagBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  playlistTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  shelfItemTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  shelfItemSubtitle: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '500',
  },
  modalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  modalEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalEmptySubtitle: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
  },
  // Playlist Detail Screen
  playlistTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  playlistBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistTopBarTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  playlistShareBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistScroll: {
    paddingBottom: 40,
  },
  playlistHero: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  playlistArtWrapper: {
    width: 210,
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    backgroundColor: '#1E1E1E',
  },
  playlistArt: {
    width: '100%',
    height: '100%',
  },
  playlistMainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  playlistMainSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAAAAA',
    textAlign: 'center',
    marginBottom: 4,
  },
  playlistSecondSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#777777',
    textAlign: 'center',
    marginBottom: 10,
  },
  playlistDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  playlistActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  playlistPlayAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
  },
  playlistPlayAllText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  playlistShuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  playlistShuffleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tracksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tracksHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  tracksHeaderCount: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '600',
  },
  tracksList: {
    paddingTop: 4,
  },
  trackItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: CARD_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  trackItemRowActive: {
    borderRadius: 8,
  },
  trackIndexCol: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackIndexText: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '600',
  },
  trackThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  trackInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  trackName: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackArtist: {
    color: '#888888',
    fontSize: 11.5,
    fontWeight: '500',
  },
  trackDurationText: {
    color: '#777777',
    fontSize: 11.5,
    fontWeight: '500',
    marginHorizontal: 8,
  },
  trackPlayBtn: {
    padding: 6,
  },
});
