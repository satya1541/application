import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '@/types/music';
import { SessionIntent } from '@/types/recommendation';
import { ClientRecommendationEngine } from '@/services/recommendationEngine';
import { MediaCarousel } from './MediaCarousel';

interface PersonalizedRecommendationsSectionProps {
  currentSong?: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song, queue?: Song[]) => void;
  fallbackSeed?: Song;
}

interface IntentChip {
  id: SessionIntent;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const INTENT_CHIPS: IntentChip[] = [
  { id: 'CHARTS_POPULAR', label: 'Made For You', icon: 'sparkles' },
  { id: 'MOOD_FLOW', label: 'Mood Flow', icon: 'water-outline' },
  { id: 'DEEP_FOCUS_ARTIST', label: 'Artist Focus', icon: 'musical-notes-outline' },
  { id: 'ACTIVE_DISCOVERY', label: 'Discovery', icon: 'compass-outline' },
];

export const PersonalizedRecommendationsSection: React.FC<PersonalizedRecommendationsSectionProps> = React.memo(
  ({ currentSong, isPlaying, onPlaySong, fallbackSeed }) => {
    const [recommendations, setRecommendations] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeIntent, setActiveIntent] = useState<SessionIntent>('CHARTS_POPULAR');
    const [subtitleText, setSubtitleText] = useState('Based on your listening vibe • Lossless & Opus');

    // Track the last processed seed to prevent redundant network hits
    const lastSeedKeyRef = useRef<string>('');

    const loadRecommendations = useCallback(
      async (intentToUse?: SessionIntent, force = false) => {
        const intent = intentToUse || activeIntent;
        const seed = currentSong || fallbackSeed;
        const seedKey = `${seed?.id || 'default'}_${intent}`;

        if (!force && seedKey === lastSeedKeyRef.current && recommendations.length > 0) {
          return;
        }

        lastSeedKeyRef.current = seedKey;
        setLoading(true);

        try {
          const res = await ClientRecommendationEngine.getHomeRecommendations(seed, intent);
          if (res && res.songs && res.songs.length > 0) {
            setRecommendations(res.songs);
            setSubtitleText(`${res.reason} • Lossless & Opus`);
          }
        } catch (err) {
          console.warn('[PersonalizedRec] Error loading recommendations:', err);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [currentSong, fallbackSeed, activeIntent, recommendations.length]
    );

    // Initial load and seed adaptation
    useEffect(() => {
      loadRecommendations(activeIntent);
    }, [currentSong?.id, fallbackSeed?.id, activeIntent, loadRecommendations]);

    // Intent switch handler
    const handleSelectIntent = (intent: SessionIntent) => {
      setActiveIntent(intent);
      loadRecommendations(intent, true);
    };

    // Manual refresh on sparkles tap
    const handleRefresh = () => {
      setRefreshing(true);
      loadRecommendations(activeIntent, true);
    };

    const handlePlayRecommendation = (song: Song, queue?: Song[]) => {
      // Play selected song with the entire recommendation carousel as the upcoming queue
      const effectiveQueue = queue && queue.length > 0 ? queue : recommendations;
      onPlaySong(song, effectiveQueue);
    };

    return (
      <View style={styles.container}>
        {/* Header with Title, Sparkle Badge & Refresh Button */}
        <View style={styles.headerRow}>
          <View style={styles.titleCol}>
            <View style={styles.titleBadgeRow}>
              <Text style={styles.sectionTitle}>Recommended For You</Text>
              <View style={styles.aiPill}>
                <Ionicons name="sparkles" size={11} color="#1DB954" />
                <Text style={styles.aiPillText}>ADAPTIVE</Text>
              </View>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitleText}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            activeOpacity={0.7}
            accessibilityLabel="Refresh Recommendations"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#1DB954" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#1DB954" />
            )}
          </TouchableOpacity>
        </View>

        {/* Intent Vibe Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {INTENT_CHIPS.map((chip) => {
            const isSelected = chip.id === activeIntent;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleSelectIntent(chip.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={chip.icon}
                  size={13}
                  color={isSelected ? '#000000' : '#ffffff'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Carousel of Recommended Tracks */}
        <MediaCarousel
          title=""
          items={recommendations}
          type="song"
          showRank={false}
          loading={loading && recommendations.length === 0}
          onPlaySong={handlePlayRecommendation}
          currentSongId={currentSong?.id}
          isPlaying={isPlaying}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  titleCol: {
    flex: 1,
    paddingRight: 8,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  aiPillText: {
    color: '#1DB954',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipsRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipActive: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  chipText: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
});
