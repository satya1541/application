import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useAudio } from '@/contexts/AudioContext';
import { SongItemRow } from '../common/SongItemRow';
import { getSafeCoverArt } from '@/services/imageUtils';
import { Song } from '@/types/music';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';

interface QueueModalProps {
  visible?: boolean;
  onClose?: () => void;
}

export const QueueModal: React.FC<QueueModalProps> = ({
  visible: propVisible,
  onClose: propOnClose,
}) => {
  const { bgHex, surfaceHex, accent } = useAppTheme();
  const { isTablet, maxModalWidth } = useResponsive();
  const {
    currentSong,
    queue,
    userQueue,
    isQueueModalOpen,
    closeQueueModal,
    removeFromUserQueue,
    moveInUserQueue,
    clearUserQueue,
    autoplayEnabled,
    toggleAutoplay,
    refreshRecommendationsQueue,
    playSong,
  } = useAudio();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Allow opening either via props or via AudioContext.isQueueModalOpen
  const isVisible = propVisible !== undefined ? propVisible : isQueueModalOpen;
  const handleClose = propOnClose || closeQueueModal;

  const currentIdx = currentSong ? queue.findIndex((s) => s.id === currentSong.id) : -1;
  const upcomingContextSongs = currentIdx !== -1 ? queue.slice(currentIdx + 1) : queue;

  const handleRefreshRecommendations = async () => {
    setIsRefreshing(true);
    try {
      await refreshRecommendationsQueue();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmClearQueue = () => {
    Alert.alert('Clear Queue', 'Are you sure you want to remove all manually queued songs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear Queue',
        style: 'destructive',
        onPress: () => clearUserQueue(),
      },
    ]);
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle={isTablet ? 'overFullScreen' : 'pageSheet'}
      transparent={isTablet}
      onRequestClose={handleClose}
    >
      <View style={[styles.rootContainer, isTablet && styles.tabletBackdrop]}>
        {isTablet && (
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleClose}
          />
        )}
        <SafeAreaView
          style={[
            styles.container,
            { backgroundColor: bgHex },
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
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleCenter}>
            <Text style={styles.headerTitle}>Queue & Up Next</Text>
            <Text style={styles.headerSubtitle}>
              {userQueue.length} queued • {upcomingContextSongs.length} upcoming
            </Text>
          </View>

          {/* Autoplay Toggle Pill */}
          <TouchableOpacity
            style={[
              styles.autoplayPill,
              autoplayEnabled && [styles.autoplayPillActive, { backgroundColor: accent.hex, borderColor: accent.hex }],
            ]}
            onPress={toggleAutoplay}
            activeOpacity={0.8}
          >
            <Ionicons
              name={autoplayEnabled ? 'infinite' : 'infinite-outline'}
              size={15}
              color={autoplayEnabled ? '#000000' : '#888888'}
            />
            <Text
              style={[styles.autoplayText, autoplayEnabled && styles.autoplayTextActive]}
            >
              Autoplay {autoplayEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 1. NOW PLAYING SECTION */}
          {currentSong && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithDot}>
                  <View style={[styles.liveGreenDot, { backgroundColor: accent.hex }]} />
                  <Text style={styles.sectionTitle}>NOW PLAYING</Text>
                </View>
              </View>

              <View style={[styles.nowPlayingCard, { backgroundColor: surfaceHex }]}>
                <ExpoImage
                  source={{ uri: getSafeCoverArt(currentSong.cover, currentSong.id) }}
                  style={styles.nowPlayingCover}
                  contentFit="cover"
                />
                <View style={styles.nowPlayingMeta}>
                  <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                    {currentSong.name}
                  </Text>
                  <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                    {currentSong.artist}
                  </Text>
                </View>
                <View style={styles.nowPlayingBadge}>
                  <Ionicons name="volume-high" size={18} color={accent.hex} />
                </View>
              </View>
            </View>
          )}

          {/* 2. MANUAL USER QUEUE SECTION (Explicitly added songs) */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="list" size={16} color={accent.hex} />
                <Text style={styles.sectionTitle}>
                  NEXT IN QUEUE ({userQueue.length})
                </Text>
              </View>

              {userQueue.length > 0 && (
                <TouchableOpacity
                  onPress={handleConfirmClearQueue}
                  style={styles.clearBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={styles.clearBtnText}>Clear Queue</Text>
                </TouchableOpacity>
              )}
            </View>

            {userQueue.length === 0 ? (
              <View style={styles.emptyQueueBox}>
                <Ionicons name="add-circle-outline" size={24} color="#555555" />
                <Text style={styles.emptyQueueText}>
                  Your queue is empty. Tap the <Text style={{ color: '#FFFFFF' }}>...</Text> menu on any song to "Add to Queue" or "Play Next".
                </Text>
              </View>
            ) : (
              userQueue.map((song: Song, idx: number) => (
                <View key={`user_q_${song.id}_${idx}`} style={styles.userQueueItemRow}>
                  <TouchableOpacity
                    style={styles.userQueueSongPress}
                    onPress={() => playSong(song)}
                    activeOpacity={0.7}
                  >
                    <ExpoImage
                      source={{ uri: getSafeCoverArt(song.cover, song.id) }}
                      style={styles.queueCover}
                      contentFit="cover"
                    />
                    <View style={styles.queueMeta}>
                      <Text style={styles.queueTitle} numberOfLines={1}>
                        {song.name}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {song.artist}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Reorder Buttons & Delete */}
                  <View style={styles.reorderActions}>
                    {idx > 0 && (
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        onPress={() => moveInUserQueue(idx, idx - 1)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      >
                        <Ionicons name="chevron-up" size={18} color="#A7A7A7" />
                      </TouchableOpacity>
                    )}
                    {idx < userQueue.length - 1 && (
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        onPress={() => moveInUserQueue(idx, idx + 1)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      >
                        <Ionicons name="chevron-down" size={18} color="#A7A7A7" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeFromUserQueue(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#888888" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* 3. CONTEXT / AUTOPLAY RECOMMENDATIONS SECTION */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="musical-notes-outline" size={16} color="#888888" />
                <Text style={styles.sectionTitle}>
                  {autoplayEnabled
                    ? `UP NEXT (PLAYLIST & AUTOPLAY) • ${upcomingContextSongs.length}`
                    : `UP NEXT FROM PLAYLIST • ${upcomingContextSongs.length}`}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleRefreshRecommendations}
                disabled={isRefreshing}
                style={styles.refreshQueueBtn}
                activeOpacity={0.7}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#1DB954" />
                ) : (
                  <Ionicons name="refresh" size={15} color="#A7A7A7" />
                )}
              </TouchableOpacity>
            </View>

            {upcomingContextSongs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No upcoming songs in playlist</Text>
                {autoplayEnabled && (
                  <TouchableOpacity
                    style={styles.generateBtn}
                    onPress={handleRefreshRecommendations}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.generateBtnText}>Generate Recommendations</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              upcomingContextSongs.map((song, idx) => (
                <SongItemRow
                  key={`context_q_${song.id}_${idx}`}
                  song={song}
                  index={idx}
                  playlistContext={queue}
                  showTrackNumber={false}
                />
              ))
            )}
          </View>
        </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  tabletBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
  },
  closeBtn: {
    padding: 6,
  },
  headerTitleCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  autoplayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222222',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: '#333333',
  },
  autoplayPillActive: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  autoplayText: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
  },
  autoplayTextActive: {
    color: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1DB954',
  },
  sectionTitle: {
    color: '#B3B3B3',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshQueueBtn: {
    padding: 4,
  },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1C',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  nowPlayingCover: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#262626',
    marginRight: 12,
  },
  nowPlayingMeta: {
    flex: 1,
  },
  nowPlayingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1DB954',
    marginBottom: 3,
  },
  nowPlayingArtist: {
    fontSize: 13,
    color: '#A7A7A7',
  },
  nowPlayingBadge: {
    padding: 8,
  },
  emptyQueueBox: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#242424',
  },
  emptyQueueText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  userQueueItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    padding: 8,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#242424',
  },
  userQueueSongPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueCover: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: '#262626',
    marginRight: 10,
  },
  queueMeta: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  queueArtist: {
    fontSize: 12,
    color: '#888888',
  },
  reorderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  reorderBtn: {
    padding: 4,
  },
  removeBtn: {
    padding: 4,
    marginLeft: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyText: {
    color: '#888888',
    fontSize: 13,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  generateBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
