import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import {
  ChartEditorialMetadata,
  ChartSummary,
  EDITORIAL_CHARTS_CONFIG,
  chartTrackToSong,
  fetchChartDetail,
  fetchChartSummaries,
} from '@/services/chartsApi';
import { ChartDetailModal } from './charts/ChartDetailModal';

const { width: WINDOW_WIDTH } = Dimensions.get('window');

interface MobileChartsScreenProps {
  onNavigateHome?: () => void;
}

type FilterCategory = 'All' | 'Apple Music' | 'Spotify' | 'YouTube' | 'Gaana' | 'Cities';

export const MobileChartsScreen: React.FC<MobileChartsScreenProps> = () => {
  const { isTablet, contentMaxWidth, width: screenWidth } = useResponsive();
  const { bgHex, surfaceHex, accent } = useAppTheme();
  const { playSong } = useAudio();

  const [summaries, setSummaries] = useState<ChartSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All');
  const [selectedChartMeta, setSelectedChartMeta] = useState<ChartEditorialMetadata | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [playingChartId, setPlayingChartId] = useState<string | null>(null);

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

  // Open modal for selected chart
  const handleOpenChart = useCallback((meta: ChartEditorialMetadata) => {
    setSelectedChartMeta(meta);
    setModalVisible(true);
  }, []);

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

  // Filter items according to active filter
  const allEditorialItems: ChartEditorialMetadata[] = useMemo(() => {
    return Object.values(EDITORIAL_CHARTS_CONFIG);
  }, []);

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case 'Apple Music':
        return allEditorialItems.filter((item) => item.platform === 'apple_music');
      case 'Spotify':
        return allEditorialItems.filter((item) => item.platform === 'spotify');
      case 'YouTube':
        return allEditorialItems.filter((item) => item.platform === 'youtube');
      case 'Gaana':
        return allEditorialItems.filter((item) => item.platform === 'gaana');
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

  // National heavyweights
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgHex }]} edges={['top']}>
      <View
        style={[
          styles.container,
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
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

        {/* Filter Bar */}
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {filterCategories.map((cat) => {
              const isActive = activeFilter === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    isActive && [styles.filterChipActive, { backgroundColor: accent.hex }],
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setActiveFilter(cat)}
                >
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

        {/* Magazine Editorial Scroll Content */}
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
              <TouchableOpacity
                style={styles.heroMagazineCard}
                activeOpacity={0.88}
                onPress={() => handleOpenChart(spotlightItem)}
              >
                <ExpoImage
                  source={{ uri: spotlightItem.coverImage }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)', 'rgba(7, 10, 16, 0.95)']}
                  style={StyleSheet.absoluteFill}
                />

                {/* Hero Card Badges */}
                <View style={styles.heroTopBadges}>
                  <View style={[styles.heroPlatformTag, { backgroundColor: spotlightItem.accentColor }]}>
                    <Text style={styles.heroPlatformTagText}>{spotlightItem.platformLabel}</Text>
                  </View>
                  <View style={styles.heroHotTag}>
                    <Ionicons name="flame" size={12} color="#F59E0B" style={{ marginRight: 4 }} />
                    <Text style={styles.heroHotTagText}>#1 IN INDIA</Text>
                  </View>
                </View>

                {/* Hero Bottom Meta */}
                <View style={styles.heroBottomContent}>
                  <Text style={styles.heroSubtitle}>{spotlightItem.subtitle.toUpperCase()}</Text>
                  <Text style={styles.heroTitle}>{spotlightItem.title}</Text>
                  <Text style={styles.heroDesc} numberOfLines={2}>
                    {spotlightItem.description}
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

                    <Text style={styles.heroTrackCount}>100 Tracks • Updated Daily</Text>
                  </View>
                </View>
              </TouchableOpacity>

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
                {cityItems.map((city) => (
                  <TouchableOpacity
                    key={city.id}
                    style={styles.cityCard}
                    activeOpacity={0.85}
                    onPress={() => handleOpenChart(city)}
                  >
                    <ExpoImage
                      source={{ uri: city.coverImage }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.92)']}
                      style={StyleSheet.absoluteFill}
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
                ))}
              </ScrollView>

              {/* --- SECTION 2: 🇮🇳 NATIONAL STREAMING CHAMPIONS --- */}
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Streaming Giants</Text>
                  <Text style={styles.sectionSubtitle}>Leaderboards across the biggest music platforms</Text>
                </View>
              </View>

              <View style={styles.editorialGrid}>
                {nationalItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.editorialCard}
                    activeOpacity={0.85}
                    onPress={() => handleOpenChart(item)}
                  >
                    <ExpoImage
                      source={{ uri: item.coverImage }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                    <LinearGradient
                      colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                      style={StyleSheet.absoluteFill}
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
                        <Text style={styles.editorialCardTracks}>Top 100 Tracks</Text>
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
                ))}
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
                  .map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.editorialCard}
                      activeOpacity={0.85}
                      onPress={() => handleOpenChart(item)}
                    >
                      <ExpoImage
                        source={{ uri: item.coverImage }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                      <LinearGradient
                        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                        style={StyleSheet.absoluteFill}
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
                          <Text style={styles.editorialCardTracks}>50 Tracks</Text>
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
                  ))}
              </View>
            </>
          ) : (
            /* --- FILTERED LIST VIEW --- */
            <View style={styles.editorialGrid}>
              {filteredItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.editorialCard}
                  activeOpacity={0.85}
                  onPress={() => handleOpenChart(item)}
                >
                  <ExpoImage
                    source={{ uri: item.coverImage }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                  <LinearGradient
                    colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                    style={StyleSheet.absoluteFill}
                  />

                  <View style={[styles.platformBadgeSmall, { backgroundColor: item.accentColor }]}>
                    <Text style={styles.platformBadgeSmallText}>
                      {item.city ? `📍 ${item.city}` : item.platformLabel}
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
                        {item.city ? '25 Tracks' : 'Top 100'}
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
              ))}
            </View>
          )}
        </ScrollView>

        {/* Dedicated Full-Bleed Chart Detail Modal */}
        <ChartDetailModal
          visible={modalVisible}
          metadata={selectedChartMeta}
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
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 140, // Clearance for MiniPlayer & Tab Bar
  },
  heroMagazineCard: {
    width: '100%',
    height: 250,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
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
  },
  heroPlayBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroTrackCount: {
    color: '#64748B',
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
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
  },
});
