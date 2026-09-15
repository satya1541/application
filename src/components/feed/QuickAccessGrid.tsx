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

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = ({ songs, playlists }) => {
  const { currentSong, isPlaying, likedSongsList, likedSongIds } = useAudio();
  const { accent, surfaceHex } = useAppTheme();

  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);

  // Navigation Modals State
  const [showLikedModal, setShowLikedModal] = useState<boolean>(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UserPlaylist | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // Load history and playlists for personalized morning/evening recommendations
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getListeningHistory().catch(() => []),
      getUserPlaylists().catch(() => []),
    ]).then(([hist, plist]) => {
      if (isMounted) {
        setHistoryItems(hist);
        setUserPlaylists(plist);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentSong?.id]);

  // Compute 6 contextual items based on time of day & listening frequency
  const tiles: QuickAccessTile[] = useMemo(() => {
    const result: QuickAccessTile[] = [];

    // ── Tile 1: Liked Songs (Always #1 Top-Left) ──
    const isLikedPlaying =
      isPlaying && !!currentSong && likedSongIds.includes(currentSong.id);

    result.push({
      id: 'tile_liked_songs',
      title: 'Liked Songs',
      subtitle: `${likedSongsList.length} tracks`,
      isLikedSongs: true,
      onCardPress: () => {
        setShowLikedModal(true);
      },
      isCurrentlyPlaying: isLikedPlaying,
    });

    // ── Compute Looped Songs from History ──
    const songPlayCountMap = new Map<string, { song: Song; count: number; lastPlayed: number }>();
    for (const entry of historyItems) {
      if (!entry.song?.id) continue;
      const existing = songPlayCountMap.get(entry.song.id);
      if (existing) {
        existing.count += 1;
        existing.lastPlayed = Math.max(existing.lastPlayed, entry.playedAt);
      } else {
        songPlayCountMap.set(entry.song.id, {
          song: entry.song,
          count: 1,
          lastPlayed: entry.playedAt,
        });
      }
    }

    // Sort songs by play count descending, then last played descending
    const sortedLoopedSongs = Array.from(songPlayCountMap.values())
      .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
      .map((item) => item.song);

    // ── Contextual Slot Fillers ──
    const seenSongIds = new Set<string>();

    // Add user custom playlists first if any exist
    for (const up of userPlaylists) {
      if (result.length >= 6) break;
      if (up.songs && up.songs.length > 0) {
        const isThisPlaylistPlaying =
          isPlaying && !!currentSong && up.songs.some((s) => s.id === currentSong.id);

        result.push({
          id: `plist_${up.id}`,
          title: up.name,
          subtitle: `${up.songs.length} songs`,
          coverUri: up.coverUrl || up.songs[0]?.cover,
          playlist: up,
          onCardPress: () => {
            setSelectedPlaylist(up);
          },
          isCurrentlyPlaying: isThisPlaylistPlaying,
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
    likedSongsList,
    likedSongIds,
    currentSong?.id,
    isPlaying,
    songs,
  ]);

  if (tiles.length === 0) {
    return null;
  }

  return (
    <View style={styles.gridContainer}>
      {tiles.map((tile) => {
        const isCurrent = tile.isCurrentlyPlaying;

        return (
          <TouchableOpacity
            key={tile.id}
            style={[styles.card, { backgroundColor: surfaceHex }]}
            activeOpacity={0.75}
            onPress={tile.onCardPress}
          >
            {/* Left Cover Image or Liked Songs Gradient */}
            {tile.isLikedSongs ? (
              <LinearGradient
                colors={['#450af5', '#8e8ee5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.likedGradientCover}
              >
                <Ionicons name="heart" size={24} color="#ffffff" />
              </LinearGradient>
            ) : tile.coverUri ? (
              <Image
                source={{ uri: tile.coverUri }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.image, styles.fallbackImage]}>
                <Ionicons name="musical-notes" size={22} color="rgba(255,255,255,0.4)" />
              </View>
            )}

            {/* Title & Metadata */}
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={2}>
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
};

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
  playingIndicator: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
