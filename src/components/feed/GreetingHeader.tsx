import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';

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
  const { profile, isGuest, openProfileModal, openAuthModal } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const effectiveName = propUserName || (!isGuest && profile?.display_name ? profile.display_name : undefined);
  const handleProfilePress = onPressProfile || openProfileModal;

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
          <Text style={styles.greeting}>
            {getGreeting()}
            {effectiveName ? <Text style={styles.userName}>, {effectiveName}</Text> : null}
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          {/* User Profile / Auth Button */}
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={handleProfilePress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Profile & Account"
          >
            {!isGuest ? (
              <View style={styles.avatarPill}>
                <View style={[styles.avatarMiniCircle, { backgroundColor: accent.hex }]}>
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
                <Ionicons name="person-circle-outline" size={24} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          {onPressYSearch && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onPressYSearch}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="YSearch Videos"
            >
              <Ionicons name="logo-youtube" size={21} color="#FF0000" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressNotifications}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingContainer: {
    flex: 1,
    paddingRight: 8,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.4,
  },
  userName: {
    color: '#ffffff',
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatarButton: {
    padding: 4,
    marginRight: 2,
  },
  avatarPill: {
    position: 'relative',
  },
  avatarMiniCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarMiniImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarMiniText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: '#121212',
  },
  guestLoginPill: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
  },
});

