import React, { useState } from 'react';
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

type CardTheme = 'ambient' | 'obsidian' | 'vibrant';

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width - 44, 380);

export const LyricStoryCardModal: React.FC<LyricStoryCardModalProps> = ({
  visible,
  onClose,
  song,
  selectedLines,
}) => {
  const insets = useSafeAreaInsets();
  const { accent } = useAppTheme();
  const [selectedTheme, setSelectedTheme] = useState<CardTheme>('ambient');

  if (!visible || !song || selectedLines.length === 0) return null;

  const quoteText = selectedLines.join('\n');

  const handleShareStory = async () => {
    try {
      const message =
        `${quoteText}\n\n` +
        `— ${song.name} by ${song.artist}\n` +
        `Shared via Shorty`;

      await Share.share({
        message,
        title: `${song.name} Lyrics`,
      });
    } catch {}
  };

  const getThemeGradients = (): [string, string, ...string[]] => {
    if (selectedTheme === 'obsidian') {
      return ['#14171F', '#0B0D13', '#050608'];
    }
    if (selectedTheme === 'vibrant') {
      return [`${accent.hex}40`, 'rgba(18, 22, 34, 0.92)', '#050608'];
    }
    // 'ambient'
    return ['rgba(22, 27, 40, 0.75)', 'rgba(10, 13, 20, 0.92)', '#050608'];
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Top Header */}
        <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Share Lyric Story</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 20, 40) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* THE SPOTIFY / APPLE MUSIC STYLE STORY CARD */}
          <View style={[styles.cardOuterContainer, { width: CARD_WIDTH }]}>
            {/* Ambient Blurred Artwork Backdrop for 'ambient' theme */}
            {selectedTheme === 'ambient' && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <ExpoImage
                  source={{ uri: getSafeCoverArt(song.cover) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={48}
                  cachePolicy="memory-disk"
                />
                <View style={[StyleSheet.absoluteFill, styles.ambientDarkScrim]} />
              </View>
            )}

            <LinearGradient
              colors={getThemeGradients()}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.storyCardContent}
            >
              {/* Header: Cover + Track Info + High-Res Badge */}
              <View style={styles.cardHeader}>
                <ExpoImage
                  source={{ uri: getSafeCoverArt(song.cover) }}
                  style={styles.cardCover}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.cardSongInfo}>
                  <Text style={styles.cardSongName} numberOfLines={1}>
                    {song.name}
                  </Text>
                  <Text style={styles.cardArtistName} numberOfLines={1}>
                    {song.artist}
                  </Text>
                </View>

                <View style={styles.audioBadge}>
                  <Ionicons name="sparkles" size={12} color="#10B981" />
                  <Text style={styles.audioBadgeText}>Lyrics</Text>
                </View>
              </View>

              {/* Stacked Clean Lyric Verses */}
              <View style={styles.versesContainer}>
                {selectedLines.map((line, idx) => (
                  <Text key={idx} style={styles.verseLine}>
                    {line}
                  </Text>
                ))}
              </View>

              {/* Minimalist Authentic Brand Footer */}
              <View style={styles.cardFooter}>
                <View style={styles.brandGroup}>
                  <View style={[styles.brandDot, { backgroundColor: accent.hex }]} />
                  <Text style={styles.brandName}>SHORTY</Text>
                </View>

                <View style={styles.waveformIndicator}>
                  <View style={[styles.waveBar, { height: 8, backgroundColor: accent.hex }]} />
                  <View style={[styles.waveBar, { height: 14, backgroundColor: accent.hex }]} />
                  <View style={[styles.waveBar, { height: 10, backgroundColor: accent.hex }]} />
                  <View style={[styles.waveBar, { height: 16, backgroundColor: accent.hex }]} />
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Theme Selector Pills */}
          <View style={styles.themeSelectorRow}>
            {(['ambient', 'obsidian', 'vibrant'] as CardTheme[]).map((theme) => {
              const isSelected = selectedTheme === theme;
              const label =
                theme === 'ambient' ? 'Artwork Ambient' : theme === 'obsidian' ? 'Midnight Glass' : 'Glow Horizon';
              return (
                <TouchableOpacity
                  key={theme}
                  style={[
                    styles.themeChip,
                    isSelected && [styles.activeThemeChip, { borderColor: accent.hex, backgroundColor: `${accent.hex}25` }],
                  ]}
                  onPress={() => setSelectedTheme(theme)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.themeChipText, isSelected && { color: '#FFFFFF', fontWeight: '800' }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action Row */}
          <View style={[styles.actionRow, { width: CARD_WIDTH }]}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: accent.hex }]}
              onPress={handleShareStory}
              activeOpacity={0.82}
            >
              <Ionicons name="share-social" size={19} color="#000000" />
              <Text style={styles.shareBtnText}>Share Lyric Card</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    gap: 18,
  },
  cardOuterContainer: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 16,
    position: 'relative',
    minHeight: 380,
  },
  ambientDarkScrim: {
    backgroundColor: 'rgba(5, 7, 12, 0.65)',
  },
  storyCardContent: {
    padding: 24,
    justifyContent: 'space-between',
    minHeight: 380,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 16,
  },
  cardCover: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  cardSongInfo: {
    flex: 1,
  },
  cardSongName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cardArtistName: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  audioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  audioBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  versesContainer: {
    paddingVertical: 24,
    gap: 14,
  },
  verseLine: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  waveformIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 16,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeThemeChip: {
    borderWidth: 1.5,
  },
  themeChipText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  actionRow: {
    gap: 10,
    marginTop: 4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  shareBtnText: {
    color: '#000000',
    fontSize: 14.5,
    fontWeight: '800',
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
});
