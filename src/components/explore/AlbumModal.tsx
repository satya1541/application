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
import { Song } from '@/types/music';
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
  const { playSong } = useAudio();
  const { isOffline, refreshNetwork } = useNetwork();
  const { isTablet, maxModalWidth } = useResponsive();
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
    getSaavnAlbumDetails(albumId)
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
      <View style={[styles.rootContainer, isTablet && styles.tabletBackdrop]}>
        {isTablet && (
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        )}
        <View
          style={[
            styles.container,
            isTablet && {
              maxWidth: maxModalWidth,
              width: '92%',
              alignSelf: 'center',
              borderRadius: 24,
              maxHeight: '90%',
              marginVertical: '5%',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.1)',
            },
          ]}
        >
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
            colors={['#1e3a29', '#121212']}
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
                <Ionicons name="shuffle" size={22} color="#1DB954" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playFab}
                activeOpacity={0.8}
                onPress={() => {
                  if (songs.length > 0) playSong(songs[0], songs);
                }}
              >
                <Ionicons name="play" size={26} color="#000000" />
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
  rootContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  tabletBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 10 : 0,
    left: 16,
    zIndex: 50,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 140,
  },
  headerGradient: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  albumArt: {
    width: 180,
    height: 180,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  albumTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  artistName: {
    color: '#b3b3b3',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  shuffleBtn: {
    padding: 8,
  },
  playFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#b3b3b3',
    fontSize: 13,
  },
  trackListContainer: {
    paddingHorizontal: 16,
  },
  tracksCountText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
});
