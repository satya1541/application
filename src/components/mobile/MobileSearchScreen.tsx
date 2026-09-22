import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  BackHandler,
  PanResponder,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SongItemRow } from '../common/SongItemRow';
import { SongItemSkeleton, SearchScreenSkeleton } from '../common/SkeletonLoader';
import { SourceBadge } from '../common/SourceBadge';
import { SearchOrchestrator, GroupedSuggestions } from '@/services/searchOrchestrator';
import { getTrendingYouTubeMusic } from '@/services/youtubeMusicApi';
import { ExploreSearchResult, CanonicalArtist, CanonicalAlbum } from '@/types/explore';
import { useAudio } from '@/contexts/AudioContext';
import { Song } from '@/types/music';
import { ArtistProfileModal } from '../explore/ArtistProfileModal';
import { AlbumModal } from '../explore/AlbumModal';
import { YSearchScreen } from '../video/YSearchScreen';
import { NoInternetView } from '../common/NoInternetView';
import { useNetwork } from '@/contexts/NetworkContext';
import { getSafeCoverArt, isYouTubeCover } from '@/services/imageUtils';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fetchTopChartArtists, ChartArtist } from '@/services/youtubeExploreService';

interface BrowseCategory {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  cover: string;
  chartKey?: string;
  language?: string;
  query?: string;
}

// 12 Authentic YouTube Top 50 Regional & Global Charts styled with Spotify tilted-art UI
const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: 'hindi',
    title: 'Hindi Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#E11D48',
    cover: 'https://i.ytimg.com/vi/I9tX-lFUTrw/hqdefault.jpg',
    chartKey: 'hindi',
  },
  {
    id: 'weekly_top',
    title: 'Weekly Top Songs',
    subtitle: 'India Top 100 Tracks',
    color: '#8B5CF6',
    cover: 'https://i.ytimg.com/vi/xvT1jH8B9AM/hqdefault.jpg',
    chartKey: 'weekly_top',
  },
  {
    id: 'daily_top',
    title: 'Daily Top Videos',
    subtitle: 'India Daily Most Viewed',
    color: '#2563EB',
    cover: 'https://i.ytimg.com/vi/JqFzhcWo3EU/hqdefault.jpg',
    chartKey: 'daily_top',
  },
  {
    id: 'trending',
    title: 'Trending Videos',
    subtitle: 'Realtime Trending',
    color: '#EC4899',
    cover: 'https://i.ytimg.com/vi/JqFzhcWo3EU/hqdefault.jpg',
    chartKey: 'trending',
  },
  {
    id: 'punjabi',
    title: 'Punjabi Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#D97706',
    cover: 'https://i.ytimg.com/vi/YyepU5ztLf4/hqdefault.jpg',
    chartKey: 'punjabi',
  },
  {
    id: 'telugu',
    title: 'Telugu Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#7C3AED',
    cover: 'https://i.ytimg.com/vi/A_RV2H2F9jw/hqdefault.jpg',
    chartKey: 'telugu',
  },
  {
    id: 'tamil',
    title: 'Tamil Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#F43F5E',
    cover: 'https://i.ytimg.com/vi/b68HETiNO98/hqdefault.jpg',
    chartKey: 'tamil',
  },
  {
    id: 'bhojpuri',
    title: 'Bhojpuri Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#DC2626',
    cover: 'https://i.ytimg.com/vi/u9BdaJTWeiw/hqdefault.jpg',
    chartKey: 'bhojpuri',
  },
  {
    id: 'haryanvi',
    title: 'Haryanvi Top Songs',
    subtitle: 'Weekly Official Chart',
    color: '#16A34A',
    cover: 'https://i.ytimg.com/vi/ebZj_nrmH-c/hqdefault.jpg',
    chartKey: 'haryanvi',
  },
  {
    id: 'international',
    title: 'Top International',
    subtitle: 'Global Weekly Chart',
    color: '#0284C7',
    cover: 'https://i.ytimg.com/vi/FboTyBsFZQs/hqdefault.jpg',
    chartKey: 'international',
  },
  {
    id: 'sambalpuri',
    title: 'Sambalpuri Top Hits',
    subtitle: 'Regional Chartbusters',
    color: '#EA580C',
    cover: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
    language: 'sambalpuri',
  },
  {
    id: 'odia',
    title: 'Odia Top Hits',
    subtitle: 'Regional Chartbusters',
    color: '#0D9488',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
    language: 'odia',
  },
];

