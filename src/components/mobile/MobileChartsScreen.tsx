import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';
import { SongItemRow } from '@/components/common/SongItemRow';
import { AlbumModalSkeleton } from '@/components/common/SkeletonLoader';
import {
  ChartEditorialMetadata,
  ChartPayload,
  ChartSummary,
  EDITORIAL_CHARTS_CONFIG,
  chartTrackToSong,
  fetchChartDetail,
  fetchChartSummaries,
} from '@/services/chartsApi';
import { Song } from '@/types/music';
import { ChartDetailModal } from './charts/ChartDetailModal';

const { width: WINDOW_WIDTH } = Dimensions.get('window');

interface MobileChartsScreenProps {
  onNavigateHome?: () => void;
}

type FilterCategory = 'All' | 'Apple Music' | 'Spotify' | 'YouTube' | 'Gaana' | 'Cities';

type DirectPlatform = 'Spotify' | 'YouTube' | 'Gaana';

const DIRECT_CHART_MAP: Record<DirectPlatform, string> = {
  Spotify: 'spotify-india',
  YouTube: 'youtube-india',
  Gaana: 'gaana-worldwide',
};

const PLATFORM_ACCENT_COLORS: Record<string, string> = {
  Spotify: '#1DB954',
  YouTube: '#FF0000',
  Gaana: '#E72C30',
  'Apple Music': '#FC3C44',
  Cities: '#0EA5E9',
  All: '#22C55E',
};

interface DirectPlatformHeaderProps {
  directMeta: ChartEditorialMetadata;
  platformAccent: string;
  coverUrl: string;
  directSongsCount: number;
  filteredSongsCount: number;
  platformSearchQuery: string;
  activeFilter: string;
  onSearchChange: (text: string) => void;
  onClearSearch: () => void;
  onPlayAll: () => void;
  onShuffle: () => void;
  styles: any;
}

const DirectPlatformHeader = React.memo<DirectPlatformHeaderProps>(
  ({
    directMeta,
    platformAccent,
    coverUrl,
    directSongsCount,
    filteredSongsCount,
    platformSearchQuery,
    activeFilter,
    onSearchChange,
    onClearSearch,
    onPlayAll,
    onShuffle,
    styles,
  }) => {
    return (
      <View style={styles.directHeaderContainer}>
        {/* Liquid Glass Hero Header Panel */}
        <View style={styles.directGlassPanel}>
          {/* Subtle Ambient Color Glow */}
          <LinearGradient
            colors={[`${platformAccent}25`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Edge Specular Highlight */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.32)', 'rgba(255, 255, 255, 0.06)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.specularRim}
          />

          <View style={styles.directHeroRow}>
            {/* Left High-Res Artwork with Specular Glass Border */}
            <View style={styles.directArtworkWrapper}>
              <ExpoImage
                source={{ uri: coverUrl }}
                style={styles.directArtwork}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.directFloatingRankBadge, { backgroundColor: platformAccent }]}>
                <Text style={styles.directFloatingRankText}>#1</Text>
              </View>
            </View>

            {/* Right Chart Metadata */}
            <View style={styles.directMetaRight}>
              <View style={styles.directPlatformBadgeRow}>
                <View style={[styles.directPlatformBadge, { backgroundColor: platformAccent }]}>
                  <Text style={styles.directPlatformBadgeText}>
                    {directMeta.platformLabel.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.directLiveTag}>
                  <View style={[styles.directLiveDot, { backgroundColor: platformAccent }]} />
                  <Text style={[styles.directLiveTagText, { color: platformAccent }]}>LIVE</Text>
                </View>
              </View>

              <Text style={styles.directChartTitle} numberOfLines={1}>
                {directMeta.title}
              </Text>
              <Text style={styles.directChartSubtitle} numberOfLines={1}>
                {directMeta.subtitle}
              </Text>
              <Text style={styles.directTrackCount}>
                {directSongsCount > 0 ? `${directSongsCount} Tracks` : 'Official Chart'} • Updated Daily
              </Text>
            </View>
          </View>

          {/* Action Row: Play All & Shuffle */}
          <View style={styles.directActionRow}>
            <TouchableOpacity
              style={[styles.directPlayAllBtn, { backgroundColor: platformAccent }]}
              activeOpacity={0.85}
              onPress={onPlayAll}
              disabled={directSongsCount === 0}
            >
              <Ionicons name="play" size={17} color="#000000" style={{ marginRight: 6 }} />
              <Text style={styles.directPlayAllBtnText}>PLAY ALL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.directShuffleBtn}
              activeOpacity={0.8}
              onPress={onShuffle}
              disabled={directSongsCount === 0}
            >
              <Ionicons name="shuffle" size={19} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Liquid Glass Search Input */}
          <View style={styles.directSearchBox}>
            <Ionicons name="search" size={15} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.directSearchInput}
              placeholder={`Search ${directSongsCount || ''} ${activeFilter} tracks...`}
              placeholderTextColor="#64748B"
              value={platformSearchQuery}
              onChangeText={onSearchChange}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {platformSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={onClearSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Section divider label */}
        <View style={styles.directSongsHeader}>
          <Text style={styles.directSongsHeaderTitle}>
            {platformSearchQuery ? `Search Results (${filteredSongsCount})` : 'Leaderboard Rankings'}
          </Text>
          <Text style={styles.directSongsHeaderSub}>
            {directSongsCount} Tracks Loaded
          </Text>
        </View>
      </View>
    );
  }
);

