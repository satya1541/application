import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioSourcePlatform } from '@/types/music';

interface SourceBadgeProps {
  source?: AudioSourcePlatform | string;
  quality?: string;
  size?: 'small' | 'medium';
  isExplicit?: boolean;
}

/**
 * Apple Music / Tidal Studio-Grade Native Vector Audio Badge
 * 100% Vector rendering with sub-pixel hairlineWidth borders, optical typography,
 * and zero raster image scaling artifacts.
 */
export const SourceBadge: React.FC<SourceBadgeProps> = ({
  source = 'jiosaavn',
  quality = 'Lossless',
  size = 'small',
  isExplicit = false,
}) => {
  const isMedium = size === 'medium';
  const qLower = (quality || '').toLowerCase();
  const isOpus = source === 'youtube' || qLower.includes('opus') || qLower.includes('160kbps');
  const isHiRes = qLower.includes('hi-res') || qLower.includes('24-bit') || qLower.includes('96khz');
  const isDolby = qLower.includes('dolby') || qLower.includes('atmos') || qLower.includes('spatial');

  // 1. Dolby Atmos / Spatial Audio Badge
  if (isDolby) {
    return (
      <View style={[styles.badgeBase, styles.dolbyBadge, isMedium && styles.badgeMedium]}>
        <Ionicons
          name="radio"
          size={isMedium ? 9 : 7.5}
          color="#38BDF8"
          style={styles.iconMargin}
        />
        <Text style={[styles.badgeText, styles.dolbyText, isMedium && styles.badgeTextMedium]}>
          ATMOS
        </Text>
      </View>
    );
  }

  // 2. Hi-Res Lossless (Gold / Amber Accent)
  if (isHiRes) {
    return (
      <View style={[styles.badgeBase, styles.hiResBadge, isMedium && styles.badgeMedium]}>
        <View style={styles.waveformContainer}>
          <View style={[styles.waveBar, { height: isMedium ? 6.5 : 5, backgroundColor: '#F59E0B' }]} />
          <View style={[styles.waveBar, { height: isMedium ? 10.5 : 8.5, backgroundColor: '#F59E0B' }]} />
          <View style={[styles.waveBar, { height: isMedium ? 8 : 6, backgroundColor: '#F59E0B' }]} />
        </View>
        <Text style={[styles.badgeText, styles.hiResText, isMedium && styles.badgeTextMedium]}>
          HI-RES
        </Text>
      </View>
    );
  }

  // 3. Lossless (Apple Emerald Waveform Mark)
  if (!isOpus) {
    return (
      <View style={[styles.badgeBase, styles.losslessBadge, isMedium && styles.badgeMedium]}>
        <View style={styles.waveformContainer}>
          <View style={[styles.waveBar, { height: isMedium ? 6 : 4.5, backgroundColor: '#22C55E' }]} />
          <View style={[styles.waveBar, { height: isMedium ? 10 : 8, backgroundColor: '#22C55E' }]} />
          <View style={[styles.waveBar, { height: isMedium ? 7.5 : 5.5, backgroundColor: '#22C55E' }]} />
        </View>
        <Text style={[styles.badgeText, styles.losslessText, isMedium && styles.badgeTextMedium]}>
          LOSSLESS
        </Text>
      </View>
    );
  }

  // 4. Opus / YouTube (Coral Red Micro-Play)
  return (
    <View style={[styles.badgeBase, styles.opusBadge, isMedium && styles.badgeMedium]}>
      <Ionicons
        name="play"
        size={isMedium ? 8 : 6.5}
        color="#FF4E45"
        style={styles.iconMargin}
      />
      <Text style={[styles.badgeText, styles.opusText, isMedium && styles.badgeTextMedium]}>
        OPUS
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  badgeMedium: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  // Apple Music Lossless: Subtle translucent emerald dark glass
  losslessBadge: {
    backgroundColor: 'rgba(20, 32, 25, 0.78)',
    borderColor: 'rgba(34, 197, 94, 0.38)',
  },
  // Apple Music Hi-Res: Subtle amber glass
  hiResBadge: {
    backgroundColor: 'rgba(36, 28, 16, 0.82)',
    borderColor: 'rgba(245, 158, 11, 0.42)',
  },
  // Opus / YouTube: Subtle coral dark glass
  opusBadge: {
    backgroundColor: 'rgba(34, 20, 22, 0.8)',
    borderColor: 'rgba(255, 78, 69, 0.36)',
  },
  // Dolby Atmos: Subtle spatial blue glass
  dolbyBadge: {
    backgroundColor: 'rgba(16, 28, 38, 0.82)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  // Optical 3-bar miniature audio waveform
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
    gap: 1.5,
  },
  waveBar: {
    width: 1.5,
    borderRadius: 1,
  },
  iconMargin: {
    marginRight: 3,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  badgeTextMedium: {
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  losslessText: {
    color: '#E5E7EB',
  },
  hiResText: {
    color: '#FDE68A',
  },
  opusText: {
    color: '#E5E7EB',
  },
  dolbyText: {
    color: '#BAE6FD',
  },
});
