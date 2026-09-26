import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  BackHandler,
  Animated,
  PanResponder,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { VideoView } from 'expo-video';
import { useVideoPlayerContext, useVideoProgress, type VideoPlayerMode } from '@/contexts/VideoPlayerContext';
import { useAudio } from '@/contexts/AudioContext';
import { FullscreenVideoOverlay } from '../player/FullscreenVideoOverlay';
import { YouTubeVideoSearchResult } from '@/services/youtubeVideoSearchService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// Isolated Miniplayer Progress Bar (only re-renders this tiny view, not the 15 UpNext cards)
const MiniplayerProgressBar: React.FC<{
  onPress: () => void;
  duration: number;
}> = React.memo(({ onPress, duration }) => {
  const { currentTime } = useVideoProgress();
  const widthPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.miniplayerProgressTrack}
    >
      <View
        style={[
          styles.miniplayerProgressFill,
          { width: `${widthPercent}%` },
        ]}
      />
    </TouchableOpacity>
  );
});

// Isolated Watch Time Display (only re-renders time text)
const WatchTimeDisplay: React.FC<{
  duration: number;
  isScrubbing: boolean;
  scrubValue: number | null;
}> = React.memo(({ duration, isScrubbing, scrubValue }) => {
  const { currentTime } = useVideoProgress();
  const displayTime = isScrubbing && scrubValue !== null ? scrubValue : currentTime;

  return (
    <Text style={styles.watchTimeText}>
      {formatTime(displayTime)} / {formatTime(duration)}
    </Text>
  );
});

// Isolated Watch Scrubber Bar (only re-renders slider thumb/track)
const WatchScrubberBar: React.FC<{
  duration: number;
  isScrubbing: boolean;
  scrubValue: number | null;
  onSlidingStart: (val?: number) => void;
  onValueChange: (val: number) => void;
  onSlidingComplete: (val: number) => void;
}> = React.memo(({
  duration,
  isScrubbing,
  scrubValue,
  onSlidingStart,
  onValueChange,
  onSlidingComplete,
}) => {
  const { currentTime } = useVideoProgress();
  const displayTime = isScrubbing && scrubValue !== null ? scrubValue : currentTime;

  return (
    <View style={styles.watchScrubberContainer}>
      <Slider
        style={styles.watchSlider}
        minimumValue={0}
        maximumValue={Math.max(1, duration)}
        value={displayTime}
        minimumTrackTintColor="#FF0000"
        maximumTrackTintColor="rgba(255, 255, 255, 0.25)"
        thumbTintColor="#FF0000"
        onSlidingStart={onSlidingStart}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
      />
    </View>
  );
});