export const MobileChartsScreen: React.FC<MobileChartsScreenProps> = () => {
  const { isTablet, contentMaxWidth } = useResponsive();
  const { bgHex, accent } = useAppTheme();
  const { playSong } = useAudio();

  const [summaries, setSummaries] = useState<ChartSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All');
  const [selectedChartMeta, setSelectedChartMeta] = useState<ChartEditorialMetadata | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedInitialCover, setSelectedInitialCover] = useState<string | undefined>(undefined);
  const [playingChartId, setPlayingChartId] = useState<string | null>(null);

  // Direct Platform State (Spotify, YouTube, Gaana)
  const [platformCharts, setPlatformCharts] = useState<Record<string, ChartPayload>>({});
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformRefreshing, setPlatformRefreshing] = useState(false);
  const [platformSearchQuery, setPlatformSearchQuery] = useState('');

  const summaryMap = useMemo(() => {
    const map: Record<string, ChartSummary> = {};
    for (const s of summaries) {
      map[s.id] = s;
    }
    return map;
  }, [summaries]);

  // Load summaries on mount or refresh
  const loadSummaries = useCallback(async (force: boolean = false) => {
    if (!force) setIsLoading(true);
    try {
      const data = await fetchChartSummaries(force);
      setSummaries(data);
    } catch (err) {
      console.warn('[MobileChartsScreen] Error loading summaries:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadSummaries(true);
  }, [loadSummaries]);

  // Check if active filter is a direct song list platform (Spotify, YouTube, Gaana)
  const isDirectPlatform = activeFilter === 'Spotify' || activeFilter === 'YouTube' || activeFilter === 'Gaana';
  const directChartId = isDirectPlatform ? DIRECT_CHART_MAP[activeFilter as DirectPlatform] : null;
  const directMeta = directChartId ? EDITORIAL_CHARTS_CONFIG[directChartId] : null;

  // Track last fetched timestamp and in-flight status per chartId to prevent infinite loop / spamming backend
  const directChartLastFetchedRef = useRef<Record<string, number>>({});
  const directChartInFlightRef = useRef<Record<string, boolean>>({});
  const platformChartsRef = useRef(platformCharts);
  platformChartsRef.current = platformCharts;

  useEffect(() => {
    if (!directChartId) return;
    setPlatformSearchQuery('');

    const existing = platformChartsRef.current[directChartId];
    const now = Date.now();
    const lastFetched = directChartLastFetchedRef.current[directChartId] || 0;
    const isStale = now - lastFetched > 5 * 60 * 1000; // 5 min cooldown

    // If already in memory and not stale, do nothing
    if (existing?.tracks?.length && !isStale) {
      return;
    }

    // If already fetching, avoid redundant call
    if (directChartInFlightRef.current[directChartId]) {
      return;
    }

    directChartInFlightRef.current[directChartId] = true;

    // If existing in memory but stale, quiet background revalidation
    if (existing?.tracks?.length) {
      directChartLastFetchedRef.current[directChartId] = now;
      fetchChartDetail(directChartId, true)
        .then((payload) => {
          if (payload && payload.tracks?.length) {
            setPlatformCharts((prev) => ({ ...prev, [directChartId]: payload }));
          }
        })
        .finally(() => {
          directChartInFlightRef.current[directChartId] = false;
        });
      return;
    }

    // Initial fetch: show skeleton/spinner
    setPlatformLoading(true);
    directChartLastFetchedRef.current[directChartId] = now;
    fetchChartDetail(directChartId, false)
      .then((payload) => {
        if (payload && payload.tracks?.length) {
          setPlatformCharts((prev) => ({ ...prev, [directChartId]: payload }));
        }
      })
      .catch((err) => {
        console.warn(`[MobileChartsScreen] Error loading direct chart ${directChartId}:`, err);
      })
      .finally(() => {
        directChartInFlightRef.current[directChartId] = false;
        setPlatformLoading(false);
      });
  }, [directChartId]);

  const handleDirectPlatformRefresh = useCallback(async () => {
    if (!directChartId || directChartInFlightRef.current[directChartId]) return;
    setPlatformRefreshing(true);
    directChartInFlightRef.current[directChartId] = true;
    try {
      const payload = await fetchChartDetail(directChartId, true);
      if (payload && payload.tracks?.length) {
        directChartLastFetchedRef.current[directChartId] = Date.now();
        setPlatformCharts((prev) => ({ ...prev, [directChartId]: payload }));
      }
    } catch (err) {
      console.warn(`[MobileChartsScreen] Error refreshing direct chart ${directChartId}:`, err);
    } finally {
      directChartInFlightRef.current[directChartId] = false;
      setPlatformRefreshing(false);
    }
  }, [directChartId]);

  // Convert tracks of direct platform into Song objects
  const directSongs: Song[] = useMemo(() => {
    if (!directChartId) return [];
    const payload = platformCharts[directChartId];
    if (!payload?.tracks) return [];
    return payload.tracks.map((t) => chartTrackToSong(t, directMeta?.title));
  }, [directChartId, platformCharts, directMeta?.title]);

  // Filter songs based on search query inside the direct platform
  const filteredDirectSongs: Song[] = useMemo(() => {
    if (!platformSearchQuery.trim()) return directSongs;
    const q = platformSearchQuery.toLowerCase().trim();
    return directSongs.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
    );
  }, [directSongs, platformSearchQuery]);

  // Play All on Direct Platform
  const handleDirectPlayAll = useCallback(() => {
    if (directSongs.length > 0) {
      playSong(directSongs[0], directSongs);
    }
  }, [directSongs, playSong]);

  // Shuffle on Direct Platform
  const handleDirectShuffle = useCallback(() => {
    if (directSongs.length > 0) {
      const shuffled = [...directSongs].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  }, [directSongs, playSong]);

  // Open modal for selected chart (used in All, Apple Music, and Cities)
  const handleOpenChart = useCallback(
    (meta: ChartEditorialMetadata, cover?: string) => {
      setSelectedChartMeta(meta);
      setSelectedInitialCover(cover || summaryMap[meta.id]?.topTrack?.cover || meta.coverImage);
      setModalVisible(true);
    },
    [summaryMap]
  );

  // Direct 1-tap play button on a magazine card
  const handleDirectPlay = useCallback(
    async (meta: ChartEditorialMetadata, e?: any) => {
      e?.stopPropagation?.();
      setPlayingChartId(meta.id);
      try {
        const payload = await fetchChartDetail(meta.id);
        if (payload && payload.tracks && payload.tracks.length > 0) {
          const songs = payload.tracks.map((t) => chartTrackToSong(t, meta.title));
          playSong(songs[0], songs);
        }
      } catch (err) {
        console.warn('[MobileChartsScreen] Error playing chart:', err);
      } finally {
        setPlayingChartId(null);
      }
    },
    [playSong]
  );

  // Filter items according to active filter (for All, Apple Music, and Cities)
  const allEditorialItems: ChartEditorialMetadata[] = useMemo(() => {
    return Object.values(EDITORIAL_CHARTS_CONFIG);
  }, []);

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case 'Apple Music':
        return allEditorialItems.filter((item) => item.platform === 'apple_music');
      case 'Cities':
        return allEditorialItems.filter((item) => Boolean(item.city));
      default:
        return allEditorialItems;
    }
  }, [activeFilter, allEditorialItems]);

  // Top spotlight item: Apple Music Top 100 India (or first item)
  const spotlightItem = useMemo(() => {
    return EDITORIAL_CHARTS_CONFIG['apple-music-top-100-india'] || allEditorialItems[0];
  }, [allEditorialItems]);

  // City items
  const cityItems = useMemo(() => {
    return allEditorialItems.filter((item) => Boolean(item.city));
  }, [allEditorialItems]);

  // National heavyweights for All view
  const nationalItems = useMemo(() => {
    return [
      EDITORIAL_CHARTS_CONFIG['apple-music-top-100-india'],
      EDITORIAL_CHARTS_CONFIG['spotify-india'],
      EDITORIAL_CHARTS_CONFIG['youtube-india'],
      EDITORIAL_CHARTS_CONFIG['gaana-worldwide'],
    ].filter(Boolean);
  }, []);

  const filterCategories: FilterCategory[] = [
    'All',
    'Apple Music',
    'Spotify',
    'YouTube',
    'Gaana',
    'Cities',
  ];

  // Memoized cover URL and accent color for Direct Platforms (Spotify, YouTube, Gaana)
  const directPlatformAccent = directMeta ? (PLATFORM_ACCENT_COLORS[activeFilter] || accent.hex) : accent.hex;

  const directCoverUrl = useMemo(() => {
    if (!directMeta) return '';
    return (
      directSongs[0]?.cover ||
      summaryMap[directMeta.id]?.topTrack?.cover ||
      directMeta.coverImage
    );
  }, [directMeta, directSongs, summaryMap]);

  const handleClearPlatformSearch = useCallback(() => {
    setPlatformSearchQuery('');
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']}>
      <View
        style={[
          styles.container,
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        {/* Liquid Glass Atmosphere Background */}
        <LinearGradient
          colors={['rgba(30, 41, 59, 0.15)', 'transparent']}
          style={styles.ambientTopGlow}
          pointerEvents="none"
        />

        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.screenTitle}>Charts</Text>
            <Text style={styles.screenSubtitle}>
              Official Streaming Leaderboards & City Trends
            </Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.pulsingDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        </View>

        {/* Liquid Glass Filter Bar */}
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {filterCategories.map((cat) => {
              const isActive = activeFilter === cat;
              const catAccent = PLATFORM_ACCENT_COLORS[cat] || accent.hex;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    isActive && [styles.filterChipActive, { backgroundColor: catAccent, borderColor: catAccent }],
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setActiveFilter(cat)}
                >
                  {/* Subtle top specular sheen inside active chip */}
                  {isActive && (
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.40)', 'transparent']}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  )}
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Body: If Spotify, YouTube, or Gaana -> DIRECT FULL SONG LIST! (No cards/folders!) */}
        {isDirectPlatform ? (
          platformLoading && directSongs.length === 0 ? (
            <View style={styles.loadingWrapper}>
              <AlbumModalSkeleton />
            </View>
          ) : (
            <FlatList
              data={filteredDirectSongs}
              keyExtractor={(item, index) => `${item.id}_${index}`}
              ListHeaderComponent={
                directMeta ? (
                  <DirectPlatformHeader
                    directMeta={directMeta}
                    platformAccent={directPlatformAccent}
                    coverUrl={directCoverUrl}
                    directSongsCount={directSongs.length}
                    filteredSongsCount={filteredDirectSongs.length}
                    platformSearchQuery={platformSearchQuery}
                    activeFilter={activeFilter}
                    onSearchChange={setPlatformSearchQuery}
                    onClearSearch={handleClearPlatformSearch}
                    onPlayAll={handleDirectPlayAll}
                    onShuffle={handleDirectShuffle}
                    styles={styles}
                  />
                ) : null
              }
              renderItem={({ item, index }) => (
                <SongItemRow
                  song={item}
                  index={index}
                  playlistContext={directSongs}
                  showTrackNumber={true}
                />
              )}
              contentContainerStyle={styles.directListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={platformRefreshing}
                  onRefresh={handleDirectPlatformRefresh}
                  tintColor={PLATFORM_ACCENT_COLORS[activeFilter] || accent.hex}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={38} color="#64748B" />
                  <Text style={styles.emptyTitle}>No Tracks Found</Text>
                  <Text style={styles.emptySubtitle}>
                    {platformSearchQuery
                      ? `No tracks matching "${platformSearchQuery}" in ${activeFilter}`
                      : 'Connecting to live stream leaderboard...'}
                  </Text>
                </View>
              }
            />
          )
        ) : (
          /* Magazine Editorial Scroll Content (For 'All', 'Apple Music', 'Cities') */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={accent.hex}
              />
            }
          >
            {activeFilter === 'All' ? (
              <>
                {/* --- HERO MAGAZINE SPOTLIGHT --- */}
                {(() => {
                  const heroCover = summaryMap[spotlightItem.id]?.topTrack?.cover || spotlightItem.coverImage;
                  const heroTopTrack = summaryMap[spotlightItem.id]?.topTrack;
                  return (
                    <TouchableOpacity
                      style={styles.heroMagazineCard}
                      activeOpacity={0.88}
                      onPress={() => handleOpenChart(spotlightItem, heroCover)}
                    >
                      <ExpoImage
                        source={{ uri: heroCover }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                      />
                      <LinearGradient
                        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.68)', 'rgba(7, 10, 16, 0.95)']}
                        style={StyleSheet.absoluteFill}
                      />

                      {/* Liquid Glass Top Highlight Sheen */}
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.40)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.specularRim}
                        pointerEvents="none"
                      />

                      {/* Hero Card Badges */}
                      <View style={styles.heroTopBadges}>
                        <View style={[styles.heroPlatformTag, { backgroundColor: spotlightItem.accentColor }]}>
                          <Text style={styles.heroPlatformTagText}>{spotlightItem.platformLabel}</Text>
                        </View>
                        <View style={styles.heroHotTag}>
                          <Ionicons name="flame" size={12} color="#F59E0B" style={{ marginRight: 4 }} />
                          <Text style={styles.heroHotTagText}>
                            {heroTopTrack ? `#1: ${heroTopTrack.title}` : '#1 IN INDIA'}
                          </Text>
                        </View>
                      </View>

                      {/* Hero Bottom Meta */}
                      <View style={styles.heroBottomContent}>
                        <Text style={styles.heroSubtitle}>{spotlightItem.subtitle.toUpperCase()}</Text>
                        <Text style={styles.heroTitle}>{spotlightItem.title}</Text>
                        <Text style={styles.heroDesc} numberOfLines={2}>
                          {heroTopTrack
                            ? `Currently trending #1: "${heroTopTrack.title}" by ${heroTopTrack.artist}`
                            : spotlightItem.description}
                        </Text>

                        <View style={styles.heroActionRow}>
                          <TouchableOpacity
                            style={[styles.heroPlayBtn, { backgroundColor: accent.hex }]}
                            activeOpacity={0.85}
                            onPress={(e) => handleDirectPlay(spotlightItem, e)}
                          >
                            {playingChartId === spotlightItem.id ? (
                              <ActivityIndicator size="small" color="#000000" />
                            ) : (
                              <>
                                <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 6 }} />
                                <Text style={styles.heroPlayBtnText}>PLAY CHART</Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <Text style={styles.heroTrackCount}>
                            {summaryMap[spotlightItem.id]?.totalTracks || 100} Tracks • Updated Daily
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })()}

                {/* --- SECTION 1: 🌆 CITY SOUNDS (MUMBAI, DELHI, BENGALURU, DUBAI) --- */}
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>City Sounds</Text>
                    <Text style={styles.sectionSubtitle}>Where India & the diaspora are listening</Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalCardScroll}
                >
                  {cityItems.map((city) => {
                    const cityCover = summaryMap[city.id]?.topTrack?.cover || city.coverImage;
                    return (
                      <TouchableOpacity
                        key={city.id}
                        style={styles.cityCard}
                        activeOpacity={0.85}
                        onPress={() => handleOpenChart(city, cityCover)}
                      >
                        <ExpoImage
                          source={{ uri: cityCover }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.92)']}
                          style={StyleSheet.absoluteFill}
                        />

                        {/* Top Specular Sheen */}
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.35)', 'transparent']}
                          style={styles.specularRim}
                          pointerEvents="none"
                        />

                        <View style={styles.cityCardTopBadge}>
                          <Ionicons name="location-sharp" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
                          <Text style={styles.cityCardTopBadgeText}>{city.city}</Text>
                        </View>

                        <View style={styles.cityCardBottom}>
                          <Text style={styles.cityCardTitle}>{city.title}</Text>
                          <Text style={styles.cityCardDesc} numberOfLines={1}>
                            {city.subtitle}
                          </Text>
                          <TouchableOpacity
                            style={styles.circlePlayBtn}
                            activeOpacity={0.8}
                            onPress={(e) => handleDirectPlay(city, e)}
                          >
                            {playingChartId === city.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Ionicons name="play" size={15} color="#FFFFFF" style={{ marginLeft: 2 }} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* --- SECTION 2: 🇮🇳 NATIONAL STREAMING CHAMPIONS --- */}
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Streaming Giants</Text>
                    <Text style={styles.sectionSubtitle}>Leaderboards across the biggest music platforms</Text>
                  </View>
                </View>

                <View style={styles.editorialGrid}>
                  {nationalItems.map((item) => {
                    const itemCover = summaryMap[item.id]?.topTrack?.cover || item.coverImage;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.editorialCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          // If user taps Spotify, YouTube, or Gaana card in All view, switch to direct filter!
                          if (item.platform === 'spotify') {
                            setActiveFilter('Spotify');
                          } else if (item.platform === 'youtube') {
                            setActiveFilter('YouTube');
                          } else if (item.platform === 'gaana') {
                            setActiveFilter('Gaana');
                          } else {
                            handleOpenChart(item, itemCover);
                          }
                        }}
                      >
                        <ExpoImage
                          source={{ uri: itemCover }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                        <LinearGradient
                          colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                          style={StyleSheet.absoluteFill}
                        />

                        {/* Top Specular Rim */}
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.35)', 'transparent']}
                          style={styles.specularRim}
                          pointerEvents="none"
                        />

                        <View style={[styles.platformBadgeSmall, { backgroundColor: item.accentColor }]}>
                          <Text style={styles.platformBadgeSmallText}>{item.platformLabel}</Text>
                        </View>

                        <View style={styles.editorialCardBottom}>
                          <Text style={styles.editorialCardTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.editorialCardDesc} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                          <View style={styles.editorialCardFooter}>
                            <Text style={styles.editorialCardTracks}>
                              {summaryMap[item.id]?.totalTracks ? `${summaryMap[item.id].totalTracks} Tracks` : 'Top 100 Tracks'}
                            </Text>
                            <TouchableOpacity
                              style={styles.editorialMiniPlayBtn}
                              activeOpacity={0.8}
                              onPress={(e) => handleDirectPlay(item, e)}
                            >
                              {playingChartId === item.id ? (
                                <ActivityIndicator size="small" color="#000000" />
                              ) : (
                                <Ionicons name="play" size={13} color="#000000" style={{ marginLeft: 1 }} />
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* --- SECTION 3: 🎵 CURATED & SPECIALIZED --- */}
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Curated & Media Charts</Text>
                    <Text style={styles.sectionSubtitle}>Top songs, curated playlists, albums & videos</Text>
                  </View>
                </View>

                <View style={styles.editorialGrid}>
                  {[
                    EDITORIAL_CHARTS_CONFIG['apple-music-top-charts-songs'],
                    EDITORIAL_CHARTS_CONFIG['apple-music-top-charts-playlists'],
                    EDITORIAL_CHARTS_CONFIG['apple-music-top-charts-albums'],
                    EDITORIAL_CHARTS_CONFIG['apple-music-top-charts-music-videos'],
                  ]
                    .filter(Boolean)
                    .map((item) => {
                      const itemCover = summaryMap[item.id]?.topTrack?.cover || item.coverImage;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.editorialCard}
                          activeOpacity={0.85}
                          onPress={() => handleOpenChart(item, itemCover)}
                        >
                          <ExpoImage
                            source={{ uri: itemCover }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            transition={150}
                            cachePolicy="memory-disk"
                          />
                          <LinearGradient
                            colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                            style={StyleSheet.absoluteFill}
                          />

                          {/* Top Specular Rim */}
                          <LinearGradient
                            colors={['rgba(255, 255, 255, 0.35)', 'transparent']}
                            style={styles.specularRim}
                            pointerEvents="none"
                          />

                          <View style={[styles.platformBadgeSmall, { backgroundColor: item.accentColor }]}>
                            <Text style={styles.platformBadgeSmallText}>{item.badge}</Text>
                          </View>

                          <View style={styles.editorialCardBottom}>
                            <Text style={styles.editorialCardTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={styles.editorialCardDesc} numberOfLines={1}>
                              {item.subtitle}
                            </Text>
                            <View style={styles.editorialCardFooter}>
                              <Text style={styles.editorialCardTracks}>
                                {summaryMap[item.id]?.totalTracks ? `${summaryMap[item.id].totalTracks} Tracks` : '50 Tracks'}
                              </Text>
                              <TouchableOpacity
                                style={styles.editorialMiniPlayBtn}
                                activeOpacity={0.8}
                                onPress={(e) => handleDirectPlay(item, e)}
                              >
                                {playingChartId === item.id ? (
                                  <ActivityIndicator size="small" color="#000000" />
                                ) : (
                                  <Ionicons name="play" size={13} color="#000000" style={{ marginLeft: 1 }} />
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </>
            ) : (
              /* --- FILTERED GRID VIEW (For Apple Music and Cities) --- */
              <View style={styles.editorialGrid}>
                {filteredItems.map((item) => {
                  const itemCover = summaryMap[item.id]?.topTrack?.cover || item.coverImage;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.editorialCard}
                      activeOpacity={0.85}
                      onPress={() => handleOpenChart(item, itemCover)}
                    >
                      <ExpoImage
                        source={{ uri: itemCover }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                      <LinearGradient
                        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                        style={StyleSheet.absoluteFill}
                      />

                      {/* Top Specular Rim */}
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.35)', 'transparent']}
                        style={styles.specularRim}
                        pointerEvents="none"
                      />

                      <View style={[styles.platformBadgeSmall, { backgroundColor: item.accentColor }]}>
                        <Text style={styles.platformBadgeSmallText}>
                          {item.city ? `📍 ${item.city}` : item.badge || item.platformLabel}
                        </Text>
                      </View>

                      <View style={styles.editorialCardBottom}>
                        <Text style={styles.editorialCardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.editorialCardDesc} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                        <View style={styles.editorialCardFooter}>
                          <Text style={styles.editorialCardTracks}>
                            {summaryMap[item.id]?.totalTracks
                              ? `${summaryMap[item.id].totalTracks} Tracks`
                              : item.city
                              ? '25 Tracks'
                              : '50 Tracks'}
                          </Text>
                          <TouchableOpacity
                            style={styles.editorialMiniPlayBtn}
                            activeOpacity={0.8}
                            onPress={(e) => handleDirectPlay(item, e)}
                          >
                            {playingChartId === item.id ? (
                              <ActivityIndicator size="small" color="#000000" />
                            ) : (
                              <Ionicons name="play" size={13} color="#000000" style={{ marginLeft: 1 }} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* Dedicated Full-Bleed Chart Detail Modal for Multi-Chart categories */}
        <ChartDetailModal
          visible={modalVisible}
          metadata={selectedChartMeta}
          initialCover={selectedInitialCover}
          onClose={() => setModalVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#070A10',
  },
  container: {
    flex: 1,
    paddingTop: 8,
    position: 'relative',
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveBadgeText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  filterBar: {
    marginBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    position: 'relative',
  },
  filterChipActive: {
    borderWidth: 1,
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  specularRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  // Direct Platform Styles (Spotify, YouTube, Gaana)
  directListContent: {
    paddingHorizontal: 16,
    paddingBottom: 150, // Clearance for MiniPlayer & Bottom Navigation
  },
  directHeaderContainer: {
    marginBottom: 12,
  },
  directGlassPanel: {
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  directHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  directArtworkWrapper: {
    width: 90,
    height: 90,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  directArtwork: {
    width: '100%',
    height: '100%',
  },
  directFloatingRankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  directFloatingRankText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  directMetaRight: {
    flex: 1,
    gap: 3,
  },
  directPlatformBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directPlatformBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  directPlatformBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  directLiveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  directLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  directLiveTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  directChartTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  directChartSubtitle: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
  },
  directTrackCount: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  directActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  directPlayAllBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 21,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  directPlayAllBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  directShuffleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 38,
    marginTop: 12,
  },
  directSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 0,
  },
  directSongsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 14,
    marginBottom: 4,
  },
  directSongsHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  directSongsHeaderSub: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  loadingWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // Magazine Scroll Content (All, Apple Music, Cities)
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 150, // Clearance for MiniPlayer & Tab Bar
  },
  heroMagazineCard: {
    width: '100%',
    height: 250,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  heroTopBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroPlatformTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroPlatformTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroHotTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  heroHotTagText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
  },
  heroBottomContent: {
    gap: 4,
  },
  heroSubtitle: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  heroPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  heroPlayBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroTrackCount: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  horizontalCardScroll: {
    gap: 12,
    paddingBottom: 8,
    marginBottom: 20,
  },
  cityCard: {
    width: 140,
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'space-between',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  cityCardTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cityCardTopBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cityCardBottom: {
    gap: 2,
  },
  cityCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cityCardDesc: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 4,
  },
  circlePlayBtn: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  editorialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    marginBottom: 24,
  },
  editorialCard: {
    width: (WINDOW_WIDTH - 44) / 2,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'space-between',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  platformBadgeSmall: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  platformBadgeSmallText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  editorialCardBottom: {
    gap: 2,
  },
  editorialCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  editorialCardDesc: {
    color: '#CBD5E1',
    fontSize: 10,
  },
  editorialCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  editorialCardTracks: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  editorialMiniPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
});
