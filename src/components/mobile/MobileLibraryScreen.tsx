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
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

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
  const rawTokens = cleanQ.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return true;

  // Strip common stopwords so queries like "Arijit Singh playlist" still match
  const stopwords = new Set(['playlist', 'playlists', 'song', 'songs', 'music', 'mix']);
  const meaningfulTokens = rawTokens.filter((t) => !stopwords.has(t));
  const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

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
  const {
    width: screenWidth,
    isTablet,
    isLandscape,
    useSidebarNavigation,
    sidebarWidth,
    contentMaxWidth,
  } = useResponsive();

  const availableWidth = useSidebarNavigation
    ? screenWidth - sidebarWidth
    : screenWidth;

  const effectiveWidth = isTablet && contentMaxWidth
    ? Math.min(availableWidth, contentMaxWidth)
    : availableWidth;

  const GRID_GAP = isTablet ? 16 : 12;
  const HORIZONTAL_PADDING = 16;

  const numCols = useMemo(() => {
    if (!isTablet) return 2;
    // Adapt column count dynamically based on available width:
    // Optimal playlist card width is 180-210dp on tablets
    const targetCardWidth = 190;
    const computedCols = Math.floor(
      (effectiveWidth - HORIZONTAL_PADDING * 2 + GRID_GAP) / (targetCardWidth + GRID_GAP)
    );
    return Math.max(2, Math.min(6, computedCols));
  }, [isTablet, effectiveWidth, GRID_GAP, HORIZONTAL_PADDING]);

  const dynamicCardWidth = useMemo(() => {
    return Math.floor(
      (effectiveWidth - HORIZONTAL_PADDING * 2 - (numCols - 1) * GRID_GAP) / numCols
    );
  }, [effectiveWidth, HORIZONTAL_PADDING, numCols, GRID_GAP]);
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

  // Execute live YouTube playlist search
  const executeLiveSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const searchId = ++activeSearchIdRef.current;
    setIsSearchingLive(true);

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
  }, []);

  // Query live YouTube playlist search when search term is >= 2 chars (with 350ms debounce)
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

    setIsSearchingLive(true);

    searchDebounceRef.current = setTimeout(() => {
      executeLiveSearch(trimmed);
    }, 350);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, executeLiveSearch]);

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
    if (isLoadingPlaylists || isSearchingLive) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent.hex || '#1DB954'} />
          <Text style={styles.loadingText}>
            {isSearchingLive ? 'Searching YouTube Playlists...' : 'Loading Playlists...'}
          </Text>
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
        cardWidth={dynamicCardWidth}
        isTablet={isTablet}
        isItemLoading={loadingPlayId === item.id}
        isCurrentPlaying={currentSong?.album === item.title && isPlaying}
        onOpen={handleOpenPlaylist}
        onPlay={handleDirectPlay}
      />
    ),
    [dynamicCardWidth, isTablet, loadingPlayId, currentSong?.album, isPlaying, handleOpenPlaylist, handleDirectPlay]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']} {...panResponder.panHandlers}>
      <View style={[styles.container, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
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
            onChangeText={(text) => {
              setSearchQuery(text);
              if (text.trim() && activeCategory !== 'All') {
                setActiveCategory('All');
              }
            }}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
              }
              executeLiveSearch(searchQuery);
            }}
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
          key={`playlist-grid-cols-${numCols}`}
          data={filteredPlaylists}
          keyExtractor={(item) => item.id}
          numColumns={numCols}
          columnWrapperStyle={[styles.gridRow, { gap: GRID_GAP }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.scrollContent]}
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
  cardWidth: number;
  isTablet?: boolean;
  isItemLoading: boolean;
  isCurrentPlaying: boolean;
  onOpen: (item: YouTubePlaylistItem) => void;
  onPlay: (item: YouTubePlaylistItem) => void;
}

