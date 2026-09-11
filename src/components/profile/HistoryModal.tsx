import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getListeningHistory,
  clearHistory,
  pruneWeeklyHistory,
  groupHistoryByDate,
  formatHistoryTime,
  HistoryEntry,
  GroupedHistory,
} from '@/services/historyService';
import { getSafeCoverArt } from '@/services/imageUtils';
import { SongActionController } from '@/services/songActionController';

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const { playSong, currentSong, isPlaying } = useAudio();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState<GroupedHistory>({
    today: [],
    yesterday: [],
    earlier: [],
  });
  const [totalCount, setTotalCount] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      await pruneWeeklyHistory(user?.id);
      const items = await getListeningHistory();
      setTotalCount(items.length);
      const g = groupHistoryByDate(items);
      setGrouped(g);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible) {
      loadHistory();
    }
  }, [visible, loadHistory]);

  const handleClear = () => {
    Alert.alert(
      'Clear Listening History',
      'Are you sure you want to permanently clear your listening history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearHistory(user?.id);
            await loadHistory();
          },
        },
      ]
    );
  };

  const handlePlaySong = (song: Song) => {
    playSong(song);
  };

  const renderItem = (entry: HistoryEntry) => {
    const isCurrent = currentSong?.id === entry.song.id;
    const coverUri = getSafeCoverArt(entry.song.cover, entry.song.id);
    const timeStr = formatHistoryTime(entry.playedAt);

    return (
      <TouchableOpacity
        key={entry.id}
        style={[styles.historyRow, isCurrent && styles.activeHistoryRow]}
        onPress={() => handlePlaySong(entry.song)}
        activeOpacity={0.7}
      >
        <ExpoImage
          source={{ uri: coverUri }}
          style={styles.artwork}
          contentFit="cover"
          transition={100}
        />

        <View style={styles.metaCol}>
          <Text style={[styles.title, isCurrent && styles.activeTitle]} numberOfLines={1}>
            {entry.song.name}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {entry.song.artist}
          </Text>
        </View>

        <View style={styles.rightCol}>
          <Text style={styles.timestamp}>{timeStr}</Text>
          <TouchableOpacity
            style={styles.moreBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation?.();
              SongActionController.open(entry.song);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={16} color="#777777" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  const hasHistory =
    grouped.today.length > 0 || grouped.yesterday.length > 0 || grouped.earlier.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleCol}>
            <Text style={styles.headerTitle}>Listening History</Text>
            {totalCount > 0 && (
              <Text style={styles.headerSubtitle}>{totalCount} played tracks</Text>
            )}
          </View>

          {hasHistory ? (
            <TouchableOpacity
              style={styles.clearHeaderBtn}
              onPress={handleClear}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1DB954" />
          </View>
        ) : !hasHistory ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="time-outline" size={36} color="#1DB954" />
            </View>
            <Text style={styles.emptyTitle}>No History Yet</Text>
            <Text style={styles.emptySubtitle}>
              Tracks played for at least 30 seconds will appear here in chronological order.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* TODAY SECTION */}
            {grouped.today.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>TODAY</Text>
                {grouped.today.map(renderItem)}
              </View>
            )}

            {/* YESTERDAY SECTION */}
            {grouped.yesterday.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>YESTERDAY</Text>
                {grouped.yesterday.map(renderItem)}
              </View>
            )}

            {/* EARLIER SECTIONS */}
            {grouped.earlier.map((group) => (
              <View key={group.dateLabel} style={styles.section}>
                <Text style={styles.sectionHeader}>{group.dateLabel.toUpperCase()}</Text>
                {group.items.map(renderItem)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
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
  headerTitleCol: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  clearHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#161616',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#222222',
  },
  activeHistoryRow: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#262626',
    marginRight: 12,
  },
  metaCol: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  activeTitle: {
    color: '#1DB954',
  },
  artist: {
    color: '#888888',
    fontSize: 12,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
    gap: 6,
  },
  timestamp: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  moreBtn: {
    padding: 2,
  },
});
