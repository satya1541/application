import React, { useState, useEffect, useCallback } from 'react';
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
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { StreamingQuality } from '@/services/supabase';
import {
  subscribeToUpdates,
  checkAndApplyUpdateManually,
  reloadAppToApplyUpdate,
  type AppUpdateStatus,
} from '@/services/updateService';

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

export const ProfileModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    user,
    profile,
    stats,
    isGuest,
    isProfileModalVisible,
    closeProfileModal,
    openAuthModal,
    signOut,
    updateProfile,
    refreshStats,
  } = useAuth();

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Live action toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Sync edit form with profile
  useEffect(() => {
    if (profile) {
      setEditName(profile.display_name || '');
      setEditBio(profile.bio || '');
    }
  }, [profile]);

  // Refresh stats whenever modal opens
  useEffect(() => {
    if (isProfileModalVisible) {
      refreshStats();
    }
  }, [isProfileModalVisible, refreshStats]);

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
        '✨ Update Received & Ready!',
        'The latest update has been downloaded to your device. Would you like to restart Shorty now to apply it?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart Now',
            onPress: () => reloadAppToApplyUpdate(),
          },
        ]
      );
    } else if (result.isAvailable) {
      Alert.alert('✨ Update Available', 'Downloading latest update in the background...');
    } else if (result.error) {
      Alert.alert('Update Status', result.error);
    } else {
      Alert.alert(
        'Up to Date! 🎉',
        `You are running the latest version.\n\nVersion: ${updateStatus?.runtimeVersion || '4.0'}\nUpdate ID: ${updateStatus?.shortUpdateId || 'Embedded'}`
      );
    }
  }, [updateStatus]);

  const handleSaveProfile = useCallback(async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please provide a display name.');
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
      showToast('Profile updated successfully! ✨');
    }
  }, [editName, editBio, updateProfile, showToast]);

  // Image Upload Handlers
  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Needed',
          'Please allow photo library access in device settings to select a profile picture.'
        );
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
        const avatarUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        const res = await updateProfile({ avatar_url: avatarUri });
        if (res.error) {
          Alert.alert('Upload Failed', res.error);
        } else {
          showToast('Profile picture updated! 📸');
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
        Alert.alert(
          'Permission Needed',
          'Please allow camera access in device settings to take a profile picture.'
        );
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
        const avatarUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        const res = await updateProfile({ avatar_url: avatarUri });
        if (res.error) {
          Alert.alert('Upload Failed', res.error);
        } else {
          showToast('Profile picture updated! 📸');
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
    Alert.alert(
      'Profile Photo',
      'Choose how you want to update your profile photo:',
      [
        { text: 'Choose from Library', onPress: handlePickFromLibrary },
        { text: 'Take Photo', onPress: handleTakePhoto },
        ...(profile?.avatar_url
          ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: handleRemovePhoto }]
          : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }, [profile?.avatar_url, handlePickFromLibrary, handleTakePhoto, handleRemovePhoto]);

  // Language toggle handler with instant persistent update
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
      const added = !current.includes(langId);
      const match = AVAILABLE_LANGUAGES.find((l) => l.id === langId);
      showToast(
        added
          ? `Added ${match?.label || langId} to Home recommendations! 🎶`
          : `Removed ${match?.label || langId} from preferences.`
      );
    },
    [profile, updateProfile, showToast]
  );

  // Audio quality selection handler
  const handleQualityChange = useCallback(
    async (quality: StreamingQuality) => {
      await updateProfile({ streaming_quality: quality });
      const found = STREAMING_QUALITIES.find((q) => q.id === quality);
      showToast(`Audio quality set to ${found?.label || quality} (${found?.bitrate}) 🎧`);
    },
    [updateProfile, showToast]
  );

  const handleSignOutPress = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your cloud library, playlists, and listening stats remain safely saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            closeProfileModal();
            await signOut();
          },
        },
      ]
    );
  }, [closeProfileModal, signOut]);

  const handleSwitchToAuth = useCallback(() => {
    closeProfileModal();
    setTimeout(() => {
      openAuthModal();
    }, 250);
  }, [closeProfileModal, openAuthModal]);

  if (!isProfileModalVisible) return null;

  const initials = (profile?.display_name || 'Shorty User')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join('') || 'U';

  const totalMinutes = stats?.totalMinutesListened ?? 0;
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalSongs = stats?.totalSongsPlayed ?? 0;
  const maxArtistPlays = Math.max(...(stats?.topArtists?.map((a) => a.playCount) || [1]), 1);

  return (
    <Modal
      visible={isProfileModalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={closeProfileModal}
    >
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

        {/* Floating Toast Notification */}
        {toastMessage && (
          <View style={[styles.toastContainer, { top: insets.top + 60 }]}>
            <LinearGradient
              colors={['#1DB954', '#108038']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.toastGradient}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Top Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={closeProfileModal}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <View style={styles.closeIconCircle}>
              <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Profile & VIP Settings</Text>
          <View style={styles.navRight}>
            {isEditing ? (
              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={isSaving}
                style={styles.saveHeaderButton}
                activeOpacity={0.7}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#1DB954" />
                ) : (
                  <Text style={styles.saveHeaderText}>Save</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setIsEditing(true)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.editHeaderButton}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil-sharp" size={16} color="#1DB954" />
                <Text style={styles.editHeaderText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO PROFILE VIP CARD */}
          <LinearGradient
            colors={['#242424', '#141414', '#0D0D0D']}
            style={styles.profileHeroCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          >
            {/* Glowing top line */}
            <View style={styles.cardGlowLine} />

            <View style={styles.avatarRow}>
              {/* Avatar circle with image / initials + camera upload trigger */}
              <TouchableOpacity
                style={styles.avatarTouchable}
                onPress={handleAvatarOptions}
                activeOpacity={0.85}
              >
                <View style={styles.avatarRingGlow}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <LinearGradient
                      colors={['#1DB954', '#0F692E']}
                      style={styles.avatarCircle}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.avatarInitials}>{initials}</Text>
                    </LinearGradient>
                  )}

                  {/* Loading spinner over avatar */}
                  {isUploadingAvatar && (
                    <View style={styles.avatarLoadingOverlay}>
                      <ActivityIndicator size="small" color="#1DB954" />
                    </View>
                  )}

                  {/* Camera Badge Icon */}
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={13} color="#FFFFFF" />
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.profileHeaderInfo}>
                {isEditing ? (
                  <TextInput
                    style={styles.nameInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Your Display Name"
                    placeholderTextColor="#666"
                    maxLength={32}
                  />
                ) : (
                  <Text style={styles.displayName} numberOfLines={1}>
                    {profile?.display_name || 'Music Explorer'}
                  </Text>
                )}

                {/* Account Status Badges */}
                <View style={styles.badgeRow}>
                  {isGuest ? (
                    <View style={styles.guestBadge}>
                      <Ionicons name="person-outline" size={11} color="#9CA3AF" />
                      <Text style={styles.guestBadgeText}>Guest Account</Text>
                    </View>
                  ) : (
                    <View style={styles.vipBadge}>
                      <Ionicons name="sparkles" size={11} color="#FFD700" />
                      <Text style={styles.vipBadgeText}>VIP Member</Text>
                    </View>
                  )}

                  <View style={styles.syncBadge}>
                    <Ionicons name="cloud-done-outline" size={11} color="#1DB954" />
                    <Text style={styles.syncBadgeText}>Synced</Text>
                  </View>
                </View>

                {/* Photo Change Action Pill */}
                <TouchableOpacity
                  style={styles.changePhotoPill}
                  onPress={handleAvatarOptions}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={12} color="#1DB954" />
                  <Text style={styles.changePhotoText}>
                    {profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bio or Edit Bio */}
            {isEditing ? (
              <TextInput
                style={styles.bioInput}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Add a bio or favorite lyric quote..."
                placeholderTextColor="#666"
                multiline
                maxLength={120}
              />
            ) : (
              <Text style={styles.bioText}>
                {profile?.bio || 'Listening to beats and vibing with Shorty 🎵'}
              </Text>
            )}

            {/* Email info if logged in */}
            {!isGuest && user?.email ? (
              <View style={styles.emailRow}>
                <Ionicons name="mail-outline" size={13} color="#777" />
                <Text style={styles.emailText}>{user.email}</Text>
              </View>
            ) : null}
          </LinearGradient>

          {/* Guest Mode Call-to-Action */}
          {isGuest && (
            <TouchableOpacity
              style={styles.guestPromoBanner}
              activeOpacity={0.88}
              onPress={handleSwitchToAuth}
            >
              <LinearGradient
                colors={['#1DB954', '#15803D']}
                style={styles.promoGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.promoIcon}>
                  <Ionicons name="cloud-upload" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.promoContent}>
                  <Text style={styles.promoTitle}>Sync your Library Anywhere</Text>
                  <Text style={styles.promoSub}>
                    Log in with Google to back up likes, playlists & sound stats.
                  </Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={24} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* SOUND STATS SECTION */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="stats-chart" size={18} color="#1DB954" />
                <Text style={styles.sectionTitle}>Sound Stats & Insights</Text>
              </View>
              <TouchableOpacity
                onPress={refreshStats}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.refreshIconBtn}
              >
                <Ionicons name="refresh" size={15} color="#A7A7A7" />
                <Text style={styles.refreshLabel}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {/* 3 Metric Summary Cards */}
            <View style={styles.statsGrid}>
              <LinearGradient
                colors={['#1F1F1F', '#161616']}
                style={styles.statCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={[styles.statIconBadge, { backgroundColor: 'rgba(29, 185, 84, 0.15)' }]}>
                  <Ionicons name="time-outline" size={16} color="#1DB954" />
                </View>
                <Text style={styles.statValue}>
                  {totalMinutes >= 60 ? `${totalHours} hrs` : `${totalMinutes}m`}
                </Text>
                <Text style={styles.statLabel}>Listening Time</Text>
              </LinearGradient>

              <LinearGradient
                colors={['#1F1F1F', '#161616']}
                style={styles.statCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={[styles.statIconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                  <Ionicons name="musical-notes-outline" size={16} color="#A855F7" />
                </View>
                <Text style={[styles.statValue, { color: '#C084FC' }]}>{totalSongs}</Text>
                <Text style={styles.statLabel}>Songs Played</Text>
              </LinearGradient>

              <LinearGradient
                colors={['#1F1F1F', '#161616']}
                style={styles.statCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={[styles.statIconBadge, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                  <Ionicons name="flame-outline" size={16} color="#EAB308" />
                </View>
                <Text style={[styles.statValue, { color: '#FACC15', fontSize: 15 }]} numberOfLines={1}>
                  {stats?.favoriteMood || 'Melodic'}
                </Text>
                <Text style={styles.statLabel}>Listening Vibe</Text>
              </LinearGradient>
            </View>

            {/* Top Artists Podium Card */}
            {stats?.topArtists && stats.topArtists.length > 0 ? (
              <View style={styles.topArtistsContainer}>
                <View style={styles.topArtistsHeader}>
                  <Text style={styles.subSectionTitle}>Top Played Artists</Text>
                  <Text style={styles.topArtistsHint}>Based on playback history</Text>
                </View>

                {stats.topArtists.map((artist, idx) => {
                  const playRatio = artist.playCount / maxArtistPlays;
                  const medalEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                  return (
                    <View key={artist.name} style={styles.artistRow}>
                      <View
                        style={[
                          styles.artistRankBadge,
                          idx === 0 && styles.rank1Badge,
                          idx === 1 && styles.rank2Badge,
                          idx === 2 && styles.rank3Badge,
                        ]}
                      >
                        {medalEmoji ? (
                          <Text style={styles.medalEmojiText}>{medalEmoji}</Text>
                        ) : (
                          <Text style={styles.artistRankText}>#{idx + 1}</Text>
                        )}
                      </View>

                      <View style={styles.artistInfoCol}>
                        <View style={styles.artistNameRow}>
                          <Text style={styles.artistName} numberOfLines={1}>
                            {artist.name}
                          </Text>
                          <Text style={styles.artistPlays}>
                            {artist.playCount} {artist.playCount === 1 ? 'play' : 'plays'}
                          </Text>
                        </View>

                        {/* Proportional playback progress bar */}
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.max(12, Math.round(playRatio * 100))}%`,
                                backgroundColor: idx === 0 ? '#1DB954' : idx === 1 ? '#60A5FA' : '#9CA3AF',
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStatsBox}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="musical-notes" size={26} color="#1DB954" />
                </View>
                <Text style={styles.emptyStatsTitle}>Your Musical Journey Awaits</Text>
                <Text style={styles.emptyStatsText}>
                  Play songs on Shorty to unlock your personalized top artists, listening minutes, and audio vibes!
                </Text>
              </View>
            )}
          </View>

          {/* AUDIO STREAMING QUALITY PREFERENCES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="options-outline" size={18} color="#1DB954" />
                <Text style={styles.sectionTitle}>Audio Streaming Quality</Text>
              </View>
              <View style={styles.activeBitratePill}>
                <Ionicons name="pulse" size={12} color="#1DB954" />
                <Text style={styles.activeBitrateText}>
                  {profile?.streaming_quality === 'low'
                    ? '96 kbps'
                    : profile?.streaming_quality === 'medium'
                    ? '160 kbps'
                    : '320 kbps'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionSubtitle}>
              Directly controls song streaming bitrates from the high-fidelity audio servers:
            </Text>

            <View style={styles.qualityList}>
              {STREAMING_QUALITIES.map((q) => {
                const isSelected = (profile?.streaming_quality || 'very_high') === q.id;
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={[styles.qualityItem, isSelected && styles.qualityItemSelected]}
                    onPress={() => handleQualityChange(q.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.qualityLeft}>
                      <View style={styles.qualityTitleRow}>
                        <View style={[styles.qualityIconCircle, isSelected && styles.qualityIconCircleSelected]}>
                          <Ionicons
                            name={q.icon}
                            size={16}
                            color={isSelected ? '#1DB954' : '#888888'}
                          />
                        </View>
                        <Text style={[styles.qualityLabel, isSelected && styles.qualityLabelSelected]}>
                          {q.label}
                        </Text>
                        <View
                          style={[
                            styles.bitrateBadge,
                            isSelected && styles.bitrateBadgeSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bitrateBadgeText,
                              isSelected && styles.bitrateBadgeTextSelected,
                            ]}
                          >
                            {q.bitrate}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.qualityDesc}>{q.desc}</Text>
                    </View>

                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={14} color="#000000" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PREFERRED MUSIC LANGUAGES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="globe-outline" size={18} color="#1DB954" />
                <Text style={styles.sectionTitle}>Music Languages</Text>
              </View>
              <View style={styles.selectedCountPill}>
                <Text style={styles.selectedCountText}>
                  {(profile?.preferred_languages || []).length} Selected
                </Text>
              </View>
            </View>

            <Text style={styles.sectionSubtitle}>
              Tap languages you enjoy. Selected languages are automatically prioritized on your Home feed:
            </Text>

            <View style={styles.tagsContainer}>
              {AVAILABLE_LANGUAGES.map((lang) => {
                const isSelected = (profile?.preferred_languages || []).includes(lang.id);
                return (
                  <TouchableOpacity
                    key={lang.id}
                    style={[styles.languageTag, isSelected && styles.languageTagSelected]}
                    onPress={() => handleToggleLanguage(lang.id)}
                    activeOpacity={0.7}
                  >
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color="#000000"
                        style={{ marginRight: 5 }}
                      />
                    ) : (
                      <Ionicons
                        name="add"
                        size={15}
                        color="#777777"
                        style={{ marginRight: 5 }}
                      />
                    )}
                    <View>
                      <Text
                        style={[
                          styles.languageTagText,
                          isSelected && styles.languageTagTextSelected,
                        ]}
                      >
                        {lang.label}
                      </Text>
                      <Text
                        style={[
                          styles.languageTagNative,
                          isSelected && styles.languageTagNativeSelected,
                        ]}
                      >
                        {lang.native}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* APP VERSION & OTA UPDATES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="cloud-download-outline" size={18} color="#38bdf8" />
                <Text style={styles.sectionTitle}>App Version & Updates</Text>
              </View>
              <View style={styles.activeChannelPill}>
                <Text style={styles.activeChannelText}>v{updateStatus?.displayVersion || '4.0.1'}</Text>
              </View>
            </View>

            <View style={styles.updateCard}>
              <View style={styles.updateRow}>
                <View style={styles.updateInfoCol}>
                  <Text style={styles.updateInfoLabel}>Current Version</Text>
                  <Text style={styles.updateInfoValue}>
                    v{updateStatus?.displayVersion || '4.0.1'} ({updateStatus?.releaseName || '2K/4K & Vivid'})
                  </Text>
                </View>

                <View style={styles.updateStatusPill}>
                  <View
                    style={[
                      styles.statusDot,
                      updateStatus?.isUpdatePending ? styles.statusDotPending : styles.statusDotActive,
                    ]}
                  />
                  <Text style={styles.statusPillText}>
                    {updateStatus?.isUpdatePending ? 'Update Ready' : 'Up to Date'}
                  </Text>
                </View>
              </View>

              {/* Check for updates button */}
              <TouchableOpacity
                style={[
                  styles.checkUpdateBtn,
                  isCheckingUpdates && styles.checkUpdateBtnLoading,
                ]}
                onPress={handleManualCheckUpdates}
                disabled={isCheckingUpdates}
                activeOpacity={0.8}
              >
                {isCheckingUpdates ? (
                  <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons
                    name={updateStatus?.isUpdatePending ? 'flash' : 'refresh'}
                    size={16}
                    color="#000000"
                    style={{ marginRight: 8 }}
                  />
                )}
                <Text style={styles.checkUpdateBtnText}>
                  {isCheckingUpdates
                    ? 'Checking Server for Updates...'
                    : updateStatus?.isUpdatePending
                    ? 'Restart Shorty to Apply'
                    : 'Check for Updates'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ACCOUNT MANAGEMENT & SIGN OUT */}
          <View style={[styles.section, { marginBottom: 40 }]}>
            {isGuest ? (
              <TouchableOpacity
                style={styles.signInButton}
                activeOpacity={0.8}
                onPress={handleSwitchToAuth}
              >
                <Ionicons name="log-in-outline" size={20} color="#000000" style={{ marginRight: 8 }} />
                <Text style={styles.signInButtonText}>Sign In / Create Account</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.signOutButton}
                activeOpacity={0.8}
                onPress={handleSignOutPress}
              >
                <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.signOutButtonText}>Sign Out of Shorty</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#1DB954',
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
    backgroundColor: '#0D0D0D',
  },
  backButton: {
    padding: 4,
  },
  closeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  navRight: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  saveHeaderButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  saveHeaderText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  editHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  editHeaderText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  profileHeroCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262626',
    marginBottom: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGlowLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: '#1DB954',
    opacity: 0.8,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarTouchable: {
    marginRight: 16,
  },
  avatarRingGlow: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: '#1DB954',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1C1C1C',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#1DB954',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#141414',
  },
  profileHeaderInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#1DB954',
    paddingVertical: 4,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 8,
  },
  guestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  guestBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  vipBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FACC15',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1DB954',
  },
  changePhotoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  changePhotoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1DB954',
  },
  bioText: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 14,
    lineHeight: 18,
  },
  bioInput: {
    fontSize: 13,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#383838',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    minHeight: 52,
    textAlignVertical: 'top',
    backgroundColor: '#181818',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  emailText: {
    fontSize: 12,
    color: '#777777',
  },
  guestPromoBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 22,
    elevation: 3,
  },
  promoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  promoIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoContent: {
    flex: 1,
  },
  promoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  promoSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    lineHeight: 15,
  },
  section: {
    marginBottom: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 12,
    lineHeight: 16,
  },
  refreshIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  refreshLabel: {
    fontSize: 11,
    color: '#A7A7A7',
    fontWeight: '600',
  },
  activeBitratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  activeBitrateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1DB954',
  },
  selectedCountPill: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1DB954',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#262626',
    alignItems: 'center',
  },
  statIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1DB954',
  },
  statLabel: {
    fontSize: 10,
    color: '#888888',
    marginTop: 3,
    fontWeight: '600',
    textAlign: 'center',
  },
  topArtistsContainer: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242424',
  },
  topArtistsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E5E7EB',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topArtistsHint: {
    fontSize: 11,
    color: '#777777',
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#262626',
  },
  artistRankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rank1Badge: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  rank2Badge: {
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    borderWidth: 1,
    borderColor: '#9CA3AF',
  },
  rank3Badge: {
    backgroundColor: 'rgba(205, 127, 50, 0.2)',
    borderWidth: 1,
    borderColor: '#CD7F32',
  },
  medalEmojiText: {
    fontSize: 16,
  },
  artistRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1DB954',
  },
  artistInfoCol: {
    flex: 1,
  },
  artistNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  artistName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: '75%',
  },
  artistPlays: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1DB954',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#262626',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyStatsBox: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242424',
    gap: 8,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyStatsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyStatsText: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 17,
  },
  qualityList: {
    backgroundColor: '#161616',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
  },
  qualityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#262626',
  },
  qualityItemSelected: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
  },
  qualityLeft: {
    flex: 1,
    paddingRight: 12,
  },
  qualityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityIconCircleSelected: {
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
  },
  qualityLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qualityLabelSelected: {
    color: '#1DB954',
  },
  bitrateBadge: {
    backgroundColor: '#242424',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bitrateBadgeSelected: {
    backgroundColor: '#1DB954',
  },
  bitrateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#888888',
  },
  bitrateBadgeTextSelected: {
    color: '#000000',
  },
  qualityDesc: {
    fontSize: 11,
    color: '#888888',
    marginTop: 4,
    lineHeight: 15,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#444444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  languageTagSelected: {
    backgroundColor: '#1DB954',
    borderColor: '#1DB954',
  },
  languageTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  languageTagTextSelected: {
    color: '#000000',
  },
  languageTagNative: {
    fontSize: 10,
    color: '#777777',
    marginTop: 1,
  },
  languageTagNativeSelected: {
    color: '#111111',
    fontWeight: '600',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1DB954',
    paddingVertical: 14,
    borderRadius: 16,
  },
  signInButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1212',
    borderWidth: 1,
    borderColor: '#4A1D1D',
    paddingVertical: 14,
    borderRadius: 16,
  },
  signOutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  activeChannelPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  activeChannelText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  updateCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 14,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  updateInfoCol: {
    flex: 1,
  },
  updateInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  updateInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  updateStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotActive: {
    backgroundColor: '#22c55e',
  },
  statusDotPending: {
    backgroundColor: '#38bdf8',
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  checkUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    paddingVertical: 12,
    borderRadius: 14,
  },
  checkUpdateBtnLoading: {
    opacity: 0.8,
  },
  checkUpdateBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
