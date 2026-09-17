import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  BackHandler,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { lockPortraitAsync, addOrientationListener } from '@/services/orientationManager';

interface FullscreenVideoOverlayProps {
  player: VideoPlayer | null;
  isVisible: boolean;
  onExitFullscreen: () => void;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const FullscreenVideoOverlay: React.FC<FullscreenVideoOverlayProps> = ({
  player,
  isVisible,
  onExitFullscreen,
}) => {
  const insets = useSafeAreaInsets();
  const { currentSong, isPlaying, togglePlay, seekTo } = useAudio();
  const { position, duration } = useAudioProgress();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [contentFit, setContentFit] = useState<'contain' | 'cover'>('cover');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  // Ripple feedback states for double-tap seek
  const [seekFeedback, setSeekFeedback] = useState<'-10' | '+10' | null>(null);
  const lastTapRef = useRef<number>(0);
  const lastTapXRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated controls opacity
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const seekFeedbackOpacity = useRef(new Animated.Value(0)).current;

  // Auto-hide controls after 3.5 seconds
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = setTimeout(() => {
      if (!isScrubbing) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setControlsVisible(false));
      }
    }, 3500);
  }, [controlsOpacity, isScrubbing]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    resetHideTimer();
  }, [controlsOpacity, resetHideTimer]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    } else {
      showControls();
    }
  }, [controlsVisible, controlsOpacity, showControls]);

  // Handle Double-Tap Seek (YouTube behavior: left side -10s, right side +10s)
  const handleTouch = (evt: any) => {
    const now = Date.now();
    const tapX = evt.nativeEvent.locationX;
    const windowWidth = Dimensions.get('window').width;
    const delta = now - lastTapRef.current;

    if (delta < 300 && Math.abs(tapX - lastTapXRef.current) < 90) {
      // Double tap detected!
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);

      const isLeft = tapX < windowWidth * 0.4;
      const isRight = tapX > windowWidth * 0.6;

      if (isLeft) {
        const target = Math.max(0, position - 10);
        seekTo(target);
        triggerSeekFeedback('-10');
      } else if (isRight) {
        const target = Math.min(duration || 0, position + 10);
        seekTo(target);
        triggerSeekFeedback('+10');
      } else {
        toggleControls();
      }
    } else {
      // Single tap: queue toggle with brief delay
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        toggleControls();
      }, 300);
    }

    lastTapRef.current = now;
    lastTapXRef.current = tapX;
  };

  const triggerSeekFeedback = (dir: '-10' | '+10') => {
    setSeekFeedback(dir);
    seekFeedbackOpacity.setValue(1);
    Animated.timing(seekFeedbackOpacity, {
      toValue: 0,
      duration: 650,
      useNativeDriver: true,
    }).start(() => setSeekFeedback(null));
  };

  // Exit fullscreen cleanly
  const handleExit = useCallback(async () => {
    await lockPortraitAsync();
    onExitFullscreen();
  }, [onExitFullscreen]);

  // Android Back Button handler
  useEffect(() => {
    if (!isVisible) return;

    const onBackPress = () => {
      handleExit();
      return true; // prevent closing full player
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isVisible, handleExit]);

  // Auto-collapse when device is physically turned back to portrait
  useEffect(() => {
    if (!isVisible) return;

    const unsubscribe = addOrientationListener((isLand) => {
      if (!isLand) {
        // Returned to portrait
        onExitFullscreen();
      }
    });

    return () => unsubscribe();
  }, [isVisible, onExitFullscreen]);

  // Initial show on open
  useEffect(() => {
    if (isVisible) {
      showControls();
    } else {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    }
  }, [isVisible, showControls]);

  if (!isVisible || !player) return null;

  const currentDisplayTime = isScrubbing ? scrubValue : position;

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={handleExit}
    >
      <StatusBar hidden={!controlsVisible} animated />
      <View style={styles.container}>
        {/* Fullscreen Video View */}
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit={contentFit}
          nativeControls={false}
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        />

        {/* Double-tap visual feedback */}
        {seekFeedback && (
          <Animated.View
            style={[
              styles.seekFeedbackOverlay,
              seekFeedback === '-10' ? styles.seekFeedbackLeft : styles.seekFeedbackRight,
              { opacity: seekFeedbackOpacity },
            ]}
            pointerEvents="none"
          >
            <Ionicons
              name={seekFeedback === '-10' ? 'play-back' : 'play-forward'}
              size={36}
              color="#ffffff"
            />
            <Text style={styles.seekFeedbackText}>{seekFeedback}s</Text>
          </Animated.View>
        )}

        {/* Tap detector overlay */}
        <TouchableWithoutFeedback onPress={handleTouch}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        {/* YouTube-Style Overlay Controls */}
        <Animated.View
          style={[
            styles.controlsContainer,
            { opacity: controlsOpacity },
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
              paddingLeft: Math.max(insets.left, 24),
              paddingRight: Math.max(insets.right, 24),
            },
          ]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
          {/* Top Bar: Back button, Track Title & Artist, Aspect Ratio Toggle */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={handleExit}
              style={styles.iconButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {currentSong?.name || 'Now Playing'}
              </Text>
              <Text style={styles.headerArtist} numberOfLines={1}>
                {currentSong?.artist || 'Unknown Artist'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                setContentFit((prev) => (prev === 'contain' ? 'cover' : 'contain'));
                resetHideTimer();
              }}
              style={styles.fitToggleBtn}
            >
              <Text style={styles.fitToggleText}>
                {contentFit === 'cover' ? 'FIT' : 'FILL'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Center Playback Controls */}
          <View style={styles.centerControls} pointerEvents="box-none">
            {/* Rewind 10s */}
            <TouchableOpacity
              onPress={() => {
                seekTo(Math.max(0, position - 10));
                resetHideTimer();
              }}
              style={styles.secondaryControlBtn}
            >
              <MaterialIcons name="replay-10" size={36} color="#ffffff" />
            </TouchableOpacity>

            {/* Play / Pause */}
            <TouchableOpacity
              onPress={() => {
                togglePlay();
                resetHideTimer();
              }}
              style={styles.mainPlayBtn}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={40}
                color="#ffffff"
                style={!isPlaying ? { marginLeft: 4 } : undefined}
              />
            </TouchableOpacity>

            {/* Forward 10s */}
            <TouchableOpacity
              onPress={() => {
                seekTo(Math.min(duration || 0, position + 10));
                resetHideTimer();
              }}
              style={styles.secondaryControlBtn}
            >
              <MaterialIcons name="forward-10" size={36} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Bottom Bar: Time, Slider, Duration & Collapse Icon */}
          <View style={styles.bottomBar}>
            <Text style={styles.timeText}>{formatTime(currentDisplayTime)}</Text>

            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={Math.max(1, duration || 1)}
              value={currentDisplayTime}
              minimumTrackTintColor="#38bdf8"
              maximumTrackTintColor="rgba(255, 255, 255, 0.28)"
              thumbTintColor="#38bdf8"
              onSlidingStart={() => {
                setIsScrubbing(true);
                if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
              }}
              onValueChange={(val) => setScrubValue(val)}
              onSlidingComplete={async (val) => {
                setIsScrubbing(false);
                await seekTo(val);
                resetHideTimer();
              }}
            />

            <Text style={styles.timeText}>{formatTime(duration || 0)}</Text>

            {/* Fullscreen Collapse Icon (matches user reference image) */}
            <TouchableOpacity
              onPress={handleExit}
              style={styles.collapseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialIcons name="fullscreen-exit" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 16,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerArtist: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  fitToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  fitToggleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  mainPlayBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  secondaryControlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  collapseBtn: {
    padding: 6,
    marginLeft: 4,
  },
  seekFeedbackOverlay: {
    position: 'absolute',
    top: '38%',
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  seekFeedbackLeft: {
    left: 48,
  },
  seekFeedbackRight: {
    right: 48,
  },
  seekFeedbackText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
});
