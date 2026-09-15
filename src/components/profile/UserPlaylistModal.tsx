import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import {
  UserPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
  renamePlaylist,
} from '@/services/userPlaylistService';
import { SongItemRow } from '../common/SongItemRow';
import { getSafeCoverArt } from '@/services/imageUtils';
import { autoFixImportedPlaylistCovers } from '@/services/playlistImportService';
import { sharePlaylist } from '@/services/playlistShareService';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';

interface UserPlaylistModalProps {
  playlist: UserPlaylist | null;
  visible: boolean;
  onClose: () => void;
  onPlaylistUpdated?: () => void;
}

export const UserPlaylistModal: React.FC<UserPlaylistModalProps> = ({
  playlist,
  visible,
  onClose,
  onPlaylistUpdated,
}) => {
  const insets = useSafeAreaInsets();
  const { playSong } = useAudio();
  const { user } = useAuth();
  const { bgHex, surfaceHex, accent } = useAppTheme();
  const { isTablet, maxModalWidth } = useResponsive();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  useEffect(() => {
    if (!visible || !playlist) return;
    const hasDuplicateCovers = playlist.songs.some(
      (s) => (playlist.coverUrl && s.cover === playlist.coverUrl) || s.id.startsWith('sp_')
    );
    if (hasDuplicateCovers) {
      autoFixImportedPlaylistCovers()
        .then((updated) => {
          if (updated) {
            onPlaylistUpdated?.();
          }
        })
        .catch(() => {});
    }
  }, [visible, playlist?.id, onPlaylistUpdated]);

  if (!visible || !playlist) return null;

  const handlePlayAll = (shuffleMode: boolean = false) => {
    if (playlist.songs.length === 0) return;
    const tracks = [...playlist.songs];
    if (shuffleMode && tracks.length > 1) {
      tracks.sort(() => Math.random() - 0.5);
    }
    playSong(tracks[0], tracks);
  };

  const handleRemoveTrack = (songId: string, songName: string) => {
    Alert.alert('Remove Song', `Remove "${songName}" from this playlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeSongFromPlaylist(playlist.id, songId, user?.id);
          onPlaylistUpdated?.();
        },
      },
    ]);
  };

  const handleDeletePlaylist = () => {
    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to permanently delete "${playlist.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePlaylist(playlist.id, user?.id);
            onPlaylistUpdated?.();
            onClose();
          },
        },
      ]
    );
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim()) return;
    await renamePlaylist(playlist.id, editedTitle.trim(), undefined, user?.id);
    setIsEditingTitle(false);
    onPlaylistUpdated?.();
  };

  const coverUri = playlist.coverUrl
    ? getSafeCoverArt(playlist.coverUrl, playlist.id)
    : playlist.songs[0]?.cover
    ? getSafeCoverArt(playlist.songs[0].cover, playlist.songs[0].id)
    : null;

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
            { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: bgHex },
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
          <StatusBar barStyle="light-content" backgroundColor={bgHex} />

        {/* Top Nav Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.navTitle} numberOfLines={1}>
            {playlist.name}
          </Text>

          <View style={styles.navActionsRow}>
            <TouchableOpacity
              style={styles.navShareBtn}
              onPress={() => sharePlaylist(playlist)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={19} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDeletePlaylist}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={19} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner */}
          <LinearGradient
            colors={['#242424', '#151515', '#0D0D0D']}
            style={styles.heroCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          >
            <View style={styles.coverWrapper}>
              {coverUri ? (
                <ExpoImage source={{ uri: coverUri }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={['#1DB954', '#0d7332']}
                  style={styles.placeholderCover}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="musical-notes" size={38} color="#FFFFFF" />
                </LinearGradient>
              )}
            </View>

            {isEditingTitle ? (
              <View style={styles.titleEditRow}>
                <TextInput
                  style={styles.titleInput}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  autoFocus
                  placeholder="Playlist Name"
                  placeholderTextColor="#666"
                />
                <TouchableOpacity onPress={handleSaveTitle} style={styles.saveTitleBtn}>
                  <Text style={styles.saveTitleText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.titleRow}
                onPress={() => {
                  setEditedTitle(playlist.name);
                  setIsEditingTitle(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.playlistTitle}>{playlist.name}</Text>
                <Ionicons name="pencil-outline" size={16} color="#888888" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}

            <Text style={styles.playlistStats}>
              {playlist.songs.length} {playlist.songs.length === 1 ? 'track' : 'tracks'} • Created Playlist
            </Text>

            {/* Play & Shuffle Buttons */}
            {playlist.songs.length > 0 && (
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.playAllBtn, { backgroundColor: accent.hex }]}
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

                <TouchableOpacity
                  style={styles.shareHeroBtn}
                  onPress={() => sharePlaylist(playlist)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="share-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.shareHeroText}>Share</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>

          {/* Songs List */}
          {playlist.songs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-note-outline" size={36} color="#666666" />
              <Text style={styles.emptyTitle}>This playlist is empty</Text>
              <Text style={styles.emptySub}>
                Tap the <Text style={{ color: '#FFFFFF' }}>...</Text> menu on any song across Home or Search and select "Add to Playlist".
              </Text>
            </View>
          ) : (
            <View style={styles.songsListContainer}>
              <Text style={styles.sectionHeading}>TRACKS</Text>
              {playlist.songs.map((song: Song, index: number) => (
                <View key={`${song.id}_${index}`} style={styles.songRowWrapper}>
                  <View style={{ flex: 1 }}>
                    <SongItemRow
                      song={song}
                      index={index}
                      playlistContext={playlist.songs}
                      showTrackNumber={true}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeSongBtn}
                    onPress={() => handleRemoveTrack(song.id, song.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={18} color="#777777" />
                  </TouchableOpacity>
                </View>
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
    backgroundColor: '#0D0D0D',
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
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  coverWrapper: {
    width: 140,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCover: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playlistTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  titleEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  titleInput: {
    backgroundColor: '#1C1C1C',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1DB954',
  },
  saveTitleBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveTitleText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  playlistStats: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 16,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
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
    backgroundColor: '#262626',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  shuffleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  shareHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  shareHeroText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySub: {
    fontSize: 13,
    color: '#777777',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 24,
  },
  songsListContainer: {
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
  songRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeSongBtn: {
    padding: 8,
  },
});
