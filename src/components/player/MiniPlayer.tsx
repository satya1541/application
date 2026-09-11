import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getSafeCoverArt, isYouTubeCover } from '@/services/imageUtils';
import { triggerOpenFullPlayer } from '@/services/playerSheetController';

const { width } = Dimensions.get('window');

/** Isolated progress bar that subscribes to useAudioProgress().
 *  Only this tiny 2px strip re-renders every 500ms — not the full MiniPlayer. */
const MiniPlayerProgressBar: React.FC = React.memo(() => {
  const { accent } = useAppTheme();
  const { position, duration } = useAudioProgress();
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
  return (
    <View style={progressStyles.progressBarBackground}>
      <View
        style={[
          progressStyles.progressBarFill,
          {
            width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            backgroundColor: accent.hex,
          },
        ]}
      />
    </View>
  );
});

const progressStyles = StyleSheet.create({
  progressBarBackground: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
});

interface MiniPlayerProps {
  bottomOffset?: number;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ bottomOffset }) => {
  const { surfaceHex, accent, themeMode } = useAppTheme();
  const {
    currentSong,
    isPlaying,
    isLoading,
    togglePlay,
    nextSong,
    prevSong,
    openFullPlayer,
    dismissPlayer,
    openQueueModal,
  } = useAudio();

  const translateX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isDragging = useRef(false);
  const isDismissing = useRef(false);

  // Reset positioning & opacity whenever a new song starts
  useEffect(() => {
    if (currentSong) {
      isDismissing.current = false;
      translateX.setValue(0);
      fadeAnim.setValue(1);
    }
  }, [currentSong?.id]);

  const handlePressMiniPlayer = () => {
    if (isDragging.current || isDismissing.current) return;
    triggerOpenFullPlayer();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Activate horizontal swipe only if horizontal movement dominates and exceeds threshold
        const isHorizontal =
          Math.abs(gestureState.dx) > 14 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return isHorizontal && !isDismissing.current;
      },
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isDismissing.current) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setTimeout(() => {
          isDragging.current = false;
        }, 50);

        if (isDismissing.current) return;

        // Slide Right Dismiss Threshold
        if (gestureState.dx > 80 || gestureState.vx > 0.4) {
          isDismissing.current = true;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: width,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start(() => {
            dismissPlayer();
          });
        }
        // Slide Left Dismiss Threshold
        else if (gestureState.dx < -80 || gestureState.vx < -0.4) {
          isDismissing.current = true;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -width,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start(() => {
            dismissPlayer();
          });
        }
        // Snap back to center
        else {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!currentSong) return null;

  const handleDismiss = (e?: any) => {
    e?.stopPropagation?.();
    if (isDismissing.current) return;
    isDismissing.current = true;

    // Single-pass, smooth dismiss animation without snapping back
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: width * 0.35,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissPlayer();
    });
  };

  // Directly flush with the bottom navigation bar (iOS: 84, Android: 64) with ZERO gap
  const computedBottom =
    bottomOffset !== undefined ? bottomOffset : Platform.OS === 'ios' ? 84 : 64;

  // Fade out slightly as user drags left or right, multiplied by fadeAnim
  const swipeOpacity = translateX.interpolate({
    inputRange: [-width * 0.7, 0, width * 0.7],
    outputRange: [0.15, 1, 0.15],
    extrapolate: 'clamp',
  });
  const combinedOpacity = Animated.multiply(swipeOpacity, fadeAnim);

  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        {
          bottom: computedBottom,
          transform: [{ translateX }],
          opacity: combinedOpacity,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: themeMode === 'oled' ? '#080808' : surfaceHex,
            borderTopColor: themeMode === 'oled' ? '#181818' : 'rgba(255, 255, 255, 0.12)',
          },
        ]}
      >
        {/* Top 2px Progress bar - isolated to prevent 500ms re-renders */}
        <MiniPlayerProgressBar />

        <View style={styles.contentRow}>
          {/* Main Tappable Area: Left Thumbnail + Center Info */}
          <TouchableOpacity
            style={styles.mainTouchArea}
            activeOpacity={0.88}
            delayPressIn={0}
            onPress={handlePressMiniPlayer}
          >
            {/* Left Thumbnail */}
            <View style={styles.coverWrapper}>
              <ExpoImage
                source={{ uri: getSafeCoverArt(currentSong.cover, currentSong.id) }}
                style={[
                  styles.cover,
                  isYouTubeCover(currentSong.cover, currentSong.id, currentSong.source) && styles.youtubeCrop,
                ]}
                contentFit="cover"
                transition={100}
                cachePolicy="memory-disk"
              />
            </View>

            {/* Center Info */}
            <View style={styles.infoContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {currentSong.name}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {currentSong.artist}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Right Action Buttons (Previous, Play/Pause, Next, Like) */}
          <View style={styles.actions}>
            {/* Previous Track */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                prevSong();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={20} color="#ffffff" />
            </TouchableOpacity>

            {/* Play / Pause Toggle */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                togglePlay();
              }}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <Ionicons name="sync" size={24} color="#ffffff" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={26}
                  color="#ffffff"
                />
              )}
            </TouchableOpacity>

            {/* Next Track */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                nextSong();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-forward" size={20} color="#ffffff" />
            </TouchableOpacity>

            {/* Queue Button */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                openQueueModal();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Ionicons name="list" size={20} color={accent.hex} />
            </TouchableOpacity>

            {/* Close / Dismiss Cross Button */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleDismiss}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 12 }}
            >
              <Ionicons
                name="close"
                size={22}
                color="#b3b3b3"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  mainTouchArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  outerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  container: {
    backgroundColor: '#202020',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 10,
    borderTopWidth: 0.6,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  progressBarBackground: {
    height: 2.5,
    width: '100%',
    backgroundColor: '#333333',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coverWrapper: {
    width: 42,
    height: 42,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  youtubeCrop: {
    transform: [{ scale: 1.35 }],
  },
  infoContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 6,
  },
});
