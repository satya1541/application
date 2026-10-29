import { StyleSheet, Platform } from 'react-native';

export const GLASS_THEME = {
  colors: {
    bgBlack: '#000000',
    bgCharcoal: '#070A10',
    bgDarkGradient: ['#0B0F17', '#000000'] as const,
    
    // Glass Surface Fills
    glassSurfaceSubtle: 'rgba(255, 255, 255, 0.045)',
    glassSurfaceDefault: 'rgba(255, 255, 255, 0.065)',
    glassSurfaceElevated: 'rgba(255, 255, 255, 0.095)',
    glassSurfaceActive: 'rgba(255, 255, 255, 0.14)',
    glassNavBg: 'rgba(11, 14, 21, 0.82)',
    glassMiniPlayerBg: 'rgba(14, 18, 26, 0.88)',

    // Silver and Specular Borders
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    borderDefault: 'rgba(255, 255, 255, 0.12)',
    borderSpecular: 'rgba(255, 255, 255, 0.20)',
    borderActive: 'rgba(255, 255, 255, 0.28)',

    // Refined Monochromatic Typography
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8', // Apple Silver / Slate 400
    textMuted: '#64748B',     // Slate 500
    
    // Controlled Accent (Green)
    accentGreen: '#22C55E',
    accentGreenGlow: 'rgba(34, 197, 94, 0.25)',
  },
  radii: {
    pill: 9999,
    nav: 34,
    cardLarge: 20,
    card: 16,
    cardSmall: 12,
    button: 10,
    badge: 8,
  },
  blur: {
    navIntensity: Platform.OS === 'ios' ? 45 : 30,
    cardIntensity: Platform.OS === 'ios' ? 25 : 15,
    overlayIntensity: Platform.OS === 'ios' ? 60 : 40,
  },
};

export const glassStyles = StyleSheet.create({
  card: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderRadius: GLASS_THEME.radii.card,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    overflow: 'hidden',
  },
  cardSubtle: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceSubtle,
    borderRadius: GLASS_THEME.radii.card,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderSubtle,
    overflow: 'hidden',
  },
  pill: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceDefault,
    borderRadius: GLASS_THEME.radii.pill,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: GLASS_THEME.colors.glassSurfaceActive,
    borderColor: GLASS_THEME.colors.borderSpecular,
  },
  floatingNav: {
    backgroundColor: GLASS_THEME.colors.glassNavBg,
    borderRadius: GLASS_THEME.radii.nav,
    borderWidth: 1,
    borderColor: GLASS_THEME.colors.borderDefault,
    overflow: 'hidden',
  },
});

