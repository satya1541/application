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
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { lockPortraitAsync, addOrientationListener } from '@/services/orientationManager';

interface FullscreenVideoOverlayProps {
  player: VideoPlayer | null;
  isVisible: boolean;
  qualityBadge?: string;
  onExitFullscreen: () => void;
  // Optional standalone player props (for independent players like YSearch)
  title?: string;
  artist?: string;
  isPlaying?: boolean;
  position?: number;
  duration?: number;
  onTogglePlay?: () => void;
  onSeekTo?: (seconds: number) => void;
  isLive?: boolean;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const FullscreenVideoOverlay: React.FC<FullscreenVideoOverlayProps> = ({
  player,
  isVisible,
  qualityBadge = '1080p',
  onExitFullscreen,
  title: overrideTitle,
  artist: overrideArtist,
  isPlaying: overrideIsPlaying,
  position: overridePosition,
  duration: overrideDuration,
  onTogglePlay: overrideTogglePlay,
  onSeekTo: overrideSeekTo,
  isLive = false,
}) => {
  const insets = useSafeAreaInsets();
  const { currentSong, isPlaying: audioIsPlaying, togglePlay: audioTogglePlay, seekTo: audioSeekTo } = useAudio();
  const { position: audioPosition, duration: audioDuration } = useAudioProgress();

  const isPlaying = overrideIsPlaying !== undefined ? overrideIsPlaying : audioIsPlaying;
  const position = overridePosition !== undefined ? overridePosition : audioPosition;
  const duration = overrideDuration !== undefined ? overrideDuration : audioDuration;
  const togglePlay = overrideTogglePlay || audioTogglePlay;
  const seekTo = overrideSeekTo || audioSeekTo;
  const displayTitle = overrideTitle || currentSong?.name || 'Now Playing';
  const displayArtist = overrideArtist || currentSong?.artist || 'Unknown Artist';


  // Prevent screen auto-sleep while watching fullscreen video
  useEffect(() => {
    if (isVisible) {
      activateKeepAwakeAsync('fullscreen_video').catch(() => {});
      return () => {
        deactivateKeepAwake('fullscreen_video');
      };
    } else {
      deactivateKeepAwake('fullscreen_video');
    }
  }, [isVisible]);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [contentFit, setContentFit] = useState<'contain' | 'cover'>('cover');
  const [isVivid, setIsVivid] = useState<boolean>(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoViewRef = useRef<VideoView>(null);

  const handleTriggerPiP = useCallback(async () => {
    try {
      if (videoViewRef.current) {
        await videoViewRef.current.startPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP start error in fullscreen:', err);
    }
  }, []);

  // Ensure player emits timeUpdate events at 1.0s interval for smooth UI with low CPU/thermal usage
  useEffect(() => {
    if (!player) return;
    try {
      player.timeUpdateEventInterval = 1.0;
    } catch {}
  }, [player]);

  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    };
  }, []);

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

  // Handle slider scrubbing gestures with rubber-band protection
  const handleSlidingStart = useCallback((val?: number) => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    setIsScrubbing(true);
    setScrubValue(val !== undefined ? val : position);
  }, [position]);

  const handleValueChange = useCallback((val: number) => {
    setScrubValue(val);
  }, []);

  const handleSlidingComplete = useCallback(async (val: number) => {
    setScrubValue(val);
    try {
      await seekTo(val);
    } catch {}
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      setIsScrubbing(false);
      setScrubValue(null);
    }, 400);
    resetHideTimer();
  }, [seekTo, resetHideTimer]);

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

  const currentDisplayTime = isScrubbing && scrubValue !== null ? scrubValue : position;

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
        {/* Fullscreen Video View: Native surfaceView for direct hardware compositor overlay, full 10-bit HDR/DCI-P3 color and maximum sharpness */}
        <VideoView
          ref={videoViewRef}
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit={contentFit}
          nativeControls={false}
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
          allowsPictureInPicture={true}
          startsPictureInPictureAutomatically={true}
        />

        {/* Vivid / HDR Color Boost Layer: Micro-contrast enhancer and warm color saturation pop */}
        {isVivid && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Subtle cinematic micro-contrast vignette to deepen black levels without clipping highlights */}
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.16)', 'transparent', 'rgba(0, 0, 0, 0.22)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Subtle warm saturation lift (enhances reds, golds, skin tones & lights) */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(255, 120, 0, 0.015)' },
              ]}
              pointerEvents="none"
            />
          </View>
        )}

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
          {/* Top Bar: Back button, Track Title & Artist, Quality Badge, Vivid Mode Toggle, Aspect Ratio Toggle */}
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
                {displayTitle}
              </Text>
              <Text style={styles.headerArtist} numberOfLines={1}>
                {displayArtist}
              </Text>
            </View>

            {/* Quality Badge (e.g. 4K UHD, 2K QHD, 1080p60) */}
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityBadgeText}>{qualityBadge || '1080p'}</Text>
            </View>

            {/* LIVE Stream Badge in Header */}
            {isLive && (
              <View style={styles.liveBadgeHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeHeaderText}>LIVE</Text>
              </View>
            )}

            {/* Vivid / HDR Color Boost Mode Toggle */}
            <TouchableOpacity
              onPress={() => {
                setIsVivid((prev) => !prev);
                resetHideTimer();
              }}
              style={[styles.vividToggleBtn, isVivid && styles.vividToggleBtnActive]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="sparkles"
                size={12}
                color={isVivid ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.vividToggleText, isVivid && styles.vividToggleTextActive]}>
                VIVID
              </Text>
            </TouchableOpacity>

            {/* Aspect Ratio Toggle (FIT / FILL) */}
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

            {/* Picture-in-Picture Button */}
            <TouchableOpacity
              onPress={handleTriggerPiP}
              style={styles.pipToggleBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="picture-in-picture-alt" size={18} color="#ffffff" />
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
            {isLive ? (
              <View style={styles.fullscreenLiveBar}>
                <View style={styles.liveDot} />
                <Text style={styles.fullscreenLiveText}>LIVE STREAM</Text>
              </View>
            ) : (
              <>
                <Text style={styles.timeText}>{formatTime(currentDisplayTime)}</Text>

                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={Math.max(1, duration || 1)}
                  value={currentDisplayTime}
                  minimumTrackTintColor="#38bdf8"
                  maximumTrackTintColor="rgba(255, 255, 255, 0.28)"
                  thumbTintColor="#38bdf8"
                  onSlidingStart={handleSlidingStart}
                  onValueChange={handleValueChange}
                  onSlidingComplete={handleSlidingComplete}
                />

                <Text style={styles.timeText}>{formatTime(duration || 0)}</Text>
              </>
            )}

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
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    marginRight: 8,
  },
  qualityBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  vividToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginRight: 8,
  },
  vividToggleBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  vividToggleText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  vividToggleTextActive: {
    color: '#ffffff',
    fontWeight: '800',
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
  pipToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
  liveBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#CC0000',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  liveBadgeHeaderText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  fullscreenLiveBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  fullscreenLiveText: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
