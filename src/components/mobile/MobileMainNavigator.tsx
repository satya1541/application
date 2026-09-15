import { useNetwork } from '@/contexts/NetworkContext';
import { useAuth } from '@/contexts/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const { isTablet, navRailWidth } = useResponsive();
  const { user, profile, openProfileModal } = useAuth();
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
    <View
      style={[
        styles.container,
        { backgroundColor: bgHex },
        isTablet && styles.tabletContainer,
      ]}
    >
      {/* Tablet Left Navigation Rail */}
      {isTablet && (
        <View
          style={[
            styles.tabletRail,
            {
              width: navRailWidth,
              backgroundColor: themeMode === 'oled' ? '#000000' : surfaceHex,
              borderRightColor: themeMode === 'oled' ? '#141414' : '#282828',
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          {/* Top Logo / App Title */}
          <View style={styles.railLogoContainer}>
            <View style={[styles.railLogoBadge, { backgroundColor: accent.hex }]}>
              <Ionicons name="musical-notes" size={17} color="#000000" />
            </View>
            <Text style={styles.railLogoText}>Shorty</Text>
          </View>

          {/* Central Nav Buttons */}
          <View style={styles.railNavGroup}>
            {/* 1. Home */}
            <TouchableOpacity
              style={[
                styles.railButton,
                activeTab === 'home' && [
                  styles.railButtonActive,
                  { backgroundColor: `${accent.hex}18` },
                ],
              ]}
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
                  styles.railLabel,
                  activeTab === 'home' && { color: accent.hex, fontWeight: '800' },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>

            {/* 2. Search */}
            <TouchableOpacity
              style={[
                styles.railButton,
                activeTab === 'search' && [
                  styles.railButtonActive,
                  { backgroundColor: `${accent.hex}18` },
                ],
              ]}
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
                  styles.railLabel,
                  activeTab === 'search' && { color: accent.hex, fontWeight: '800' },
                ]}
              >
                Search
              </Text>
            </TouchableOpacity>

            {/* 3. Playlists */}
            <TouchableOpacity
              style={[
                styles.railButton,
                activeTab === 'playlists' && [
                  styles.railButtonActive,
                  { backgroundColor: `${accent.hex}18` },
                ],
              ]}
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
                  styles.railLabel,
                  activeTab === 'playlists' && { color: accent.hex, fontWeight: '800' },
                ]}
              >
                Playlists
              </Text>
            </TouchableOpacity>

            {/* 4. My Lib */}
            <TouchableOpacity
              style={[
                styles.railButton,
                activeTab === 'my_lib' && [
                  styles.railButtonActive,
                  { backgroundColor: `${accent.hex}18` },
                ],
              ]}
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
                  styles.railLabel,
                  activeTab === 'my_lib' && { color: accent.hex, fontWeight: '800' },
                ]}
              >
                My Lib
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Settings & Profile Actions */}
          <View style={styles.railBottomGroup}>
            <TouchableOpacity
              style={styles.railBottomButton}
              onPress={handleOpenSettings}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={21} color="#aaaaaa" />
              <Text style={styles.railBottomLabel}>Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.railBottomButton}
              onPress={openProfileModal}
              activeOpacity={0.7}
            >
              <View style={[styles.railAvatarCircle, { borderColor: accent.hex }]}>
                <Ionicons name="person" size={13} color={accent.hex} />
              </View>
              <Text style={styles.railBottomLabel} numberOfLines={1}>
                {profile?.display_name || user?.email?.split('@')[0] || 'Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Content Column */}
      <View style={styles.mainContentArea}>
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

        {/* MiniPlayer: On tablet docked at bottom (0 offset); on phone sits above bottom tab bar */}
        <MiniPlayer
          bottomOffset={isTablet ? 0 : Platform.OS === 'ios' ? 84 : 64}
        />

        {/* Persistent Spotify Offline Banner sitting right above tab bar / miniplayer */}
        <OfflineBanner
          positionAbsolute={true}
          bottomOffset={isTablet ? 60 : Platform.OS === 'ios' ? 84 : 64}
        />

        {/* Spotify Bottom Tab Navigation Bar (Phone Only) */}
        {!isTablet && (
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
        )}
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
  tabletContainer: {
    flexDirection: 'row',
  },
  mainContentArea: {
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  tabletRail: {
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRightWidth: 1,
    zIndex: 900,
  },
  railLogoContainer: {
    alignItems: 'center',
    gap: 5,
    paddingTop: 6,
  },
  railLogoBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLogoText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  railNavGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  railButton: {
    width: 60,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  railButtonActive: {
    borderRadius: 10,
  },
  railLabel: {
    color: '#999999',
    fontSize: 10,
    fontWeight: '600',
  },
  railBottomGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  railBottomButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  railBottomLabel: {
    color: '#888888',
    fontSize: 9,
    fontWeight: '600',
    maxWidth: 58,
  },
  railAvatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
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

