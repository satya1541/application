import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { GLASS_THEME } from '@/constants/glassTheme';

interface GreetingHeaderProps {
  userName?: string;
  onPressNotifications?: () => void;
  onPressSettings?: () => void;
  onPressProfile?: () => void;
  onPressYSearch?: () => void;
}

export const GreetingHeader: React.FC<GreetingHeaderProps> = ({
  userName: propUserName,
  onPressNotifications,
  onPressSettings,
  onPressProfile,
  onPressYSearch,
}) => {
  const { accent, bgHex } = useAppTheme();
  const { profile, isGuest, openProfileModal } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const effectiveName = propUserName || (!isGuest && profile?.display_name ? profile.display_name : undefined);
  const handleProfilePress = () => {
    if (onPressProfile) {
      onPressProfile();
    } else {
      openProfileModal('profile');
    }
  };

  const handleSettingsPress = () => {
    if (onPressSettings) {
      onPressSettings();
    } else {
      openProfileModal('settings');
    }
  };

  const initials = (profile?.display_name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join('') || 'U';

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.greetingContainer}
          onPress={handleProfilePress}
          activeOpacity={0.8}
        >
          {effectiveName ? (
            <>
              <Text style={styles.greetingSubtitle}>{getGreeting()},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {effectiveName}
              </Text>
            </>
          ) : (
            <Text style={styles.singleGreetingTitle}>{getGreeting()}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.actions}>
          {/* User Profile Avatar */}
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={handleProfilePress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Profile & Account"
          >
            {!isGuest ? (
              <View style={styles.avatarPill}>
                <View style={[styles.avatarMiniCircle, { borderColor: accent.hex }]}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatarMiniImage} />
                  ) : (
                    <Text style={styles.avatarMiniText}>{initials}</Text>
                  )}
                </View>
                <View style={[styles.onlineDot, { borderColor: bgHex }]} />
              </View>
            ) : (
              <View style={styles.guestLoginPill}>
                <Ionicons name="person-circle-outline" size={28} color="#E2E8F0" />
              </View>
            )}
          </TouchableOpacity>

          {/* YouTube Icon Pill */}
          {onPressYSearch && (
            <TouchableOpacity
              style={styles.glassIconButton}
              onPress={onPressYSearch}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="YSearch Videos"
            >
              <Ionicons name="logo-youtube" size={17} color="#FF0000" />
            </TouchableOpacity>
          )}

          {/* Notifications Button */}
          <TouchableOpacity
            style={styles.glassIconButton}
            onPress={onPressNotifications}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Settings Button */}
          <TouchableOpacity
            style={styles.glassIconButton}
            onPress={handleSettingsPress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingContainer: {
    flex: 1,
    paddingRight: 10,
    justifyContent: 'center',
  },
  greetingSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: -0.1,
    marginBottom: 1,
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  singleGreetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarButton: {
    padding: 2,
  },
  avatarPill: {
    position: 'relative',
  },
  avatarMiniCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarMiniImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarMiniText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GLASS_THEME.colors.accentGreen,
    borderWidth: 1.5,
  },
  guestLoginPill: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
