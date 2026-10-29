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
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { isTablet } = useResponsive();
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
        colors={['rgba(28, 34, 48, 0.90)', 'rgba(12, 14, 20, 0.95)', '#050508']}
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
            <Ionicons name="shuffle" size={20} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playFab}
            activeOpacity={0.8}
            onPress={() => {
              if (songs.length > 0) playSong(songs[0], songs);
            }}
          >
            <Ionicons name="play" size={28} color="#000000" style={{ marginLeft: 3 }} />
          </TouchableOpacity>

          <View style={styles.actionIconBtn}>
            <Ionicons name="musical-notes" size={20} color="#ffffff" />
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
  coverWrapper: {
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.65,
    shadowRadius: 22,
    elevation: 16,
    marginBottom: 20,
  },
  albumArt: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: '#141720',
  },
  badgePill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(18, 22, 30, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  badgePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  albumTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
    letterSpacing: -0.3,
  },
  descriptionText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  artistName: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.3,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
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
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
