import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ToastAndroid,
  Animated,
  PanResponder,
  Easing,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { SourceBadge } from '../common/SourceBadge';
import { LyricsView } from './LyricsView';
import { VideoCanvasView } from './VideoCanvasView';
import { Deck3DCarousel } from '../explore/Deck3DCarousel';
import { QueueModal } from '../explore/QueueModal';
import { OfflineBanner } from '../common/OfflineBanner';
import { AmbientPlayerBackground, getPaletteForSong } from './AmbientPlayerBackground';
import { getHighResCoverArt } from '@/services/imageUtils';
import { registerPlayerSheetListeners } from '@/services/playerSheetController';
import { resolveDirectYouTubeVideoStream } from '@/services/youtubeStreamResolver';

const { width, height } = Dimensions.get('window');

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

interface PlayerScrubberProps {
  primaryColor: string;
  seekTo: (seconds: number) => Promise<void>;
}

/**
 * Isolated Scrubber component that subscribes to useAudioProgress().
 * Only this tiny scrubber re-renders every 500ms — preventing FullPlayerModal,
 * Deck3DCarousel, and AmbientPlayerBackground from re-rendering during playback!
 */
const PlayerScrubber: React.FC<PlayerScrubberProps> = React.memo(({ primaryColor, seekTo }) => {
  const { position, duration } = useAudioProgress();
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    };
  }, []);

  const handleSlidingStart = (value: number) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    setIsSeeking(true);
    setSeekValue(value);
  };

  const handleValueChange = (value: number) => {
    setSeekValue(value);
  };

  const handleSlidingComplete = async (value: number) => {
    setSeekValue(value);
    try {
      await seekTo(value);
    } catch {}
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      setIsSeeking(false);
      setSeekValue(null);
    }, 400);
  };

  const displayPosition = isSeeking && seekValue !== null ? seekValue : position;

  return (
    <View style={styles.scrubberContainer}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 100}
        value={displayPosition}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={primaryColor}
        maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
        thumbTintColor="#ffffff"
      />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
});

