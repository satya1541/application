import { CacheStats, clearAllCache, getCacheStats } from '@/services/cacheManager';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, ACCENT_COLORS, THEME_MODES, ThemeMode, AccentColorId } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import { useResponsive } from '@/hooks/useResponsive';

interface SettingsScreenProps {
  onBack: () => void;
}

const EMPTY_STATS: CacheStats = {
  totalBytes: 0,
  totalMB: '0.0',
  maxMB: 200,
  usagePercent: 0,
  fileCount: 0,
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const { themeMode, accentId, accent, bgHex, surfaceHex, setThemeMode, setAccentColor } = useAppTheme();
  const { crossfadeDuration, gaplessEnabled, setCrossfadeDuration, setGaplessEnabled } = useAudio();
  const { isTablet } = useResponsive();
  const [stats, setStats] = useState<CacheStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStats(await getCacheStats());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear cache?',
      'Your downloads will not be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear cache',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            await clearAllCache();
            await loadStats();
            setClearing(false);
            Alert.alert('Cache cleared', 'Cached music and images have been removed.');
          },
        },
      ],
    );
  }, [loadStats]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bgHex }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: surfaceHex }]}>
        <View style={[styles.headerInner, isTablet && { maxWidth: 760, alignSelf: 'center', width: '100%' }]}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBack}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isTablet && { maxWidth: 760, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
      >
        {/* APPEARANCE & THEME */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APPEARANCE & THEME</Text>
          <Text style={styles.sectionSubtitle}>
            Customize your visual atmosphere and pitch-black OLED power saving.
          </Text>

          {/* Theme Mode Selector */}
          <Text style={styles.subSectionTitle}>Background Style</Text>
          <View style={styles.modeContainer}>
            {THEME_MODES.map((mode) => {
              const isSelected = themeMode === mode.id;
              return (
                <TouchableOpacity
                  key={mode.id}
                  activeOpacity={0.7}
                  onPress={() => setThemeMode(mode.id)}
                  style={[
                    styles.modeCard,
                    { backgroundColor: mode.bg, borderColor: isSelected ? accent.hex : 'rgba(255,255,255,0.12)' },
                    isSelected && { borderWidth: 2, shadowColor: accent.hex, shadowOpacity: 0.35, shadowRadius: 8 },
                  ]}
                >
                  <View style={styles.modeCardHeader}>
                    <Text style={[styles.modeCardTitle, isSelected && { color: accent.hex }]}>
                      {mode.name}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={accent.hex} />
                    ) : null}
                  </View>
                  <Text style={styles.modeCardDesc}>{mode.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Accent Color Selector */}
          <Text style={[styles.subSectionTitle, { marginTop: 22 }]}>Accent Color</Text>
          <View style={styles.accentContainer}>
            {ACCENT_COLORS.map((item) => {
              const isSelected = accentId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => setAccentColor(item.id)}
                  style={[
                    styles.accentChip,
                    { backgroundColor: surfaceHex, borderColor: isSelected ? item.hex : 'transparent' },
                    isSelected && { borderWidth: 2 },
                  ]}
                >
                  <View style={[styles.accentCircle, { backgroundColor: item.hex }]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#000000" />}
                  </View>
                  <Text style={[styles.accentName, isSelected && { color: item.hex, fontWeight: '700' }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* AUDIO PLAYBACK & TRANSITIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PLAYBACK & TRANSITIONS</Text>
          <Text style={styles.sectionSubtitle}>
            Seamlessly blend tracks and preload upcoming streams for an uninterrupted live DJ suite.
          </Text>

          {/* Crossfade Duration */}
          <Text style={styles.subSectionTitle}>Smart Crossfade</Text>
          <View style={styles.crossfadeContainer}>
            {[0, 3, 5, 8, 12].map((seconds) => {
              const isSelected = crossfadeDuration === seconds;
              return (
                <TouchableOpacity
                  key={seconds}
                  activeOpacity={0.7}
                  onPress={() => setCrossfadeDuration(seconds)}
                  style={[
                    styles.crossfadeChip,
                    {
                      backgroundColor: isSelected ? accent.hex : surfaceHex,
                      borderColor: isSelected ? accent.hex : 'rgba(255,255,255,0.12)',
                    },
                    isSelected && { borderWidth: 2, shadowColor: accent.hex, shadowOpacity: 0.35, shadowRadius: 6 },
                  ]}
                >
                  <Text
                    style={[
                      styles.crossfadeChipText,
                      isSelected ? { color: '#000000', fontWeight: '800' } : { color: '#ffffff' },
                    ]}
                  >
                    {seconds === 0 ? 'Off' : `${seconds}s`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.crossfadeDesc}>
            {crossfadeDuration === 0
              ? 'Standard playback with 0s audio overlap.'
              : `Smoothly blends music with a ${crossfadeDuration}-second crossfade curve between songs.`}
          </Text>

          {/* Gapless Preload Toggle */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setGaplessEnabled(!gaplessEnabled)}
            style={[styles.toggleCard, { backgroundColor: surfaceHex }]}
          >
            <View style={styles.toggleCardContent}>
              <Text style={styles.toggleCardTitle}>Gapless Stream Preload</Text>
              <Text style={styles.toggleCardDesc}>
                Preloads upcoming stream 5s before current track ends to eliminate silence and buffer spin.
              </Text>
            </View>
            <View
              style={[
                styles.switchPill,
                { backgroundColor: gaplessEnabled ? accent.hex : 'rgba(255,255,255,0.2)' },
              ]}
            >
              <View
                style={[
                  styles.switchKnob,
                  gaplessEnabled ? styles.switchKnobActive : styles.switchKnobInactive,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* STORAGE MANAGEMENT */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & CACHE</Text>
          <View style={styles.usageBar}>
            <View style={[styles.usageFill, { width: `${Math.max(2, stats.usagePercent)}%`, backgroundColor: accent.hex }]} />
          </View>

          <View style={styles.legend}>
            <StorageRow color="#3d8bfd" label="Other apps" value="Unavailable" />
            <StorageRow color={accent.hex} label="Music Cache" value={loading ? 'Loading...' : `${stats.totalMB} MB`} />
            <StorageRow color="#4a4a4a" label="Free Space" value="Device managed" />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={clearing}
            onPress={handleClearCache}
            style={({ pressed }) => [styles.clearButton, { backgroundColor: accent.hex }, pressed && styles.pressed]}
          >
            {clearing ? <ActivityIndicator color="#000000" /> : <Text style={styles.clearButtonText}>Clear Cache</Text>}
          </Pressable>

          <Text style={styles.description}>
            You can free up storage by clearing your music and cover art cache. Your offline library won&apos;t be removed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const StorageRow: React.FC<{ color: string; label: string; value: string }> = ({ color, label, value }) => (
  <View style={styles.storageRow}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#101010',
  },
  header: {
    height: 72,
    backgroundColor: '#181818',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 48,
  },
  usageBar: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#555555',
  },
  usageFill: {
    height: '100%',
    backgroundColor: '#4285d4',
    borderRadius: 7,
  },
  legend: {
    gap: 18,
    marginTop: 38,
  },
  storageRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 16,
  },
  label: {
    color: '#eeeeee',
    fontSize: 18,
    fontWeight: '500',
  },
  value: {
    color: '#eeeeee',
    fontSize: 18,
    marginLeft: 5,
  },
  clearButton: {
    alignSelf: 'center',
    minWidth: 230,
    minHeight: 64,
    marginTop: 42,
    paddingHorizontal: 28,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  clearButtonText: {
    color: '#111111',
    fontSize: 21,
    fontWeight: '800',
  },
  description: {
    color: '#989898',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 28,
  },
  note: {
    color: '#6f6f6f',
    fontSize: 14,
    marginTop: 24,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  subSectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  modeContainer: {
    gap: 10,
  },
  modeCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  modeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modeCardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modeCardDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  accentContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  accentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    gap: 10,
  },
  accentCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 28,
  },
  crossfadeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  crossfadeChip: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  crossfadeChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  crossfadeDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleCardContent: {
    flex: 1,
    paddingRight: 14,
  },
  toggleCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleCardDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 16,
  },
  switchPill: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  switchKnobActive: {
    alignSelf: 'flex-end',
  },
  switchKnobInactive: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
