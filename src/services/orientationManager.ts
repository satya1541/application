import { Platform, Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Checks whether the current window dimensions indicate landscape mode.
 */
export function isLandscape(): boolean {
  const { width, height } = Dimensions.get('window');
  return width > height;
}

/**
 * Unlocks orientation dynamically.
 */
export async function unlockOrientationAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (ScreenOrientation && typeof ScreenOrientation.unlockAsync === 'function') {
      await ScreenOrientation.unlockAsync();
    }
  } catch (err) {
    console.warn('[OrientationManager] unlockAsync failed:', err);
  }
}

/**
 * Locks orientation to portrait (top-up).
 */
export async function lockPortraitAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (ScreenOrientation && typeof ScreenOrientation.lockAsync === 'function') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  } catch (err) {
    console.warn('[OrientationManager] lockPortraitAsync failed:', err);
  }
}

/**
 * Locks orientation to landscape (allows rotating between left and right landscape).
 */
export async function lockLandscapeAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (ScreenOrientation && typeof ScreenOrientation.lockAsync === 'function') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  } catch (err) {
    console.warn('[OrientationManager] lockLandscapeAsync failed:', err);
  }
}

/**
 * Subscribes to orientation changes, supporting both expo-screen-orientation native listener
 * and React Native Dimensions fallback.
 *
 * @param callback Called with `true` when entering landscape, `false` when in portrait.
 * @returns Unsubscribe cleanup function.
 */
export function addOrientationListener(callback: (isLandscapeMode: boolean) => void): () => void {
  let isCleanedUp = false;
  let nativeSub: { remove: () => void } | null = null;

  // 1. Try native ScreenOrientation listener for immediate sensor response
  if (Platform.OS !== 'web' && ScreenOrientation && typeof ScreenOrientation.addOrientationChangeListener === 'function') {
    try {
      nativeSub = ScreenOrientation.addOrientationChangeListener((event) => {
        if (isCleanedUp) return;
        const orient = event.orientationInfo.orientation;
        const isLand =
          orient === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orient === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        callback(isLand);
      });
    } catch (err) {
      console.warn('[OrientationManager] Failed to attach native listener:', err);
    }
  }

  // 2. Also listen to Dimensions change as universal fallback
  const dimSub = Dimensions.addEventListener('change', ({ window }) => {
    if (isCleanedUp) return;
    callback(window.width > window.height);
  });

  return () => {
    isCleanedUp = true;
    nativeSub?.remove?.();
    dimSub?.remove?.();
  };
}
