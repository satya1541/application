import { useAudio } from '@/contexts/AudioContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import {
    getTrendingSaavnSongs,
    JIOSAAVN_BADGE,
} from '@/services/saavnStream';
import {
    getTrendingYouTubeMusic,
    YOUTUBE_OPUS_BADGE,
} from '@/services/youtubeMusicApi';
import { AudioSourcePlatform } from '@/types/explore';
import { Song } from '@/types/music';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoInternetView } from '../common/NoInternetView';
import { GreetingHeader } from '../feed/GreetingHeader';
import { QuickAccessGrid } from '../feed/QuickAccessGrid';
import { MediaCarousel } from '../feed/MediaCarousel';
import { useAppTheme } from '@/contexts/ThemeContext';

interface MobileHomeScreenProps {
  onOpenSettings?: () => void;
}

interface LanguageDef {
  id: string;
  name: string;
}

const LANGUAGES: LanguageDef[] = [
  { id: 'hindi', name: 'Hindi' },
  { id: 'punjabi', name: 'Punjabi' },
  { id: 'english', name: 'English' },
  { id: 'sambalpuri', name: 'Sambalpuri' },
  { id: 'odia', name: 'Odia' },
  { id: 'bhojpuri', name: 'Bhojpuri' },
  { id: 'haryanvi', name: 'Haryanvi' },
  { id: 'tamil', name: 'Tamil' },
  { id: 'telugu', name: 'Telugu' },
  { id: 'bengali', name: 'Bengali' },
  { id: 'malayalam', name: 'Malayalam' },
  { id: 'kannada', name: 'Kannada' },
  { id: 'marathi', name: 'Marathi' },
  { id: 'gujarati', name: 'Gujarati' },
  { id: 'rajasthani', name: 'Rajasthani' },
  { id: 'urdu', name: 'Urdu' },
];

export interface ChartSectionConfig {
  id: string;
  langId: string;
  source: AudioSourcePlatform;
  title: string;
  subtitle: string;
}

export const CHART_SECTIONS: ChartSectionConfig[] = LANGUAGES.flatMap((lang) => [
  {
    id: `${lang.id}_lossless`,
    langId: lang.id,
    source: 'jiosaavn',
    title: `${lang.name} Lossless Top 50`,
    subtitle: `The biggest ${lang.name} songs in Lossless quality`,
  },
  {
    id: `${lang.id}_opus`,
    langId: lang.id,
    source: 'youtube',
    title: `${lang.name} Opus Top 50`,
    subtitle: `The biggest ${lang.name} songs in Opus`,
  },
]);

// Isolated chart section component with on-demand viewport-driven data fetching
interface ChartSectionItemProps {
  section: ChartSectionConfig;
  songs: Song[];
  loading: boolean;
  onPlaySong: (song: Song, queue?: Song[]) => void;
  currentSongId?: string;
  isPlaying: boolean;
  onRequestData: (langId: string, source: AudioSourcePlatform, sectionId: string) => void;
}

const ChartSectionItem = React.memo<ChartSectionItemProps>(
  ({ section, songs, loading, onPlaySong, currentSongId, isPlaying, onRequestData }) => {
    useEffect(() => {
      if ((!songs || songs.length === 0) && !loading) {
        onRequestData(section.langId, section.source, section.id);
      }
    }, [section.langId, section.source, section.id, songs, loading, onRequestData]);

    return (
      <MediaCarousel
        title={section.title}
        subtitle={section.subtitle}
        items={songs || []}
        type="song"
        showRank={true}
        loading={loading}
        onPlaySong={(song) => onPlaySong(song)}
        currentSongId={currentSongId}
        isPlaying={isPlaying}
      />
    );
  },
  (prev, next) => {
    if (prev.section.id !== next.section.id) return false;
    if (prev.songs !== next.songs) return false;
    if (prev.loading !== next.loading) return false;
    if (prev.currentSongId !== next.currentSongId) return false;
    if (prev.isPlaying !== next.isPlaying) return false;
    return true;
  }
);

