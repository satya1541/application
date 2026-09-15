import { useWindowDimensions } from 'react-native';

export interface ResponsiveInfo {
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
  isLargeTablet: boolean;
  isDesktop: boolean;
  contentPadding: number;
  maxContentWidth: number;
  maxModalWidth: number;
  navRailWidth: number;
  navigationType: 'rail' | 'bottom-bar';
  columns: {
    quickAccess: number;
    playlists: number;
    browseCategories: number;
    mediaCarouselCardWidth: number;
  };
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const shortestDimension = Math.min(width, height);
  const isLandscape = width > height;
  
  // Standard tablet threshold: shortest edge >= 600 or current width >= 768
  const isTablet = shortestDimension >= 600 || width >= 768;
  const isLargeTablet = shortestDimension >= 720 || width >= 1024;
  const isDesktop = width >= 1280;

  const contentPadding = isTablet ? (isLandscape ? 28 : 22) : 16;
  const navRailWidth = isTablet ? (isLandscape ? 84 : 74) : 0;

  // Adaptive column counts
  const quickAccessColumns = isTablet ? 3 : 2;
  
  let playlistColumns = 2;
  if (isLargeTablet && isLandscape) {
    playlistColumns = 5;
  } else if (isTablet) {
    playlistColumns = isLandscape ? 4 : 3;
  }

  let browseColumns = 2;
  if (isLargeTablet && isLandscape) {
    browseColumns = 4;
  } else if (isTablet) {
    browseColumns = isLandscape ? 4 : 3;
  }

  const mediaCarouselCardWidth = isTablet ? 168 : 144;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    isLargeTablet,
    isDesktop,
    contentPadding,
    maxContentWidth: 1200,
    maxModalWidth: 680,
    navRailWidth,
    navigationType: isTablet ? 'rail' : 'bottom-bar',
    columns: {
      quickAccess: quickAccessColumns,
      playlists: playlistColumns,
      browseCategories: browseColumns,
      mediaCarouselCardWidth,
    },
  };
}

export { isTabletDevice, unlockOrientationAsync, lockPortraitAsync, lockLandscapeAsync } from '@/services/orientationManager';
