import { useWindowDimensions } from 'react-native';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  
  // Grid columns
  quickAccessColumns: number;
  gridCardColumns: number;
  categoryColumns: number;
  playlistColumns: number;
  
  // Container sizing
  contentMaxWidth: number | undefined;
  modalMaxWidth: number | string;
  modalMaxHeight: number | string;
  sidebarWidth: number;
  
  // Navigation
  useSidebarNavigation: boolean;
  navMaxWidth: number | undefined;
}

/**
 * Global responsive layout hook providing iPadOS/Tablet-aware breakpoints,
 * multi-column grid counts, and layout constraints.
 */
export function useResponsive(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isPortrait = !isLandscape;

  // Tablet threshold: >= 768px (iPad Mini portrait is 768, standard iPad is 810-834)
  const isTablet = width >= 768 || (height >= 768 && isLandscape && width >= 600);
  // Large Tablet threshold: >= 1024px (iPad Pro 11"/12.9", large desktop/tablets in landscape)
  const isLargeTablet = width >= 1024;

  // Multi-column counts based on screen width
  let quickAccessColumns = 2;
  let gridCardColumns = 2;
  let categoryColumns = 3;
  let playlistColumns = 2;

  if (width >= 1200) {
    quickAccessColumns = 4;
    gridCardColumns = 4;
    categoryColumns = 6;
    playlistColumns = 4;
  } else if (width >= 960) {
    quickAccessColumns = 3;
    gridCardColumns = 3;
    categoryColumns = 5;
    playlistColumns = 3;
  } else if (isTablet) {
    quickAccessColumns = 3;
    gridCardColumns = 3;
    categoryColumns = 4;
    playlistColumns = 3;
  }

  // Use Sidebar navigation when in tablet landscape or large tablet
  const useSidebarNavigation = isTablet && isLandscape && width >= 900;

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isLandscape,
    isPortrait,
    quickAccessColumns,
    gridCardColumns,
    categoryColumns,
    playlistColumns,
    contentMaxWidth: isTablet ? (isLargeTablet ? 1440 : 1080) : undefined,
    modalMaxWidth: isTablet ? (isLargeTablet ? 880 : 720) : '100%',
    modalMaxHeight: isTablet ? '92%' : '100%',
    sidebarWidth: 250,
    useSidebarNavigation,
    navMaxWidth: isTablet && !useSidebarNavigation ? 620 : undefined,
  };
}

