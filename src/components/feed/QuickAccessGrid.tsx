import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Song, Playlist } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getListeningHistory, HistoryEntry } from '@/services/historyService';
import { getUserPlaylists, UserPlaylist } from '@/services/userPlaylistService';
import { INITIAL_SONGS } from '@/services/musicCatalog';
import { LikedSongsModal } from '../profile/LikedSongsModal';
import { UserPlaylistModal } from '../profile/UserPlaylistModal';
import { TrackDetailModal } from './TrackDetailModal';

interface QuickAccessGridProps {
  songs?: Song[];
  playlists?: Playlist[];
}

interface QuickAccessTile {
  id: string;
  title: string;
  subtitle?: string;
  coverUri?: string;
  isLikedSongs?: boolean;
  song?: Song;
  playlist?: UserPlaylist;
  onCardPress: () => void;
  isCurrentlyPlaying: boolean;
}

// Persistent in-memory cache to guarantee zero layout shift / 0ms flash on remounts
let _cachedHistory: HistoryEntry[] = [];
let _cachedPlaylists: UserPlaylist[] = [];
let _hasLoadedFromStorage = false;

// Eagerly prefetch at bundle load time so cache is already primed on initial paint
getListeningHistory()
  .then((items) => {
    if (items && items.length > 0) {
      _cachedHistory = items;
      _hasLoadedFromStorage = true;
    }
  })
  .catch(() => {});

