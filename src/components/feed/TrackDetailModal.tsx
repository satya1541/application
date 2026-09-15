import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { SongItemRow } from '../common/SongItemRow';
import { SourceBadge } from '../common/SourceBadge';
import { ClientRecommendationEngine } from '@/services/recommendationEngine';
import { getSafeCoverArt } from '@/services/imageUtils';

interface TrackDetailModalProps {
  song: Song | null;
  visible: boolean;
  onClose: () => void;
  fallbackContextSongs?: Song[];
}

export const TrackDetailModal: React.FC<TrackDetailModalProps> = ({
  song,
  visible,
  onClose,
  fallbackContextSongs = [],
}) => {
  const insets = useSafeAreaInsets();
  const { playSong, isPlaying, currentSong, togglePlay, isLiked, toggleLike } = useAudio();
  const { bgHex, surfaceHex, accent } = useAppTheme();

  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(false);

  useEffect(() => {
    if (!visible || !song) return;

    let isMounted = true;
    setLoadingRecommendations(true);

    ClientRecommendationEngine.getNextRecommendations(song, [song], 0)
      .then((recs) => {
        if (isMounted) {
          // Filter out the main song itself to avoid duplicate in the up next list
          const filtered = recs.filter((s) => s.id !== song.id);
          if (filtered.length > 0) {
            setRecommendations(filtered.slice(0, 15));
          } else if (fallbackContextSongs.length > 0) {
            setRecommendations(fallbackContextSongs.filter((s) => s.id !== song.id).slice(0, 15));
          }
        }
      })
      .catch(() => {
        if (isMounted && fallbackContextSongs.length > 0) {
          setRecommendations(fallbackContextSongs.filter((s) => s.id !== song.id).slice(0, 15));
        }
      })
      .finally(() => {
        if (isMounted) setLoadingRecommendations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, song?.id, fallbackContextSongs]);

  if (!visible || !song) return null;

  const isCurrent = currentSong?.id === song.id;
  const isThisPlaying = isCurrent && isPlaying;
  const liked = isLiked(song.id);

  const handlePlayMainSong = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      const fullQueue = [song, ...recommendations];
      playSong(song, fullQueue, false);
    }
  };

  const handleShuffle = () => {
    const fullQueue = [song, ...recommendations];
    if (fullQueue.length > 1) {
      fullQueue.sort(() => Math.random() - 0.5);
    }
    playSong(fullQueue[0], fullQueue, false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { backgroundColor: bgHex, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={bgHex} />

        {/* Top Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>
            Track Details
          </Text>
          <View style={styles.navButtonPlaceholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(40, insets.bottom + 120) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Ambient Glow & Hero Artwork */}
          <View style={styles.heroSection}>
            <View style={styles.artworkContainer}>
              <ExpoImage
                source={{ uri: getSafeCoverArt(song.cover) }}
                style={styles.coverImage}
                contentFit="cover"
                transition={200}
              />
              <View style={[styles.artworkGlow, { shadowColor: accent.hex }]} />
            </View>

            {/* Song Meta */}
            <Text style={styles.songTitle} numberOfLines={2}>
              {song.name}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {song.artist || 'Unknown Artist'}
            </Text>

            {song.album ? (
              <Text style={styles.songAlbum} numberOfLines={1}>
                {song.album}
              </Text>
            ) : null}

            <View style={styles.badgeRow}>
              {song.quality ? (
                <View style={styles.qualityPill}>
                  <Text style={[styles.qualityPillText, { color: accent.hex }]}>
                    {song.quality}
                  </Text>
                </View>
              ) : null}
              {song.source ? (
                <SourceBadge
                  source={song.source as any}
                  quality={song.quality}
                  size="small"
                />
              ) : null}
            </View>

            {/* Action Buttons Row */}
            <View style={styles.actionsRow}>
              {/* Play / Pause Primary Button */}
              <TouchableOpacity
                style={[styles.primaryPlayButton, { backgroundColor: accent.hex }]}
                activeOpacity={0.8}
                onPress={handlePlayMainSong}
              >
                <Ionicons
                  name={isThisPlaying ? 'pause' : 'play'}
                  size={20}
                  color="#000000"
                  style={!isThisPlaying ? { marginLeft: 2 } : undefined}
                />
                <Text style={styles.primaryPlayText}>
                  {isThisPlaying ? 'Pause' : 'Play Song'}
                </Text>
              </TouchableOpacity>

              {/* Shuffle Radio Button */}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: surfaceHex }]}
                activeOpacity={0.7}
                onPress={handleShuffle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="shuffle" size={22} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Like / Heart Button */}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: surfaceHex }]}
                activeOpacity={0.7}
                onPress={() => toggleLike(song.id, song)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={22}
                  color={liked ? '#E91E63' : '#FFFFFF'}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Up Next & Similar Recommendations */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Up Next & Similar</Text>
            {loadingRecommendations ? (
              <ActivityIndicator size="small" color={accent.hex} />
            ) : (
              <Text style={styles.trackCountLabel}>
                {recommendations.length} tracks
              </Text>
            )}
          </View>

          <View style={styles.trackListContainer}>
            {recommendations.map((item, idx) => (
              <SongItemRow
                key={`${item.id}_${idx}`}
                song={item}
                index={idx}
                playlistContext={[song, ...recommendations]}
                showTrackNumber={true}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonPlaceholder: {
    width: 40,
  },
  navTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  artworkContainer: {
    width: 200,
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
    backgroundColor: '#1E1E1E',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  artworkGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  songAlbum: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  qualityPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  qualityPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  primaryPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    height: 48,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryPlayText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  trackCountLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
  trackListContainer: {
    gap: 4,
  },
});
