import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme, ACCENT_COLORS, THEME_MODES, ThemeMode, AccentColorId } from '@/contexts/ThemeContext';
import { useAudio } from '@/contexts/AudioContext';
import { useResponsive } from '@/hooks/useResponsive';
import { GLASS_THEME } from '@/constants/glassTheme';
import { GlassCard } from '../common/GlassCard';
import { StreamingQuality } from '@/services/supabase';
import { CacheStats, clearAllCache, getCacheStats } from '@/services/cacheManager';
import { APP_CONFIG } from '@/config/version';
import {
  subscribeToUpdates,
  checkAndApplyUpdateManually,
  reloadAppToApplyUpdate,
  type AppUpdateStatus,
} from '@/services/updateService';

type ActiveTab = 'profile' | 'settings';

const STREAMING_QUALITIES: {
  id: StreamingQuality;
  label: string;
  bitrate: string;
  desc: string;
  badge: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'very_high',
    label: 'Lossless Hi-Res',
    bitrate: '320 kbps',
    desc: 'Maximum bitrate • Pristine master fidelity & dynamic range',
    badge: 'STUDIO',
    icon: 'sparkles',
  },
  {
    id: 'high',
    label: 'High Quality',
    bitrate: '320 kbps',
    desc: 'Deep punchy bass, crisp vocals • Recommended for Wi-Fi',
    badge: 'HQ',
    icon: 'disc-outline',
  },
  {
    id: 'medium',
    label: 'Balanced',
    bitrate: '160 kbps',
    desc: 'Great speed & clarity • Perfect for everyday mobile listening',
    badge: 'BALANCED',
    icon: 'wifi-outline',
  },
  {
    id: 'low',
    label: 'Data Saver',
    bitrate: '96 kbps',
    desc: 'Optimized audio stream • Saves up to 70% mobile cellular data',
    badge: 'SAVER',
    icon: 'cellular-outline',
  },
];

