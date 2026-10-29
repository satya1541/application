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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { OfflineBanner } from '../common/OfflineBanner';
import { FullPlayerModal } from '../player/FullPlayerModal';
import { MiniPlayer } from '../player/MiniPlayer';
import { MobileHomeScreen } from './MobileHomeScreen';
import { MobileExploreScreen } from './MobileExploreScreen';
import { MobileLibraryScreen } from './MobileLibraryScreen';
import { MobilePostsScreen } from './MobilePostsScreen';
import { MobileSearchScreen } from './MobileSearchScreen';
import { MyLibScreen } from './MyLibScreen';
import { SettingsScreen } from './SettingsScreen';
import { YSearchScreen } from '../video/YSearchScreen';
import { SongActionMenu } from '../common/SongActionMenu';
import { QueueModal } from '../explore/QueueModal';
import { useAppTheme } from '@/contexts/ThemeContext';
import { GLASS_THEME } from '@/constants/glassTheme';
import { useResponsive } from '@/hooks/useResponsive';

type TabKey = 'home' | 'explore' | 'search' | 'playlists' | 'posts' | 'my_lib';

const TABS: Array<{
  key: TabKey;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'home', label: 'Home', activeIcon: 'home', inactiveIcon: 'home-outline' },
  { key: 'explore', label: 'Explore', activeIcon: 'compass', inactiveIcon: 'compass-outline' },
  { key: 'search', label: 'Search', activeIcon: 'search', inactiveIcon: 'search-outline' },
  { key: 'playlists', label: 'Playlists', activeIcon: 'albums', inactiveIcon: 'albums-outline' },
  { key: 'posts', label: 'Posts', activeIcon: 'newspaper', inactiveIcon: 'newspaper-outline' },
  { key: 'my_lib', label: 'My Lib', activeIcon: 'library', inactiveIcon: 'library-outline' },
];

