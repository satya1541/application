import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getListeningHistory, HistoryEntry } from '@/services/historyService';
import { INITIAL_SONGS } from '@/services/musicCatalog';
import { TrackDetailModal } from './TrackDetailModal';
import { GLASS_THEME } from '@/constants/glassTheme';

interface SpotlightHeroCardProps {
  songs?: Song[];
}

export const SpotlightHeroCard: React.FC<SpotlightHeroCardProps> = React.memo(({ songs }) => {
  const { isTablet, contentMaxWidth } = useResponsive();
  const { accent } = useAppTheme();
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();

  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [selectedModalSong, setSelectedModalSong] = useState<Song | null>(null);

  // Load recent history once on mount to determine if we can show "Jump Back In"
  useEffect(() => {
    let isMounted = true;
    getListeningHistory()
      .then((history) => {
        if (isMounted && history && history.length > 0) {
          setRecentHistory(history);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Determine active hero track and category mode
  const { heroSong, mode, badgeLabel, badgeIcon } = useMemo(() => {
    // 1. If currently playing or has current track loaded
    if (currentSong) {
      return {
        heroSong: currentSong,
        mode: 'now_playing' as const,
        badgeLabel: isPlaying ? 'NOW PLAYING' : 'RESUME SESSION',
        badgeIcon: isPlaying ? 'volume-high' : 'play-forward',
      };
    }

    // 2. If recent listening history exists
    if (recentHistory.length > 0 && recentHistory[0]?.song) {
      return {
        heroSong: recentHistory[0].song,
        mode: 'jump_back_in' as const,
        badgeLabel: 'JUMP BACK IN',
        badgeIcon: 'sparkles',
      };
    }

    // 3. Editorial Spotlight: #1 Chart Topper from available songs
    const topSong = (songs && songs.length > 0 ? songs[0] : null) || INITIAL_SONGS[0];
    return {
      heroSong: topSong,
      mode: 'chart_topper' as const,
      badgeLabel: "TODAY'S #1 SPOTLIGHT",
      badgeIcon: 'flame',
    };
  }, [currentSong, isPlaying, recentHistory, songs]);

  const isCurrentActive = currentSong?.id === heroSong?.id;
  const isThisPlaying = isCurrentActive && isPlaying;

  const handlePlayToggle = useCallback(() => {
    if (!heroSong) return;
    if (isCurrentActive) {
      togglePlay();
    } else {
      // Play hero song as seed so ML / smart recommendation engine builds a tailored queue
      playSong(heroSong);
    }
  }, [heroSong, isCurrentActive, togglePlay, playSong]);

  const handleOpenDetails = useCallback(() => {
    if (heroSong) {
      setSelectedModalSong(heroSong);
    }
  }, [heroSong]);

  if (!heroSong) {
    return null;
  }

  const coverUrl = heroSong.cover || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800';

  return (
    <>
      <View
        style={[
          styles.container,
          isTablet && contentMaxWidth ? { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' } : null,
        ]}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.92}
          onPress={handleOpenDetails}
        >
          {/* Ambient Blurred Background of Artwork */}
          <ExpoImage
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={Platform.OS === 'ios' ? 36 : 24}
            cachePolicy="memory-disk"
          />

          {/* Liquid Glass Ambient Gradient */}
          <LinearGradient
            colors={['rgba(10, 14, 22, 0.45)', 'rgba(5, 7, 12, 0.90)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Frosted Glass Blur Backdrop */}
          <BlurView
            intensity={Platform.OS === 'ios' ? 30 : 16}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />

          {/* Specular Rim Lighting at Top Edge */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.38)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.specularRim}
            pointerEvents="none"
          />

          {/* Main Card Content */}
          <View style={styles.contentRow}>
            {/* Left High-Res Album Cover */}
            <View style={[styles.artworkWrapper, isTablet && styles.artworkWrapperTablet]}>
              <ExpoImage
                source={{ uri: coverUrl }}
                style={styles.artwork}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              {isThisPlaying && (
                <View style={styles.playingIndicatorOverlay}>
                  <View style={[styles.soundWaveBar, { height: 14, backgroundColor: accent.hex }]} />
                  <View style={[styles.soundWaveBar, { height: 20, backgroundColor: accent.hex }]} />
                  <View style={[styles.soundWaveBar, { height: 11, backgroundColor: accent.hex }]} />
                </View>
              )}
            </View>

            {/* Middle Editorial Text Column */}
            <View style={styles.infoCol}>
              {/* Category Pill Badge */}
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.editorialBadge,
                    mode === 'chart_topper' && styles.chartBadge,
                  ]}
                >
                  <Ionicons
                    name={badgeIcon as any}
                    size={11}
                    color={mode === 'chart_topper' ? '#F59E0B' : '#FFFFFF'}
                  />
                  <Text
                    style={[
                      styles.editorialBadgeText,
                      mode === 'chart_topper' && { color: '#FBBF24' },
                    ]}
                  >
                    {badgeLabel}
                  </Text>
                </View>

                {heroSong.quality && (
                  <View style={styles.qualityPill}>
                    <Text style={styles.qualityPillText}>
                      {heroSong.quality.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {/* Title & Artist */}
              <Text style={styles.title} numberOfLines={1}>
                {heroSong.name}
              </Text>

              <Text style={styles.artist} numberOfLines={1}>
                {heroSong.artist || heroSong.album || 'Featured Artist'}
              </Text>

              <Text style={styles.contextHint} numberOfLines={1}>
                {mode === 'chart_topper'
                  ? 'Most popular stream across charts'
                  : 'Tap to inspect or resume listening'}
              </Text>
            </View>

            {/* Right Floating White Play/Pause Button */}
            <TouchableOpacity
              style={styles.playFab}
              activeOpacity={0.85}
              onPress={handlePlayToggle}
              accessibilityLabel={isThisPlaying ? 'Pause' : 'Play'}
            >
              <Ionicons
                name={isThisPlaying ? 'pause' : 'play'}
                size={22}
                color="#000000"
                style={!isThisPlaying ? { marginLeft: 2 } : undefined}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>

      {/* Track Details Modal */}
      {selectedModalSong && (
        <TrackDetailModal
          song={selectedModalSong}
          visible={Boolean(selectedModalSong)}
          onClose={() => setSelectedModalSong(null)}
          fallbackContextSongs={songs}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0A0D14',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  specularRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  artworkWrapper: {
    width: 96,
    height: 96,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  artworkWrapperTablet: {
    width: 114,
    height: 114,
    borderRadius: 18,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  playingIndicatorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  soundWaveBar: {
    width: 3.5,
    borderRadius: 2,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  editorialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  chartBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  editorialBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  qualityPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  qualityPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  artist: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  contextHint: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.42)',
  },
  playFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
});
