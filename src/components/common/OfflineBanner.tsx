import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Easing, StyleProp, ViewStyle, Platform } from 'react-native';
import { useNetwork } from '@/contexts/NetworkContext';

interface OfflineBannerProps {
  style?: StyleProp<ViewStyle>;
  bottomOffset?: number;
  positionAbsolute?: boolean;
}

/**
 * Persistent bottom offline banner matching Spotify UI (Image 2).
 * Displays "No Internet connection available" directly above the bottom tab navigation bar
 * on all screens whenever the device loses internet connectivity.
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  style,
  bottomOffset,
  positionAbsolute = false,
}) => {
  const { isOffline } = useNetwork();
  const [shouldRender, setShouldRender] = useState(isOffline);
  const animValue = useRef(new Animated.Value(isOffline ? 1 : 0)).current;

  useEffect(() => {
    if (isOffline) {
      setShouldRender(true);
      Animated.timing(animValue, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(animValue, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
        }
      });
    }
  }, [isOffline, animValue]);

  if (!shouldRender) {
    return null;
  }

  const isAbs = positionAbsolute || bottomOffset !== undefined;

  return (
    <Animated.View
      style={[
        styles.banner,
        isAbs && {
          position: 'absolute',
          bottom: bottomOffset ?? 0,
          left: 0,
          right: 0,
        },
        {
          opacity: animValue,
          transform: [
            {
              translateY: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
        style,
      ]}
      pointerEvents={isOffline ? 'auto' : 'none'}
    >
      <Text style={styles.text}>No Internet connection available</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    height: 40,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});

