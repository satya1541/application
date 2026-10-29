import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS_THEME } from '@/constants/glassTheme';

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  showSheen?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = GLASS_THEME.blur.cardIntensity,
  borderRadius = GLASS_THEME.radii.card,
  borderWidth = 1,
  borderColor = GLASS_THEME.colors.borderDefault,
  showSheen = true,
}) => {
  return (
    <View
      style={[
        styles.outerContainer,
        {
          borderRadius,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {showSheen && (
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.01)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  content: {
    width: '100%',
    height: '100%',
    position: 'relative',
    zIndex: 1,
  },
});

