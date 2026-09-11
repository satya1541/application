import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
  Easing,
  AppState,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

export interface PaletteType {
  primary: string;
  secondary: string;
  tertiary: string;
  base: string;
}

export function getPaletteForSong(
  id?: string,
  cover?: string,
  customGradients?: [string, string]
): PaletteType {
  const primary =
    customGradients &&
    customGradients.length >= 2 &&
    customGradients[0] !== '#1DB954' &&
    customGradients[0] !== '#ff4e45'
      ? customGradients[0]
      : '#ffffff';

  return {
    primary,
    secondary: customGradients?.[1] || 'rgba(255,255,255,0.4)',
    tertiary: primary,
    base: '#07070a',
  };
}

interface AuroraMeshViewProps {
  coverUrl?: string;
  opacityVal?: Animated.AnimatedInterpolation<number> | number;
  rotationInterpolate: Animated.AnimatedInterpolation<string>;
  orb1Translate: Animated.ValueXY;
  orb1Scale: Animated.Value;
  orb2Translate: Animated.ValueXY;
  orb2Scale: Animated.Value;
  pulseAnim: Animated.Value;
}

const AuroraMeshView: React.FC<AuroraMeshViewProps> = ({
  coverUrl,
  opacityVal = 1,
  rotationInterpolate,
  orb1Translate,
  orb1Scale,
  orb2Translate,
  orb2Scale,
  pulseAnim,
}) => {
  if (!coverUrl) return null;

  return (
    <Animated.View
      style={[
        styles.auroraMeshWrapper,
        {
          opacity: opacityVal,
          transform: [{ rotate: rotationInterpolate }],
        },
      ]}
    >
      {/* Top-Left Floating Artwork Orb (Direct from Thumbnail Pixels) */}
      <Animated.View
        style={[
          styles.ambientOrbPosition,
          {
            top: -height * 0.14,
            left: -width * 0.32,
            width: width * 1.45,
            height: width * 1.45,
            borderRadius: (width * 1.45) / 2,
            opacity: 0.9,
            transform: [
              { translateX: orb1Translate.x },
              { translateY: orb1Translate.y },
              { scale: orb1Scale },
            ],
          },
        ]}
      >
        <ExpoImage
          source={{ uri: coverUrl }}
          style={styles.orbImageZoom1}
          blurRadius={Platform.OS === 'ios' ? 42 : 10}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </Animated.View>

      {/* Bottom-Right Counter-Floating Artwork Orb */}
      <Animated.View
        style={[
          styles.ambientOrbPosition,
          {
            bottom: -height * 0.12,
            right: -width * 0.26,
            width: width * 1.35,
            height: width * 1.35,
            borderRadius: (width * 1.35) / 2,
            opacity: 0.85,
            transform: [
              { translateX: orb2Translate.x },
              { translateY: orb2Translate.y },
              { scale: orb2Scale },
            ],
          },
        ]}
      >
        <ExpoImage
          source={{ uri: coverUrl }}
          style={styles.orbImageZoom2}
          blurRadius={Platform.OS === 'ios' ? 42 : 10}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </Animated.View>

      {/* Center Breathing Ambient Heart (Reacts to Playback) */}
      <Animated.View
        style={[
          styles.ambientOrbPosition,
          {
            top: height * 0.2,
            left: width * 0.08,
            width: width * 0.95,
            height: width * 0.95,
            borderRadius: (width * 0.95) / 2,
            opacity: 0.7,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <ExpoImage
          source={{ uri: coverUrl }}
          style={styles.orbImageZoom3}
          blurRadius={Platform.OS === 'ios' ? 36 : 10}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </Animated.View>
  );
};

export interface AmbientPlayerBackgroundProps {
  coverUrl?: string;
  songId?: string;
  songName?: string;
  artistName?: string;
  gradientColors?: [string, string];
  isPlaying?: boolean;
  children: React.ReactNode;
}

export const AmbientPlayerBackground: React.FC<AmbientPlayerBackgroundProps> = ({
  coverUrl,
  isPlaying = false,
  children,
}) => {
  // Active and previous covers for silky smooth 750ms crossfading between tracks
  const [activeCover, setActiveCover] = useState<string | undefined>(coverUrl);
  const [prevCover, setPrevCover] = useState<string | undefined>(undefined);

  // Crossfade opacity animation between tracks
  const crossfadeAnim = useRef(new Animated.Value(1)).current;

  // Floating Aurora Orb 1 (Top Left)
  const orb1Translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const orb1Scale = useRef(new Animated.Value(1)).current;

  // Floating Aurora Orb 2 (Bottom Right)
  const orb2Translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const orb2Scale = useRef(new Animated.Value(1)).current;

  // Slow ambient mesh rotation
  const rotationAnim = useRef(new Animated.Value(0)).current;

  // Pulse glow responding to playback
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Track AppState to pause 60fps animations in background (prevents battery heat)
  const [isAppActive, setIsAppActive] = useState<boolean>(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setIsAppActive(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  // Handle smooth crossfade when thumbnail changes
  useEffect(() => {
    if (coverUrl !== activeCover) {
      setPrevCover(activeCover);
      setActiveCover(coverUrl);

      crossfadeAnim.setValue(0);
      Animated.timing(crossfadeAnim, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setPrevCover(undefined);
      });
    }
  }, [coverUrl, activeCover, crossfadeAnim]);

  // Start continuous 60fps native-driven ambient floating animations ONLY when active
  useEffect(() => {
    if (!isAppActive) return;
    // 1. Orb 1 organic figure-8 drift
    const orb1Loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orb1Translate.x, {
            toValue: 50,
            duration: 7200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb1Translate.y, {
            toValue: -40,
            duration: 8200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb1Scale, {
            toValue: 1.25,
            duration: 7600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(orb1Translate.x, {
            toValue: -40,
            duration: 8600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb1Translate.y, {
            toValue: 45,
            duration: 7400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb1Scale, {
            toValue: 0.95,
            duration: 8200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // 2. Orb 2 counter-drift
    const orb2Loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orb2Translate.x, {
            toValue: -55,
            duration: 8400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb2Translate.y, {
            toValue: 50,
            duration: 7800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb2Scale, {
            toValue: 1.28,
            duration: 8900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(orb2Translate.x, {
            toValue: 35,
            duration: 9200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb2Translate.y, {
            toValue: -35,
            duration: 8600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(orb2Scale, {
            toValue: 0.9,
            duration: 8000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // 3. Ultra slow subtle rotation (iOS only to eliminate continuous GPU texture re-composition on Android)
    let rotationLoop: Animated.CompositeAnimation | null = null;
    if (Platform.OS === 'ios') {
      rotationLoop = Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 45000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotationLoop.start();
    }

    orb1Loop.start();
    orb2Loop.start();

    return () => {
      orb1Loop.stop();
      orb2Loop.stop();
      if (rotationLoop) rotationLoop.stop();
    };
  }, [isAppActive, orb1Translate, orb1Scale, orb2Translate, orb2Scale, rotationAnim]);

  // Breathing pulse animation when music is actively playing
  useEffect(() => {
    if (!isAppActive) return;
    let pulseLoop: Animated.CompositeAnimation | null = null;
    if (isPlaying) {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.92,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    } else {
      Animated.timing(pulseAnim, {
        toValue: 1.0,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (pulseLoop) pulseLoop.stop();
    };
  }, [isPlaying, pulseAnim]);

  const rotationInterpolate = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background Visual Layers (Pointer Events Disabled so touches pass directly to gesture handlers) */}
      <View style={styles.absoluteFill} pointerEvents="none">
        {/* 1. Deep Atmospheric Dark Base Floor */}
        <View style={[styles.absoluteFill, { backgroundColor: '#07070a' }]} />

        {/* 2. Previous Blurred Cover (Outgoing Crossfade) */}
        {prevCover && (
          <Animated.View
            style={[
              styles.absoluteFill,
              {
                opacity: crossfadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 0],
                }),
              },
            ]}
          >
            <ExpoImage
              source={{ uri: prevCover }}
              style={styles.blurredImage}
              blurRadius={Platform.OS === 'ios' ? 45 : 12}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </Animated.View>
        )}

        {/* 3. Active Blurred Cover (Incoming Crossfade) */}
        {activeCover && (
          <Animated.View
            style={[
              styles.absoluteFill,
              {
                opacity: crossfadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.6],
                }),
              },
            ]}
          >
            <ExpoImage
              source={{ uri: activeCover }}
              style={styles.blurredImage}
              blurRadius={Platform.OS === 'ios' ? 45 : 12}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </Animated.View>
        )}

        {/* 4. Living Aurora Mesh Orbs (Previous track artwork orbs during crossfade) */}
        {prevCover && (
          <AuroraMeshView
            coverUrl={prevCover}
            opacityVal={crossfadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            })}
            rotationInterpolate={rotationInterpolate}
            orb1Translate={orb1Translate}
            orb1Scale={orb1Scale}
            orb2Translate={orb2Translate}
            orb2Scale={orb2Scale}
            pulseAnim={pulseAnim}
          />
        )}

        {/* 5. Living Aurora Mesh Orbs (Active track artwork orbs - 100% Genuine Thumbnail Colors) */}
        {activeCover && (
          <AuroraMeshView
            coverUrl={activeCover}
            opacityVal={
              prevCover
                ? crossfadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  })
                : 1
            }
            rotationInterpolate={rotationInterpolate}
            orb1Translate={orb1Translate}
            orb1Scale={orb1Scale}
            orb2Translate={orb2Translate}
            orb2Scale={orb2Scale}
            pulseAnim={pulseAnim}
          />
        )}

        {/* 6. Frosted Glass Blur Overlay */}
        {Platform.OS === 'ios' && (
          <BlurView
            intensity={60}
            tint="dark"
            style={styles.absoluteFill}
          />
        )}

        {/* 7. Multi-stop Vignette Gradient for Perfect Contrast & Legibility */}
        <LinearGradient
          colors={[
            'rgba(0, 0, 0, 0.25)',
            'rgba(6, 6, 10, 0.60)',
            'rgba(4, 4, 8, 0.90)',
            '#050508',
          ]}
          locations={[0, 0.45, 0.8, 1]}
          style={styles.absoluteFill}
        />
      </View>

      {/* 8. Foreground Player UI Content */}
      <View style={styles.contentContainer}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#050508',
    overflow: 'hidden',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blurredImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    transform: [{ scale: 1.25 }],
  },
  auroraMeshWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambientOrbPosition: {
    position: 'absolute',
    overflow: 'hidden',
  },
  orbImageZoom1: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    transform: [{ scale: 2.8 }, { rotate: '35deg' }],
  },
  orbImageZoom2: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    transform: [{ scale: 2.8 }, { rotate: '-45deg' }],
  },
  orbImageZoom3: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    transform: [{ scale: 3.2 }, { rotate: '90deg' }],
  },
  contentContainer: {
    flex: 1,
    zIndex: 10,
  },
});
