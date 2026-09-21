import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { MobileMainNavigator } from '@/components/mobile/MobileMainNavigator';
import { WelcomeAuthScreen } from '@/components/auth/WelcomeAuthScreen';

export default function Index() {
  const { user, isLoading } = useAuth();
  const { bgHex, accent } = useAppTheme();

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: bgHex }]}>
        <ActivityIndicator size="large" color={accent.hex} />
      </View>
    );
  }

  // Auth gate: In production APK / OTA updates, require user login.
  // In local development (npx expo start / __DEV__), automatically bypass to Home.
  if (!user && !__DEV__) {
    return <WelcomeAuthScreen />;
  }

  return (
    <View style={[styles.root, { backgroundColor: bgHex }]}>
      <MobileMainNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