const AVAILABLE_LANGUAGES = [
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { id: 'english', label: 'English', native: 'Global' },
  { id: 'sambalpuri', label: 'Sambalpuri', native: 'ଓଡ଼ିଆ' },
  { id: 'bhojpuri', label: 'Bhojpuri', native: 'भोजपुरी' },
  { id: 'haryanvi', label: 'Haryanvi', native: 'हरियाणवी' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்' },
  { id: 'telugu', label: 'Telugu', native: 'తెలుగు' },
  { id: 'malayalam', label: 'Malayalam', native: 'മലയാളം' },
  { id: 'marathi', label: 'Marathi', native: 'मराठी' },
  { id: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી' },
];

const EMPTY_STATS: CacheStats = {
  totalBytes: 0,
  totalMB: '0.0',
  maxMB: 200,
  usagePercent: 0,
  fileCount: 0,
};

export const ProfileModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const {
    user,
    profile,
    stats,
    isGuest,
    isProfileModalVisible,
    profileModalInitialTab,
    closeProfileModal,
    openAuthModal,
    signOut,
    updateProfile,
    refreshStats,
  } = useAuth();

  const {
    themeMode,
    accentId,
    accent,
    bgHex,
    surfaceHex,
    setThemeMode,
    setAccentColor,
  } = useAppTheme();

  const {
    crossfadeDuration,
    gaplessEnabled,
    setCrossfadeDuration,
    setGaplessEnabled,
  } = useAudio();

  // Active sub-view tab inside Profile & Settings
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  // Synchronize initial tab when modal opens
  useEffect(() => {
    if (isProfileModalVisible) {
      setActiveTab(profileModalInitialTab || 'profile');
      refreshStats();
    }
  }, [isProfileModalVisible, profileModalInitialTab, refreshStats]);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Cache stats state
  const [cacheStats, setCacheStats] = useState<CacheStats>(EMPTY_STATS);
  const [loadingCache, setLoadingCache] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Sync profile fields
  useEffect(() => {
    if (profile) {
      setEditName(profile.display_name || '');
      setEditBio(profile.bio || '');
    }
  }, [profile]);

  // Load cache stats
  const loadCacheStats = useCallback(async () => {
    setLoadingCache(true);
    try {
      const data = await getCacheStats();
      setCacheStats(data);
    } catch {
      // Ignore
    } finally {
      setLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    if (isProfileModalVisible && activeTab === 'settings') {
      loadCacheStats();
    }
  }, [isProfileModalVisible, activeTab, loadCacheStats]);

  // OTA Updates State & Subscription
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);

  useEffect(() => {
    const unsub = subscribeToUpdates((st) => {
      setUpdateStatus(st);
    });
    return unsub;
  }, []);

  const handleManualCheckUpdates = useCallback(async () => {
    if (updateStatus?.isUpdatePending) {
      await reloadAppToApplyUpdate();
      return;
    }

    setIsCheckingUpdates(true);
    const result = await checkAndApplyUpdateManually();
    setIsCheckingUpdates(false);

    if (result.isNew) {
      Alert.alert(
        '✨ Update Ready!',
        'The latest update has been downloaded. Restart Shorty now to apply it?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart Now', onPress: () => reloadAppToApplyUpdate() },
        ]
      );
    } else if (result.isAvailable) {
      Alert.alert('✨ Update Available', 'Downloading latest update in the background...');
    } else if (result.error) {
      Alert.alert('Update Status', result.error);
    } else {
      Alert.alert(
        'Up to Date! 🎉',
        `You are running the latest version: Shorty ${APP_CONFIG.otaVersion} (${APP_CONFIG.releaseTag})`
      );
    }
  }, [updateStatus]);

  // Save profile changes
  const handleSaveProfile = useCallback(async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter a display name.');
      return;
    }
    setIsSaving(true);
    const res = await updateProfile({
      display_name: editName.trim(),
      bio: editBio.trim(),
    });
    setIsSaving(false);
    if (res.error) {
      Alert.alert('Save Failed', res.error);
    } else {
      setIsEditing(false);
      showToast('Profile updated! ✨');
    }
  }, [editName, editBio, updateProfile, showToast]);

  // Image Upload Handlers
  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access in device settings.');
        return;
      }

      setIsUploadingAvatar(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const avatarUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        const res = await updateProfile({ avatar_url: avatarUri });
        if (res.error) {
          Alert.alert('Upload Failed', res.error);
        } else {
          showToast('Profile photo updated! 📸');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to select image.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [updateProfile, showToast]);

  const handleTakePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow camera access in device settings.');
        return;
      }

      setIsUploadingAvatar(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const avatarUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        const res = await updateProfile({ avatar_url: avatarUri });
        if (res.error) {
          Alert.alert('Upload Failed', res.error);
        } else {
          showToast('Profile photo updated! 📸');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to take photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [updateProfile, showToast]);

  const handleRemovePhoto = useCallback(async () => {
    setIsUploadingAvatar(true);
    const res = await updateProfile({ avatar_url: null });
    setIsUploadingAvatar(false);
    if (res.error) {
      Alert.alert('Error', res.error);
    } else {
      showToast('Profile photo removed.');
    }
  }, [updateProfile, showToast]);

  const handleAvatarOptions = useCallback(() => {
    Alert.alert('Profile Photo', 'Choose an option to update your photo:', [
      { text: 'Choose from Library', onPress: handlePickFromLibrary },
      { text: 'Take Photo', onPress: handleTakePhoto },
      ...(profile?.avatar_url
        ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: handleRemovePhoto }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [profile?.avatar_url, handlePickFromLibrary, handleTakePhoto, handleRemovePhoto]);

  // Language toggle handler
  const handleToggleLanguage = useCallback(
    async (langId: string) => {
      const current = profile?.preferred_languages || [];
      const updated = current.includes(langId)
        ? current.filter((l) => l !== langId)
        : [...current, langId];

      if (updated.length === 0) {
        Alert.alert('Selection Required', 'Please keep at least one preferred music language.');
        return;
      }

      await updateProfile({ preferred_languages: updated });
      showToast(updated.includes(langId) ? 'Language added 🎵' : 'Language removed');
    },
    [profile?.preferred_languages, updateProfile, showToast]
  );

  // Clear cache handler
  const handleClearCache = useCallback(() => {
    Alert.alert('Clear Cache?', 'Your downloaded and offline tracks will remain intact.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear Cache',
        style: 'destructive',
        onPress: async () => {
          setClearingCache(true);
          await clearAllCache();
          await loadCacheStats();
          setClearingCache(false);
          showToast('Cache cleared successfully! 🧹');
        },
      },
    ]);
  }, [loadCacheStats, showToast]);

  // Sign out confirmation
  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          closeProfileModal();
        },
      },
    ]);
  }, [signOut, closeProfileModal]);

  if (!isProfileModalVisible) return null;

  const initials =
    (profile?.display_name || 'U')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join('') || 'U';

  return (
    <Modal
      visible={isProfileModalVisible}
      animationType="slide"
      presentationStyle={isTablet ? 'overFullScreen' : 'fullScreen'}
      transparent={isTablet}
      onRequestClose={closeProfileModal}
    >
      <View style={[styles.modalBackdrop, isTablet && styles.tabletBackdrop]}>
        <View style={[styles.container, isTablet && styles.tabletContainer]}>
          {/* Ambient Liquid Glass Atmosphere */}
          <LinearGradient
            colors={['#0F1522', '#080C14', '#04060A']}
            style={StyleSheet.absoluteFill}
          />
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 25}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />

          {/* Toast Notification Pill */}
          {toastMessage && (
            <View style={[styles.toastContainer, { top: insets.top + 60 }]}>
              <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={[styles.toastPill, { borderColor: accent.hex }]}>
                <Ionicons name="sparkles" size={15} color={accent.hex} />
                <Text style={styles.toastText}>{toastMessage}</Text>
              </View>
            </View>
          )}

          {/* Sticky Liquid Glass Header */}
          <View style={[styles.header, { paddingTop: isTablet ? 18 : insets.top + 10 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={closeProfileModal}
                style={styles.closeBtn}
                activeOpacity={0.75}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>Profile & Settings</Text>
                <Text style={styles.headerSubtitle}>
                  {activeTab === 'profile' ? 'Account & Personal Preferences' : 'App, Playback & Atmosphere'}
                </Text>
              </View>
            </View>

            {/* Quick Action in Header */}
            {!isGuest && (
              <TouchableOpacity
                onPress={handleSignOut}
                style={styles.headerSignOutBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={17} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>

          {/* Liquid Glass Segmented Pill Switcher */}
          <View style={styles.segmentedContainer}>
            <View style={styles.segmentedPillWrapper}>
              <TouchableOpacity
                style={[
                  styles.segmentTab,
                  activeTab === 'profile' && [styles.segmentTabActive, { borderColor: accent.hex }],
                ]}
                activeOpacity={0.8}
                onPress={() => setActiveTab('profile')}
              >
                {activeTab === 'profile' && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.05)']}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Ionicons
                  name="person-circle-outline"
                  size={16}
                  color={activeTab === 'profile' ? '#FFFFFF' : '#94A3B8'}
                />
                <Text
                  style={[
                    styles.segmentLabel,
                    activeTab === 'profile' ? styles.segmentLabelActive : styles.segmentLabelInactive,
                  ]}
                >
                  Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentTab,
                  activeTab === 'settings' && [styles.segmentTabActive, { borderColor: accent.hex }],
                ]}
                activeOpacity={0.8}
                onPress={() => setActiveTab('settings')}
              >
                {activeTab === 'settings' && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.05)']}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Ionicons
                  name="settings-outline"
                  size={16}
                  color={activeTab === 'settings' ? '#FFFFFF' : '#94A3B8'}
                />
                <Text
                  style={[
                    styles.segmentLabel,
                    activeTab === 'settings' ? styles.segmentLabelActive : styles.segmentLabelInactive,
                  ]}
                >
                  Settings
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Scrollable Content Body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: isTablet ? 40 : insets.bottom + 60 },
            ]}
          >
            {/* ============================================================== */}
            {/* TAB 1: PROFILE & PERSONAL PREFERENCES                          */}
            {/* ============================================================== */}
            {activeTab === 'profile' && (
              <>
                {/* 1. Identity & Account Card */}
                <GlassCard style={styles.sectionGlassCard}>
                  <View style={styles.avatarRow}>
                    <TouchableOpacity
                      onPress={handleAvatarOptions}
                      activeOpacity={0.85}
                      style={styles.avatarTouchable}
                      disabled={isUploadingAvatar}
                    >
                      <View style={[styles.avatarCircle, { borderColor: accent.hex }]}>
                        {profile?.avatar_url ? (
                          <ExpoImage
                            source={{ uri: profile.avatar_url }}
                            style={styles.avatarImg}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <Text style={styles.avatarInitials}>{initials}</Text>
                        )}
                        {isUploadingAvatar ? (
                          <View style={styles.avatarLoadingOverlay}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          </View>
                        ) : (
                          <View style={[styles.avatarEditBadge, { backgroundColor: accent.hex }]}>
                            <Ionicons name="camera" size={11} color="#000000" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={styles.identityTextCol}>
                      {!isEditing ? (
                        <>
                          <View style={styles.nameRow}>
                            <Text style={styles.displayName} numberOfLines={1}>
                              {profile?.display_name || (isGuest ? 'Guest User' : 'Music Lover')}
                            </Text>
                            <TouchableOpacity
                              onPress={() => setIsEditing(true)}
                              style={styles.editIconBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="pencil" size={14} color="#94A3B8" />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.userEmail} numberOfLines={1}>
                            {user?.email || 'Logged in as Guest'}
                          </Text>
                          {profile?.bio ? (
                            <Text style={styles.userBio} numberOfLines={2}>
                              {profile.bio}
                            </Text>
                          ) : (
                            <Text style={styles.userBioPlaceholder}>
                              Tap pencil to add a music bio...
                            </Text>
                          )}
                        </>
                      ) : (
                        <View style={styles.editForm}>
                          <TextInput
                            style={styles.glassInput}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Display name"
                            placeholderTextColor="#64748B"
                            maxLength={40}
                          />
                          <TextInput
                            style={[styles.glassInput, styles.glassInputMulti]}
                            value={editBio}
                            onChangeText={setEditBio}
                            placeholder="Short bio (optional)"
                            placeholderTextColor="#64748B"
                            maxLength={120}
                            multiline
                          />
                          <View style={styles.editFormActions}>
                            <TouchableOpacity
                              onPress={() => setIsEditing(false)}
                              style={styles.cancelEditBtn}
                            >
                              <Text style={styles.cancelEditText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleSaveProfile}
                              disabled={isSaving}
                              style={[styles.saveEditBtn, { backgroundColor: accent.hex }]}
                            >
                              {isSaving ? (
                                <ActivityIndicator size="small" color="#000000" />
                              ) : (
                                <Text style={styles.saveEditText}>Save</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Guest Sign-in Callout or Signed-In Badge */}
                  {isGuest ? (
                    <View style={styles.guestBanner}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guestBannerTitle}>Sync your library anywhere</Text>
                        <Text style={styles.guestBannerSubtitle}>
                          Sign in with Google to backup playlists and favorite songs across devices.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          closeProfileModal();
                          openAuthModal('signin');
                        }}
                        style={[styles.guestLoginBtn, { backgroundColor: accent.hex }]}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.guestLoginBtnText}>Sign In</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.accountVerifiedRow}>
                      <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                      <Text style={styles.accountVerifiedText}>Cloud Synced via Supabase</Text>
                    </View>
                  )}
                </GlassCard>

                {/* 2. Listening Milestones */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>LISTENING STATS</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: accent.hex }]}>
                        {stats?.totalMinutesListened ? `${(stats.totalMinutesListened / 60).toFixed(1)}h` : '0h'}
                      </Text>
                      <Text style={styles.statLabel}>Streamed</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: accent.hex }]}>
                        {stats?.totalSongsPlayed || 0}
                      </Text>
                      <Text style={styles.statLabel}>Songs Played</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: accent.hex }]}>
                        {stats?.favoriteMood || 'Vibes'}
                      </Text>
                      <Text style={styles.statLabel}>Vibe</Text>
                    </View>
                  </View>
                </GlassCard>

                {/* 3. Music Languages Preferences */}
                <GlassCard style={styles.sectionGlassCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>MUSIC LANGUAGES</Text>
                    <Text style={styles.sectionHint}>Select your feed languages</Text>
                  </View>
                  <View style={styles.languageChipsGrid}>
                    {AVAILABLE_LANGUAGES.map((lang) => {
                      const isSelected = (profile?.preferred_languages || ['hindi', 'punjabi', 'english', 'sambalpuri']).includes(lang.id);
                      return (
                        <TouchableOpacity
                          key={lang.id}
                          activeOpacity={0.75}
                          onPress={() => handleToggleLanguage(lang.id)}
                          style={[
                            styles.langChip,
                            isSelected && [styles.langChipSelected, { borderColor: accent.hex }],
                          ]}
                        >
                          <Text style={[styles.langChipNative, isSelected && { color: accent.hex }]}>
                            {lang.native}
                          </Text>
                          <Text style={[styles.langChipText, isSelected && styles.langChipTextSelected]}>
                            {lang.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </GlassCard>

                {/* 4. Streaming Audio Quality Tier */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>STREAMING QUALITY</Text>
                  <Text style={styles.sectionSubtitle}>
                    Select your default master bitrate for online listening.
                  </Text>
                  <View style={styles.qualityList}>
                    {STREAMING_QUALITIES.map((q) => {
                      const isSelected = (profile?.streaming_quality || 'very_high') === q.id;
                      return (
                        <TouchableOpacity
                          key={q.id}
                          activeOpacity={0.78}
                          onPress={async () => {
                            await updateProfile({ streaming_quality: q.id });
                            showToast(`${q.label} activated! 🎧`);
                          }}
                          style={[
                            styles.qualityOptionCard,
                            isSelected && [styles.qualityOptionCardSelected, { borderColor: accent.hex }],
                          ]}
                        >
                          <View style={styles.qualityOptionLeft}>
                            <View style={[styles.qualityIconCircle, isSelected && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                              <Ionicons name={q.icon} size={18} color={isSelected ? accent.hex : '#94A3B8'} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.qualityHeaderRow}>
                                <Text style={[styles.qualityLabel, isSelected && { color: '#FFFFFF', fontWeight: '800' }]}>
                                  {q.label}
                                </Text>
                                <View style={styles.qualityBadgePill}>
                                  <Text style={styles.qualityBadgeText}>{q.badge}</Text>
                                </View>
                              </View>
                              <Text style={styles.qualityDesc}>{q.desc}</Text>
                            </View>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={accent.hex} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </GlassCard>
              </>
            )}

            {/* ============================================================== */}
            {/* TAB 2: APP, PLAYBACK & SYSTEM SETTINGS                         */}
            {/* ============================================================== */}
            {activeTab === 'settings' && (
              <>
                {/* 1. Appearance & Theme Atmosphere */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>APPEARANCE & THEME</Text>
                  <Text style={styles.sectionSubtitle}>
                    Customize your visual atmosphere and pitch-black OLED power saving.
                  </Text>

                  {/* Mode Selector */}
                  <Text style={styles.fieldLabel}>Background Style</Text>
                  <View style={styles.themeModeRow}>
                    {THEME_MODES.map((mode) => {
                      const isSelected = themeMode === mode.id;
                      return (
                        <TouchableOpacity
                          key={mode.id}
                          activeOpacity={0.75}
                          onPress={() => setThemeMode(mode.id)}
                          style={[
                            styles.themeModeCard,
                            { backgroundColor: mode.bg },
                            isSelected && [styles.themeModeCardActive, { borderColor: accent.hex }],
                          ]}
                        >
                          <View style={styles.themeModeHeader}>
                            <Text style={[styles.themeModeName, isSelected && { color: accent.hex }]}>
                              {mode.name}
                            </Text>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={16} color={accent.hex} />
                            )}
                          </View>
                          <Text style={styles.themeModeDesc}>{mode.desc}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Accent Color Palette */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Accent Color Glow</Text>
                  <View style={styles.accentChipsWrap}>
                    {ACCENT_COLORS.map((item) => {
                      const isSelected = accentId === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.75}
                          onPress={() => setAccentColor(item.id)}
                          style={[
                            styles.accentColorChip,
                            isSelected && { borderColor: item.hex, borderWidth: 1.5 },
                          ]}
                        >
                          <View style={[styles.accentDot, { backgroundColor: item.hex }]}>
                            {isSelected && <Ionicons name="checkmark" size={12} color="#000000" />}
                          </View>
                          <Text style={[styles.accentChipText, isSelected && { color: item.hex, fontWeight: '800' }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </GlassCard>

                {/* 2. Playback Engine & Transitions */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>PLAYBACK & TRANSITIONS</Text>
                  <Text style={styles.sectionSubtitle}>
                    Smart track-blending and seamless preloading between songs.
                  </Text>

                  {/* Smart Crossfade */}
                  <Text style={styles.fieldLabel}>Smart Crossfade</Text>
                  <View style={styles.crossfadePillsRow}>
                    {[0, 3, 5, 8, 12].map((seconds) => {
                      const isSelected = crossfadeDuration === seconds;
                      return (
                        <TouchableOpacity
                          key={seconds}
                          activeOpacity={0.75}
                          onPress={() => setCrossfadeDuration(seconds)}
                          style={[
                            styles.crossfadePill,
                            isSelected && [styles.crossfadePillActive, { backgroundColor: accent.hex, borderColor: accent.hex }],
                          ]}
                        >
                          <Text
                            style={[
                              styles.crossfadePillText,
                              isSelected ? { color: '#000000', fontWeight: '800' } : { color: '#FFFFFF' },
                            ]}
                          >
                            {seconds === 0 ? 'Off' : `${seconds}s`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.crossfadeExplainer}>
                    {crossfadeDuration === 0
                      ? 'Standard playback with 0s audio overlap.'
                      : `Smoothly blends music with a ${crossfadeDuration}-second crossfade curve between tracks.`}
                  </Text>

                  {/* Gapless Preload Toggle */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setGaplessEnabled(!gaplessEnabled)}
                    style={styles.toggleRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleTitle}>Gapless Stream Preload</Text>
                      <Text style={styles.toggleDesc}>
                        Preloads upcoming stream 5s before current track ends to eliminate buffer spin.
                      </Text>
                    </View>
                    <View style={[styles.switchTrack, { backgroundColor: gaplessEnabled ? accent.hex : 'rgba(255,255,255,0.18)' }]}>
                      <View style={[styles.switchThumb, gaplessEnabled ? styles.switchThumbActive : styles.switchThumbInactive]} />
                    </View>
                  </TouchableOpacity>
                </GlassCard>

                {/* 3. Storage & Cache Management */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>STORAGE & CACHE</Text>
                  <Text style={styles.sectionSubtitle}>
                    Manage cached audio streams and cover images on this device.
                  </Text>

                  <View style={styles.storageProgressBar}>
                    <View
                      style={[
                        styles.storageProgressFill,
                        {
                          width: `${Math.max(3, cacheStats.usagePercent)}%`,
                          backgroundColor: accent.hex,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.storageLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: accent.hex }]} />
                      <Text style={styles.legendLabel}>Music Cache</Text>
                      <Text style={styles.legendVal}>
                        {loadingCache ? '...' : `${cacheStats.totalMB} MB`}
                      </Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.legendLabel}>Total Files</Text>
                      <Text style={styles.legendVal}>{cacheStats.fileCount}</Text>
                    </View>
                  </View>

                  <Pressable
                    disabled={clearingCache}
                    onPress={handleClearCache}
                    style={({ pressed }) => [
                      styles.clearCacheBtn,
                      { backgroundColor: accent.hex },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {clearingCache ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Text style={styles.clearCacheBtnText}>Clear Cache</Text>
                    )}
                  </Pressable>
                </GlassCard>

                {/* 4. Software Updates & About */}
                <GlassCard style={styles.sectionGlassCard}>
                  <Text style={styles.sectionTitle}>SOFTWARE UPDATES & ABOUT</Text>
                  <View style={styles.aboutRow}>
                    <View>
                      <Text style={styles.aboutAppName}>Shorty Music</Text>
                      <Text style={styles.aboutVersion}>
                        Version {APP_CONFIG.otaVersion} • {APP_CONFIG.channel}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleManualCheckUpdates}
                      disabled={isCheckingUpdates}
                      style={styles.checkUpdateBtn}
                      activeOpacity={0.8}
                    >
                      {isCheckingUpdates ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.checkUpdateBtnText}>
                          {updateStatus?.isUpdatePending ? 'Restart to Apply' : 'Check Updates'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const ProfileAndSettingsModal = ProfileModal;

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
  },
  tabletBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tabletContainer: {
    maxWidth: 880,
    maxHeight: '92%',
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderSpecular,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '500',
  },
  headerSignOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  segmentedPillWrapper: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 11,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
  },
  segmentLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  segmentLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  segmentLabelInactive: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 16,
  },
  sectionGlassCard: {
    padding: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#05070C',
  },
  identityTextCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  editIconBtn: {
    padding: 2,
  },
  userEmail: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  userBio: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  userBioPlaceholder: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editForm: {
    gap: 8,
  },
  glassInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: '#FFFFFF',
    fontSize: 13,
  },
  glassInputMulti: {
    height: 52,
    textAlignVertical: 'top',
  },
  editFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelEditText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  saveEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveEditText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  guestBanner: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestBannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  guestBannerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  guestLoginBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  guestLoginBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  accountVerifiedRow: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountVerifiedText: {
    color: '#10B981',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHint: {
    color: '#64748B',
    fontSize: 11,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  languageChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  langChipSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  langChipNative: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  langChipText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  langChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  qualityList: {
    gap: 8,
  },
  qualityOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  qualityOptionCardSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  qualityOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  qualityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qualityLabel: {
    color: '#E2E8F0',
    fontSize: 13.5,
    fontWeight: '700',
  },
  qualityBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  qualityBadgeText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
  },
  qualityDesc: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  fieldLabel: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  themeModeRow: {
    gap: 8,
  },
  themeModeCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  themeModeCardActive: {
    borderWidth: 1.5,
  },
  themeModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  themeModeName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  themeModeDesc: {
    color: '#64748B',
    fontSize: 11,
  },
  accentChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accentColorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  accentDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentChipText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  crossfadePillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  crossfadePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  crossfadePillActive: {},
  crossfadePillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  crossfadeExplainer: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleDesc: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    maxWidth: 260,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
  storageProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  storageProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  storageLegendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  legendVal: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  clearCacheBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  clearCacheBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aboutAppName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  aboutVersion: {
    color: '#64748B',
    fontSize: 11.5,
    marginTop: 2,
  },
  checkUpdateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
