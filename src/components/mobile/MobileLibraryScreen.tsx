import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  BackHandler,
  PanResponder,
  TextInput,
  Dimensions,
  Platform,
  Alert, RefreshControl, ActivityIndicator, Keyboard,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';

import {
  getCachedDynamicPlaylists,
  fetchDynamicYouTubePlaylists,
  getCategoryFallbackCover,
  resolveLivePlaylistCover,
  YouTubePlaylistItem,
} from '@/services/youtubePlaylistsCatalog';
import { YouTubePlaylistModal } from '../explore/YouTubePlaylistModal';
import { fetchYouTubePlaylist, searchLiveYouTubePlaylists } from '@/services/youtubeMusicApi';
import { Song } from '@/types/music';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 44) / 2;

interface MobileLibraryScreenProps {
  onNavigateHome?: () => void;
}

/**
 * Intelligent multi-token matcher for playlists.
 * Matches across title, description, category, and badge.
 * Handles reverse order keywords ("hindi top" -> "Top 100 Songs India - Hindi")
 * and common stems ("romantic" -> "romance", "party" -> "partying").
 */
function matchPlaylistItem(p: YouTubePlaylistItem, query: string): boolean {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return true;

  const title = (p.title || '').toLowerCase();
  const desc = (p.description || '').toLowerCase();
  const badge = (p.badge || '').toLowerCase();
  const category = (p.category || '').toLowerCase();
  const fullText = `${title} ${desc} ${badge} ${category}`;

  // 1. Direct whole-string match
  if (fullText.includes(cleanQ)) return true;

  // 2. Tokenized multi-word matching
  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const allTokensMatch = tokens.every((token) => fullText.includes(token));
  if (allTokensMatch) return true;

  // 3. Stem matching (for words like "romantic" -> "romance", "songs" -> "song")
  const stemMatch = tokens.every((token) => {
    if (fullText.includes(token)) return true;
    const stem = token.length > 4 ? token.slice(0, 4) : token;
    return fullText.includes(stem);
  });
  if (stemMatch) return true;

  return false;
}

