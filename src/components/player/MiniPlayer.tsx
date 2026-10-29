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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, useAudioProgress } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getSafeCoverArt, isYouTubeCover } from '@/services/imageUtils';
import { triggerOpenFullPlayer } from '@/services/playerSheetController';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
  const { isTablet } = useResponsive();
  const { accent } = useAppTheme();
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
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDragging.current = false;
        const swipeThreshold = width * 0.3;

        if (gestureState.dx < -swipeThreshold) {
          Animated.timing(translateX, {
            toValue: -width,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(width);
            nextSong();
            Animated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          });
        } else if (gestureState.dx > swipeThreshold) {
          Animated.timing(translateX, {
            toValue: width,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(-width);
            prevSong();
            Animated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  if (!currentSong) {
    return null;
  }

  const handleDismiss = (e: any) => {
    e.stopPropagation?.();
    isDismissing.current = true;
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

  const computedBottom =
    bottomOffset !== undefined ? bottomOffset : Platform.OS === 'ios' ? 88 : 74;

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
      <View style={styles.container}>
        <BlurView
          intensity={GLASS_THEME.blur.navIntensity}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top 2px Progress bar */}
        <MiniPlayerProgressBar />

        <View style={styles.contentRow}>
          {/* Main Tappable Area */}
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

          {/* Right Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                prevSong();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Previous track"
            >
              <Ionicons name="play-skip-back" size={19} color="#E2E8F0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                togglePlay();
              }}
              activeOpacity={0.7}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading ? (
                <Ionicons name="sync" size={22} color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={24}
                  color="#FFFFFF"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                nextSong();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Next track"
            >
              <Ionicons name="play-skip-forward" size={19} color="#E2E8F0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                openQueueModal();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityLabel="View queue"
            >
              <Ionicons name="list" size={19} color={accent.hex} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleDismiss}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 12 }}
              accessibilityLabel="Dismiss player"
            >
              <Ionicons name="close" size={20} color="#94A3B8" />
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
  tabletOuterWrapper: {
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
    left: undefined,
    right: undefined,
  },
  outerWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 25,
  },
  container: {
    backgroundColor: GLASS_THEME.colors.glassMiniPlayerBg,
    borderRadius: GLASS_THEME.radii.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  coverWrapper: {
    width: 42,
    height: 42,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
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
    color: GLASS_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  artist: {
    color: GLASS_THEME.colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionBtn: {
    padding: 5,
  },
});
