import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Song } from '@/types/music';
import { getSafeCoverArt } from '@/services/imageUtils';
import { useAppTheme } from '@/contexts/ThemeContext';

interface LyricStoryCardModalProps {
  visible: boolean;
  onClose: () => void;
  song: Song | null;
  selectedLines: string[];
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width - 48, 360);

export const LyricStoryCardModal: React.FC<LyricStoryCardModalProps> = ({
  visible,
  onClose,
  song,
  selectedLines,
}) => {
  const insets = useSafeAreaInsets();
  const { accent } = useAppTheme();

  if (!visible || !song || selectedLines.length === 0) return null;

  const quoteText = selectedLines.join('\n');

  const handleShareStory = async () => {
    try {
      const message =
        `“${quoteText}”\n\n` +
        `🎵 ${song.name} — ${song.artist}\n` +
        `Stream high-fidelity music with Shorty ⚡`;

      await Share.share({
        message,
        title: `${song.name} Lyrics`,
      });
    } catch { }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Top Header */}
        <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lyric Story Card</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 20, 40) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* THE LYRIC CARD */}
          <LinearGradient
            colors={['#1E1B4B', '#0F172A', '#020617']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.storyCard, { width: CARD_WIDTH }]}
          >
            {/* Song Header */}
            <View style={styles.cardHeader}>
              <ExpoImage
                source={{ uri: getSafeCoverArt(song.cover) }}
                style={styles.cardCover}
                contentFit="cover"
              />
              <View style={styles.cardSongInfo}>
                <Text style={styles.cardSongName} numberOfLines={1}>
                  {song.name}
                </Text>
                <Text style={styles.cardArtistName} numberOfLines={1}>
                  {song.artist}
                </Text>
              </View>
              <View style={styles.quoteMarkBadge}>
                <Ionicons name="chatbox-ellipses" size={16} color="#A855F7" />
              </View>
            </View>

            {/* Lyric Content */}
            <View style={styles.quoteBody}>
              <Text style={styles.openQuote}>“</Text>
              <Text style={styles.quoteText}>{quoteText}</Text>
            </View>

            {/* Brand Footer */}
            <View style={styles.cardFooter}>
              <View style={styles.brandBadge}>
                <Ionicons name="flash" size={12} color="#1DB954" />
                <Text style={styles.brandText}>SHORTY AUDIO</Text>
              </View>
              <Text style={styles.sourceMeta}>Deluxe Synced Lyrics</Text>
            </View>
          </LinearGradient>

          {/* Action Buttons */}
          <View style={[styles.actionRow, { width: CARD_WIDTH }]}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: accent.hex }]}
              onPress={handleShareStory}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social" size={20} color="#000000" />
              <Text style={styles.shareBtnText}>Share Story Card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Back to Lyrics</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    gap: 20,
  },
  storyCard: {
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    minHeight: 320,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 14,
  },
  cardCover: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  cardSongInfo: {
    flex: 1,
  },
  cardSongName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cardArtistName: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    marginTop: 2,
  },
  quoteMarkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteBody: {
    paddingVertical: 20,
  },
  openQuote: {
    color: '#A855F7',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 38,
    marginBottom: -6,
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.3,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 14,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sourceMeta: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
  },
  actionRow: {
    gap: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
  },
  shareBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
});