getUserPlaylists()
  .then((lists) => {
    if (lists && lists.length > 0) {
      _cachedPlaylists = lists;
      _hasLoadedFromStorage = true;
    }
  })
  .catch(() => {});

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = React.memo(({ songs, playlists }) => {
  const { currentSong, isPlaying, likedSongsList, isLiked } = useAudio();
  const { accent, surfaceHex } = useAppTheme();
  const { isTablet, contentPadding } = useResponsive();

  // Initialize directly from in-memory cache so frame 1 has real data with zero flicker
  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>(_cachedHistory);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>(_cachedPlaylists);

  // Navigation Modals State
  const [showLikedModal, setShowLikedModal] = useState<boolean>(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UserPlaylist | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // Load history and playlists seamlessly
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [hist, plist] = await Promise.all([
          getListeningHistory().catch(() => []),
          getUserPlaylists().catch(() => []),
        ]);

        if (!isMounted) return;

        _cachedHistory = hist;
        _cachedPlaylists = plist;
        _hasLoadedFromStorage = true;

        // Equality checks to prevent unnecessary re-renders and eliminate glitching
        setHistoryItems((prev) => {
          if (
            prev.length === hist.length &&
            (prev.length === 0 ||
              (prev[0]?.id === hist[0]?.id && prev[0]?.playedAt === hist[0]?.playedAt))
          ) {
            return prev;
          }
          return hist;
        });

        setUserPlaylists((prev) => {
          if (
            prev.length === plist.length &&
            (prev.length === 0 ||
              (prev[0]?.id === plist[0]?.id && prev[0]?.updatedAt === plist[0]?.updatedAt))
          ) {
            return prev;
          }
          return plist;
        });
      } catch (err) {
        console.warn('QuickAccessGrid silent load error:', err);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute 6 dynamic tiles based on liked songs, user playlists, and recent history
  const tiles = useMemo<QuickAccessTile[]>(() => {
    const list: QuickAccessTile[] = [];

    // TILE 1: Liked Songs (Always #1 slot)
    const isLikedPlaying = Boolean(
      currentSong && isLiked(currentSong.id)
    );

    list.push({
      id: 'liked-songs',
      title: 'Liked Songs',
      subtitle: `${likedSongsList.length} songs`,
      isLikedSongs: true,
      isCurrentlyPlaying: isLikedPlaying,
      onCardPress: () => setShowLikedModal(true),
    });

    // Track IDs already in the grid to avoid duplicate cards
    const addedIds = new Set<string>();

    // Priority 1: User Playlists
    for (const pl of userPlaylists) {
      if (list.length >= 6) break;
      const plCover = pl.coverUrl;
      const isThisPlaylistPlaying = Boolean(
        currentSong && pl.songs?.some((s) => s.id === currentSong.id)
      );

      list.push({
        id: `pl-${pl.id}`,
        title: pl.name,
        subtitle: `${pl.songs?.length || 0} songs`,
        coverUri: plCover,
        playlist: pl,
        isCurrentlyPlaying: isThisPlaylistPlaying,
        onCardPress: () => setSelectedPlaylist(pl),
      });
      addedIds.add(`pl-${pl.id}`);
    }

    // Priority 2: Recent Listening History
    for (const item of historyItems) {
      if (list.length >= 6) break;
      if (!item.song?.id || addedIds.has(item.song.id)) continue;

      const song = item.song;
      addedIds.add(song.id);

      list.push({
        id: `history-${song.id}`,
        title: song.name,
        subtitle: song.artist,
        coverUri: song.cover,
        song: song,
        isCurrentlyPlaying: currentSong?.id === song.id,
        onCardPress: () => setSelectedSong(song),
      });
    }

    // Priority 3: Fallback to Catalog Top Hits if grid is not full (< 6 items)
    const fallbackPool = songs && songs.length > 0 ? songs : INITIAL_SONGS;
    for (const song of fallbackPool) {
      if (list.length >= 6) break;
      if (addedIds.has(song.id)) continue;

      addedIds.add(song.id);

      list.push({
        id: `catalog-${song.id}`,
        title: song.name,
        subtitle: song.artist,
        coverUri: song.cover,
        song: song,
        isCurrentlyPlaying: currentSong?.id === song.id,
        onCardPress: () => setSelectedSong(song),
      });
    }

    return list.slice(0, 6);
  }, [
    likedSongsList.length,
    isLiked,
    userPlaylists,
    historyItems,
    currentSong?.id,
    songs,
  ]);

  if (tiles.length === 0) {
    return null;
  }

  return (
    <View style={[styles.gridContainer, { paddingHorizontal: contentPadding }]}>
      {tiles.map((tile) => {
        const isCurrent = tile.isCurrentlyPlaying;

        return (
          <TouchableOpacity
            key={tile.id}
            style={[
              styles.card,
              { backgroundColor: surfaceHex },
              isTablet && styles.tabletCard,
            ]}
            activeOpacity={0.75}
            onPress={tile.onCardPress}
          >
            {/* Left Cover Image or Liked Songs Gradient */}
            {tile.isLikedSongs ? (
              <LinearGradient
                colors={['#450af5', '#8e8ee5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.likedGradientCover, isTablet && styles.tabletCover]}
              >
                <Ionicons name="heart" size={isTablet ? 26 : 24} color="#ffffff" />
              </LinearGradient>
            ) : tile.coverUri ? (
              <Image
                source={{ uri: tile.coverUri }}
                style={[styles.image, isTablet && styles.tabletCover]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.image, styles.fallbackImage, isTablet && styles.tabletCover]}>
                <Ionicons name="musical-notes" size={22} color="rgba(255,255,255,0.4)" />
              </View>
            )}

            {/* Title & Metadata */}
            <View style={styles.titleContainer}>
              <Text style={[styles.title, isTablet && styles.tabletTitle]} numberOfLines={2}>
                {tile.title}
              </Text>
            </View>

            {/* Subtle Now Playing Equalizer Indicator */}
            {isCurrent && (
              <View style={styles.playingIndicator}>
                <Ionicons name="stats-chart" size={15} color={accent.hex} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* Sub-modals for deep screen access */}
      <LikedSongsModal
        visible={showLikedModal}
        onClose={() => setShowLikedModal(false)}
      />

      <UserPlaylistModal
        playlist={selectedPlaylist}
        visible={Boolean(selectedPlaylist)}
        onClose={() => setSelectedPlaylist(null)}
      />

      <TrackDetailModal
        song={selectedSong}
        visible={Boolean(selectedSong)}
        onClose={() => setSelectedSong(null)}
        fallbackContextSongs={songs || INITIAL_SONGS}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    rowGap: 8,
    columnGap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    width: '48.7%',
    height: 58,
    backgroundColor: '#242424',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabletCard: {
    width: '32%',
    height: 64,
    borderRadius: 8,
  },
  likedGradientCover: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 58,
    height: 58,
    backgroundColor: '#2b2b2b',
  },
  tabletCover: {
    width: 64,
    height: 64,
  },
  fallbackImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  tabletTitle: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  playingIndicator: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