const PlaylistGridCard: React.FC<PlaylistGridCardProps> = React.memo(
  ({ item, index, cardWidth, isTablet, isItemLoading, isCurrentPlaying, onOpen, onPlay }) => {
    const { accent } = useAppTheme();
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

    const cardHeight = Math.round(cardWidth * 1.18);

    return (
      <TouchableOpacity
        style={[
          styles.folderCard,
          { width: cardWidth, height: cardHeight },
          isCurrentPlaying && {
            borderColor: accent.hex,
            shadowColor: accent.hex,
            shadowOpacity: 0.5,
          },
        ]}
        activeOpacity={0.84}
        onPress={() => onOpen(item)}
      >
        {/* Layer 1: Back Panel with Folder Tab */}
        <View style={styles.folderBackContainer}>
          {/* Top Folder Tab Header */}
          <View style={[styles.folderTab, isCurrentPlaying && { borderColor: accent.hex }]}>
            <Ionicons name="folder-outline" size={10} color="#94A3B8" style={{ marginRight: 4 }} />
            <Text style={styles.folderTabText} numberOfLines={1}>
              {item.category?.toUpperCase() || 'PLAYLIST'}
            </Text>
          </View>

          {/* Back Art Panel */}
          <View style={styles.folderBackPlate}>
            <ExpoImage
              source={{ uri: imageSource }}
              style={styles.folderArt}
              contentFit="cover"
              transition={120}
              cachePolicy="memory-disk"
              priority={index !== undefined && index < 8 ? 'high' : 'normal'}
              recyclingKey={item.id}
              onError={handleImageError}
            />
            {/* Dark gradient over back artwork */}
            <LinearGradient
              colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
              style={styles.folderBackShade}
            />
            {/* Specular top rim sheen */}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.25)', 'transparent']}
              style={styles.folderBackRim}
              pointerEvents="none"
            />
          </View>
        </View>

        {/* Layer 2: Inner Stacked Sheets (files/record sleeves peeking out) */}
        <View style={styles.folderSheetsContainer} pointerEvents="none">
          {/* Back Sheet: tilted left */}
          <View style={[styles.folderSheet, styles.folderSheetBack]} />
          {/* Front Sheet: tilted right with preview track lines */}
          <View style={[styles.folderSheet, styles.folderSheetFront]}>
            <View style={styles.sheetLines}>
              <View style={[styles.sheetLine, { width: '75%' }]} />
              <View style={[styles.sheetLine, { width: '50%' }]} />
            </View>
          </View>
        </View>

        {/* Layer 3: Front Frosted Glass Panel (Hinged Pocket) */}
        <View
          style={[
            styles.folderFrontGlass,
            isCurrentPlaying && { borderColor: accent.hex },
          ]}
        >
          {/* Glass Top Edge Specular Sheen */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.32)', 'rgba(255, 255, 255, 0.05)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.7 }}
            style={styles.frontGlassSpecular}
            pointerEvents="none"
          />

          {/* Badge Pill on Glass */}
          <View style={styles.folderBadge}>
            <Text style={styles.folderBadgeText}>{item.badge.toUpperCase()}</Text>
          </View>

          {/* Label Area */}
          <View style={styles.folderLabelArea}>
            <Text
              style={[
                styles.folderTitle,
                isCurrentPlaying && { color: accent.hex, fontWeight: '800' },
                isTablet && styles.cardTitleTablet,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.folderMeta, isTablet && styles.cardDescTablet]} numberOfLines={1}>
              {item.description || (item.category ? item.category + ' • Official Mix' : 'Curated Mix')}
            </Text>
          </View>

          {/* Floating Action Key Button (.gf-key) */}
          <TouchableOpacity
            style={[
              styles.folderKeyBtn,
              isCurrentPlaying && [styles.folderKeyBtnActive, { backgroundColor: accent.hex }],
            ]}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation?.();
              onPlay(item);
            }}
          >
            {isItemLoading ? (
              <ActivityIndicator size="small" color={isCurrentPlaying ? '#000000' : '#FFFFFF'} />
            ) : (
              <Ionicons
                name={isCurrentPlaying ? 'pause' : 'play'}
                size={15}
                color={isCurrentPlaying ? '#000000' : '#FFFFFF'}
                style={{ marginLeft: isCurrentPlaying ? 0 : 2 }}
              />
            )}
          </TouchableOpacity>
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
    height: 48,
    borderRadius: GLASS_THEME.radii.pill,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
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
    paddingBottom: 140, // Clearance for floating MiniPlayer & Tab Bar
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
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  card: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderRadius: GLASS_THEME.radii.card,
    borderColor: GLASS_THEME.colors.borderDefault,
    overflow: 'hidden',
    borderWidth: 1,
  },
  thumbnailWrapper: {
    width: '100%',
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
  cardTitleTablet: {
    fontSize: 14,
  },
  cardDescTablet: {
    fontSize: 12,
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
  folderCard: {
    position: 'relative',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    marginVertical: 4,
  },
  folderBackContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  folderTab: {
    position: 'absolute',
    top: 0,
    left: 8,
    width: '52%',
    height: 18,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    zIndex: 2,
  },
  folderTabText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
  },
  folderBackPlate: {
    position: 'absolute',
    top: 15,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  folderArt: {
    width: '100%',
    height: '100%',
  },
  folderBackShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  folderBackRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
  },
  folderSheetsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
  },
  folderSheet: {
    position: 'absolute',
    borderRadius: 12,
  },
  folderSheetBack: {
    top: 19,
    left: 14,
    right: 14,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    transform: [{ rotate: '-2.4deg' }],
  },
  folderSheetFront: {
    top: 24,
    left: 18,
    right: 18,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    transform: [{ rotate: '1.8deg' }],
    padding: 8,
    justifyContent: 'center',
  },
  sheetLines: {
    gap: 4,
  },
  sheetLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  folderFrontGlass: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 22, 32, 0.82)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 10,
    padding: 10,
    justifyContent: 'space-between',
  },
  frontGlassSpecular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  folderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  folderBadgeText: {
    color: '#E2E8F0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  folderLabelArea: {
    paddingRight: 38,
    marginBottom: 2,
  },
  folderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  folderMeta: {
    fontSize: 10.5,
    color: '#94A3B8',
    letterSpacing: -0.1,
  },
  folderKeyBtn: {
    position: 'absolute',
    bottom: 9,
    right: 9,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  folderKeyBtnActive: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },

});

