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
import { UpdateNotificationBanner } from '@/components/common/UpdateNotificationBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initCacheLifecycle } from '@/services/cacheManager';
import { lockPortraitAsync } from '@/services/orientationManager';
import { initUpdateManager } from '@/services/updateService';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { VideoPlayerProvider } from '@/contexts/VideoPlayerContext';
import { GlobalVideoPlayer } from '@/components/video/GlobalVideoPlayer';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Shorty';
    }
    SplashScreen.hideAsync().catch(() => {});
    lockPortraitAsync();
    initUpdateManager();
    const cleanupCache = initCacheLifecycle();
    return () => {
      cleanupCache();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <NetworkProvider>
            <AuthProvider>
              <AudioProvider>
                <VideoPlayerProvider>
                  <StatusBar style="light" />
                  <Slot />
                  <GlobalVideoPlayer />
                  <AuthModal />
                  <ProfileModal />
                  <MonthlyReplayController />
                  <UpdateNotificationBanner />
                </VideoPlayerProvider>
              </AudioProvider>
            </AuthProvider>
          </NetworkProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
