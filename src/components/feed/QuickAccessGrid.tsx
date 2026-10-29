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
import { getListeningHistory, HistoryEntry } from '@/services/historyService';
import { getUserPlaylists, UserPlaylist } from '@/services/userPlaylistService';
import { INITIAL_SONGS } from '@/services/musicCatalog';
import { LikedSongsModal } from '../profile/LikedSongsModal';
import { UserPlaylistModal } from '../profile/UserPlaylistModal';
import { TrackDetailModal } from './TrackDetailModal';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { currentSong, isPlaying, likedSongsList, likedSongIds } = useAudio();
  const { accent } = useAppTheme();

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

        setHistoryItems((prev) => {
          if (
            prev.length === hist.length &&
            (prev.length === 0 ||
              (prev[0]?.song?.id === hist[0]?.song?.id && prev[0]?.playedAt === hist[0]?.playedAt))
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
      } catch (e) {
        // Silent recovery
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const tiles = useMemo<QuickAccessTile[]>(() => {
    const result: QuickAccessTile[] = [];
    const seenSongIds = new Set<string>();

    // 1. Liked Songs Card
    result.push({
      id: 'liked_songs_tile',
      title: 'Liked Songs',
      subtitle: `${likedSongsList.length} tracks`,
      isLikedSongs: true,
      onCardPress: () => {
        setShowLikedModal(true);
      },
      isCurrentlyPlaying: false,
    });

    // Extract looped songs from history
    const playCounts = new Map<string, { count: number; song: Song }>();
    for (const h of historyItems) {
      if (!h.song) continue;
      const existing = playCounts.get(h.song.id);
      if (existing) {
        existing.count += 1;
      } else {
        playCounts.set(h.song.id, { count: 1, song: h.song });
      }
    }
    const sortedLoopedSongs = Array.from(playCounts.values())
      .sort((a, b) => b.count - a.count)
      .map((entry) => entry.song);

    // Add user playlists
    for (const up of userPlaylists) {
      if (result.length >= 6) break;
      if (up.songs && up.songs.length > 0) {
        const isThisPlaylistPlaying =
          isPlaying && currentSong && up.songs.some((s) => s.id === currentSong.id);

        result.push({
          id: `playlist_${up.id}`,
          title: up.name,
          subtitle: 'Playlist',
          coverUri: up.coverUrl || up.songs[0]?.cover,
          playlist: up,
          onCardPress: () => {
            setSelectedPlaylist(up);
          },
          isCurrentlyPlaying: Boolean(isThisPlaylistPlaying),
        });
      }
    }

    // Add most looped songs from history
    for (const song of sortedLoopedSongs) {
      if (result.length >= 6) break;
      if (seenSongIds.has(song.id)) continue;
      seenSongIds.add(song.id);

      const isCurrent = currentSong?.id === song.id;
      result.push({
        id: `song_${song.id}`,
        title: song.name,
        subtitle: song.artist,
        coverUri: song.cover,
        song,
        onCardPress: () => {
          setSelectedSong(song);
        },
        isCurrentlyPlaying: isCurrent && isPlaying,
      });
    }

    // Fallback backfill from props or catalog if fewer than 6 items
    const pool = (songs && songs.length > 0 ? songs : INITIAL_SONGS) || [];
    for (const song of pool) {
      if (result.length >= 6) break;
      if (seenSongIds.has(song.id)) continue;
      seenSongIds.add(song.id);

      const isCurrent = currentSong?.id === song.id;
      result.push({
        id: `fallback_${song.id}`,
        title: song.name,
        subtitle: song.artist,
        coverUri: song.cover,
        song,
        onCardPress: () => {
          setSelectedSong(song);
        },
        isCurrentlyPlaying: isCurrent && isPlaying,
      });
    }

    return result.slice(0, 6);
  }, [
    historyItems,
    userPlaylists,
    likedSongsList.length,
    likedSongIds,
    currentSong?.id,
    isPlaying,
    songs,
  ]);

  const { quickAccessColumns } = useResponsive();

  // Dynamically chunk tiles into responsive columns (2 on phone, 3 on tablet portrait, 4 on tablet landscape)
  const tileRows = useMemo(() => {
    const rows: QuickAccessTile[][] = [];
    const cols = Math.max(2, quickAccessColumns || 2);
    for (let i = 0; i < tiles.length; i += cols) {
      rows.push(tiles.slice(i, i + cols));
    }
    return rows;
  }, [tiles, quickAccessColumns]);

  if (tiles.length === 0) {
    return null;
  }

  return (
    <View style={styles.gridContainer}>
      {tileRows.map((row, rowIndex) => (
        <View key={`row_${rowIndex}`} style={styles.gridRow}>
          {row.map((tile, colIndex) => {
            const isCurrent = tile.isCurrentlyPlaying;
            const isLastCol = colIndex === row.length - 1;

            return (
              <TouchableOpacity
                key={tile.id}
                style={[
                  styles.card,
                  !isLastCol && { marginRight: 10 },
                ]}
                activeOpacity={0.75}
                onPress={tile.onCardPress}
              >
                {/* Specular sheen gradient on card surface */}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.01)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 0.9 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Inset Artwork or Liked Songs Gradient */}
                {tile.isLikedSongs ? (
                  <LinearGradient
                    colors={['#4F46E5', '#6366F1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.likedGradientCover}
                  >
                    <Ionicons name="heart" size={20} color="#FFFFFF" />
                  </LinearGradient>
                ) : tile.coverUri ? (
                  <Image
                    source={{ uri: tile.coverUri }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.image, styles.fallbackImage]}>
                    <Ionicons name="musical-notes" size={18} color="rgba(255,255,255,0.4)" />
                  </View>
                )}

                {/* Title & Metadata */}
                <View style={styles.titleContainer}>
                  <Text style={styles.title} numberOfLines={1}>
                    {tile.title}
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {tile.subtitle || (tile.playlist ? 'Playlist' : 'Music')}
                  </Text>
                </View>

                {/* Now Playing Indicator or Subtle Chevron */}
                {isCurrent ? (
                  <View style={styles.playingIndicator}>
                    <Ionicons name="stats-chart" size={14} color={accent.hex} />
                  </View>
                ) : (
                  <View style={styles.chevronWrapper}>
                    <Ionicons name="chevron-forward" size={13} color="rgba(255, 255, 255, 0.35)" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

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
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 20,
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    flex: 1,
    height: 62,
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderRadius: GLASS_THEME.radii.card,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    position: 'relative',
  },
  likedGradientCover: {
    width: 46,
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  image: {
    width: 46,
    height: 46,
    borderRadius: 9,
    marginLeft: 8,
    backgroundColor: '#1E293B',
  },
  fallbackImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    paddingLeft: 8,
    paddingRight: 4,
    justifyContent: 'center',
  },
  title: {
    color: GLASS_THEME.colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 16,
    marginBottom: 1,
  },
  subtitle: {
    color: GLASS_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  playingIndicator: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronWrapper: {
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