export const FullPlayerModal: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    isLoading,
    togglePlay,
    nextSong,
    prevSong,
    seekTo,
    shuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    toggleLike,
    isLiked,
    closeFullPlayer,
    queue,
    history,
    playSong,
  } = useAudio();

  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [canvasVideoUrl, setCanvasVideoUrl] = useState<string | null>(null);

  // Automatically resolve direct YouTube MP4 video stream if playing a YouTube / Opus track
  useEffect(() => {
    let isMounted = true;
    setCanvasVideoUrl(null);
    setShowCanvas(false); // Every song opens as 'Song' filter by default!

    const isYouTube = currentSong?.source === 'youtube' || currentSong?.id?.startsWith('yt_');
    if (isYouTube && currentSong?.id) {
      resolveDirectYouTubeVideoStream(currentSong.id)
        .then((url) => {
          if (isMounted && url) {
            setCanvasVideoUrl(url);
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [currentSong?.id, currentSong?.source]);

  const isLossless = currentSong?.quality === 'Lossless' || currentSong?.source === 'jiosaavn';
  const hasVideoAvailable = Boolean(canvasVideoUrl);

  const { height: windowHeight } = useWindowDimensions();
  const screenHeight = windowHeight || height || 800;

  // Vertical drag & glide animation for instant modal opening & swipe-down collapse
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const isClosingRef = useRef(false);
  const isOpenRef = useRef(false);
  const showLyricsRef = useRef(showLyrics);
  showLyricsRef.current = showLyrics;

  const [visible, setVisible] = useState(false);

  const animateOpen = () => {
    isClosingRef.current = false;
    isOpenRef.current = true;
    setVisible(true);
    setShowCanvas(false); // Every song opens as 'Song' filter by default!

    translateY.stopAnimation();
    Animated.spring(translateY, {
      toValue: 0,
      tension: 140,
      friction: 12,
      velocity: -3.5,
      useNativeDriver: true,
    }).start();
  };

  const animateClose = (velocity?: number) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    isOpenRef.current = false;
    translateY.stopAnimation();

    // Preserve the user's release finger velocity for realistic momentum physics
    const initialVelocity =
      typeof velocity === 'number' && velocity > 0
        ? Math.max(velocity * 1.3, 1.5)
        : 1.5;

    Animated.spring(translateY, {
      toValue: screenHeight,
      tension: 80,
      friction: 12,
      velocity: initialVelocity,
      useNativeDriver: true,
    }).start(() => {
      closeFullPlayer();
      setVisible(false);
      isClosingRef.current = false;
    });
  };

  // Register with zero-latency global controller for instant 0ms touch-down response
  useEffect(() => {
    const unregister = registerPlayerSheetListeners(
      () => animateOpen(),
      (vel) => animateClose(vel)
    );
    return unregister;
  }, [screenHeight]);

  // Handle hardware / gesture back button on Android
  useEffect(() => {
    if (!visible) return;
    const backAction = () => {
      animateClose(1.5);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => {
      backHandler.remove();
    };
  }, [visible]);

  const collapseToMiniPlayer = () => {
    animateClose(1.5);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // If lyrics view is active, allow lyrics scrollview to receive gestures unless dragged from top header area
        if (showLyricsRef.current && evt.nativeEvent.pageY > 140) return false;
        // Claim touch-down responder on all non-touchable surfaces (artwork, background, empty space, titles)
        return true;
      },
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // If lyrics view is active, allow lyrics scrollview to receive gestures unless dragged from top header area
        if (showLyricsRef.current && evt.nativeEvent.pageY > 140) return false;
        // Trigger on any downward swipe anywhere across the full player (supports diagonal thumb arcs)
        return gestureState.dy > 3 && gestureState.dy > Math.abs(gestureState.dx) * 0.3;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        if (showLyricsRef.current && evt.nativeEvent.pageY > 140) return false;
        return gestureState.dy > 3 && gestureState.dy > Math.abs(gestureState.dx) * 0.3;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          // Elastic resistance when dragging upwards
          translateY.setValue(gestureState.dy * 0.18);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Effortless flick or downward drag past 20px threshold initiates momentum glide to MiniPlayer
        if (gestureState.dy > 20 || gestureState.vy > 0.08) {
          animateClose(gestureState.vy);
        } else {
          // Snap back up to full screen
          Animated.spring(translateY, {
            toValue: 0,
            friction: 9,
            tension: 70,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: (_, gestureState) => {
        if (gestureState && (gestureState.dy > 20 || gestureState.vy > 0.08)) {
          animateClose(gestureState.vy);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 9,
            tension: 70,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const liked = currentSong ? isLiked(currentSong.id) : false;
  const palette = currentSong
    ? getPaletteForSong(currentSong.id, currentSong.cover, currentSong.gradientColors)
    : { primary: '#ffffff', secondary: 'rgba(255,255,255,0.4)', tertiary: '#ffffff', base: '#07070a' };

  const currentIdx = currentSong ? queue.findIndex((s) => s.id === currentSong.id) : -1;
  const upcomingQueue = currentIdx !== -1 ? queue.slice(currentIdx + 1) : [];

  const scale = translateY.interpolate({
    inputRange: [0, screenHeight * 0.6, screenHeight],
    outputRange: [1, 0.94, 0.86],
    extrapolate: 'clamp',
  });

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, screenHeight * 0.6, screenHeight],
    outputRange: [1, 0.6, 0],
    extrapolate: 'clamp',
  });

  // PERFORMANCE: Fully unmount heavy GPU animations when the modal is hidden.
  // This prevents 3 blurred image orbs + infinite animation loops from consuming
  // GPU cycles and generating device heat when the player is collapsed.
  if (!visible && !isClosingRef.current) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={collapseToMiniPlayer}
    >
      <View
        style={[
          styles.modalRoot,
          {
            pointerEvents: visible && !isClosingRef.current ? 'auto' : 'none',
          },
        ]}
      >
      {/* Background Dimming Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: backdropOpacity },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={collapseToMiniPlayer}
        />
      </Animated.View>

      {/* Collapsing Full Player Sheet */}
      <Animated.View
        style={[
          styles.modalWrapper,
          {
            transform: [
              { translateY },
              { scale },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <AmbientPlayerBackground
          coverUrl={currentSong ? getHighResCoverArt(currentSong.cover, currentSong.id) : undefined}
          songId={currentSong?.id}
          songName={currentSong?.name}
          artistName={currentSong?.artist}
          gradientColors={currentSong?.gradientColors}
          isPlaying={isPlaying}
        >
          <SafeAreaView style={styles.safeArea}>
            <View>
              {/* Top Swipe Handle (Tappable & Swipable) */}
              <TouchableOpacity
                style={styles.dragHandleContainer}
                activeOpacity={0.7}
                onPress={collapseToMiniPlayer}
              >
                <View style={styles.dragHandlePill} />
              </TouchableOpacity>

              {/* Top Navigation Bar */}
              <View style={styles.topBar}>
                <TouchableOpacity onPress={collapseToMiniPlayer} style={styles.topIconBtn}>
                  <Ionicons name="chevron-down" size={28} color="#ffffff" />
                </TouchableOpacity>

                {/* Song & Video filter switch shown by default for all tracks */}
                <View style={styles.segmentedToggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.segmentedOption,
                      !showCanvas && styles.segmentedOptionActive,
                    ]}
                    onPress={() => setShowCanvas(false)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        !showCanvas && styles.segmentedTextActive,
                      ]}
                    >
                      Song
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.segmentedOption,
                      showCanvas && styles.segmentedOptionActive,
                      (isLossless || !hasVideoAvailable) && styles.segmentedOptionDisabled,
                    ]}
                    onPress={() => {
                      if (isLossless || !hasVideoAvailable) {
                        if (Platform.OS === 'android') {
                          ToastAndroid.show(
                            isLossless
                              ? 'Video not available for Lossless songs'
                              : 'Video is not available for this track',
                            ToastAndroid.SHORT
                          );
                        }
                        return;
                      }
                      setShowCanvas(true);
                      if (showLyrics) setShowLyrics(false);
                    }}
                    activeOpacity={isLossless || !hasVideoAvailable ? 0.9 : 0.8}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        showCanvas && styles.segmentedTextActive,
                        (isLossless || !hasVideoAvailable) && styles.segmentedTextDisabled,
                      ]}
                    >
                      Video
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.topRightActions} />
              </View>
            </View>

            {/* Center Main: 3D Deck Carousel OR Synced Lyrics View OR Video Canvas */}
            <View style={styles.centerContainer}>
              {showLyrics ? (
                <LyricsView />
              ) : (
                <View style={styles.deckOrCanvasContainer}>
                  {currentSong && (
                    <View
                      style={[
                        styles.deckCarouselWrapper,
                        showCanvas && styles.deckCarouselHidden,
                      ]}
                      pointerEvents={showCanvas ? 'none' : 'auto'}
                    >
                      <Deck3DCarousel
                        currentSong={currentSong}
                        upcomingQueue={upcomingQueue}
                        historyStack={history}
                        onSelectSong={(song) => playSong(song)}
                      />
                    </View>
                  )}

                  {/* Keep Canvas mounted to preserve player state and instant time sync */}
                  {!!canvasVideoUrl && (
                    <View
                      style={[
                        styles.canvasWrapper,
                        !showCanvas && styles.canvasHidden,
                      ]}
                      pointerEvents={showCanvas ? 'auto' : 'none'}
                    >
                      <VideoCanvasView
                        videoUrl={canvasVideoUrl}
                        isPlaying={isPlaying}
                        isVisible={showCanvas}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Song Metadata Row */}
            <View style={styles.metaRow}>
              <View style={styles.titleWrapper}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {currentSong?.name || ''}
                </Text>
                <View style={styles.artistSourceRow}>
                  <Text style={styles.artistName} numberOfLines={1}>
                    {currentSong?.artist || ''}
                  </Text>
                  {currentSong?.source && (
                    <SourceBadge
                      source={currentSong.source}
                      quality={currentSong.quality}
                      size="medium"
                    />
                  )}
                </View>
              </View>

              <TouchableOpacity
                onPress={() => currentSong && toggleLike(currentSong.id)}
                style={styles.likeBtn}
              >
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={26}
                  color={liked ? '#FF3366' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>

            {/* Scrubber Progress Slider */}
            <PlayerScrubber primaryColor={palette.primary} seekTo={seekTo} />

            {/* Primary Transport Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={toggleShuffle}
                style={styles.auxBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="shuffle"
                  size={22}
                  color={shuffle ? palette.primary : 'rgba(255,255,255,0.4)'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={prevSong}
                style={styles.skipBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="play-skip-back" size={30} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlay}
                style={[
                  styles.playPauseFab,
                  {
                    backgroundColor: palette.primary,
                    shadowColor: palette.primary,
                  },
                ]}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <Ionicons name="sync" size={32} color="#000000" />
                ) : (
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={36}
                    color="#000000"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={nextSong}
                style={styles.skipBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="play-skip-forward" size={30} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleRepeat}
                style={styles.auxBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={repeatMode === 'one' ? 'repeat-outline' : 'repeat'}
                  size={22}
                  color={
                    repeatMode !== 'off' ? palette.primary : 'rgba(255,255,255,0.4)'
                  }
                />
              </TouchableOpacity>
            </View>

            {/* Bottom Floating Utilities: Lyrics & Queue Toggles */}
            <View style={styles.bottomUtilitiesRow}>

              <TouchableOpacity
                style={[
                  styles.utilityPill,
                  showLyrics && { backgroundColor: palette.primary, borderColor: palette.primary },
                ]}
                onPress={() => {
                  setShowLyrics((prev) => !prev);
                  if (showCanvas) setShowCanvas(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mic-outline"
                  size={16}
                  color={showLyrics ? '#000000' : '#ffffff'}
                />
                <Text
                  style={[
                    styles.utilityText,
                    showLyrics && styles.utilityTextActive,
                  ]}
                >
                  Lyrics
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.utilityPill}
                onPress={() => setShowQueue(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="list-outline" size={16} color="#ffffff" />
                <Text style={styles.utilityText}>Queue ({upcomingQueue.length})</Text>
              </TouchableOpacity>
            </View>

            {/* Offline Status Banner */}
            <OfflineBanner
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                borderTopColor: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                marginTop: 8,
              }}
            />
          </SafeAreaView>
        </AmbientPlayerBackground>

        </Animated.View>

        {/* Embedded Secondary Modals */}
        <QueueModal
          visible={showQueue}
          onClose={() => setShowQueue(false)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  gradientContainer: {
    flex: 1,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  dragHandlePill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  topRightActions: {
    width: 36,
    height: 36,
  },
  topIconBtn: {
    padding: 6,
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerAlbum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  segmentedToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  segmentedOption: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
  },
  segmentedOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  segmentedOptionDisabled: {
    opacity: 0.45,
  },
  segmentedText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  segmentedTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  segmentedTextDisabled: {
    color: 'rgba(255, 255, 255, 0.38)',
  },
  eqBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  eqText: {
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  deckOrCanvasContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  deckCarouselWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckCarouselHidden: {
    opacity: 0,
  },
  canvasWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  canvasHidden: {
    opacity: 0,
    zIndex: -1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleWrapper: {
    flex: 1,
    marginRight: 16,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  artistSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  artistName: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    maxWidth: width * 0.55,
  },
  likeBtn: {
    padding: 6,
  },
  scrubberContainer: {
    marginBottom: 12,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  auxBtn: {
    padding: 10,
  },
  skipBtn: {
    padding: 10,
  },
  playPauseFab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomUtilitiesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  utilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  utilityPillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  utilityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  utilityTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
});
