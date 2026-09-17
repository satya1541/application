import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  RefreshControl,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';

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
import { fetchYouTubePlaylist, getCachedPlaylistSongs } from '@/services/youtubeMusicApi';
import { resolveLivePlaylistCover } from '@/services/youtubePlaylistsCatalog';
import { Song } from '@/types/music';

interface YouTubePlaylistModalProps {
  visible: boolean;
  playlistId: string | null;
  playlistTitle?: string;
  playlistCover?: string;
  playlistDescription?: string;
  playlistBadge?: string;
  onClose: () => void;
}

export const YouTubePlaylistModal: React.FC<YouTubePlaylistModalProps> = ({
  visible,
  playlistId,
  playlistTitle = 'Official Playlist',
  playlistCover,
  playlistDescription,
  playlistBadge = 'YouTube Music',
  onClose,
}) => {
  const { playSong } = useAudio();
  const { isOffline, refreshNetwork } = useNetwork();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fallbackCover =
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';

  const getValidCover = useCallback((url?: string) => {
    if (url && url.startsWith('http')) {
      return url;
    }
    return null;
  }, []);

  const [modalCover, setModalCover] = useState<string>(
    getValidCover(playlistCover) || fallbackCover
  );

  const loadPlaylistSongs = useCallback(
    async (showLoadingSpinner: boolean = true) => {
      if (!playlistId) return;

      // 1. Instant 0ms cached retrieval (Stale-While-Revalidate)
      const cached = await getCachedPlaylistSongs(playlistId);
      if (cached && cached.length > 0) {
        setSongs((cached as unknown as Song[]) || []);
        setIsLoading(false);
        if (cached[0]?.cover && (modalCover === fallbackCover || !modalCover)) {
          setModalCover(cached[0].cover);
        }
      } else if (showLoadingSpinner) {
        setIsLoading(true);
      }

      // 2. Fetch fresh tracks from network
      try {
        const data = await fetchYouTubePlaylist(playlistId, playlistTitle, 100);
        if (data && data.length > 0) {
          setSongs((data as unknown as Song[]) || []);
          if (data[0]?.cover && modalCover === fallbackCover) {
            setModalCover(data[0].cover);
          }
        }
      } catch (err) {
        console.warn('Failed to load YouTube playlist:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [playlistId, playlistTitle, fallbackCover, modalCover]
  );

  useEffect(() => {
    if (!visible || !playlistId) return;
    loadPlaylistSongs(true);
  }, [visible, playlistId, loadPlaylistSongs]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadPlaylistSongs(false);
  }, [loadPlaylistSongs]);

  useEffect(() => {
    const valid = getValidCover(playlistCover);
    if (valid) {
      setModalCover(valid);
    } else if (playlistId) {
      resolveLivePlaylistCover(playlistId).then((liveUrl: string | null) => {
        if (liveUrl) setModalCover(liveUrl);
      }).catch(() => {});
    }
  }, [playlistCover, playlistId, getValidCover]);

  // When songs load, if modalCover is still fallback, use the first song's high quality cover
  useEffect(() => {
    if (modalCover === fallbackCover && songs.length > 0 && songs[0]?.cover) {
      setModalCover(songs[0].cover);
    }
  }, [songs, modalCover]);

  const handleImageError = useCallback(() => {
    if (songs.length > 0 && songs[0]?.cover && songs[0].cover !== modalCover) {
      setModalCover(songs[0].cover);
    } else if (playlistId) {
      resolveLivePlaylistCover(playlistId).then((liveUrl: string | null) => {
        if (liveUrl && liveUrl !== modalCover) {
          setModalCover(liveUrl);
        } else {
          setModalCover(fallbackCover);
        }
      }).catch(() => {
        setModalCover(fallbackCover);
      });
    } else {
      setModalCover(fallbackCover);
    }
  }, [songs, playlistId, modalCover]);

  // High-performance Fisher-Yates shuffle
  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playSong(shuffled[0], shuffled);
  };

  const renderHeader = useMemo(() => (
    <>
      <LinearGradient
        colors={['#2a1836', '#1a1024', '#121212']}
        style={styles.headerGradient}
      >
        <View style={styles.coverWrapper}>
          <ExpoImage
            source={{ uri: modalCover }}
            placeholder={{ uri: fallbackCover }}
            placeholderContentFit="cover"
            style={styles.albumArt}
            contentFit="cover"
            transition={100}
            cachePolicy="memory-disk"
            priority="high"
            recyclingKey={playlistId || modalCover}
            onError={handleImageError}
          />

          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>{playlistBadge.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.albumTitle} numberOfLines={2}>
          {playlistTitle}
        </Text>

        {playlistDescription ? (
          <Text style={styles.descriptionText} numberOfLines={3}>
            {playlistDescription}
          </Text>
        ) : null}

        <Text style={styles.artistName}>
          YouTube Music Official • Verified Opus 160kbps
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionIconBtn}
            activeOpacity={0.7}
            onPress={handleShufflePlay}
          >
            <Ionicons name="shuffle" size={22} color="#1DB954" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playFab}
            activeOpacity={0.8}
            onPress={() => {
              if (songs.length > 0) playSong(songs[0], songs);
            }}
          >
            <Ionicons name="play" size={28} color="#000000" />
          </TouchableOpacity>

          <View style={styles.actionIconBtn}>
            <Ionicons name="musical-notes" size={20} color="#ff4e45" />
          </View>
        </View>
      </LinearGradient>

      {!isLoading && songs.length > 0 && (
        <View style={styles.trackListHeader}>
          <Text style={styles.tracksCountText}>
            {songs.length} Tracks • Official YouTube Audio
          </Text>
        </View>
      )}
    </>
  ), [
    modalCover,
    fallbackCover,
    playlistId,
    handleImageError,
    playlistBadge,
    playlistTitle,
    playlistDescription,
    handleShufflePlay,
    songs,
    playSong,
    isLoading,
  ]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <SafeAreaView style={styles.floatingHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={26} color="#ffffff" />
          </TouchableOpacity>
        </SafeAreaView>

        <FlatList
          data={isLoading ? [] : songs}
          keyExtractor={(song, idx) => song.id || `pl-song-${idx}`}
          renderItem={({ item: song, index: idx }) => (
            <View style={styles.songRowWrapper}>
              <SongItemRow
                song={song}
                index={idx}
                showTrackNumber={true}
                playlistContext={songs}
                priority={idx < 12 ? 'high' : 'normal'}
              />
            </View>
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            isLoading ? (
              <AlbumModalSkeleton />
            ) : isOffline && songs.length === 0 ? (
              <NoInternetView onRetry={refreshNetwork} style={{ minHeight: 260 }} />
            ) : null
          }
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#1DB954"
              colors={['#1DB954']}
            />
          }
        />

        {/* Floating MiniPlayer inside Playlist Modal */}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
  coverWrapper: {
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    marginBottom: 18,
  },
  albumArt: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#282828',
  },
  badgePill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  albumTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  descriptionText: {
    fontSize: 13,
    color: '#b3b3b3',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  artistName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff4e45',
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    width: '100%',
  },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  trackListHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  songRowWrapper: {
    paddingHorizontal: 16,
  },
  tracksCountText: {
    fontSize: 13,
    color: '#b3b3b3',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