export const MobileMainNavigator: React.FC = () => {
  const { bgHex, accent } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [visitedTabs, setVisitedTabs] = useState<Record<TabKey, boolean>>({
    home: true,
    explore: false,
    search: false,
    playlists: false,
    posts: false,
    my_lib: false,
  });
  const [myLibRefreshTrigger, setMyLibRefreshTrigger] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [ySearchVisible, setYSearchVisible] = useState(false);
  const { isOffline } = useNetwork();

  // Animated values for smooth cross-screen transitions
  const homeOpacity = useRef(new Animated.Value(1)).current;
  const homeTranslateY = useRef(new Animated.Value(0)).current;

  const exploreOpacity = useRef(new Animated.Value(0)).current;
  const exploreTranslateY = useRef(new Animated.Value(8)).current;

  const searchOpacity = useRef(new Animated.Value(0)).current;
  const searchTranslateY = useRef(new Animated.Value(8)).current;

  const playlistsOpacity = useRef(new Animated.Value(0)).current;
  const playlistsTranslateY = useRef(new Animated.Value(8)).current;

  const postsOpacity = useRef(new Animated.Value(0)).current;
  const postsTranslateY = useRef(new Animated.Value(8)).current;

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
    if (activeTab === 'explore') animateScreenOut(exploreOpacity);
    if (activeTab === 'search') animateScreenOut(searchOpacity);
    if (activeTab === 'playlists') animateScreenOut(playlistsOpacity);
    if (activeTab === 'posts') animateScreenOut(postsOpacity);
    if (activeTab === 'my_lib') animateScreenOut(myLibOpacity);

    // Incoming animation
    if (tab === 'home') animateScreenIn(homeOpacity, homeTranslateY);
    if (tab === 'explore') animateScreenIn(exploreOpacity, exploreTranslateY);
    if (tab === 'search') animateScreenIn(searchOpacity, searchTranslateY);
    if (tab === 'playlists') animateScreenIn(playlistsOpacity, playlistsTranslateY);
    if (tab === 'posts') animateScreenIn(postsOpacity, postsTranslateY);
    if (tab === 'my_lib') animateScreenIn(myLibOpacity, myLibTranslateY);

    setActiveTab(tab);
  };

  // Global Android Back Button / Edge Gesture fallback:
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      if (ySearchVisible) {
        setYSearchVisible(false);
        return true;
      }
      if (activeTab !== 'home') {
        handleSelectTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, settingsVisible, ySearchVisible, visitedTabs]);

  const { isTablet, useSidebarNavigation, sidebarWidth, navMaxWidth } = useResponsive();

  const handleOpenSettings = useCallback(() => {
    setSettingsVisible(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  const handleOpenYSearch = useCallback(() => {
    setYSearchVisible(true);
  }, []);

  const handleCloseYSearch = useCallback(() => {
    setYSearchVisible(false);
  }, []);

  const navBottomSpacing = Platform.OS === 'ios' ? 84 : 72;

  return (
    <View style={[styles.container, { backgroundColor: bgHex }, useSidebarNavigation && styles.rowLayout]}>
      {/* Floating Liquid Glass Left Sidebar for iPadOS / Tablet Landscape */}
      {useSidebarNavigation && !ySearchVisible && (
        <View style={[styles.tabletSidebar, { width: sidebarWidth }]}>
          <BlurView
            intensity={GLASS_THEME.blur.navIntensity}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Sidebar Brand Header */}
          <View style={styles.sidebarHeader}>
            <View style={styles.brandRow}>
              <View style={[styles.brandDot, { backgroundColor: accent.hex }]} />
              <Text style={styles.brandTitle}>SHORTY</Text>
            </View>
            <TouchableOpacity
              onPress={handleOpenSettings}
              style={styles.sidebarIconBtn}
              activeOpacity={0.7}
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Sidebar Nav List */}
          <View style={styles.sidebarNavList}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.sidebarTabBtn, isActive && styles.activeSidebarTabBtn]}
                  onPress={() => handleSelectTab(tab.key)}
                  activeOpacity={0.75}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={21}
                    color={isActive ? '#FFFFFF' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.sidebarTabLabel,
                      isActive ? [styles.activeSidebarTabLabel, { color: accent.hex }] : styles.inactiveSidebarTabLabel,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                  {isActive && (
                    <View style={[styles.sidebarActiveIndicator, { backgroundColor: accent.hex }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sidebar Bottom Offline status */}
          {isOffline && (
            <View style={styles.sidebarOfflinePill}>
              <Ionicons name="cloud-offline-outline" size={16} color="#F59E0B" />
              <Text style={styles.sidebarOfflineText}>Offline Mode</Text>
            </View>
          )}
        </View>
      )}

      {/* 6 Cross-Fading Persistent Screen Layers */}
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
          <MobileHomeScreen
            onOpenSettings={handleOpenSettings}
            onOpenYSearch={handleOpenYSearch}
          />
        </Animated.View>

        {/* Layer 2: Explore (YT Music Explore) */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: exploreOpacity,
              transform: [{ translateY: exploreTranslateY }],
              zIndex: activeTab === 'explore' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'explore' ? 'auto' : 'none'}
        >
          {visitedTabs.explore && (
            <MobileExploreScreen
              onNavigateHome={() => handleSelectTab('home')}
              onOpenYSearch={handleOpenYSearch}
            />
          )}
        </Animated.View>

        {/* Layer 3: Search */}
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
            <MobileSearchScreen
              onNavigateHome={() => handleSelectTab('home')}
              onOpenYSearch={handleOpenYSearch}
            />
          )}
        </Animated.View>

        {/* Layer 4: Playlists (Curated catalog) */}
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

        {/* Layer 5: Posts (YouTube Community Feed) */}
        <Animated.View
          style={[
            styles.tabPane,
            {
              opacity: postsOpacity,
              transform: [{ translateY: postsTranslateY }],
              zIndex: activeTab === 'posts' ? 10 : 1,
            },
          ]}
          pointerEvents={activeTab === 'posts' ? 'auto' : 'none'}
        >
          {visitedTabs.posts && (
            <MobilePostsScreen onNavigateHome={() => handleSelectTab('home')} />
          )}
        </Animated.View>

        {/* Layer 6: My Lib (User created playlists + history) */}
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

        {/* Floating MiniPlayer sitting directly above floating tab bar or docked in right pane */}
        {!ySearchVisible && !settingsVisible && (
          <View
            style={[
              useSidebarNavigation ? styles.sidebarMiniPlayerWrapper : styles.miniPlayerFloatingHost,
              isTablet && !useSidebarNavigation && styles.tabletPortraitMiniPlayerHost,
            ]}
            pointerEvents="box-none"
          >
            <MiniPlayer bottomOffset={useSidebarNavigation ? 16 : navBottomSpacing} />
            <OfflineBanner positionAbsolute={true} bottomOffset={useSidebarNavigation ? 16 : navBottomSpacing} />
          </View>
        )}
      </View>

      {/* Floating Liquid Glass Bottom Navigation Bar (Phone & Tablet Portrait) */}
      {!useSidebarNavigation && !ySearchVisible && (
        <View
          style={[
            styles.floatingNavContainer,
            navMaxWidth ? { maxWidth: navMaxWidth, alignSelf: 'center', width: '100%' } : null,
          ]}
        >
          <BlurView
            intensity={GLASS_THEME.blur.navIntensity}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.navRow}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabButton, isActive && styles.activeTabCapsule]}
                  onPress={() => handleSelectTab(tab.key)}
                  activeOpacity={0.75}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={isActive ? 21 : 20}
                    color={isActive ? '#FFFFFF' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive ? [styles.activeTabLabel, { color: accent.hex }] : styles.inactiveTabLabel,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* YSearch Screen Full Overlay */}
      {ySearchVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: bgHex }]}>
          <YSearchScreen onBack={handleCloseYSearch} />
        </View>
      )}

      {/* Settings Screen Full Overlay */}
      {settingsVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1100, backgroundColor: bgHex }]}>
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
    backgroundColor: '#000000',
  },
  rowLayout: {
    flexDirection: 'row',
  },
  tabletSidebar: {
    height: '96%',
    marginVertical: '2%',
    marginLeft: 14,
    borderRadius: 24,
    backgroundColor: GLASS_THEME.colors.glassNavBg,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    overflow: 'hidden',
    zIndex: 950,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 12,
    paddingTop: Platform.OS === 'ios' ? 24 : 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: GLASS_THEME.colors.borderSubtle,
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  sidebarIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: GLASS_THEME.colors.glassSurfaceSubtle,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarNavList: {
    flex: 1,
    gap: 6,
  },
  sidebarTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 12,
    position: 'relative',
  },
  activeSidebarTabBtn: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceActive,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderSpecular,
  },
  sidebarTabLabel: {
    fontSize: 14,
    letterSpacing: -0.2,
    flex: 1,
  },
  inactiveSidebarTabLabel: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  activeSidebarTabLabel: {
    fontWeight: '700',
  },
  sidebarActiveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sidebarOfflinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginTop: 8,
  },
  sidebarOfflineText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  miniPlayerFloatingHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 25,
  },
  tabletPortraitMiniPlayerHost: {
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  sidebarMiniPlayerWrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    zIndex: 9999,
    elevation: 25,
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
  floatingNavContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 22 : 12,
    height: 60,
    borderRadius: 30,
    backgroundColor: GLASS_THEME.colors.glassNavBg,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    overflow: 'hidden',
    zIndex: 900,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 20,
    gap: 2,
  },
  activeTabCapsule: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: -0.1,
  },
  inactiveTabLabel: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  activeTabLabel: {
    fontWeight: '700',
  },
});
