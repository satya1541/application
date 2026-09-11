import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { SafeStorage } from '@/services/storage';

export type ThemeMode = 'oled' | 'midnight' | 'slate';
export type AccentColorId = 'green' | 'red' | 'purple' | 'cyan' | 'gold';

export interface AccentOption {
  id: AccentColorId;
  name: string;
  hex: string;
  glow: string;
}

export const ACCENT_COLORS: AccentOption[] = [
  { id: 'green', name: 'Spotify Neon', hex: '#1DB954', glow: 'rgba(29, 185, 84, 0.35)' },
  { id: 'red', name: 'Apple Crimson', hex: '#FA233B', glow: 'rgba(250, 35, 59, 0.35)' },
  { id: 'purple', name: 'Cyberpunk Purple', hex: '#A855F7', glow: 'rgba(168, 85, 247, 0.35)' },
  { id: 'cyan', name: 'Electric Cyan', hex: '#00F5D4', glow: 'rgba(0, 245, 212, 0.35)' },
  { id: 'gold', name: 'Champagne Gold', hex: '#F59E0B', glow: 'rgba(245, 158, 11, 0.35)' },
];

export const THEME_MODES: { id: ThemeMode; name: string; desc: string; bg: string; surface: string }[] = [
  { id: 'oled', name: 'Pure OLED', desc: 'True pitch black, maximum AMOLED battery saving', bg: '#000000', surface: '#0d0d0d' },
  { id: 'midnight', name: 'Midnight Navy', desc: 'Deep subtle galactic navy tint', bg: '#080c14', surface: '#0f1624' },
  { id: 'slate', name: 'Classic Slate', desc: 'Standard studio neutral dark', bg: '#121212', surface: '#1e1e1e' },
];

interface ThemeContextType {
  themeMode: ThemeMode;
  accentId: AccentColorId;
  accent: AccentOption;
  bgHex: string;
  surfaceHex: string;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (accent: AccentColorId) => void;
}

const STORAGE_KEY_THEME_MODE = '@shorty_theme_mode_v1';
const STORAGE_KEY_ACCENT = '@shorty_theme_accent_v1';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('oled');
  const [accentId, setAccentIdState] = useState<AccentColorId>('green');

  useEffect(() => {
    SafeStorage.getItem(STORAGE_KEY_THEME_MODE)
      .then((savedMode) => {
        if (savedMode === 'oled' || savedMode === 'midnight' || savedMode === 'slate') {
          setThemeModeState(savedMode);
        }
      })
      .catch(() => {});

    SafeStorage.getItem(STORAGE_KEY_ACCENT)
      .then((savedAccent) => {
        if (ACCENT_COLORS.some((a) => a.id === savedAccent)) {
          setAccentIdState(savedAccent as AccentColorId);
        }
      })
      .catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    SafeStorage.setItem(STORAGE_KEY_THEME_MODE, mode).catch(() => {});
  }, []);

  const setAccentColor = useCallback((accent: AccentColorId) => {
    setAccentIdState(accent);
    SafeStorage.setItem(STORAGE_KEY_ACCENT, accent).catch(() => {});
  }, []);

  const activeAccent = useMemo(
    () => ACCENT_COLORS.find((a) => a.id === accentId) || ACCENT_COLORS[0],
    [accentId]
  );

  const activeModeConfig = useMemo(
    () => THEME_MODES.find((m) => m.id === themeMode) || THEME_MODES[0],
    [themeMode]
  );

  const value = useMemo(
    () => ({
      themeMode,
      accentId,
      accent: activeAccent,
      bgHex: activeModeConfig.bg,
      surfaceHex: activeModeConfig.surface,
      setThemeMode,
      setAccentColor,
    }),
    [themeMode, accentId, activeAccent, activeModeConfig, setThemeMode, setAccentColor]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      themeMode: 'oled',
      accentId: 'green',
      accent: ACCENT_COLORS[0],
      bgHex: '#000000',
      surfaceHex: '#0d0d0d',
      setThemeMode: () => {},
      setAccentColor: () => {},
    };
  }
  return context;
};
