import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '@/contexts/AudioContext';
import { SongItemRow } from '../common/SongItemRow';
import { AlbumModalSkeleton } from '../common/SkeletonLoader';
import { MiniPlayer } from '../player/MiniPlayer';
import { NoInternetView } from '../common/NoInternetView';
import { OfflineBanner } from '../common/OfflineBanner';
import { useNetwork } from '@/contexts/NetworkContext';

import { getSaavnAlbumDetails } from '@/services/saavnStream';
import { fetchPlaylistDetails } from '@/services/youtubeExploreService';
import { YOUTUBE_OPUS_BADGE } from '@/services/youtubeMusicApi';
import { Song } from '@/types/music';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

interface AlbumModalProps {
  visible: boolean;
  albumId: string | null;
  albumName?: string;
  albumCover?: string;
  onClose: () => void;
}

export const AlbumModal: React.FC<AlbumModalProps> = ({
  visible,
  albumId,
  albumName = 'Album',
  albumCover,
  onClose,
}) => {
  const { isTablet } = useResponsive();
  const { playSong } = useAudio();
  const { isOffline, refreshNetwork } = useNetwork();
  const [albumDetails, setAlbumDetails] = useState<{
    id: string;
    name: string;
    artist: string;
    year: string;
    cover: string;
    songs: Song[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!visible || !albumId) return;

    setIsLoading(true);
    const cleanId = albumId.trim();
    const isYouTubeAlbum =
      cleanId.startsWith('MPRE') || cleanId.startsWith('VL') || cleanId.startsWith('PL') || cleanId.length > 15;

    if (isYouTubeAlbum) {
      fetchPlaylistDetails(cleanId)
        .then((pl) => {
          if (pl) {
            setAlbumDetails({
              id: pl.id,
              name: pl.title || albumName,
              artist: pl.subtitle || 'Various Artists',
              year: pl.secondSubtitle || 'Album',
              cover: pl.thumbnail || albumCover || '',
              songs: (pl.tracks || []).map((t) => {
                const parseDuration = (dur?: string): number => {
                  if (!dur) return 0;
                  const parts = dur.split(':').map((p) => parseInt(p, 10));
                  if (parts.some((n) => isNaN(n))) return 0;
                  if (parts.length === 2) return parts[0] * 60 + parts[1];
                  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                  return 0;
                };
                return {
                  id: t.videoId,
                  name: t.title,
                  artist: t.artist || pl.subtitle || 'Artist',
                  album: t.album || pl.title || 'Album',
                  duration: parseDuration(t.duration),
                  cover: t.thumbnail,
                  streamUrl: '',
                  quality: 'Opus',
                  source: 'youtube',
                  sourceBadge: YOUTUBE_OPUS_BADGE,
                };
              }) as unknown as Song[],
            });
          }
        })
        .catch((err) => {
          console.warn('Failed to load YouTube album:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      getSaavnAlbumDetails(cleanId)
        .then((data) => {
          if (data) {
            setAlbumDetails({
              ...data,
              songs: data.songs as unknown as Song[],
            });
          }
        })
        .catch((err) => {
          console.warn('Failed to load album:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [visible, albumId]);

  if (!visible) return null;

  const songs = albumDetails?.songs || [];
  const cover =
    albumDetails?.cover ||
    albumCover ||
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={isTablet ? 'overFullScreen' : 'fullScreen'}
      transparent={isTablet}
      onRequestClose={onClose}
    >
      <View style={[styles.modalBackdrop, isTablet && styles.tabletBackdrop]}>
        <View style={[styles.container, isTablet && styles.tabletContainer]}>
        <SafeAreaView style={styles.floatingHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={26} color="#ffffff" />
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <LinearGradient
            colors={['rgba(28, 34, 48, 0.90)', 'rgba(12, 14, 20, 0.95)', '#050508']}
            style={styles.headerGradient}
          >
            <Image source={{ uri: cover }} style={styles.albumArt} />
            <Text style={styles.albumTitle} numberOfLines={2}>
              {albumDetails?.name || albumName}
            </Text>
            <Text style={styles.artistName}>
              {albumDetails?.artist || 'Various Artists'} • {albumDetails?.year || '2024'}
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.shuffleBtn} activeOpacity={0.7}>
                <Ionicons name="shuffle" size={20} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playFab}
                activeOpacity={0.8}
                onPress={() => {
                  if (songs.length > 0) playSong(songs[0], songs);
                }}
              >
                <Ionicons name="play" size={26} color="#000000" style={{ marginLeft: 3 }} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shuffleBtn} activeOpacity={0.7}>
                <Ionicons name="heart-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {isLoading ? (
            <AlbumModalSkeleton />
          ) : isOffline && songs.length === 0 ? (
            <NoInternetView onRetry={refreshNetwork} style={{ minHeight: 260 }} />
          ) : (
            <View style={styles.trackListContainer}>
              <Text style={styles.tracksCountText}>
                {songs.length} Tracks • 320kbps CD Quality Master
              </Text>
              {songs.map((song, idx) => (
                <SongItemRow
                  key={song.id || `album-song-${idx}`}
                  song={song}
                  index={idx}
                  showTrackNumber={true}
                  playlistContext={songs}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Floating MiniPlayer inside Album Modal */}
        <MiniPlayer
          bottomOffset={
            isOffline
              ? (Platform.OS === 'ios' ? 24 : 0) + 40
              : Platform.OS === 'ios'
              ? 24
              : 0
          }
        />

        {/* Persistent Offline Banner */}
        <OfflineBanner positionAbsolute={true} bottomOffset={Platform.OS === 'ios' ? 24 : 0} />
      </View>
      </View>
    </Modal>

  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
  },
  tabletBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tabletContainer: {
    maxWidth: 820,
    maxHeight: '90%',
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderSpecular,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: '#050508',
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 12 : 0,
    left: 16,
    zIndex: 50,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 140,
  },
  headerGradient: {
    paddingTop: 68,
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  albumArt: {
    width: 190,
    height: 190,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  albumTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  artistName: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  shuffleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  trackListContainer: {
    paddingHorizontal: 16,
  },
  tracksCountText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
});
