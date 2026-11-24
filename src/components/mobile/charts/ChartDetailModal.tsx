import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Dimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';
import { SongItemRow } from '@/components/common/SongItemRow';
import { AlbumModalSkeleton } from '@/components/common/SkeletonLoader';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import {
  ChartEditorialMetadata,
  ChartPayload,
  chartTrackToSong,
  fetchChartDetail,
} from '@/services/chartsApi';
import { Song } from '@/types/music';

interface ChartDetailModalProps {
  visible: boolean;
  metadata: ChartEditorialMetadata | null;
  initialCover?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ChartDetailModal: React.FC<ChartDetailModalProps> = ({
  visible,
  metadata,
  initialCover,
  onClose,
}) => {
  const { isTablet, contentMaxWidth } = useResponsive();
  const { playSong } = useAudio();
  const { accent, bgHex, surfaceHex } = useAppTheme();

  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadChart = useCallback(
    async (force: boolean = false) => {
      if (!metadata) return;
      if (!force) setIsLoading(true);

      try {
        const data = await fetchChartDetail(metadata.id, force);
        setChartData(data);
      } catch (err) {
        console.warn('[ChartDetailModal] Error loading chart:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [metadata]
  );

  useEffect(() => {
    if (visible && metadata) {
      setSearchQuery('');
      loadChart();
    } else {
      setChartData(null);
    }
  }, [visible, metadata, loadChart]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadChart(true);
  }, [loadChart]);

  // Convert resolved tracks to Song objects
  const songs: Song[] = useMemo(() => {
    if (!chartData || !chartData.tracks) return [];
    return chartData.tracks.map((t) => chartTrackToSong(t, metadata?.title));
  }, [chartData, metadata?.title]);

  // Filter songs if user is searching inside the chart
  const filteredSongs: Song[] = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const q = searchQuery.toLowerCase().trim();
    return songs.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
    );
  }, [songs, searchQuery]);

  // Handle Play All
  const handlePlayAll = useCallback(() => {
    if (songs.length > 0) {
      playSong(songs[0], songs);
    }
  }, [songs, playSong]);

  // Handle Shuffle Play
  const handleShufflePlay = useCallback(() => {
    if (songs.length > 0) {
      const shuffled = [...songs].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  }, [songs, playSong]);

  if (!metadata) return null;

  const coverUrl =
    chartData?.tracks?.[0]?.cover || initialCover || metadata.coverImage;

  const headerComponent = (
    <View style={styles.headerContainer}>
      {/* Visual Cover Art with Elevated Shadow */}
      <View style={styles.artContainer}>
        <ExpoImage
          source={{ uri: coverUrl }}
          style={styles.coverArt}
          contentFit="cover"
          transition={250}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.artGradient}
          pointerEvents="none"
        />
        {/* Liquid Glass Specular Rim Highlight */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.specularRim}
          pointerEvents="none"
        />
        <View
          style={[
            styles.floatingBadge,
            { backgroundColor: metadata.accentColor || '#FC3C44' },
          ]}
        >
          <Text style={styles.floatingBadgeText}>
            {metadata.badge.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Meta Information */}
      <View style={styles.metaContainer}>
        <Text style={styles.chartTitle}>{metadata.title}</Text>
        <Text style={styles.chartSubtitle}>
          {metadata.platformLabel} • {metadata.subtitle}
        </Text>
        <Text style={styles.chartDescription} numberOfLines={2}>
          {metadata.description}
        </Text>
        <Text style={styles.trackCountText}>
          {chartData?.tracks?.length || metadata.city ? `${chartData?.tracks?.length || 25} Tracks` : '50+ Tracks'} • Updated Daily
        </Text>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.playAllButton, { backgroundColor: accent.hex }]}
          activeOpacity={0.85}
          onPress={handlePlayAll}
          disabled={songs.length === 0}
        >
          <Ionicons name="play" size={20} color="#000000" style={{ marginRight: 6 }} />
          <Text style={styles.playAllText}>PLAY ALL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shuffleButton}
          activeOpacity={0.8}
          onPress={handleShufflePlay}
          disabled={songs.length === 0}
        >
          <Ionicons name="shuffle" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* In-Chart Search Bar */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={16} color="#808080" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${songs.length} chart tracks...`}
          placeholderTextColor="#71717A"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="#808080" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: bgHex }]}>
        {/* Full-bleed Blurred Backdrop Background */}
        <ExpoImage
          source={{ uri: coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={50}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'rgba(7, 10, 16, 0.95)', '#070A10']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Top Floating App Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.7}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.topBarTitleContainer}>
              <Text style={styles.topBarTitle} numberOfLines={1}>
                {metadata.title}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.refreshButton}
              activeOpacity={0.7}
              onPress={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="refresh" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <View style={[styles.contentWrapper, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
            {isLoading && songs.length === 0 ? (
              <View style={styles.skeletonWrapper}>
                <AlbumModalSkeleton />
              </View>
            ) : (
              <FlatList
                data={filteredSongs}
                keyExtractor={(item, index) => `${item.id}_${index}`}
                ListHeaderComponent={headerComponent}
                renderItem={({ item, index }) => (
                  <SongItemRow
                    song={item}
                    index={index}
                    playlistContext={songs}
                    showTrackNumber={true}
                  />
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={accent.hex}
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="musical-notes-outline" size={40} color="#666666" />
                    <Text style={styles.emptyText}>
                      {searchQuery
                        ? `No tracks found for "${searchQuery}"`
                        : 'Resolving tracks for this chart...'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </SafeAreaView>

        {/* Floating MiniPlayer inside Chart Detail Modal */}
        <MiniPlayer bottomOffset={Platform.OS === 'ios' ? 24 : 8} />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#070A10',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  contentWrapper: {
    flex: 1,
  },
  headerContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  artContainer: {
    width: Math.min(SCREEN_WIDTH - 80, 240),
    height: Math.min(SCREEN_WIDTH - 80, 240),
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 16,
  },
  coverArt: {
    width: '100%',
    height: '100%',
  },
  specularRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  artGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  floatingBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  floatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metaContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  chartTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  chartSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 6,
  },
  chartDescription: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 6,
  },
  trackCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  playAllButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playAllText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  shuffleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 160, // Clearance for floating MiniPlayer
  },
  skeletonWrapper: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    color: '#71717A',
  },
});
