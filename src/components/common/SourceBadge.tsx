import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { AudioSourcePlatform } from '@/types/music';

const LOSSLESS_LOGO_WHITE = require('@/assets/images/lossless_white.png');
const OPUS_LOGO_CIRCLE = require('@/assets/images/opus_circle.png');

interface SourceBadgeProps {
  source?: AudioSourcePlatform | string;
  quality?: string;
  size?: 'small' | 'medium';
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
  source = 'jiosaavn',
  quality = 'Lossless',
  size = 'small',
}) => {
  const isOpus = source === 'youtube' || quality === 'Opus' || quality === '160kbps';
  const isLossless = !isOpus && (source === 'jiosaavn' || quality === 'Lossless' || quality === '320kbps');
  const isMedium = size === 'medium';

  if (isLossless) {
    return (
      <View style={[styles.badgeBase, styles.losslessBadge, isMedium && styles.badgeMedium]}>
        <ExpoImage
          source={LOSSLESS_LOGO_WHITE}
          style={[styles.losslessLogo, isMedium && styles.losslessLogoMedium]}
          contentFit="contain"
          transition={100}
        />
      </View>
    );
  }

  return (
    <View style={[styles.badgeBase, styles.opusBadge, isMedium && styles.badgeMedium]}>
      <ExpoImage
        source={OPUS_LOGO_CIRCLE}
        style={[styles.opusLogo, isMedium && styles.opusLogoMedium]}
        contentFit="contain"
        transition={100}
      />
      <Text style={[styles.opusText, isMedium && styles.opusTextMedium]}>OPUS</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeBase: {
    borderRadius: 4,
    borderWidth: 0.8,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  losslessBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderColor: 'rgba(29, 185, 84, 0.55)',
    paddingHorizontal: 4.5,
    paddingVertical: 2,
  },
  losslessLogo: {
    width: 42,
    height: 11,
  },
  losslessLogoMedium: {
    width: 55,
    height: 14,
  },
  opusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderColor: 'rgba(255, 78, 69, 0.55)',
    paddingHorizontal: 4.5,
    paddingVertical: 1.5,
  },
  opusLogo: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  opusLogoMedium: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
  },
  opusText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  opusTextMedium: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  badgeMedium: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
});