export const GlobalVideoPlayer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    player,
    activeVideo,
    videoStream,
    playerMode,
    isVideoPlaying,
    duration,
    isLoadingStream,
    isFullscreen,
    playlist,
    watchVideoViewRef,
    miniVideoViewRef,
    playVideo,
    togglePlay,
    seekTo,
    collapseToMini,
    maximizeToFull,
    closePlayer,
    nextVideo,
    prevVideo,
    enterFullscreen,
    exitFullscreen,
    triggerPiP,
    handlePiPStart,
    handlePiPStop,
  } = useVideoPlayerContext();
  const { isPlaying: isAudioPlaying } = useAudio();

  const [showWatchControls, setShowWatchControls] = useState(true);
  const watchControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slide-down animation value (starts offscreen at bottom to prevent any initial paint flash)
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const isClosingRef = useRef(false);
  const prevModeRef = useRef<VideoPlayerMode>(playerMode);

  // Floating Miniplayer gesture & entrance animation values
  const miniTranslateX = useRef(new Animated.Value(0)).current;
  const miniTranslateY = useRef(new Animated.Value(0)).current;
  const miniScale = useRef(new Animated.Value(1)).current;
  const miniOpacity = useRef(new Animated.Value(1)).current;

  // Auto-hide controls in full watch view after 3.5s
  const resetWatchControlsTimer = useCallback(() => {
    if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
    watchControlsTimerRef.current = setTimeout(() => {
      setShowWatchControls(false);
    }, 3500);
  }, []);

  const toggleWatchControls = useCallback(() => {
    if (showWatchControls) {
      if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
      setShowWatchControls(false);
    } else {
      setShowWatchControls(true);
      resetWatchControlsTimer();
    }
  }, [showWatchControls, resetWatchControlsTimer]);

  // Synchronous pre-paint entrance animation when playerMode transitions between 'full' and 'mini'
  useLayoutEffect(() => {
    if (playerMode === 'full' && prevModeRef.current !== 'full') {
      isClosingRef.current = false;
      translateY.stopAnimation();
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 110,
        friction: 12,
        velocity: -2.5,
        useNativeDriver: true,
      }).start();
      setShowWatchControls(true);
      resetWatchControlsTimer();
    } else if (playerMode === 'mini' && prevModeRef.current === 'full') {
      // Full watch view remains safely parked offscreen below viewport
      translateY.setValue(SCREEN_HEIGHT);
      // Fluid scale & fade entrance for miniplayer
      miniTranslateX.setValue(0);
      miniTranslateY.setValue(0);
      miniScale.setValue(0.92);
      miniOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(miniOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(miniScale, {
          toValue: 1,
          tension: 130,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevModeRef.current = playerMode;
  }, [playerMode, translateY, miniScale, miniOpacity, miniTranslateX, miniTranslateY, resetWatchControlsTimer]);

  // Maximize from miniplayer to full watch view (delegates entrance spring cleanly to useLayoutEffect)
  const handleMaximize = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = false;
    maximizeToFull();
  }, [maximizeToFull]);

  // Smooth collapse to miniplayer with downward slide animation (no post-animation jump)
  const animateCollapseToMini = useCallback(
    (velocity?: number) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      translateY.stopAnimation();

      const initialVelocity =
        typeof velocity === 'number' && velocity > 0 ? Math.max(velocity * 1.2, 1.5) : 1.5;

      Animated.spring(translateY, {
        toValue: SCREEN_HEIGHT,
        tension: 90,
        friction: 12,
        velocity: initialVelocity,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          collapseToMini();
        }
        isClosingRef.current = false;
      });
    },
    [translateY, collapseToMini]
  );

  // Android back button: collapse full watch view to mini player
  useEffect(() => {
    if (playerMode !== 'full' || isFullscreen) return;
    const backAction = () => {
      animateCollapseToMini(1.5);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [playerMode, isFullscreen, animateCollapseToMini]);

  // PanResponder for smooth gestures on Full Watch mode:
  // - Swipe UP: enters landscape fullscreen mode (YouTube behavior)
  // - Swipe DOWN: smoothly slides down and collapses to miniplayer
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.7;
        // Downward swipe to collapse (> 12px) OR upward swipe to enter fullscreen (< -15px)
        return isVertical && (gestureState.dy > 12 || gestureState.dy < -15);
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          // Elastic dampening when dragged upwards
          translateY.setValue(gestureState.dy * 0.15);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // 1. Deliberate Swipe UP -> Enter Landscape Fullscreen!
        if (gestureState.dy < -25 || gestureState.vy < -0.2) {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 12,
            tension: 100,
            useNativeDriver: true,
          }).start();
          enterFullscreen();
          return;
        }

        // 2. Deliberate Swipe DOWN -> Collapse to Miniplayer!
        if (gestureState.dy > 45 || gestureState.vy > 0.12) {
          animateCollapseToMini(gestureState.vy);
          return;
        }

        // 3. Otherwise: snap back cleanly to 0
        Animated.spring(translateY, {
          toValue: 0,
          friction: 10,
          tension: 80,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: (_, gestureState) => {
        if (gestureState && (gestureState.dy < -25 || gestureState.vy < -0.2)) {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 12,
            tension: 100,
            useNativeDriver: true,
          }).start();
          enterFullscreen();
        } else if (gestureState && (gestureState.dy > 45 || gestureState.vy > 0.12)) {
          animateCollapseToMini(gestureState.vy);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 10,
            tension: 80,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // PanResponder for Floating Miniplayer:
  // - Swipe UP: expands to full watch screen
  // - Swipe LEFT/RIGHT: slides away and closes player
  // - Swipe DOWN: slides down and closes player
  const miniPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isUp = gestureState.dy < -12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.6;
        const isDown = gestureState.dy > 18;
        const isHorizontal = Math.abs(gestureState.dx) > 15;
        return isUp || isDown || isHorizontal;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        miniTranslateX.stopAnimation();
        miniTranslateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          miniTranslateY.setValue(gestureState.dy);
        } else if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          miniTranslateX.setValue(gestureState.dx);
        } else if (gestureState.dy > 0) {
          miniTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // 1. Swipe UP on Miniplayer -> Expand to Full Watch Screen!
        if (gestureState.dy < -20 || gestureState.vy < -0.2) {
          miniTranslateY.setValue(0);
          miniTranslateX.setValue(0);
          handleMaximize();
          return;
        }

        // 2. Swipe Sideways (dismiss miniplayer)
        if (Math.abs(gestureState.dx) > 60 || Math.abs(gestureState.vx) > 0.3) {
          const exitX = gestureState.dx > 0 ? 300 : -300;
          Animated.timing(miniTranslateX, {
            toValue: exitX,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            closePlayer();
            miniTranslateX.setValue(0);
            miniTranslateY.setValue(0);
          });
          return;
        }

        // 3. Swipe Down (dismiss miniplayer)
        if (gestureState.dy > 45 || gestureState.vy > 0.25) {
          Animated.timing(miniTranslateY, {
            toValue: 200,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            closePlayer();
            miniTranslateX.setValue(0);
            miniTranslateY.setValue(0);
          });
          return;
        }

        // Snap back to resting position
        Animated.parallel([
          Animated.spring(miniTranslateX, { toValue: 0, friction: 10, tension: 90, useNativeDriver: true }),
          Animated.spring(miniTranslateY, { toValue: 0, friction: 10, tension: 90, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(miniTranslateX, { toValue: 0, friction: 10, tension: 90, useNativeDriver: true }),
          Animated.spring(miniTranslateY, { toValue: 0, friction: 10, tension: 90, useNativeDriver: true }),
        ]).start();
      },
    })
  ).current;

  // Scrubbing handlers
  const handleSlidingStart = useCallback(
    (val?: number) => {
      if (watchControlsTimerRef.current) clearTimeout(watchControlsTimerRef.current);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      isScrubbingRef.current = true;
      setIsScrubbing(true);
      setScrubValue(val !== undefined ? val : (player?.currentTime ?? 0));
    },
    [player]
  );

  const handleValueChange = useCallback((val: number) => {
    setScrubValue(val);
  }, []);

  const handleSlidingComplete = useCallback(
    (val: number) => {
      setScrubValue(val);
      seekTo(val);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        setScrubValue(null);
      }, 400);
      resetWatchControlsTimer();
    },
    [seekTo, resetWatchControlsTimer]
  );

  if (playerMode === 'hidden' || !activeVideo) {
    return null;
  }

  const effectiveDuration = duration > 0 ? duration : activeVideo?.durationSeconds || 0;
  const isLiveVideo = Boolean(activeVideo?.isLive || videoStream?.isLive);

  // Up next videos from current playlist
  const upNextVideos = playlist.filter((v) => v.videoId !== activeVideo.videoId).slice(0, 15);

  // Native PiP is strictly reserved for actively playing YSearch videos - never regular audio songs
  const isPiPAllowed = Boolean(isVideoPlaying && !isAudioPlaying && activeVideo);

  return (
    <>
      {/* 1. Floating Miniplayer (matching YouTube: docked in bottom right corner across all screens) */}
      {playerMode === 'mini' && !isFullscreen && (
        <Animated.View
          {...miniPanResponder.panHandlers}
          style={[
            styles.miniplayerContainer,
            {
              bottom: Math.max(insets.bottom, 12) + (Platform.OS === 'ios' ? 70 : 60),
              transform: [
                { translateX: miniTranslateX },
                { translateY: miniTranslateY },
                { scale: miniScale },
              ],
              opacity: miniOpacity,
            },
          ]}
        >
          {/* Video View Box with tap-to-maximize touchable & close button */}
          <View style={styles.miniplayerVideoBox}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleMaximize}
              style={StyleSheet.absoluteFill}
            >
              {/* Background thumbnail avoids black gap during native surface initialization */}
              <ExpoImage
                source={{ uri: activeVideo.thumbnail }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              {videoStream && player && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <VideoView
                    ref={miniVideoViewRef}
                    key={`mini-video-${activeVideo.videoId}`}
                    style={StyleSheet.absoluteFill}
                    player={player}
                    contentFit="contain"
                    nativeControls={false}
                    surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
                    allowsPictureInPicture={isPiPAllowed}
                    startsPictureInPictureAutomatically={isPiPAllowed}
                    onPictureInPictureStart={handlePiPStart}
                    onPictureInPictureStop={handlePiPStop}
                  />
                </View>
              )}
            </TouchableOpacity>

            {/* LIVE Badge on Floating Miniplayer */}
            {isLiveVideo && (
              <View style={styles.miniLiveBadge} pointerEvents="none">
                <View style={styles.liveDot} />
                <Text style={styles.miniLiveText}>LIVE</Text>
              </View>
            )}

            {/* Close Button ('x') */}
            <TouchableOpacity
              style={styles.miniplayerCloseBtn}
              onPress={closePlayer}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={15} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Thin Red Progress Bar Indicator */}
          <MiniplayerProgressBar onPress={handleMaximize} duration={effectiveDuration} />

          {/* Mini Control Bar: Replay 10s, Play/Pause, Forward 10s */}
          <View style={styles.miniplayerControlsBar}>
            <TouchableOpacity
              onPress={() => seekTo(Math.max(0, (player?.currentTime ?? 0) - 10))}
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="replay-10" size={20} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlay}
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isVideoPlaying ? 'pause' : 'play'}
                size={22}
                color="#ffffff"
                style={!isVideoPlaying ? { marginLeft: 2 } : undefined}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => seekTo(Math.min(effectiveDuration, (player?.currentTime ?? 0) + 10))}
              style={styles.miniControlBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="forward-10" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* 2. Full Portrait Watch Screen with slide-down gesture */}
      {playerMode === 'full' && !isFullscreen && (
        <Animated.View
          style={[
            styles.watchScreenOverlay,
            { transform: [{ translateY }] },
          ]}
        >
          <SafeAreaView
            style={[styles.watchScreenContainer, { backgroundColor: '#0f0f0f' }]}
            edges={['top', 'bottom']}
          >
            {/* Gesture-interactive top bar & 16:9 Video Canvas Frame */}
            <View {...panResponder.panHandlers}>
              {/* Top Drag Handle & Gesture Area */}
              <View style={styles.gestureHeaderArea}>
                <View style={styles.dragPillIndicator} />
              </View>

              {/* 16:9 Video Canvas Frame */}
              <View style={styles.watchVideoCanvas}>
                {videoStream && player ? (
                  <View style={StyleSheet.absoluteFill}>
                    <ExpoImage
                      source={{ uri: activeVideo.thumbnail }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <VideoView
                        ref={watchVideoViewRef}
                        key={`watch-video-${activeVideo.videoId}`}
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="contain"
                        nativeControls={false}
                        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
                        allowsPictureInPicture={isPiPAllowed}
                        startsPictureInPictureAutomatically={isPiPAllowed}
                        onPictureInPictureStart={handlePiPStart}
                        onPictureInPictureStop={handlePiPStop}
                      />
                    </View>

                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={toggleWatchControls}
                      style={StyleSheet.absoluteFill}
                    >
                    {/* Watch Controls Overlay */}
                    {showWatchControls && (
                      <View style={styles.watchControlsOverlay}>
                        <LinearGradient
                          colors={['rgba(0,0,0,0.65)', 'transparent', 'rgba(0,0,0,0.7)']}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />

                        {/* Top Bar: Chevron-down (collapse to miniplayer) & Actions */}
                        <View style={styles.watchTopBar}>
                          <TouchableOpacity
                            onPress={() => animateCollapseToMini(1.5)}
                            style={styles.watchChevronBtn}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons name="chevron-down" size={28} color="#ffffff" />
                          </TouchableOpacity>

                          <View style={styles.watchTopRightActions}>
                            {/* PiP Button */}
                            <TouchableOpacity
                              style={styles.watchTopActionBtn}
                              onPress={triggerPiP}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="picture-in-picture-alt" size={22} color="#ffffff" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.watchTopActionBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="cast" size={20} color="#ffffff" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.watchTopActionBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="closed-caption-off" size={22} color="#ffffff" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.watchTopActionBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="settings-outline" size={20} color="#ffffff" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Center Controls: Previous, Replay 10, Big Play/Pause, Forward 10, Next */}
                        <View style={styles.watchCenterControls}>
                          <TouchableOpacity
                            onPress={() => {
                              prevVideo();
                              resetWatchControlsTimer();
                            }}
                            style={styles.watchPrevNextBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="play-skip-back" size={28} color="#ffffff" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              seekTo(Math.max(0, (player?.currentTime ?? 0) - 10));
                              resetWatchControlsTimer();
                            }}
                            style={styles.watchSecondarySeekBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="replay-10" size={30} color="#ffffff" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              togglePlay();
                              resetWatchControlsTimer();
                            }}
                            style={styles.watchPlayPauseBtn}
                          >
                            <Ionicons
                              name={isVideoPlaying ? 'pause' : 'play'}
                              size={36}
                              color="#ffffff"
                              style={!isVideoPlaying ? { marginLeft: 3 } : undefined}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              seekTo(Math.min(effectiveDuration, (player?.currentTime ?? 0) + 10));
                              resetWatchControlsTimer();
                            }}
                            style={styles.watchSecondarySeekBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="forward-10" size={30} color="#ffffff" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              nextVideo();
                              resetWatchControlsTimer();
                            }}
                            style={styles.watchPrevNextBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="play-skip-forward" size={28} color="#ffffff" />
                          </TouchableOpacity>
                        </View>

                        {/* Bottom Row of Video: Time Text & Fullscreen Button */}
                        <View style={styles.watchBottomBar}>
                          {isLiveVideo ? (
                            <View style={styles.watchLiveIndicator}>
                              <View style={styles.liveDot} />
                              <Text style={styles.watchLiveText}>LIVE</Text>
                            </View>
                          ) : (
                            <WatchTimeDisplay
                              duration={effectiveDuration}
                              isScrubbing={isScrubbing}
                              scrubValue={scrubValue}
                            />
                          )}

                          <TouchableOpacity
                            onPress={enterFullscreen}
                            style={styles.watchFullscreenBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="fullscreen" size={26} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.loadingStreamPlaceholder}>
                  <ExpoImage
                    source={{ uri: activeVideo.thumbnail }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                  <View style={styles.loadingDimmer}>
                    <ActivityIndicator size="large" color="#FF0000" />
                    <Text style={styles.resolvingStreamText}>
                      {isLoadingStream ? 'Connecting video stream...' : 'Preparing playback...'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Red Scrub Slider right below Video Canvas */}
          <WatchScrubberBar
            duration={effectiveDuration}
            isScrubbing={isScrubbing}
            scrubValue={scrubValue}
            onSlidingStart={handleSlidingStart}
            onValueChange={handleValueChange}
            onSlidingComplete={handleSlidingComplete}
          />

            {/* Watch Details & Up Next ScrollView */}
            <ScrollView
              style={styles.watchDetailsScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Video Title */}
              <Text style={styles.watchVideoTitle} numberOfLines={3}>
                {activeVideo.title}
              </Text>

              {/* Video Stats */}
              <View style={styles.watchStatsRow}>
                {isLiveVideo && (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                )}
                <Text style={styles.watchVideoStats}>
                  {activeVideo.viewCount || '10K views'}
                  {activeVideo.publishedTime ? ` • ${activeVideo.publishedTime}` : ''}
                </Text>
              </View>

              {/* Channel Row */}
              <View style={styles.watchChannelRow}>
                {activeVideo.channelAvatar && !activeVideo.channelAvatar.includes('ui-avatars.com') ? (
                  <ExpoImage
                    source={{ uri: activeVideo.channelAvatar }}
                    style={styles.watchChannelAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.watchChannelAvatarPlaceholder}>
                    <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                  </View>
                )}

                <View style={styles.watchChannelTextCol}>
                  <Text style={styles.watchChannelName} numberOfLines={1}>
                    {activeVideo.author}
                  </Text>
                  <Text style={styles.watchChannelSubBadge}>Official Channel</Text>
                </View>
              </View>

              <View style={styles.watchDivider} />

              {/* Up Next / Related Videos Header */}
              {upNextVideos.length > 0 && (
                <>
                  <View style={styles.upNextSectionHeader}>
                    <Text style={styles.upNextSectionTitle}>Up Next</Text>
                  </View>

                  {/* Up Next Cards */}
                  {upNextVideos.map((item: YouTubeVideoSearchResult) => (
                    <TouchableOpacity
                      key={`upnext-${item.videoId}`}
                      style={styles.upNextCard}
                      onPress={() => playVideo(item, playlist)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.upNextThumbContainer}>
                        <ExpoImage
                          source={{ uri: item.thumbnail }}
                          style={styles.upNextThumb}
                          contentFit="cover"
                        />
                        {item.isLive ? (
                          <View style={styles.upNextLiveBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>LIVE</Text>
                          </View>
                        ) : item.duration ? (
                          <View style={styles.upNextDurationBadge}>
                            <Text style={styles.upNextDurationText}>{item.duration}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.upNextMetaCol}>
                        <Text style={styles.upNextTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={styles.upNextSubtitle} numberOfLines={1}>
                          {item.author}
                          {item.viewCount ? ` • ${item.viewCount}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      )}

      {/* 3. Shared Fullscreen Video Overlay */}
      {isFullscreen && player && activeVideo && (
        <FullscreenVideoOverlay
          player={player}
          isVisible={isFullscreen}
          qualityBadge={videoStream?.qualityBadge || '1080p HD'}
          title={activeVideo.title}
          artist={activeVideo.author}
          isPlaying={isVideoPlaying}
          duration={effectiveDuration}
          onTogglePlay={togglePlay}
          onSeekTo={seekTo}
          onExitFullscreen={exitFullscreen}
          isLive={isLiveVideo}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  // Floating Miniplayer
  miniplayerContainer: {
    position: 'absolute',
    right: 14,
    width: 172,
    borderRadius: 12,
    backgroundColor: '#181818',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    overflow: 'hidden',
    zIndex: 99999,
  },
  miniplayerVideoBox: {
    width: '100%',
    height: 97,
    backgroundColor: '#000000',
    position: 'relative',
  },
  miniplayerCloseBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  miniplayerProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  miniplayerProgressFill: {
    height: '100%',
    backgroundColor: '#FF0000',
  },
  miniplayerControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 7,
    backgroundColor: '#181818',
  },
  miniControlBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniLiveBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(204, 0, 0, 0.92)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 5,
  },
  miniLiveText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
  },
  liveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Full Portrait Watch View
  watchScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99990,
    backgroundColor: '#0f0f0f',
  },
  watchScreenContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  gestureHeaderArea: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  dragPillIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  watchVideoCanvas: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
    backgroundColor: '#000000',
    position: 'relative',
  },
  watchControlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 12,
  },
  watchTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  watchChevronBtn: {
    padding: 4,
  },
  watchTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  watchTopActionBtn: {
    padding: 4,
  },
  watchCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  watchPrevNextBtn: {
    padding: 6,
  },
  watchSecondarySeekBtn: {
    padding: 6,
  },
  watchPlayPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  watchLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(204, 0, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 5,
  },
  watchLiveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  watchTimeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  watchFullscreenBtn: {
    padding: 4,
  },
  loadingStreamPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  loadingDimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  resolvingStreamText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Scrubber Slider
  watchScrubberContainer: {
    width: '100%',
    height: 18,
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  watchSlider: {
    width: '100%',
    height: 20,
    margin: 0,
    padding: 0,
  },

  // Watch Details Section
  watchDetailsScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  watchVideoTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 6,
  },
  watchStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(204, 0, 0, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    gap: 4,
  },
  livePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  watchVideoStats: {
    color: '#aaaaaa',
    fontSize: 12,
  },
  watchChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  watchChannelAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#282828',
  },
  watchChannelAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#282828',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchChannelTextCol: {
    flex: 1,
  },
  watchChannelName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  watchChannelSubBadge: {
    color: '#888888',
    fontSize: 11,
    marginTop: 1,
  },
  watchDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 12,
  },

  // Up Next Section
  upNextSectionHeader: {
    marginBottom: 10,
  },
  upNextSectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  upNextCard: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  upNextThumbContainer: {
    width: 120,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    position: 'relative',
  },
  upNextThumb: {
    width: '100%',
    height: '100%',
  },
  upNextLiveBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(204, 0, 0, 0.92)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  upNextDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  upNextDurationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  upNextMetaCol: {
    flex: 1,
    justifyContent: 'center',
  },
  upNextTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  upNextSubtitle: {
    color: '#888888',
    fontSize: 11,
  },
});
