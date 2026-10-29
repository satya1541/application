import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
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

  // Auto-scroll & manual touch coordination
  const [isScrolledAway, setIsScrolledAway] = useState<boolean>(false);
  const isUserInteractingRef = useRef<boolean>(false);
  const userScrollResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollViewRef = useRef<ScrollView | null>(null);
  const containerHeightRef = useRef<number>(450);
  const lineLayoutsRef = useRef<{ [index: number]: { y: number; height: number } }>({});

  // Extract YouTube video ID if available
  const videoIdHint = useMemo(() => {
    if (!currentSong) return undefined;
    if (currentSong.id.startsWith('yt_')) return currentSong.id.replace('yt_', '');
    if (currentSong.streamUrl) {
      const match = currentSong.streamUrl.match(/(?:v=|vi\/|youtu\.be\/|\/v\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    }
    return undefined;
  }, [currentSong?.id, currentSong?.streamUrl]);

  useEffect(() => {
    if (!currentSong) return;

    let isMounted = true;
    setIsLoading(true);
    setIsQuoteMode(false);
    setSelectedIndices([]);
    setIsScrolledAway(false);
    lineLayoutsRef.current = {};

    // 1. If song already has catalog lyrics, parse and display them immediately
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

    // 2. Fetch live from LRCLIB & YouTube InnerTube (with CJK guard and title validation)
    getLiveLyrics(currentSong.name, currentSong.artist, currentSong.duration, videoIdHint)
      .then((res) => {
        if (!isMounted) return;
        if (res.lines && res.lines.length > 0) {
          setLyricsLines(res.lines);
          setIsSynced(res.synced);
          setSourceName(
            res.source === 'lrclib'
              ? 'LRCLIB'
              : res.source === 'youtube'
              ? 'YouTube Official'
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
      if (userScrollResumeTimerRef.current) clearTimeout(userScrollResumeTimerRef.current);
    };
  }, [currentSong?.id, currentSong?.name, currentSong?.artist, videoIdHint]);

  // Find active line index based on playback position
  const activeIndex = useMemo(() => {
    if (!lyricsLines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyricsLines.length; i++) {
      if (position >= lyricsLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [position, lyricsLines]);

  const activeIndexRef = useRef<number>(activeIndex);
  activeIndexRef.current = activeIndex;

  // Exact centering of active line in viewport
  const scrollToActiveLine = useCallback((index: number, animated = true) => {
    if (index < 0 || isQuoteMode) return;
    const line = lineLayoutsRef.current[index];
    if (line && scrollViewRef.current) {
      // Calculate scroll offset to place the active line in the vertical center of the container
      const targetY = Math.max(
        0,
        line.y - (containerHeightRef.current / 2) + (line.height / 2)
      );
      scrollViewRef.current.scrollTo({ y: targetY, animated });
    }
  }, [isQuoteMode]);

  // Synchronized Auto-Scroll trigger whenever activeIndex changes (only when user isn't dragging)
  useEffect(() => {
    if (activeIndex >= 0 && !isUserInteractingRef.current) {
      scrollToActiveLine(activeIndex, true);
    }
  }, [activeIndex, scrollToActiveLine]);

  // Handle user scroll gestures to prevent fighting the thumb
  const handleScrollBeginDrag = () => {
    isUserInteractingRef.current = true;
    setIsScrolledAway(true);
    if (userScrollResumeTimerRef.current) clearTimeout(userScrollResumeTimerRef.current);
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (userScrollResumeTimerRef.current) clearTimeout(userScrollResumeTimerRef.current);
    // After 3.5s of no user movement, gently resume auto-scroll
    userScrollResumeTimerRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
      setIsScrolledAway(false);
      scrollToActiveLine(activeIndexRef.current, true);
    }, 3500);
  };

  const handleSyncBackToAudio = () => {
    if (userScrollResumeTimerRef.current) clearTimeout(userScrollResumeTimerRef.current);
    isUserInteractingRef.current = false;
    setIsScrolledAway(false);
    scrollToActiveLine(activeIndex, true);
  };

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
      isUserInteractingRef.current = false;
      setIsScrolledAway(false);
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
        <ActivityIndicator size="small" color="#ffffff" />
        <Text style={styles.floatingLoadingText}>Fetching verified lyrics...</Text>
      </View>
    );
  }

  if (lyricsLines.length === 0) {
    return (
      <View style={styles.floatingEmptyContainer}>
        <Ionicons name="musical-notes-outline" size={42} color="rgba(255,255,255,0.25)" />
        <Text style={styles.floatingEmptyTitle}>No Lyrics Found</Text>
        <Text style={styles.floatingEmptySub}>
          Synchronized lyrics are not available for this track yet.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.floatingContainer}
      onLayout={(e) => {
        containerHeightRef.current = e.nativeEvent.layout.height;
      }}
    >
      {/* Top Action Toolbar */}
      <View style={styles.quoteToolbar}>
        {sourceName ? (
          <View style={styles.sourcePill}>
            <Ionicons name="shield-checkmark" size={12} color="#10B981" />
            <Text style={styles.sourcePillText}>{sourceName}</Text>
          </View>
        ) : <View />}

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
            name={isQuoteMode ? 'close' : 'sparkles-outline'}
            size={14}
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
          isQuoteMode && selectedIndices.length > 0 && { paddingBottom: 90 },
        ]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleScrollEndDrag}
        scrollEventThrottle={16}
      >
        {lyricsLines.map((item, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const isSelected = selectedIndices.includes(index);

          return (
            <TouchableOpacity
              key={`${index}-${item.time}`}
              activeOpacity={0.75}
              onPress={() => handleLinePress(index, item.time)}
              onLongPress={() => handleLineLongPress(index)}
              onLayout={(e) => {
                lineLayoutsRef.current[index] = {
                  y: e.nativeEvent.layout.y,
                  height: e.nativeEvent.layout.height,
                };
              }}
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

      {/* Floating "Sync to Audio" pill when user has manually scrolled away */}
      {!isQuoteMode && isScrolledAway && activeIndex >= 0 && (
        <TouchableOpacity
          style={styles.syncBackPill}
          onPress={handleSyncBackToAudio}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-down" size={14} color="#000000" />
          <Text style={styles.syncBackPillText}>Sync to Audio</Text>
        </TouchableOpacity>
      )}

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
    position: 'relative',
  },
  floatingScrollContent: {
    paddingHorizontal: 8,
    paddingTop: 40,
    paddingBottom: 160,
    gap: 16,
  },
  floatingLineWrapper: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  activeFloatingLineWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  floatingLyricText: {
    fontSize: 23,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.26)',
    lineHeight: 33,
    letterSpacing: -0.3,
  },
  activeFloatingLyricText: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 37,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  pastFloatingLyricText: {
    color: 'rgba(255, 255, 255, 0.58)',
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
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  quoteToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  sourcePillText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  quoteToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  quoteToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedLineWrapper: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 32,
    flex: 1,
  },
  syncBackPill: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  syncBackPillText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
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
