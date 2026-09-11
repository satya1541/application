import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { SongActionController } from '@/services/songActionController';
import { getSafeCoverArt } from '@/services/imageUtils';
import {
  getUserPlaylists,
  createPlaylist,
  addSongToPlaylist,
  UserPlaylist,
} from '@/services/userPlaylistService';

const { width } = Dimensions.get('window');

export const SongActionMenu: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playSong, playNext, addToUserQueue, toggleLike, isLiked } = useAudio();

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<boolean>(false);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');

  useEffect(() => {
    const unsubscribe = SongActionController.subscribe((song) => {
      setSelectedSong(song);
      setShowPlaylistPicker(false);
      setIsCreatingNew(false);
      setNewPlaylistName('');
    });
    return unsubscribe;
  }, []);

  const handleClose = useCallback(() => {
    SongActionController.close();
  }, []);

  const loadPlaylists = useCallback(async () => {
    const list = await getUserPlaylists();
    setPlaylists(list);
  }, []);

  const handlePlayNow = useCallback(() => {
    if (!selectedSong) return;
    playSong(selectedSong);
    handleClose();
  }, [selectedSong, playSong, handleClose]);

  const handlePlayNext = useCallback(() => {
    if (!selectedSong) return;
    playNext(selectedSong);
    handleClose();
  }, [selectedSong, playNext, handleClose]);

  const handleAddToQueue = useCallback(() => {
    if (!selectedSong) return;
    addToUserQueue(selectedSong);
    handleClose();
  }, [selectedSong, addToUserQueue, handleClose]);

  const handleToggleLike = useCallback(() => {
    if (!selectedSong) return;
    toggleLike(selectedSong.id, selectedSong);
    handleClose();
  }, [selectedSong, toggleLike, handleClose]);

  const handleOpenPlaylistPicker = useCallback(async () => {
    await loadPlaylists();
    setShowPlaylistPicker(true);
  }, [loadPlaylists]);

  const handleSelectPlaylist = useCallback(
    async (playlist: UserPlaylist) => {
      if (!selectedSong) return;
      const res = await addSongToPlaylist(playlist.id, selectedSong);
      if (res.alreadyExists) {
        Alert.alert('Already Added', `"${selectedSong.name}" is already in "${playlist.name}".`);
      } else {
        const msg = `Added to ${playlist.name}! 🎵`;
        if (Platform.OS === 'android') {
          ToastAndroid.showWithGravity(msg, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
        } else {
          Alert.alert('Success', msg);
        }
        handleClose();
      }
    },
    [selectedSong, handleClose]
  );

  const handleCreateAndAdd = useCallback(async () => {
    if (!newPlaylistName.trim() || !selectedSong) return;
    const playlist = await createPlaylist(newPlaylistName.trim());
    await addSongToPlaylist(playlist.id, selectedSong);
    const msg = `Created "${playlist.name}" and added song! 🎵`;
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(msg, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
    } else {
      Alert.alert('Success', msg);
    }
    handleClose();
  }, [newPlaylistName, selectedSong, handleClose]);

  if (!selectedSong) return null;

  const liked = isLiked(selectedSong.id);
  const coverUri = getSafeCoverArt(selectedSong.cover, selectedSong.id);

  const formatDuration = (secs?: number) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal
      visible={Boolean(selectedSong)}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Top Grab Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handleBar} />
          </View>

          {/* Song Summary Row */}
          <View style={styles.songHeader}>
            <ExpoImage
              source={{ uri: coverUri }}
              style={styles.songCover}
              contentFit="cover"
              transition={100}
            />
            <View style={styles.songMeta}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {selectedSong.name}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {selectedSong.artist}
                {selectedSong.duration ? ` • ${formatDuration(selectedSong.duration)}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Main Actions or Playlist Subview */}
          {!showPlaylistPicker ? (
            <View style={styles.menuContainer}>
              {/* 1. Play */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handlePlayNow}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="play" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.menuText}>Play</Text>
              </TouchableOpacity>

              {/* 2. Play Next */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handlePlayNext}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="play-skip-forward" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuText}>Play Next</Text>
                  <Text style={styles.menuSubText}>Insert directly after current song</Text>
                </View>
              </TouchableOpacity>

              {/* 3. Add to Queue */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleAddToQueue}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="add-circle-outline" size={20} color="#1DB954" />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuText, { color: '#1DB954' }]}>Add to Queue</Text>
                  <Text style={styles.menuSubText}>Appends to upcoming queue</Text>
                </View>
              </TouchableOpacity>

              {/* 4. Add to Playlist */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleOpenPlaylistPicker}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="folder-outline" size={19} color="#FFFFFF" />
                </View>
                <Text style={styles.menuText}>Add to Playlist</Text>
                <Ionicons name="chevron-forward" size={18} color="#666666" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {/* 5. Like / Dislike */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleToggleLike}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Ionicons
                    name={liked ? 'heart' : 'heart-outline'}
                    size={20}
                    color={liked ? '#1DB954' : '#FFFFFF'}
                  />
                </View>
                <Text style={[styles.menuText, liked && { color: '#1DB954' }]}>
                  {liked ? 'Liked (Remove from Likes)' : 'Like'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Sub-View: Add to Playlist */
            <View style={styles.playlistPickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity
                  onPress={() => setShowPlaylistPicker(false)}
                  style={styles.pickerBackBtn}
                >
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  <Text style={styles.pickerBackText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Add to Playlist</Text>
              </View>

              {/* Create New Playlist Option */}
              {isCreatingNew ? (
                <View style={styles.createNewBox}>
                  <TextInput
                    style={styles.newPlaylistInput}
                    placeholder="Enter playlist title..."
                    placeholderTextColor="#666666"
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    autoFocus
                  />
                  <View style={styles.createNewActions}>
                    <TouchableOpacity
                      onPress={() => setIsCreatingNew(false)}
                      style={styles.cancelBtn}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCreateAndAdd}
                      disabled={!newPlaylistName.trim()}
                      style={[
                        styles.createConfirmBtn,
                        !newPlaylistName.trim() && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.createConfirmText}>Create & Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.newPlaylistBtn}
                  onPress={() => setIsCreatingNew(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.newPlaylistIcon}>
                    <Ionicons name="add" size={22} color="#000000" />
                  </View>
                  <Text style={styles.newPlaylistText}>New Playlist</Text>
                </TouchableOpacity>
              )}

              {/* Existing Playlists */}
              <ScrollView
                style={styles.playlistsScroll}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {playlists.length === 0 && !isCreatingNew ? (
                  <View style={styles.emptyPlaylists}>
                    <Text style={styles.emptyPlaylistsText}>
                      You haven't created any playlists yet. Tap "New Playlist" above to start!
                    </Text>
                  </View>
                ) : (
                  playlists.map((pl) => (
                    <TouchableOpacity
                      key={pl.id}
                      style={styles.playlistRow}
                      onPress={() => handleSelectPlaylist(pl)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.playlistIcon}>
                        <Ionicons name="musical-notes" size={18} color="#1DB954" />
                      </View>
                      <View style={styles.playlistInfo}>
                        <Text style={styles.playlistName} numberOfLines={1}>
                          {pl.name}
                        </Text>
                        <Text style={styles.playlistCount}>
                          {pl.songs.length} {pl.songs.length === 1 ? 'song' : 'songs'}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color="#888888" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          {/* Bottom Close Button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444444',
  },
  songHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  songCover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#262626',
    marginRight: 14,
  },
  songMeta: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 13,
    color: '#A7A7A7',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A2A',
    marginVertical: 12,
  },
  menuContainer: {
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#242424',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTextCol: {
    flex: 1,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuSubText: {
    fontSize: 11,
    color: '#777777',
    marginTop: 2,
  },
  playlistPickerContainer: {
    paddingVertical: 6,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pickerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  pickerBackText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  newPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  newPlaylistIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  newPlaylistText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  createNewBox: {
    backgroundColor: '#222222',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  newPlaylistInput: {
    backgroundColor: '#181818',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 10,
  },
  createNewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#888888',
    fontWeight: '600',
  },
  createConfirmBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createConfirmText: {
    color: '#000000',
    fontWeight: '700',
  },
  playlistsScroll: {
    maxHeight: 250,
  },
  emptyPlaylists: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyPlaylistsText: {
    fontSize: 13,
    color: '#777777',
    textAlign: 'center',
    lineHeight: 18,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#252525',
  },
  playlistIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playlistCount: {
    fontSize: 11,
    color: '#777777',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#242424',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
