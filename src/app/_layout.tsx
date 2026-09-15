import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AudioProvider } from '@/contexts/AudioContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { ProfileModal } from '@/components/profile/ProfileModal';
import { MonthlyReplayController } from '@/components/profile/MonthlyReplayController';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initCacheLifecycle } from '@/services/cacheManager';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { initOrientationManager } from '@/services/orientationManager';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Shorty';
    }
    SplashScreen.hideAsync().catch(() => {});
    const cleanupCache = initCacheLifecycle();
    const cleanupOrientation = initOrientationManager();
    return () => {
      cleanupCache();
      cleanupOrientation();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <NetworkProvider>
            <AuthProvider>
              <AudioProvider>
                <StatusBar style="light" />
                <Slot />
                <AuthModal />
                <ProfileModal />
                <MonthlyReplayController />
              </AudioProvider>
            </AuthProvider>
          </NetworkProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