interface MobileSearchScreenProps {
  onNavigateHome?: () => void;
}

export const MobileSearchScreen: React.FC<MobileSearchScreenProps> = ({ onNavigateHome }) => {
  const { bgHex, surfaceHex, accent, themeMode } = useAppTheme();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<ExploreSearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<GroupedSuggestions | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showYSearch, setShowYSearch] = useState(false);

  const { playSong } = useAudio();
  const { isOffline, refreshNetwork } = useNetwork();

  // Active Category Detail View State (Opened via Browse All)
  const [selectedCategory, setSelectedCategory] = useState<BrowseCategory | null>(null);
  const [categorySongs, setCategorySongs] = useState<Song[]>([]);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);

  // Top Artists from YouTube Music Charts (https://music.youtube.com/charts)
  const [topArtists, setTopArtists] = useState<ChartArtist[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);

  const loadTopArtists = useCallback(async (force = false) => {
    setIsLoadingArtists(true);
    try {
      const artists = await fetchTopChartArtists(force);
      if (artists && artists.length > 0) {
        setTopArtists(artists);
      }
    } catch (err) {
      console.warn('[MobileSearchScreen] Failed to fetch top chart artists:', err);
    } finally {
      setIsLoadingArtists(false);
    }
  }, []);

  useEffect(() => {
    loadTopArtists();
  }, [loadTopArtists]);

  // Re-fetch when coming back online if top artists list is empty
  useEffect(() => {
    if (!isOffline && topArtists.length === 0) {
      loadTopArtists();
    }
  }, [isOffline, topArtists.length, loadTopArtists]);

  // Modal States for Artist & Album Discovery
  const [selectedArtist, setSelectedArtist] = useState<{ id: string; name: string; image?: string } | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isInputFocusedRef = useRef(false);

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request sequencing IDs to prevent race conditions and out-of-order stale overwrites
  const activeSearchIdRef = useRef<number>(0);
  const activeSuggestionIdRef = useRef<number>(0);

  // Unified Back Handler (Handles edge-swipe gesture, hardware back button, and in-screen swipe)
  const handleBack = useCallback(() => {
    // 0. If YSearch screen is active, close it and return to standard search
    if (showYSearch) {
      setShowYSearch(false);
      return true;
    }
    // 1. If artist profile modal is open, close it
    if (selectedArtist) {
      setSelectedArtist(null);
      return true;
    }
    // 2. If album modal is open, close it
    if (selectedAlbumId) {
      setSelectedAlbumId(null);
      return true;
    }
    // 3. If a category chart detail is open, return to Browse all
    if (selectedCategory) {
      setSelectedCategory(null);
      return true;
    }
    // 4. If search query or search results are active, clear search and return to Browse all
    if (query.trim().length > 0 || searchResult) {
      setQuery('');
      setSearchResult(null);
      setShowSuggestions(false);
      Keyboard.dismiss();
      return true;
    }
    // 5. If already at the root of Search Screen, route to Home Screen
    if (onNavigateHome) {
      onNavigateHome();
      return true;
    }
    return false;
  }, [showYSearch, selectedArtist, selectedAlbumId, selectedCategory, query, searchResult, onNavigateHome]);

  // Android System Back & Edge-Swipe Navigation Handler
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return handleBack();
    });
    return () => subscription.remove();
  }, [handleBack]);

  // In-Screen Horizontal Swipe Back Gesture Handler
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Trigger if swiping right with clear horizontal intent (dx > 20, dx > 1.5 * |dy|)
        return gestureState.dx > 20 && gestureState.dx > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_, gestureState) => {
        // Require at least 45px rightward swipe or brisk swipe velocity
        if (gestureState.dx > 45 && (gestureState.vx > 0.12 || gestureState.dx > 90)) {
          handleBack();
        }
      },
    })
  ).current;

  // Live Autocomplete Suggestions (Only when input is actively focused)
  useEffect(() => {
    if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);

    if (!isInputFocusedRef.current) {
      setShowSuggestions(false);
      return;
    }

    if (query.trim().length >= 2) {
      const suggestionId = ++activeSuggestionIdRef.current;
      suggestionTimeoutRef.current = setTimeout(async () => {
        if (!isInputFocusedRef.current || suggestionId !== activeSuggestionIdRef.current) return;
        const res = await SearchOrchestrator.getSuggestions(query);
        if (!isInputFocusedRef.current || suggestionId !== activeSuggestionIdRef.current) return;
        setSuggestions(res);
        setShowSuggestions(true);
      }, 200);
    } else {
      ++activeSuggestionIdRef.current;
      setSuggestions(null);
      setShowSuggestions(false);
    }

    return () => {
      if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    };
  }, [query, isInputFocused]);

  // Automatically dismiss suggestions & blur input whenever the soft keyboard hides
  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsInputFocused(false);
      isInputFocusedRef.current = false;
      setShowSuggestions(false);
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
      inputRef.current?.blur();
    });
    return () => {
      hideSub.remove();
    };
  }, []);

  // Full Search Dispatch (Only triggers on user query)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!query.trim()) {
      ++activeSearchIdRef.current;
      setSearchResult(null);
      setIsLoading(false);
      return;
    }

    const searchId = ++activeSearchIdRef.current;
    setIsLoading(true);
    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await SearchOrchestrator.searchAll(
          query.trim(),
          'all',
          25
        );
        // Stale response check: If a newer search was dispatched, discard this response
        if (searchId !== activeSearchIdRef.current) return;
        setSearchResult(res);
      } catch (err) {
        if (searchId === activeSearchIdRef.current) {
          console.warn('Search query failed:', err);
        }
      } finally {
        if (searchId === activeSearchIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [query]);

  const handleSelectSuggestion = (item: any) => {
    if (item.type === 'artist') {
      setSelectedArtist({ id: item.id.replace('art-', ''), name: item.title, image: item.image });
      setShowSuggestions(false);
    } else if (item.type === 'album') {
      setSelectedAlbumId(item.id.replace('alb-', ''));
      setShowSuggestions(false);
    } else {
      setQuery(item.title);
      setShowSuggestions(false);
    }
  };

  const handleSelectCategory = async (category: BrowseCategory) => {
    setSelectedCategory(category);
    setIsCategoryLoading(true);
    setShowSuggestions(false);

    try {
      const targetKey = category.chartKey || category.language;
      if (targetKey) {
        const songs = await getTrendingYouTubeMusic(targetKey, 50);
        setCategorySongs(songs as unknown as Song[]);
      } else {
        const res = await SearchOrchestrator.searchAll(category.query || category.title, 'all', 40);
        setCategorySongs(res.songs as unknown as Song[]);
      }
    } catch (err) {
      console.warn('Failed to load category tracks:', err);
    } finally {
      setIsCategoryLoading(false);
    }
  };

  const displayedSongs = searchResult?.songs || [];
  const topResult = searchResult?.topResult || (
    searchResult?.artists && searchResult.artists.length > 0
      ? searchResult.artists[0]
      : displayedSongs.length > 0
      ? displayedSongs[0]
      : null
  );

  // Intent-Aware Dynamic Section Rendering
  const sectionOrder = searchResult?.sections || ['TopResult', 'Songs', 'Artists', 'Albums'];

  const renderSection = (sectionName: 'TopResult' | 'Artists' | 'Albums' | 'Songs') => {
    switch (sectionName) {
      case 'TopResult':
        if (!topResult) return null;
        const isArtist = 'role' in topResult || topResult.type === 'artist';
        const isAlbum = topResult.type === 'album';

        return (
          <View key="sec-top-result" style={styles.topResultSection}>
            <Text style={styles.sectionTitle}>Top result</Text>
            <TouchableOpacity
              style={styles.topResultCard}
              activeOpacity={0.85}
              onPress={() => {
                if (isArtist) {
                  setSelectedArtist({
                    id: topResult.id,
                    name: topResult.name,
                    image: topResult.cover,
                  });
                } else if (isAlbum) {
                  setSelectedAlbumId(topResult.id);
                } else {
                  playSong(topResult as unknown as Song);
                }
              }}
            >
              <View style={[styles.topResultImageWrapper, isArtist && styles.topResultArtistWrapper]}>
                <ExpoImage
                  source={{ uri: getSafeCoverArt(topResult.cover, topResult.id) }}
                  style={[
                    styles.topResultImage,
                    isArtist && styles.topResultArtistImage,
                    isYouTubeCover(topResult.cover, topResult.id, (topResult as any).source) && styles.youtubeCrop,
                  ]}
                  contentFit="cover"
                  transition={100}
                  cachePolicy="memory-disk"
                />
              </View>
              <View style={styles.topResultInfoCol}>
                <View style={styles.topBadgeRow}>
                  <Text style={styles.topResultTag}>
                    {isArtist
                      ? 'TOP RESULT • ARTIST'
                      : isAlbum
                      ? 'TOP RESULT • ALBUM'
                      : 'TOP RESULT • SONG'}
                  </Text>
                </View>
                <Text style={styles.topResultTitle} numberOfLines={1}>
                  {topResult.name}
                </Text>
                <View style={styles.topResultMeta}>
                  <Text style={styles.topResultType}>
                    {isArtist
                      ? (topResult as CanonicalArtist).role || 'Verified Artist'
                      : isAlbum
                      ? `${(topResult as CanonicalAlbum).artist} • ${(topResult as CanonicalAlbum).year || 'Album'}`
                      : (topResult as any).artist}
                  </Text>
                  {!isArtist && !isAlbum && (
                    <SourceBadge
                      source={(topResult as any).source}
                      quality={(topResult as any).quality}
                    />
                  )}
                </View>
              </View>
              <View style={[styles.playIconCircle, { backgroundColor: accent.hex }]}>
                <Ionicons name="play" size={20} color="#000000" />
              </View>
            </TouchableOpacity>
          </View>
        );

      case 'Artists':
        if (!searchResult?.artists || searchResult.artists.length === 0) return null;
        return (
          <View key="sec-artists" style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Artists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artistList}>
              {searchResult.artists.map((artist) => (
                <TouchableOpacity
                  key={artist.id}
                  style={styles.artistCard}
                  onPress={() => setSelectedArtist({ id: artist.id, name: artist.name, image: artist.cover })}
                  activeOpacity={0.8}
                >
                  <ExpoImage source={{ uri: artist.cover }} style={styles.artistAvatar} contentFit="cover" transition={100} cachePolicy="memory-disk" />
                  <Text style={styles.artistName} numberOfLines={1}>
                    {artist.name}
                  </Text>
                  <Text style={styles.artistTag}>Artist</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      case 'Albums':
        if (!searchResult?.albums || searchResult.albums.length === 0) return null;
        return (
          <View key="sec-albums" style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Albums & Singles</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumList}>
              {searchResult.albums.map((album) => (
                <TouchableOpacity
                  key={album.id}
                  style={styles.albumCard}
                  onPress={() => setSelectedAlbumId(album.id)}
                  activeOpacity={0.8}
                >
                  <ExpoImage source={{ uri: album.cover }} style={styles.albumCover} contentFit="cover" transition={100} cachePolicy="memory-disk" />
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {album.name}
                  </Text>
                  <Text style={styles.albumArtist} numberOfLines={1}>
                    {album.artist}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      case 'Songs':
        if (displayedSongs.length === 0) return null;
        return (
          <View key="sec-songs" style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Songs</Text>
            {displayedSongs.map((song, idx) => (
              <SongItemRow
                key={`${song.id}-${idx}`}
                song={song as unknown as Song}
                index={idx}
                showTrackNumber={true}
              />
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  if (showYSearch) {
    return <YSearchScreen onBack={() => setShowYSearch(false)} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgHex }]} edges={['top']} {...panResponder.panHandlers}>
      <View style={styles.content}>
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Search</Text>
          <TouchableOpacity
            style={styles.ySearchHeaderBtn}
            onPress={() => setShowYSearch(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-youtube" size={18} color="#FF0000" style={{ marginRight: 6 }} />
            <Text style={styles.ySearchHeaderText}>YSearch</Text>
            <Ionicons name="sparkles" size={12} color="#f59e0b" style={{ marginLeft: 5 }} />
          </TouchableOpacity>
        </View>

        {/* Capsule Search Bar Input */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: surfaceHex,
              borderColor: isInputFocused ? accent.hex : 'rgba(255,255,255,0.08)',
              borderWidth: 1,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color={isInputFocused ? accent.hex : '#a0a0a0'}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="What do you want to listen to?"
            placeholderTextColor="#777777"
            value={query}
            returnKeyType="search"
            blurOnSubmit={true}
            onSubmitEditing={() => {
              setIsInputFocused(false);
              isInputFocusedRef.current = false;
              setShowSuggestions(false);
              if (suggestionTimeoutRef.current) {
                clearTimeout(suggestionTimeoutRef.current);
              }
              inputRef.current?.blur();
              Keyboard.dismiss();
            }}
            onChangeText={(text) => {
              setQuery(text);
              if (isInputFocusedRef.current && text.length >= 2) setShowSuggestions(true);
            }}
            onFocus={() => {
              setIsInputFocused(true);
              isInputFocusedRef.current = true;
              if (query.length >= 2) setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsInputFocused(false);
              isInputFocusedRef.current = false;
              setShowSuggestions(false);
            }}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setShowSuggestions(false);
                setSuggestions(null);
                setSearchResult(null);
              }}
            >
              <Ionicons name="close-circle" size={18} color="#777777" />
            </TouchableOpacity>
          )}
        </View>

        {/* Suggestions Flyout Overlay (Only rendered if input is actively focused) */}
        {isInputFocused && showSuggestions && suggestions && (
          (suggestions.artists.length > 0 ||
            suggestions.songs.length > 0 ||
            suggestions.albums.length > 0 ||
            suggestions.queries.length > 0) && (
            <View style={styles.suggestionsContainer}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {/* Artists Suggestions */}
                {suggestions.artists.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    {item.image ? (
                      <ExpoImage source={{ uri: item.image }} style={styles.artistThumb} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <View style={styles.artistThumbPlaceholder}>
                        <Ionicons name="person" size={14} color={accent.hex} />
                      </View>
                    )}
                    <View style={styles.suggestionTextCol}>
                      <Text style={styles.suggestionTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.suggestionSub}>Artist • View Profile</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color="#666666" />
                  </TouchableOpacity>
                ))}

                {/* Songs Suggestions */}
                {suggestions.songs.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <Ionicons name="musical-note" size={18} color="#b3b3b3" style={{ marginRight: 10 }} />
                    <View style={styles.suggestionTextCol}>
                      <Text style={styles.suggestionTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.suggestionSub} numberOfLines={1}>
                        Song • {item.subtitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Albums Suggestions */}
                {suggestions.albums &&
                  suggestions.albums.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.suggestionRow}
                      onPress={() => handleSelectSuggestion(item)}
                    >
                      {item.image ? (
                        <ExpoImage source={{ uri: item.image }} style={styles.albumThumb} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Ionicons name="disc" size={18} color="#b3b3b3" style={{ marginRight: 10 }} />
                      )}
                      <View style={styles.suggestionTextCol}>
                        <Text style={styles.suggestionTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.suggestionSub} numberOfLines={1}>
                          Album • {item.subtitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                {/* Queries Suggestions */}
                {suggestions.queries.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <Ionicons name="search-outline" size={16} color="#777777" style={{ marginRight: 10 }} />
                    <View style={styles.suggestionTextCol}>
                      <Text style={styles.suggestionQueryTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScrollBeginDrag={() => setShowSuggestions(false)}
        >
          {isLoading && searchResult && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1DB954" />
              <Text style={styles.loadingText}>Updating live results...</Text>
            </View>
          )}

          {/* Typo Correction Banner */}
          {searchResult?.correctedQuery && (
            <TouchableOpacity
              style={styles.typoBanner}
              onPress={() => setQuery(searchResult.correctedQuery!)}
            >
              <Text style={styles.typoText}>
                Showing results for{' '}
                <Text style={styles.typoHighlight}>{searchResult.correctedQuery}</Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* MODE 1: Active Category / Chart Detail View (When a card is tapped) */}
          {!query.trim() && selectedCategory ? (
            <View>
              {/* Back to Browse All Button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={18} color="#1DB954" />
                <Text style={styles.backButtonText}>Browse all</Text>
              </TouchableOpacity>

              {/* Category Header Banner */}
              <View
                style={[
                  styles.chartHeaderBanner,
                  { backgroundColor: selectedCategory.color },
                ]}
              >
                <View style={styles.chartHeaderTop}>
                  <View style={styles.chartHeaderBadge}>
                    <Text style={styles.chartHeaderBadgeText}>🎵 YOUTUBE CHARTS • OPUS</Text>
                  </View>
                </View>

                <Text style={styles.chartHeaderTitle}>{selectedCategory.title}</Text>
                <Text style={styles.chartHeaderSub}>
                  {selectedCategory.subtitle || 'Official YouTube Charts'} • {categorySongs.length} Tracks
                </Text>

                {categorySongs.length > 0 && (
                  <TouchableOpacity
                    style={styles.playAllButton}
                    onPress={() => playSong(categorySongs[0], categorySongs)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="play" size={18} color="#000000" />
                    <Text style={styles.playAllButtonText}>Play Top 50</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Songs List */}
              {isCategoryLoading ? (
                <View style={{ paddingTop: 8 }}>
                  <SongItemSkeleton count={10} showTrackNumber={true} />
                </View>
              ) : isOffline && categorySongs.length === 0 ? (
                <NoInternetView onRetry={refreshNetwork} style={styles.offlineView} />
              ) : (
                <View style={styles.sectionBlock}>
                  {categorySongs.map((song, idx) => (
                    <SongItemRow
                      key={`${song.id}-${idx}`}
                      song={song}
                      index={idx}
                      playlistContext={categorySongs}
                      showTrackNumber={true}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : isOffline ? (
            /* OFFLINE STATE (Matching Image 1) */
            <NoInternetView onRetry={refreshNetwork} style={styles.offlineView} />
          ) : !query.trim() ? (
            /* MODE 2: Dynamic YouTube Music Charts Top Artists (https://music.youtube.com/charts) */
            <View style={styles.chartSection}>
              {/* Top Artists Header */}
              <View style={styles.chartHeaderRow}>
                <View>
                  <Text style={styles.chartSectionTitle}>Top artists</Text>
                  <Text style={styles.chartSectionSubtitle}>YouTube Music Charts • Top 40</Text>
                </View>
                <View style={styles.chartOfficialBadge}>
                  <Ionicons name="trending-up" size={13} color="#38bdf8" style={{ marginRight: 4 }} />
                  <Text style={styles.chartOfficialBadgeText}>Live Charts</Text>
                </View>
              </View>

              {isLoadingArtists && topArtists.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="small" color="#38bdf8" />
                  <Text style={styles.chartLoadingText}>Loading top artists...</Text>
                </View>
              ) : topArtists.length === 0 && isOffline ? (
                <NoInternetView onRetry={() => loadTopArtists(true)} style={styles.offlineView} />
              ) : (
                <View style={styles.artistsContainer}>
                  {topArtists.map((artist, idx) => {
                    const isTop3 = artist.rank <= 3;
                    const rankBadgeColor =
                      artist.rank === 1
                        ? '#F59E0B'
                        : artist.rank === 2
                        ? '#94A3B8'
                        : artist.rank === 3
                        ? '#D97706'
                        : '#64748B';

                    return (
                      <TouchableOpacity
                        key={artist.id || `artist-${idx}`}
                        style={styles.artistRowItem}
                        activeOpacity={0.75}
                        onPress={() => {
                          setSelectedArtist({
                            id: artist.id,
                            name: artist.name,
                            image: artist.thumbnail,
                          });
                        }}
                      >
                        {/* Rank & Trend Column */}
                        <View style={styles.artistRankCol}>
                          <Text
                            style={[
                              styles.artistRankNumber,
                              isTop3 && { color: rankBadgeColor, fontWeight: '900', fontSize: 16 },
                            ]}
                          >
                            {artist.rank}
                          </Text>
                          {artist.rankTrend === 'up' ? (
                            <Ionicons name="caret-up" size={12} color="#22c55e" style={styles.trendIcon} />
                          ) : artist.rankTrend === 'down' ? (
                            <Ionicons name="caret-down" size={12} color="#ef4444" style={styles.trendIcon} />
                          ) : (
                            <Ionicons name="remove" size={12} color="#64748b" style={styles.trendIcon} />
                          )}
                        </View>

                        {/* Circular Avatar */}
                        <View style={styles.artistAvatarWrapper}>
                          <ExpoImage
                            source={{
                              uri:
                                artist.thumbnail ||
                                'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
                            }}
                            style={styles.artistAvatarImg}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={150}
                          />
                          {artist.rank === 1 && (
                            <View style={styles.topArtistTrophy}>
                              <Ionicons name="trophy" size={9} color="#000000" />
                            </View>
                          )}
                        </View>

                        {/* Artist Info */}
                        <View style={styles.artistMetaCol}>
                          <Text style={styles.artistMetaName} numberOfLines={1}>
                            {artist.name}
                          </Text>
                          {!!artist.subscribers && (
                            <Text style={styles.artistMetaSubs} numberOfLines={1}>
                              {artist.subscribers}
                            </Text>
                          )}
                        </View>

                        {/* Quick Search Action */}
                        <TouchableOpacity
                          style={styles.artistSearchQuickBtn}
                          activeOpacity={0.7}
                          onPress={() => {
                            setQuery(artist.name);
                            inputRef.current?.focus();
                          }}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <Ionicons name="search-outline" size={18} color="#94a3b8" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            /* MODE 3: Intent-Aware Live Search Results View */
            <View>
              {isLoading && !searchResult ? (
                <SearchScreenSkeleton />
              ) : (
                <>
                  {sectionOrder.map((sectionName) => renderSection(sectionName))}

                  {displayedSongs.length === 0 &&
                    (!searchResult?.artists || searchResult.artists.length === 0) &&
                    (!searchResult?.albums || searchResult.albums.length === 0) &&
                    !isLoading && (
                      isOffline ? (
                        <NoInternetView onRetry={refreshNetwork} style={styles.offlineView} />
                      ) : (
                        <View style={styles.emptyContainer}>
                          <Ionicons name="search-outline" size={48} color="#444444" />
                          <Text style={styles.emptyTitle}>No results found for "{query}"</Text>
                          <Text style={styles.emptySubtitle}>
                            Please check the spelling or explore the categories above.
                          </Text>
                        </View>
                      )
                    )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Deep-Dive Canonical Modals */}
      <ArtistProfileModal
        visible={!!selectedArtist}
        artistId={selectedArtist?.id || null}
        artistName={selectedArtist?.name || ''}
        artistImage={selectedArtist?.image}
        onClose={() => setSelectedArtist(null)}
        onOpenAlbum={(albumId) => setSelectedAlbumId(albumId)}
      />

      <AlbumModal
        visible={!!selectedAlbumId}
        albumId={selectedAlbumId}
        onClose={() => setSelectedAlbumId(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  header: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  ySearchHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.45)',
  },
  ySearchHeaderText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  profileBtn: {
    padding: 2,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#333333',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    borderRadius: 24, // Clean capsule shape matching Spotify
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    height: '100%',
  },
  // Top Artists from YouTube Music Charts Styles
  chartSection: {
    marginBottom: 24,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  chartSectionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  chartSectionSubtitle: {
    color: '#8e8e93',
    fontSize: 13,
    marginTop: 2,
  },
  chartOfficialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  chartOfficialBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  chartLoadingContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartLoadingText: {
    color: '#8e8e93',
    fontSize: 14,
    marginTop: 10,
  },
  artistsContainer: {
    gap: 8,
  },
  artistRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  artistRankCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  artistRankNumber: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700',
  },
  trendIcon: {
    marginTop: 2,
  },
  artistAvatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  artistAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  topArtistTrophy: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#F59E0B',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistMetaCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  artistMetaName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  artistMetaSubs: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '400',
  },
  artistSearchQuickBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  // Suggestions Flyout
  suggestionsContainer: {
    position: 'absolute',
    top: 115,
    left: 16,
    right: 16,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    zIndex: 999,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a2a',
  },
  artistThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  albumThumb: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginRight: 10,
  },
  artistThumbPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionTextCol: {
    flex: 1,
  },
  suggestionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionSub: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  suggestionQueryTitle: {
    color: '#cccccc',
    fontSize: 13,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  loadingText: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  typoBanner: {
    backgroundColor: '#1a2920',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1DB954',
  },
  typoText: {
    color: '#b3b3b3',
    fontSize: 13,
  },
  typoHighlight: {
    color: '#1DB954',
    fontWeight: '700',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backButtonText: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: '700',
  },
  chartHeaderBanner: {
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  chartHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartHeaderBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chartHeaderBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chartHeaderTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  chartHeaderSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    marginBottom: 14,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    alignSelf: 'flex-start',
    gap: 6,
  },
  playAllButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  topResultSection: {
    marginBottom: 18,
  },
  topResultCard: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#282828',
  },
  topResultImageWrapper: {
    width: 68,
    height: 68,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },
  topResultArtistWrapper: {
    borderRadius: 34,
  },
  topResultImage: {
    width: '100%',
    height: '100%',
  },
  topResultArtistImage: {
    borderRadius: 34,
  },
  youtubeCrop: {
    transform: [{ scale: 1.35 }],
  },
  topResultInfoCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  topBadgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  topResultTag: {
    color: '#1DB954',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topResultTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  topResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  topResultType: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  playIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  artistList: {
    gap: 14,
    paddingVertical: 6,
  },
  artistCard: {
    alignItems: 'center',
    width: 80,
  },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 6,
    backgroundColor: '#282828',
  },
  artistName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  artistTag: {
    color: '#888888',
    fontSize: 10,
    marginTop: 1,
  },
  albumList: {
    gap: 12,
    paddingVertical: 6,
  },
  albumCard: {
    width: 120,
  },
  albumCover: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#282828',
  },
  albumTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  albumArtist: {
    color: '#888888',
    fontSize: 11,
    marginTop: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: '#888888',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 260,
  },
  offlineView: {
    minHeight: 380,
    backgroundColor: 'transparent',
    paddingVertical: 40,
  },
});