// Memoized header component to prevent FlatList unmounting / remounting glitches
interface HomeHeaderProps {
  onOpenSettings?: () => void;
  fallbackSongs?: Song[];
}

const HomeHeader = React.memo<HomeHeaderProps>(
  ({ onOpenSettings, fallbackSongs }) => {
    return (
      <View>
        <GreetingHeader onPressSettings={onOpenSettings} />
        <QuickAccessGrid songs={fallbackSongs} />
      </View>
    );
  }
);

export const MobileHomeScreen: React.FC<MobileHomeScreenProps> = React.memo(({ onOpenSettings }) => {
  const { bgHex, accent } = useAppTheme();
  const { playSong, currentSong, isPlaying } = useAudio();
  const { profile } = useAuth();
  const { isOffline } = useNetwork();
  const [refreshing, setRefreshing] = useState(false);

  const preferredLangs = useMemo(
    () => profile?.preferred_languages || ['hindi', 'punjabi', 'english', 'sambalpuri'],
    [profile?.preferred_languages]
  );

  const dynamicSections = useMemo(() => {
    const prioritized = [
      ...LANGUAGES.filter((l) => preferredLangs.includes(l.id)),
      ...LANGUAGES.filter((l) => !preferredLangs.includes(l.id)),
    ];

    return prioritized.flatMap((lang) => [
      {
        id: `${lang.id}_lossless`,
        langId: lang.id,
        source: 'jiosaavn' as AudioSourcePlatform,
        title: `${lang.name} Lossless Top 50`,
        subtitle: `The biggest ${lang.name} songs in Lossless quality`,
      },
      {
        id: `${lang.id}_opus`,
        langId: lang.id,
        source: 'youtube' as AudioSourcePlatform,
        title: `${lang.name} Opus Top 50`,
        subtitle: `The biggest ${lang.name} songs in Opus`,
      },
    ]);
  }, [preferredLangs]);

  // Track storage per independent section
  const [sectionSongs, setSectionSongs] = useState<Record<string, Song[]>>({});
  const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});

  // In-memory feed cache for 0ms instant re-renders
  const feedCache = useRef<Map<string, Song[]>>(new Map());
  // In-flight tracker to eliminate duplicate requests
  const inFlightRef = useRef<Set<string>>(new Set());

  // Helper to fetch chart tracks
  const fetchSectionTracks = useCallback(
    async (langId: string, source: AudioSourcePlatform): Promise<Song[]> => {
      const cacheKey = `${langId}_${source}`;
      if (feedCache.current.has(cacheKey)) {
        return feedCache.current.get(cacheKey)!;
      }

      try {
        let resolved: Song[] = [];
        if (source === 'youtube') {
          const ytTracks = await getTrendingYouTubeMusic(langId, 50);
          resolved = ytTracks.map((s) => ({
            ...s,
            source: 'youtube' as const,
            quality: 'Opus' as const,
            sourceBadge: YOUTUBE_OPUS_BADGE,
          })) as unknown as Song[];
        } else {
          const saavnTracks = await getTrendingSaavnSongs(langId, 50);
          resolved = saavnTracks.map((s) => ({
            ...s,
            source: 'jiosaavn' as const,
            quality: 'Lossless' as const,
            sourceBadge: JIOSAAVN_BADGE,
          })) as unknown as Song[];
        }

        if (resolved.length > 0) {
          feedCache.current.set(cacheKey, resolved);
        }
        return resolved;
      } catch (err) {
        console.warn(`Error fetching ${langId} (${source}):`, err);
        return [];
      }
    },
    []
  );

  // On-demand loader called as sections scroll into viewport
  const handleRequestData = useCallback(
    async (langId: string, source: AudioSourcePlatform, sectionId: string) => {
      if (inFlightRef.current.has(sectionId)) return;
      inFlightRef.current.add(sectionId);

      setLoadingSections((prev) => ({ ...prev, [sectionId]: true }));
      try {
        const tracks = await fetchSectionTracks(langId, source);
        setSectionSongs((prev) => ({ ...prev, [sectionId]: tracks }));
      } finally {
        inFlightRef.current.delete(sectionId);
        setLoadingSections((prev) => ({ ...prev, [sectionId]: false }));
      }
    },
    [fetchSectionTracks]
  );

  // Initial fast load: only Tier 1 (Hindi, Punjabi, English, Sambalpuri) on launch
  const loadInitialTier = useCallback(async () => {
    const tier1Sections = CHART_SECTIONS.filter((s) =>
      ['hindi', 'punjabi', 'english', 'sambalpuri'].includes(s.langId)
    );

    const initialLoading: Record<string, boolean> = {};
    for (const sec of tier1Sections) {
      initialLoading[sec.id] = true;
      inFlightRef.current.add(sec.id);
    }
    setLoadingSections((prev) => ({ ...prev, ...initialLoading }));

    try {
      const tier1Results = await Promise.allSettled(
        tier1Sections.map((sec) => fetchSectionTracks(sec.langId, sec.source))
      );

      const newSongs: Record<string, Song[]> = {};
      tier1Sections.forEach((sec, idx) => {
        const res = tier1Results[idx];
        if (res.status === 'fulfilled') newSongs[sec.id] = res.value;
      });

      setSectionSongs((prev) => ({ ...prev, ...newSongs }));
    } finally {
      for (const sec of tier1Sections) {
        inFlightRef.current.delete(sec.id);
      }
      setLoadingSections((prev) => {
        const updated = { ...prev };
        for (const sec of tier1Sections) updated[sec.id] = false;
        return updated;
      });
    }
  }, [fetchSectionTracks]);

  useEffect(() => {
    loadInitialTier();
  }, [loadInitialTier]);

  const onRefresh = async () => {
    setRefreshing(true);
    feedCache.current.clear();
    inFlightRef.current.clear();
    setSectionSongs({});
    await loadInitialTier();
    setRefreshing(false);
  };

  const renderSectionItem = useCallback(
    ({ item }: { item: ChartSectionConfig }) => (
      <ChartSectionItem
        section={item}
        songs={sectionSongs[item.id] || []}
        loading={loadingSections[item.id] ?? false}
        onPlaySong={playSong}
        currentSongId={currentSong?.id}
        isPlaying={isPlaying}
        onRequestData={handleRequestData}
      />
    ),
    [sectionSongs, loadingSections, playSong, currentSong?.id, isPlaying, handleRequestData]
  );

  const keyExtractor = useCallback((item: ChartSectionConfig) => item.id, []);

  const fallbackSongs = useMemo(() => {
    return (
      sectionSongs['hindi_lossless'] ||
      sectionSongs['punjabi_lossless'] ||
      sectionSongs['english_lossless'] ||
      undefined
    );
  }, [
    sectionSongs['hindi_lossless']?.length,
    sectionSongs['punjabi_lossless']?.length,
    sectionSongs['english_lossless']?.length,
  ]);

  const listHeader = useMemo(
    () => <HomeHeader onOpenSettings={onOpenSettings} fallbackSongs={fallbackSongs} />,
    [onOpenSettings, fallbackSongs]
  );

  return (
    <SafeAreaView style={[styles.screenWrapper, { backgroundColor: bgHex }]} edges={['top']}>
      {isOffline && Object.values(sectionSongs).every((songs) => !songs || songs.length === 0) ? (
        <NoInternetView onRetry={onRefresh} style={styles.offlineView} />
      ) : (
        <FlatList
          data={dynamicSections}
          renderItem={renderSectionItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="normal"
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={4}
          removeClippedSubviews={Platform.OS === 'android'}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={styles.scrollContent}
          style={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent.hex}
              colors={[accent.hex]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140, // Space for floating MiniPlayer + Bottom Navigation
  },
  offlineView: {
    minHeight: 450,
    backgroundColor: 'transparent',
    paddingVertical: 40,
  },
});
