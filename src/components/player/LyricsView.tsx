import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { getLiveLyrics, LyricLine } from '@/services/lyricsService';
import { LyricStoryCardModal } from './LyricStoryCardModal';
import { useAppTheme } from '@/contexts/ThemeContext';

export const LyricsView: React.FC = () => {
  const { currentSong, seekTo } = useAudio();
  const { position } = useAudioProgress();
  const { accent } = useAppTheme();
  const [lyricsLines, setLyricsLines] = useState<LyricLine[]>([]);
  const [isSynced, setIsSynced] = useState<boolean>(true);
  const [sourceName, setSourceName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Quote / Share Story Mode
  const [isQuoteMode, setIsQuoteMode] = useState<boolean>(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [showStoryModal, setShowStoryModal] = useState<boolean>(false);

  const scrollViewRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!currentSong) return;

    let isMounted = true;
    setIsLoading(true);
    setIsQuoteMode(false);
    setSelectedIndices([]);

    // If song already has catalog lyrics, use them immediately
    if (currentSong.lyrics && currentSong.lyrics.length > 0) {
      const parsed = currentSong.lyrics.map((line) => {
        const match = line.match(/\[(\d{2}):(\d{2})\.?(\d{2})?\](.*)/);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          return { time: minutes * 60 + seconds, text: match[4].trim() };
        }
        return { time: 0, text: line };
      });
      setLyricsLines(parsed);
      setIsSynced(true);
      setSourceName('Verified Master');
      setIsLoading(false);
      return;
    }

    // Otherwise fetch live from LRCLIB & NetEase multi-tier API
    getLiveLyrics(currentSong.name, currentSong.artist, currentSong.duration)
      .then((res) => {
        if (!isMounted) return;
        if (res.lines && res.lines.length > 0) {
          setLyricsLines(res.lines);
          setIsSynced(res.synced);
          setSourceName(
            res.source === 'lrclib'
              ? 'LRCLIB'
              : res.source === 'netease'
              ? 'NetEase'
              : 'Synced'
          );
        } else {
          setLyricsLines([]);
        }
      })
      .catch((err) => {
        console.warn('Lyrics fetch error:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentSong?.id, currentSong?.name, currentSong?.artist]);

  // Find active line index based on playback position
  let activeIndex = -1;
  for (let i = 0; i < lyricsLines.length; i++) {
    if (position >= lyricsLines[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Smooth Auto-Scroll to Active Lyric (only when not actively selecting quotes)
  useEffect(() => {
    if (!isQuoteMode && activeIndex >= 0 && scrollViewRef.current && isSynced) {
      const targetY = Math.max(0, activeIndex * 58 - 140);
      scrollViewRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, [activeIndex, isSynced, isQuoteMode]);

  const handleLinePress = (index: number, time: number) => {
    if (isQuoteMode) {
      if (selectedIndices.includes(index)) {
        setSelectedIndices(selectedIndices.filter((i) => i !== index));
      } else {
        if (selectedIndices.length >= 4) return;
        setSelectedIndices([...selectedIndices, index].sort((a, b) => a - b));
      }
    } else {
      seekTo(time);
    }
  };

  const handleLineLongPress = (index: number) => {
    if (!isQuoteMode) {
      setIsQuoteMode(true);
      setSelectedIndices([index]);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.floatingLoadingContainer}>
        <ActivityIndicator size="small" color="#1DB954" />
        <Text style={styles.floatingLoadingText}>Fetching synced lyrics...</Text>
      </View>
    );
  }

  if (lyricsLines.length === 0) {
    return (
      <View style={styles.floatingEmptyContainer}>
        <Ionicons name="musical-notes-outline" size={40} color="rgba(255,255,255,0.3)" />
        <Text style={styles.floatingEmptyTitle}>No Lyrics Found</Text>
        <Text style={styles.floatingEmptySub}>
          Synchronized lyrics are not available for this track.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.floatingContainer}>
      {/* Top Quote Mode Toggle Bar */}
      <View style={styles.quoteToolbar}>
        <TouchableOpacity
          style={[
            styles.quoteToggleBtn,
            isQuoteMode && { backgroundColor: accent.hex },
          ]}
          onPress={() => {
            if (isQuoteMode) {
              setIsQuoteMode(false);
              setSelectedIndices([]);
            } else {
              setIsQuoteMode(true);
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isQuoteMode ? 'close' : 'chatbox-ellipses-outline'}
            size={15}
            color={isQuoteMode ? '#000000' : '#FFFFFF'}
          />
          <Text
            style={[
              styles.quoteToggleText,
              isQuoteMode && { color: '#000000', fontWeight: '800' },
            ]}
          >
            {isQuoteMode ? 'Cancel' : 'Share Quote'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.floatingScrollContent,
          isQuoteMode && selectedIndices.length > 0 && { paddingBottom: 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {lyricsLines.map((item, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const isSelected = selectedIndices.includes(index);

          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => handleLinePress(index, item.time)}
              onLongPress={() => handleLineLongPress(index)}
              style={[
                styles.floatingLineWrapper,
                isActive && !isQuoteMode && styles.activeFloatingLineWrapper,
                isSelected && [styles.selectedLineWrapper, { borderColor: accent.hex }],
              ]}
            >
              {isQuoteMode && (
                <View
                  style={[
                    styles.selectCheckCircle,
                    isSelected && { backgroundColor: accent.hex, borderColor: accent.hex },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={12} color="#000000" />}
                </View>
              )}
              <Text
                style={[
                  styles.floatingLyricText,
                  isActive && !isQuoteMode && styles.activeFloatingLyricText,
                  isPast && !isQuoteMode && styles.pastFloatingLyricText,
                  isSelected && styles.selectedLyricText,
                ]}
              >
                {item.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Floating Bottom Bar for Story Card Creation */}
      {isQuoteMode && selectedIndices.length > 0 && (
        <View style={styles.floatingBottomBar}>
          <TouchableOpacity
            style={[styles.createCardBtn, { backgroundColor: accent.hex }]}
            onPress={() => setShowStoryModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={17} color="#000000" />
            <Text style={styles.createCardText}>
              Create Story Card ({selectedIndices.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <LyricStoryCardModal
        visible={showStoryModal}
        onClose={() => {
          setShowStoryModal(false);
          setIsQuoteMode(false);
          setSelectedIndices([]);
        }}
        song={currentSong}
        selectedLines={selectedIndices.map((i) => lyricsLines[i]?.text).filter(Boolean)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    marginVertical: 4,
    width: '100%',
  },
  floatingScrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 20,
    gap: 18,
  },
  floatingLineWrapper: {
    paddingVertical: 4,
  },
  activeFloatingLineWrapper: {
    transform: [{ scale: 1.04 }],
  },
  floatingLyricText: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.28)',
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  activeFloatingLyricText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  pastFloatingLyricText: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  floatingLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 12,
  },
  floatingLoadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  floatingEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 30,
    gap: 8,
  },
  floatingEmptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  floatingEmptySub: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
  },
  quoteToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  quoteToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  quoteToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedLineWrapper: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedLyricText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 34,
    flex: 1,
  },
  floatingBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  createCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  createCardText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
