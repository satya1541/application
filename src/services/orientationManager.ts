import { Platform, Dimensions, AppState } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Detects whether the current device is a tablet.
 * Uses iPad check on iOS and minDimension >= 600 (standard Android sw600dp threshold) on Android.
 */
export function isTabletDevice(): boolean {
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'ios' && (Platform as any).isPad) return true;
  const { width, height } = Dimensions.get('window');
  const minDimension = Math.min(width, height);
  return minDimension >= 600;
}

/**
 * Locks orientation to portrait (top-up) on phones.
 * On tablets, orientation is unlocked to allow smooth auto-rotation.
 */
export async function lockPortraitAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  // Never lock tablets to portrait - allow auto-rotation in portrait and landscape
  if (isTabletDevice()) {
    try {
      if (ScreenOrientation && typeof ScreenOrientation.unlockAsync === 'function') {
        await ScreenOrientation.unlockAsync();
      }
    } catch {}
    return;
  }
  try {
    if (ScreenOrientation && typeof ScreenOrientation.lockAsync === 'function') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  } catch (err) {
    console.warn('[OrientationManager] lockPortraitAsync failed:', err);
  }
}

/**
 * Initializes orientation on app launch.
 * Unlocks orientation for tablets, locks to portrait for phones.
 */
export async function initOrientationAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (isTabletDevice()) {
      if (ScreenOrientation && typeof ScreenOrientation.unlockAsync === 'function') {
        await ScreenOrientation.unlockAsync();
      }
    } else {
      if (ScreenOrientation && typeof ScreenOrientation.lockAsync === 'function') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    }
  } catch (err) {
    console.warn('[OrientationManager] initOrientationAsync failed:', err);
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
        // Never trigger landscape rotation if the app is in background or PiP window
        if (AppState.currentState !== 'active') return;
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
    // In Android PiP, window dimensions are 16:9 (width > height), which must not trigger landscape rotation!
    if (AppState.currentState !== 'active') return;
    callback(window.width > window.height);
  });

  return () => {
    isCleanedUp = true;
    nativeSub?.remove?.();
    dimSub?.remove?.();
  };
}