export const MobileLibraryScreen: React.FC<MobileLibraryScreenProps> = ({ onNavigateHome }) => {
  const { bgHex, surfaceHex, accent, themeMode } = useAppTheme();
  const { playSong, currentSong, isPlaying } = useAudio();

  const [playlists, setPlaylists] = useState<YouTubePlaylistItem[]>(() => getCachedDynamicPlaylists());
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState<boolean>(() => getCachedDynamicPlaylists().length === 0);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [liveSearchResults, setLiveSearchResults] = useState<YouTubePlaylistItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<YouTubePlaylistItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingPlayId, setLoadingPlayId] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchIdRef = useRef<number>(0);

  // Load playlists dynamically on mount
  const loadPlaylists = useCallback(async (force: boolean = false) => {
    try {
      if (playlists.length === 0) {
        setIsLoadingPlaylists(true);
      }
      const live = await fetchDynamicYouTubePlaylists(force);
      if (live && live.length > 0) {
        setPlaylists(live);
      }
    } catch (err) {
      console.warn('Error loading dynamic playlists:', err);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [playlists.length]);

  useEffect(() => {
    loadPlaylists(false);
  }, [loadPlaylists]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadPlaylists(true);
    setIsRefreshing(false);
  }, [loadPlaylists]);

  const handleBack = useCallback(() => {
    if (onNavigateHome) {
      onNavigateHome();
      return true;
    }
    return false;
  }, [onNavigateHome]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }
      return handleBack();
    });
    return () => subscription.remove();
  }, [handleBack, modalVisible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 25 && gestureState.dx > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 45 && (gestureState.vx > 0.12 || gestureState.dx > 90)) {
          handleBack();
        }
      },
    })
  ).current;

  // Query live YouTube playlist search when search term is >= 2 chars
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const searchId = ++activeSearchIdRef.current;
    setIsSearchingLive(true);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const live = await searchLiveYouTubePlaylists(trimmed, 20);
        if (activeSearchIdRef.current === searchId) {
          setLiveSearchResults(live || []);
        }
      } catch (err) {
        console.warn('[searchLiveYouTubePlaylists] Error during live search:', err);
      } finally {
        if (activeSearchIdRef.current === searchId) {
          setIsSearchingLive(false);
        }
      }
    }, 350);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  // Combined candidate playlists (local catalog matching first, merged with live YouTube playlists)
  const allMatchingPlaylists = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) {
      return playlists;
    }

    const seenIds = new Set<string>();
    const combined: YouTubePlaylistItem[] = [];

    // Local matching items
    for (const p of playlists) {
      if (matchPlaylistItem(p, q)) {
        seenIds.add(p.id);
        combined.push(p);
      }
    }

    // Live search results from YouTube
    for (const p of liveSearchResults) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        combined.push(p);
      }
    }

    return combined;
  }, [playlists, searchQuery, liveSearchResults]);

  // Dynamic categories and counts based on allMatchingPlaylists
  const dynamicCategories = useMemo(() => {
    const counts: Record<string, number> = { All: allMatchingPlaylists.length };
    for (const p of allMatchingPlaylists) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }

    const uniqueCats = Array.from(new Set(allMatchingPlaylists.map((p) => p.category)));
    const priority = [
      'Charts',
      'Bollywood & Hindi',
      'Punjabi & Regional',
      'Fresh & Trending',
      'Moods & Chill',
      'Party & Dance',
      'Retro & 90s',
      'Hip-Hop & Rap',
      'Global & Pop',
    ];

    uniqueCats.sort((a, b) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return [
      { name: 'All', count: counts.All || 0 },
      ...uniqueCats.map((cat) => ({ name: cat, count: counts[cat] || 0 })),
    ];
  }, [allMatchingPlaylists]);

  // If user selected a specific category, but current search yields 0 items in it,
  // auto-reset to 'All' so matching results are never hidden
  useEffect(() => {
    if (activeCategory !== 'All' && searchQuery.trim()) {
      const countInCat = allMatchingPlaylists.filter((p) => p.category === activeCategory).length;
      if (countInCat === 0 && allMatchingPlaylists.length > 0) {
        setActiveCategory('All');
      }
    }
  }, [allMatchingPlaylists, activeCategory, searchQuery]);

  // Filter playlists dynamically based on active category
  const filteredPlaylists = useMemo(() => {
    if (activeCategory === 'All') {
      return allMatchingPlaylists;
    }
    return allMatchingPlaylists.filter((p) => p.category === activeCategory);
  }, [allMatchingPlaylists, activeCategory]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setLiveSearchResults([]);
    setActiveCategory('All');
    Keyboard.dismiss();
  }, []);

  // Handle one-tap direct play on a playlist card
  const handleDirectPlay = useCallback(
    async (playlist: YouTubePlaylistItem) => {
      setLoadingPlayId(playlist.id);
      try {
        const songs = await fetchYouTubePlaylist(playlist.id, playlist.title, 50);
        if (songs && songs.length > 0) {
          playSong(songs[0] as unknown as Song, songs as unknown as Song[]);
        }
      } catch (err) {
        console.warn('Failed to play playlist directly:', err);
      } finally {
        setLoadingPlayId(null);
      }
    },
    [playSong]
  );

  const handleOpenPlaylist = useCallback((playlist: YouTubePlaylistItem) => {
    setSelectedPlaylist(playlist);
    setModalVisible(true);
  }, []);

  const renderHeader = useMemo(() => {
    return (
      <View>
        {/* Section Header Row */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionHeaderTitle}>
              {searchQuery
                ? `Search Results`
                : activeCategory === 'All'
                ? 'All Curated Playlists'
                : activeCategory}
            </Text>
            {isSearchingLive && (
              <Text style={styles.searchingLiveIndicator}>• Live searching...</Text>
            )}
          </View>
          <Text style={styles.sectionCountLabel}>{filteredPlaylists.length} playlists</Text>
        </View>
      </View>
    );
  }, [searchQuery, activeCategory, isSearchingLive, filteredPlaylists.length]);

  const renderEmpty = useCallback(() => {
    if (isLoadingPlaylists) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={styles.loadingText}>Loading Playlists...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="musical-notes-outline" size={36} color="#666666" />
        </View>
        <Text style={styles.emptyTitle}>No Playlists Found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? `No matching playlists found for "${searchQuery}".`
            : 'No playlists available right now.'}
        </Text>

        <View style={styles.suggestionsWrapper}>
          <Text style={styles.suggestionsHeader}>POPULAR SUGGESTIONS</Text>
          <View style={styles.suggestionGrid}>
            {[
              'Bollywood',
              'Punjabi',
              'Tollywood',
              'Kollywood',
              'Desi Pop',
              'Arijit Singh',
              'Chill',
              'Hip Hop',
            ].map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                style={styles.suggestionChip}
                activeOpacity={0.7}
                onPress={() => {
                  setSearchQuery(suggestion);
                  setActiveCategory('All');
                }}
              >
                <Ionicons name="search" size={12} color={accent.hex} style={{ marginRight: 6 }} />
                <Text style={styles.suggestionChipText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {searchQuery ? (
          <TouchableOpacity
            style={styles.clearSearchBtn}
            activeOpacity={0.8}
            onPress={handleClearSearch}
          >
            <Text style={styles.clearSearchBtnText}>Reset to All Playlists</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [isLoadingPlaylists, searchQuery, handleClearSearch, accent.hex]);

  const renderItem = useCallback(
    ({ item, index }: { item: YouTubePlaylistItem; index: number }) => (
      <PlaylistGridCard
        item={item}
        index={index}
        isItemLoading={loadingPlayId === item.id}
        isCurrentPlaying={currentSong?.album === item.title && isPlaying}
        onOpen={handleOpenPlaylist}
        onPlay={handleDirectPlay}
      />
    ),
    [loadingPlayId, currentSong?.album, isPlaying, handleOpenPlaylist, handleDirectPlay]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']} {...panResponder.panHandlers}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.headerTitle}>Playlist</Text>
            <Text style={styles.headerSubtitle}>Official Live YouTube Playlists</Text>
          </View>
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>
              {searchQuery ? `${filteredPlaylists.length} Found` : `${playlists?.length || 0} Playlists`}
            </Text>
          </View>
        </View>

        {/* Search Input Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: surfaceHex },
            isSearchFocused && [styles.searchBarFocused, { borderColor: accent.hex }],
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={isSearchFocused ? accent.hex : '#9e9e9e'}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search playlists, artists, genres, moods..."
            placeholderTextColor="#808080"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {isSearchingLive && (
            <ActivityIndicator size="small" color={accent.hex} style={styles.searchSpinner} />
          )}
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.searchClearBtn}
            >
              <Ionicons name="close-circle" size={18} color="#9e9e9e" />
            </TouchableOpacity>
          )}
        </View>

        {/* Dynamic Category Horizontal Filter Pills */}
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.filterScroll}
          >
            {dynamicCategories.map((cat) => {
              const isActive = activeCategory === cat.name;
              return (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.filterPill,
                    isActive && [styles.filterPillActive, { backgroundColor: accent.hex }],
                  ]}
                  onPress={() => setActiveCategory(cat.name)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {cat.name}
                  </Text>
                  <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                      {cat.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Virtualized 2-Column Playlists Grid with Top-to-Bottom Priority */}
        <FlatList
          data={filteredPlaylists}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#1DB954"
              colors={['#1DB954']}
            />
          }
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          renderItem={renderItem}
        />
      </View>

      {/* Dynamic YouTube Playlist Modal */}
      {selectedPlaylist && (
        <YouTubePlaylistModal
          visible={modalVisible}
          playlistId={selectedPlaylist.id}
          playlistTitle={selectedPlaylist.title}
          playlistCover={selectedPlaylist.thumbnail}
          playlistDescription={selectedPlaylist.description}
          playlistBadge={selectedPlaylist.badge}
          onClose={() => setModalVisible(false)}
        />
      )}
    </SafeAreaView>
  );
};

interface PlaylistGridCardProps {
  item: YouTubePlaylistItem;
  index?: number;
  isItemLoading: boolean;
  isCurrentPlaying: boolean;
  onOpen: (item: YouTubePlaylistItem) => void;
  onPlay: (item: YouTubePlaylistItem) => void;
}

const PlaylistGridCard: React.FC<PlaylistGridCardProps> = React.memo(
  ({ item, index, isItemLoading, isCurrentPlaying, onOpen, onPlay }) => {
    const fallbackCover = useMemo(
      () => getCategoryFallbackCover(item.category),
      [item.category]
    );

    const initialThumb = useMemo(() => {
      if (
        item.thumbnail &&
        item.thumbnail.startsWith('http') &&
        !item.thumbnail.includes('/vi/RDCLAK') &&
        !item.thumbnail.includes('/vi/PL')
      ) {
        return item.thumbnail;
      }
      return fallbackCover;
    }, [item.thumbnail, fallbackCover]);

    const [imageSource, setImageSource] = useState<string>(initialThumb);

    useEffect(() => {
      setImageSource(initialThumb);
    }, [initialThumb]);

    const handleImageError = useCallback(() => {
      if (item.id) {
        resolveLivePlaylistCover(item.id)
          .then((liveUrl) => {
            if (liveUrl && liveUrl !== imageSource) {
              setImageSource(liveUrl);
            } else {
              setImageSource(fallbackCover);
            }
          })
          .catch(() => {
            setImageSource(fallbackCover);
          });
      } else {
        setImageSource(fallbackCover);
      }
    }, [item.id, imageSource, fallbackCover]);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => onOpen(item)}
      >
        <View style={styles.thumbnailWrapper}>
          <ExpoImage
            source={{ uri: imageSource }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            priority={index !== undefined && index < 8 ? 'high' : 'normal'}
            recyclingKey={item.id}
            onError={handleImageError}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.thumbGradient}
          />

          {/* Badge Pill */}
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>{item.badge.toUpperCase()}</Text>
          </View>

          {/* Play Button on Thumbnail */}
          <TouchableOpacity
            style={[styles.cardPlayBtn, isCurrentPlaying && styles.cardPlayBtnActive]}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation?.();
              onPlay(item);
            }}
          >
            {isItemLoading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Ionicons
                name={isCurrentPlaying ? 'pause' : 'play'}
                size={16}
                color="#000000"
                style={{ marginLeft: isCurrentPlaying ? 0 : 2 }}
              />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description || item.type}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9e9e9e',
    fontWeight: '500',
  },
  countChip: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  countChipText: {
    color: '#1DB954',
    fontSize: 11,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202020',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchBarFocused: {
    borderColor: '#1DB954',
    backgroundColor: '#242424',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    height: '100%',
  },
  searchSpinner: {
    marginRight: 8,
  },
  searchClearBtn: {
    padding: 2,
  },
  filterContainer: {
    marginBottom: 14,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  filterPillText: {
    color: '#b3b3b3',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  filterCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  filterCountText: {
    color: '#9e9e9e',
    fontSize: 10,
    fontWeight: '700',
  },
  filterCountTextActive: {
    color: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 130, // Clearance for floating MiniPlayer & Tab Bar
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  searchingLiveIndicator: {
    fontSize: 11,
    color: '#1DB954',
    fontWeight: '600',
  },
  sectionCountLabel: {
    fontSize: 12,
    color: '#808080',
    fontWeight: '600',
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#181818',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  thumbnailWrapper: {
    width: '100%',
    height: CARD_WIDTH,
    position: 'relative',
    backgroundColor: '#282828',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  cardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardPlayBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
  cardPlayBtnActive: {
    backgroundColor: '#ffffff',
  },
  cardContent: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    color: '#8e8e8e',
    lineHeight: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1c1c1c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9e9e9e',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 26,
  },
  suggestionsWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  suggestionsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#707070',
    letterSpacing: 1,
    marginBottom: 14,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202020',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  suggestionChipText: {
    color: '#e0e0e0',
    fontSize: 12,
    fontWeight: '600',
  },
  clearSearchBtn: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderWidth: 1,
    borderColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
  },
  clearSearchBtnText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '700',
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
});

