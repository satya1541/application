import { useNetwork } from '@/contexts/NetworkContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    BackHandler,
    Easing,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { OfflineBanner } from '../common/OfflineBanner';
import { FullPlayerModal } from '../player/FullPlayerModal';
import { MiniPlayer } from '../player/MiniPlayer';
import { MobileHomeScreen } from './MobileHomeScreen';
import { MobileLibraryScreen } from './MobileLibraryScreen';
import { MobileSearchScreen } from './MobileSearchScreen';
import { MyLibScreen } from './MyLibScreen';
import { SettingsScreen } from './SettingsScreen';
import { SongActionMenu } from '../common/SongActionMenu';
import { QueueModal } from '../explore/QueueModal';
import { useAppTheme } from '@/contexts/ThemeContext';

type TabKey = 'home' | 'search' | 'playlists' | 'my_lib';

export const MobileMainNavigator: React.FC = () => {
  const { bgHex, surfaceHex, accent, themeMode } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [visitedTabs, setVisitedTabs] = useState<Record<TabKey, boolean>>({
    home: true,
    search: false,
    playlists: false,
    my_lib: false,
  });
  const [myLibRefreshTrigger, setMyLibRefreshTrigger] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { isOffline } = useNetwork();

  // Animated values for smooth cross-screen transitions
  const homeOpacity = useRef(new Animated.Value(1)).current;
  const homeTranslateY = useRef(new Animated.Value(0)).current;

  const searchOpacity = useRef(new Animated.Value(0)).current;
  const searchTranslateY = useRef(new Animated.Value(8)).current;

  const playlistsOpacity = useRef(new Animated.Value(0)).current;
  const playlistsTranslateY = useRef(new Animated.Value(8)).current;

  const myLibOpacity = useRef(new Animated.Value(0)).current;
  const myLibTranslateY = useRef(new Animated.Value(8)).current;

  const animateScreenIn = (opacity: Animated.Value, translateY: Animated.Value) => {
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateScreenOut = (opacity: Animated.Value) => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleSelectTab = (tab: TabKey) => {
    if (tab === activeTab) {
      if (tab === 'my_lib') {
        setMyLibRefreshTrigger((prev) => prev + 1);
      }
      return;
    }

    if (!visitedTabs[tab]) {
      setVisitedTabs((prev) => ({ ...prev, [tab]: true }));
    }

    // Outgoing animation
    if (activeTab === 'home') animateScreenOut(homeOpacity);
    if (activeTab === 'search') animateScreenOut(searchOpacity);
    if (activeTab === 'playlists') animateScreenOut(playlistsOpacity);
    if (activeTab === 'my_lib') animateScreenOut(myLibOpacity);

    // Incoming animation
    if (tab === 'home') animateScreenIn(homeOpacity, homeTranslateY);
    if (tab === 'search') animateScreenIn(searchOpacity, searchTranslateY);
    if (tab === 'playlists') animateScreenIn(playlistsOpacity, playlistsTranslateY);
    if (tab === 'my_lib') animateScreenIn(myLibOpacity, myLibTranslateY);

    setActiveTab(tab);
  };

  // Global Android Back Button / Edge Gesture fallback:
  // If user is on Search, Playlists, or My Lib, back navigation routes to Home instead of closing app
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      if (activeTab !== 'home') {
        handleSelectTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, settingsVisible, visitedTabs]);

  const handleOpenSettings = useCallback(() => {
    setSettingsVisible(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bgHex }]}>
      {/* 4 Cross-Fading Persistent Screen Layers */}
      <View style={styles.screenContainer}>
        {/* Layer 1: Home */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: homeOpacity,
              transform: [{ translateY: homeTranslateY }],
              zIndex: activeTab === 'home' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'home' ? 'auto' : 'none'}
        >
          <MobileHomeScreen onOpenSettings={handleOpenSettings} />
        </Animated.View>

        {/* Layer 2: Search */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: searchOpacity,
              transform: [{ translateY: searchTranslateY }],
              zIndex: activeTab === 'search' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'search' ? 'auto' : 'none'}
        >
          {visitedTabs.search && (
            <MobileSearchScreen onNavigateHome={() => handleSelectTab('home')} />
          )}
        </Animated.View>

        {/* Layer 3: Playlists (Curated catalog) */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: playlistsOpacity,
              transform: [{ translateY: playlistsTranslateY }],
              zIndex: activeTab === 'playlists' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'playlists' ? 'auto' : 'none'}
        >
          {visitedTabs.playlists && (
            <MobileLibraryScreen onNavigateHome={() => handleSelectTab('home')} />
          )}
        </Animated.View>

        {/* Layer 4: My Lib (User created playlists + history) */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: myLibOpacity,
              transform: [{ translateY: myLibTranslateY }],
              zIndex: activeTab === 'my_lib' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'my_lib' ? 'auto' : 'none'}
        >
          {visitedTabs.my_lib && (
            <MyLibScreen
              isActive={activeTab === 'my_lib'}
              refreshTrigger={myLibRefreshTrigger}
            />
          )}
        </Animated.View>
      </View>

      {/* Floating MiniPlayer sitting right above tab bar */}
      <MiniPlayer bottomOffset={Platform.OS === 'ios' ? 84 : 64} />

      {/* Persistent Spotify Offline Banner sitting right above tab bar */}
      <OfflineBanner positionAbsolute={true} bottomOffset={Platform.OS === 'ios' ? 84 : 64} />

      {/* Spotify Bottom Tab Navigation Bar (4 Distinct Tabs) */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: themeMode === 'oled' ? '#000000' : surfaceHex,
            borderTopColor: themeMode === 'oled' ? '#141414' : '#282828',
          },
        ]}
      >
        {/* 1. Home */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleSelectTab('home')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={23}
            color={activeTab === 'home' ? accent.hex : '#999999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'home' && { color: accent.hex, fontWeight: '800' },
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        {/* 2. Search */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleSelectTab('search')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'search' ? 'search' : 'search-outline'}
            size={23}
            color={activeTab === 'search' ? accent.hex : '#999999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'search' && { color: accent.hex, fontWeight: '800' },
            ]}
          >
            Search
          </Text>
        </TouchableOpacity>

        {/* 3. Playlists (Curated catalog) */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleSelectTab('playlists')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'playlists' ? 'albums' : 'albums-outline'}
            size={23}
            color={activeTab === 'playlists' ? accent.hex : '#999999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'playlists' && { color: accent.hex, fontWeight: '800' },
            ]}
          >
            Playlists
          </Text>
        </TouchableOpacity>

        {/* 4. My Lib (Personal library) */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleSelectTab('my_lib')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'my_lib' ? 'library' : 'library-outline'}
            size={23}
            color={activeTab === 'my_lib' ? accent.hex : '#999999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'my_lib' && { color: accent.hex, fontWeight: '800' },
            ]}
          >
            My Lib
          </Text>
        </TouchableOpacity>
      </View>

      {/* Settings Screen Full Overlay (Preserves tab hierarchy & state underneath) */}
      {settingsVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: bgHex }]}>
          <SettingsScreen onBack={handleCloseSettings} />
        </View>
      )}

      {/* Global Modals Mounted at Root */}
      <FullPlayerModal />
      <QueueModal />
      <SongActionMenu />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
  tabPane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 84 : 62,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#282828',
    paddingBottom: Platform.OS === 'ios' ? 24 : 6,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 900,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    color: '#999999',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  activeTabLabel: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
