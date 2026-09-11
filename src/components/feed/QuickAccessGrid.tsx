import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Song, Playlist } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';

interface QuickAccessGridProps {
  songs?: Song[];
  playlists?: Playlist[];
}

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = ({ songs, playlists }) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();

  // If songs are provided, render top 6 songs for 1-tap playback
  if (songs && songs.length > 0) {
    const displaySongs = songs.slice(0, 6);

    return (
      <View style={styles.gridContainer}>
        {displaySongs.map((song) => {
          const isCurrent = currentSong?.id === song.id;

          const handleSongPress = () => {
            if (isCurrent) {
              togglePlay();
            } else {
              playSong(song);
            }
          };

          return (
            <TouchableOpacity
              key={song.id}
              style={[styles.card, isCurrent && styles.activeCard]}
              activeOpacity={0.75}
              onPress={handleSongPress}
            >
              <Image source={{ uri: song.cover }} style={styles.image} />
              <Text style={[styles.title, isCurrent && styles.activeTitle]} numberOfLines={2}>
                {song.name}
              </Text>
              {isCurrent && (
                <View style={styles.playIndicator}>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={14}
                    color="#000000"
                  />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Fallback to playlists if songs are not yet loaded
  const displayPlaylists = (playlists || []).slice(0, 6);

  const handlePlaylistPress = (playlist: Playlist) => {
    if (playlist.songs.length > 0) {
      if (currentSong?.id === playlist.songs[0].id) {
        togglePlay();
      } else {
        playSong(playlist.songs[0], playlist.songs);
      }
    }
  };

  return (
    <View style={styles.gridContainer}>
      {displayPlaylists.map((item) => {
        const isCurrentPlaylist =
          currentSong && item.songs.some((s) => s.id === currentSong.id);

        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, isCurrentPlaylist && styles.activeCard]}
            activeOpacity={0.75}
            onPress={() => handlePlaylistPress(item)}
          >
            <Image source={{ uri: item.cover }} style={styles.image} />
            <Text style={[styles.title, isCurrentPlaylist && styles.activeTitle]} numberOfLines={2}>
              {item.title}
            </Text>
            {isCurrentPlaylist && (
              <View style={styles.playIndicator}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={14}
                  color="#000000"
                />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginVertical: 10,
    gap: 8,
  },
  card: {
    width: '48.5%',
    height: 56,
    backgroundColor: '#242424',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  activeCard: {
    backgroundColor: '#2a2a2a',
    borderColor: 'rgba(29, 185, 84, 0.4)',
  },
  image: {
    width: 56,
    height: 56,
    backgroundColor: '#333333',
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  activeTitle: {
    color: '#1DB954',
  },
  playIndicator: {
    position: 'absolute',
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
