import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  TextInput,
  Modal,
  Dimensions,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useAudio } from '@/contexts/AudioContext';
import {
  getUserPlaylists,
  createPlaylist,
  syncUserPlaylistsWithCloud,
  UserPlaylist,
} from '@/services/userPlaylistService';
import { getListeningHistory, HistoryEntry } from '@/services/historyService';
import { getSafeCoverArt } from '@/services/imageUtils';
import { SongActionController } from '@/services/songActionController';
import { LikedSongsModal } from '../profile/LikedSongsModal';
import { UserPlaylistModal } from '../profile/UserPlaylistModal';
import { HistoryModal } from '../profile/HistoryModal';
import { ImportPlaylistModal } from '../profile/ImportPlaylistModal';
import { ShortyReplayModal } from '../profile/ShortyReplayModal';
import { autoFixImportedPlaylistCovers } from '@/services/playlistImportService';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';

type FilterChip = 'All' | 'Playlists' | 'Liked Songs';

export interface MyLibScreenProps {
  isActive?: boolean;
  refreshTrigger?: number;
}

export const MyLibScreen: React.FC<MyLibScreenProps> = ({
  isActive = true,
  refreshTrigger = 0,
}) => {
  const insets = useSafeAreaInsets();
  const { likedSongsList, playSong } = useAudio();
  const { user } = useAuth();
  const { bgHex, surfaceHex, accent } = useAppTheme();
  const { isTablet, contentPadding, columns, width: screenWidth } = useResponsive();
  const numColumns = columns.playlists;
  const tileGap = 12;
  const tileWidth = Math.floor(
    (screenWidth - contentPadding * 2 - (numColumns - 1) * tileGap) / numColumns
  );

  const [activeFilter, setActiveFilter] = useState<FilterChip>('All');
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [showLikedModal, setShowLikedModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UserPlaylist | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [pls, hist] = await Promise.all([
        user?.id ? syncUserPlaylistsWithCloud(user.id) : getUserPlaylists(),
        getListeningHistory(),
      ]);
      setPlaylists(pls);
      setRecentHistory(hist.slice(0, 8));
      setSelectedPlaylist((prev) => {
        if (!prev) return null;
        return pls.find((p) => p.id === prev.id) || null;
      });

      // Silently fix any songs that were assigned the playlist thumbnail
      autoFixImportedPlaylistCovers().then((hasUpdates) => {
        if (hasUpdates) {
          getUserPlaylists().then(setPlaylists).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('[MyLibScreen] Error loading library data:', err);
    }
  }, []);

  // Refresh library data whenever navigating to My Lib screen (or when active tab changes)
  useEffect(() => {
    if (isActive) {
      loadData();
    }
  }, [isActive, refreshTrigger, loadData]);

  // Also refresh when app resumes from background while My Lib is active
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isActive) {
        loadData();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isActive, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const created = await createPlaylist(
      newPlaylistName.trim(),
      newPlaylistDesc.trim(),
      undefined,
      [],
      user?.id
    );
    setShowCreateModal(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    await loadData();
    setSelectedPlaylist(created);
  };

  const handlePlayLikedAll = (shuffle: boolean = false) => {
    if (likedSongsList.length === 0) return;
    const tracks = [...likedSongsList];
    if (shuffle && tracks.length > 1) {
      tracks.sort(() => Math.random() - 0.5);
    }
    playSong(tracks[0], tracks);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bgHex }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={bgHex} />

      {/* Top Header */}
      <View style={[styles.header, { paddingHorizontal: contentPadding }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Lib</Text>
        </View>

        <View style={styles.headerRight}>
          {/* Import Playlist from URL Button */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: surfaceHex }]}
            onPress={() => setShowImportModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="link-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Listening History Button */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: surfaceHex }]}
            onPress={() => setShowHistoryModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Create New Playlist Button */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: surfaceHex }]}
            onPress={() => setShowCreateModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={[styles.filterChipsRow, { paddingHorizontal: contentPadding }]}>
        {(['All', 'Playlists', 'Liked Songs'] as FilterChip[]).map((chip) => {
          const isSelected = activeFilter === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[
                styles.filterChip,
                isSelected && [styles.filterChipActive, { backgroundColor: accent.hex, borderColor: accent.hex }],
              ]}
              onPress={() => setActiveFilter(chip)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={accent.hex} />
        }
      >
        {/* 1. HERO LIKED SONGS CARD */}
        {(activeFilter === 'All' || activeFilter === 'Liked Songs') && (
          <TouchableOpacity
            style={[styles.likedHeroCardWrapper, isTablet && { maxWidth: 860, alignSelf: 'center', width: '100%' }]}
            onPress={() => setShowLikedModal(true)}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#4F46E5', accent.hex, bgHex]}
              style={styles.likedHeroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.likedCardLeft}>
                <View style={styles.likedHeartCircle}>
                  <Ionicons name="heart" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.likedCardMeta}>
                  <Text style={styles.likedCardTitle}>Liked Songs</Text>
                  <Text style={styles.likedCardCount}>
                    {likedSongsList.length} {likedSongsList.length === 1 ? 'song' : 'songs'} • Offline & Synced
                  </Text>
                </View>
              </View>

              {likedSongsList.length > 0 && (
                <View style={styles.likedCardActions}>
                  <TouchableOpacity
                    style={styles.quickPlayBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handlePlayLikedAll(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={18} color="#000000" />
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* 2. CREATED PLAYLISTS SECTION */}
        {(activeFilter === 'All' || activeFilter === 'Playlists') && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>My Playlists</Text>
              <View style={styles.sectionActionGroup}>
                <TouchableOpacity
                  style={styles.importHeaderBtn}
                  onPress={() => setShowImportModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="link-outline" size={13} color="#1DB954" />
                  <Text style={styles.importHeaderBtnText}>Import</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowCreateModal(true)} activeOpacity={0.7}>
                  <Text style={styles.sectionActionText}>+ New</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.playlistsGrid}>
              {/* Create Playlist Action Tile */}
              <TouchableOpacity
                style={[styles.createPlaylistTile, { width: tileWidth }]}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.createTileIcon}>
                  <Ionicons name="add" size={32} color="#1DB954" />
                </View>
                <Text style={styles.createTileTitle}>Create Playlist</Text>
                <Text style={styles.createTileSub}>Build custom mix</Text>
              </TouchableOpacity>

              {/* Import from URL Action Tile */}
              <TouchableOpacity
                style={[styles.createPlaylistTile, { width: tileWidth }]}
                onPress={() => setShowImportModal(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.createTileIcon, { backgroundColor: 'rgba(29, 185, 84, 0.12)' }]}>
                  <Ionicons name="link" size={26} color="#1DB954" />
                </View>
                <Text style={styles.createTileTitle}>Import URL</Text>
                <Text style={styles.createTileSub}>YT, Spotify link</Text>
              </TouchableOpacity>

              {/* User Playlists Tiles */}
              {playlists.map((pl) => {
                const cover = pl.coverUrl
                  ? getSafeCoverArt(pl.coverUrl, pl.id)
                  : pl.songs[0]?.cover
                  ? getSafeCoverArt(pl.songs[0].cover, pl.songs[0].id)
                  : null;

                return (
                  <TouchableOpacity
                    key={pl.id}
                    style={[styles.playlistTile, { width: tileWidth }]}
                    onPress={() => setSelectedPlaylist(pl)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.playlistTileCoverWrapper}>
                      {cover ? (
                        <ExpoImage source={{ uri: cover }} style={styles.playlistTileCover} contentFit="cover" />
                      ) : (
                        <LinearGradient
                          colors={['#2A2A2A', '#1C1C1C']}
                          style={styles.placeholderTileCover}
                        >
                          <Ionicons name="musical-notes" size={28} color="#1DB954" />
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={styles.playlistTileTitle} numberOfLines={1}>
                      {pl.name}
                    </Text>
                    <Text style={styles.playlistTileCount}>
                      {pl.songs.length} {pl.songs.length === 1 ? 'song' : 'songs'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 3. RECENTLY PLAYED HISTORY PREVIEW */}
        {activeFilter === 'All' && recentHistory.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Ionicons name="time-outline" size={16} color="#1DB954" />
                <Text style={styles.sectionTitle}>Recently Played</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHistoryModal(true)} activeOpacity={0.7}>
                <Text style={styles.sectionActionText}>View All →</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.recentHistoryCard, isTablet && { maxWidth: 860, alignSelf: 'center', width: '100%' }]}>
              {recentHistory.map((item, idx) => (
                <TouchableOpacity
                  key={`${item.id}_${idx}`}
                  style={[
                    styles.recentHistoryRow,
                    idx === recentHistory.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => playSong(item.song)}
                  onLongPress={() => SongActionController.open(item.song)}
                  activeOpacity={0.7}
                >
                  <ExpoImage
                    source={{ uri: getSafeCoverArt(item.song.cover, item.song.id) }}
                    style={styles.recentCover}
                    contentFit="cover"
                  />
                  <View style={styles.recentMeta}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {item.song.name}
                    </Text>
                    <Text style={styles.recentArtist} numberOfLines={1}>
                      {item.song.artist}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.recentActionBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      SongActionController.open(item.song);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color="#777777" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* CREATE PLAYLIST MODAL */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <TouchableOpacity
          style={styles.createModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowCreateModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.createModalSheet, isTablet && { maxWidth: 500, alignSelf: 'center' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.createModalTitle}>New Playlist</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name..."
              placeholderTextColor="#666666"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
              maxLength={40}
            />

            <TextInput
              style={[styles.modalInput, { height: 60, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor="#666666"
              value={newPlaylistDesc}
              onChangeText={setNewPlaylistDesc}
              maxLength={100}
              multiline
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  !newPlaylistName.trim() && { opacity: 0.5 },
                ]}
                disabled={!newPlaylistName.trim()}
                onPress={handleCreatePlaylist}
              >
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* SUB-MODALS */}
      <LikedSongsModal
        visible={showLikedModal}
        onClose={() => {
          setShowLikedModal(false);
          loadData();
        }}
      />

      <UserPlaylistModal
        playlist={selectedPlaylist}
        visible={Boolean(selectedPlaylist)}
        onClose={() => {
          setSelectedPlaylist(null);
          loadData();
        }}
        onPlaylistUpdated={loadData}
      />

      <HistoryModal
        visible={showHistoryModal}
        onClose={() => {
          setShowHistoryModal(false);
          loadData();
        }}
      />

      <ImportPlaylistModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={async (created) => {
          setShowImportModal(false);
          await loadData();
          setSelectedPlaylist(created);
        }}
      />

      <ShortyReplayModal
        visible={showReplayModal}
        onClose={() => setShowReplayModal(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#1C1C1C',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  filterChipActive: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  filterChipText: {
    color: '#B3B3B3',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  likedHeroCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 4,
  },
  likedHeroGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  likedCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  likedHeartCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  likedCardMeta: {
    flex: 1,
  },
  likedCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  likedCardCount: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  replayHeroCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 4,
  },
  replayHeroGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  replayCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  replayIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  replayCardMeta: {
    flex: 1,
  },
  replayBadgeRow: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 4,
  },
  replayBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  replayCardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  replayCardSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  replayArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  likedCardActions: {
    marginLeft: 12,
  },
  quickPlayBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionActionText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  importHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  importHeaderBtnText: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '700',
  },
  playlistsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  createPlaylistTile: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
  },
  createTileIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  createTileTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  createTileSub: {
    color: '#777777',
    fontSize: 11,
    marginTop: 2,
  },
  playlistTile: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },
  playlistTileCoverWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#222222',
  },
  playlistTileCover: {
    width: '100%',
    height: '100%',
  },
  placeholderTileCover: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistTileTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  playlistTileCount: {
    color: '#888888',
    fontSize: 11,
  },
  recentHistoryCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222222',
    overflow: 'hidden',
  },
  recentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#242424',
  },
  recentCover: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: '#262626',
    marginRight: 10,
  },
  recentMeta: {
    flex: 1,
  },
  recentTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  recentArtist: {
    color: '#888888',
    fontSize: 12,
  },
  recentActionBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  createModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  createModalSheet: {
    width: '100%',
    backgroundColor: '#1C1C1C',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  createModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#141414',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2E2E2E',
    fontSize: 14,
    marginBottom: 12,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#888888',
    fontWeight: '600',
  },
  modalConfirmBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalConfirmText: {
    color: '#000000',
    fontWeight: '700',
  },
});
