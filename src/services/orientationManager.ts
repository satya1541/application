import { Platform, Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Checks whether the current runtime device qualifies as a tablet.
 * Uses Platform.isPad on iOS and shortest window dimension threshold (>= 600dp) on Android.
 */
export function isTabletDevice(): boolean {
  if (Platform.OS === 'ios') {
    return !!Platform.isPad;
  }
  const { width, height } = Dimensions.get('window');
  const shortest = Math.min(width, height);
  return shortest >= 600;
}

/**
 * Configures orientation based on device form-factor:
 * - Tablets: Auto-rotate unlocked (portrait, landscape-left, landscape-right, portrait-down)
 * - Phones: Locked to standard portrait for comfortable one-handed media browsing
 */
export async function applyDeviceOrientationPolicy(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    if (isTabletDevice()) {
      // Tablets auto-rotate freely with device posture and sensors
      await ScreenOrientation.unlockAsync();
    } else {
      // Handheld phones remain locked to portrait
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  } catch (err) {
    // Non-fatal: some devices/emulators or split-screen modes may restrict orientation changes
    console.warn('[OrientationManager] Could not update orientation lock:', err);
  }
}

/**
 * Unlocks orientation dynamically (e.g. for fullscreen video or tablet mode).
 */
export async function unlockOrientationAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.unlockAsync();
  } catch (err) {
    console.warn('[OrientationManager] unlockAsync failed:', err);
  }
}

/**
 * Locks orientation to portrait.
 */
export async function lockPortraitAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch (err) {
    console.warn('[OrientationManager] lockPortraitAsync failed:', err);
  }
}

/**
 * Locks orientation to landscape.
 */
export async function lockLandscapeAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch (err) {
    console.warn('[OrientationManager] lockLandscapeAsync failed:', err);
  }
}

/**
 * Initializes orientation management with support for foldable devices:
 * When foldables expand/contract, re-evaluates the tablet threshold and applies policy.
 */
export function initOrientationManager(): () => void {
  if (Platform.OS === 'web') return () => {};

  // Apply initial policy
  applyDeviceOrientationPolicy();

  // Listen to dimension changes (e.g. foldables unfolding into tablet mode or window resizing)
  const subscription = Dimensions.addEventListener('change', () => {
    applyDeviceOrientationPolicy();
  });

  return () => {
    subscription?.remove();
  };
}
