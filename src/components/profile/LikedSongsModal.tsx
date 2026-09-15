import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { SongItemRow } from '../common/SongItemRow';
import { useResponsive } from '@/hooks/useResponsive';

interface LikedSongsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LikedSongsModal: React.FC<LikedSongsModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const { likedSongsList, playSong } = useAudio();
  const { isTablet, maxModalWidth } = useResponsive();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return likedSongsList;
    return likedSongsList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );
  }, [likedSongsList, searchQuery]);

  if (!visible) return null;

  const handlePlayAll = (shuffle: boolean = false) => {
    if (likedSongsList.length === 0) return;
    const tracks = [...likedSongsList];
    if (shuffle && tracks.length > 1) {
      tracks.sort(() => Math.random() - 0.5);
    }
    playSong(tracks[0], tracks);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
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
            styles.screen,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
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
          <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

        {/* Top Nav */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.navTitle}>Liked Songs</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner */}
          <LinearGradient
            colors={['#4F46E5', '#1DB954', '#0D0D0D']}
            style={styles.heroCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heartIconBox}>
              <Ionicons name="heart" size={44} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>Liked Songs</Text>
            <Text style={styles.heroSubtitle}>
              {likedSongsList.length} {likedSongsList.length === 1 ? 'track' : 'tracks'} • Synced Collection
            </Text>

            {likedSongsList.length > 0 && (
              <View style={styles.heroButtonsRow}>
                <TouchableOpacity
                  style={styles.playAllBtn}
                  onPress={() => handlePlayAll(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={18} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.playAllText}>Play All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shuffleBtn}
                  onPress={() => handlePlayAll(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shuffle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>

          {/* Search within Liked Songs */}
          {likedSongsList.length > 3 && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color="#777777" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Find in Liked Songs..."
                placeholderTextColor="#666666"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#888888" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Track List */}
          {likedSongsList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="heart-outline" size={36} color="#1DB954" />
              </View>
              <Text style={styles.emptyTitle}>No liked songs yet</Text>
              <Text style={styles.emptySubtitle}>
                Songs you like by tapping the heart icon will appear here and be available even offline.
              </Text>
            </View>
          ) : filteredSongs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No matching songs</Text>
              <Text style={styles.emptySubtitle}>Try searching for a different title or artist.</Text>
            </View>
          ) : (
            <View style={styles.songsList}>
              <Text style={styles.sectionHeading}>SAVED SONGS</Text>
              {filteredSongs.map((song: Song, idx: number) => (
                <SongItemRow
                  key={`liked_${song.id}_${idx}`}
                  song={song}
                  index={idx}
                  playlistContext={filteredSongs}
                  showTrackNumber={true}
                />
              ))}
            </View>
          )}
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  tabletBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 18,
  },
  heartIconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
  },
  heroButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playAllText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shuffleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262626',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 32,
  },
  songsList: {
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#888888',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 4,
  },
});
