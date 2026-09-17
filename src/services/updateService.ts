import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { APP_CONFIG } from '@/config/version';

const LAST_SEEN_UPDATE_KEY = '@shorty_last_seen_update_id';
const LAST_SEEN_VERSION_KEY = '@shorty_last_seen_version';

export interface AppUpdateStatus {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean; // Downloaded and ready to apply
  displayVersion: string;
  releaseName: string;
  currentUpdateId: string | null;
  shortUpdateId: string;
  isEmbedded: boolean;
  channel: string;
  runtimeVersion: string;
  lastCheckedAt: Date | null;
  recentlyUpdated: boolean;
}

type UpdateListener = (status: AppUpdateStatus) => void;
const listeners = new Set<UpdateListener>();

let currentStatus: AppUpdateStatus = {
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  displayVersion: APP_CONFIG.otaVersion,
  releaseName: APP_CONFIG.releaseName,
  currentUpdateId: Updates.updateId || null,
  shortUpdateId: Updates.updateId ? Updates.updateId.substring(0, 8) : 'Embedded',
  isEmbedded: Updates.isEmbeddedLaunch ?? true,
  channel: Updates.channel || APP_CONFIG.channel,
  runtimeVersion: Updates.runtimeVersion || APP_CONFIG.baseVersion,
  lastCheckedAt: null,
  recentlyUpdated: false,
};

function notifyListeners() {
  listeners.forEach((l) => l({ ...currentStatus }));
}

export function subscribeToUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener({ ...currentStatus });
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateStatus(): AppUpdateStatus {
  return { ...currentStatus };
}

/**
 * Initializes update tracking:
 * 1. Checks if the app was just launched with a newly applied OTA update
 * 2. Checks if an update is available on startup
 * 3. Listens for app coming to foreground
 */
export async function initUpdateManager(): Promise<void> {
  // 1. Detect if this is a newly applied update (version bump or update ID change)
  try {
    const lastSeenId = await AsyncStorage.getItem(LAST_SEEN_UPDATE_KEY);
    const lastSeenVersion = await AsyncStorage.getItem(LAST_SEEN_VERSION_KEY);
    const activeId = Updates.updateId;
    const currentVersion = APP_CONFIG.otaVersion;

    const isNewUpdate =
      (activeId && lastSeenId && activeId !== lastSeenId) ||
      (lastSeenVersion && lastSeenVersion !== currentVersion);

    if (isNewUpdate) {
      currentStatus = {
        ...currentStatus,
        recentlyUpdated: true,
        displayVersion: currentVersion,
        currentUpdateId: activeId || currentStatus.currentUpdateId,
        shortUpdateId: activeId ? activeId.substring(0, 8) : currentVersion,
      };
      notifyListeners();

      // Clear recentlyUpdated celebration toast after 7 seconds
      setTimeout(() => {
        currentStatus.recentlyUpdated = false;
        notifyListeners();
      }, 7000);
    }

    if (activeId) {
      await AsyncStorage.setItem(LAST_SEEN_UPDATE_KEY, activeId);
    }
    await AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
  } catch (err) {
    console.warn('[UpdateManager] Error checking last update id:', err);
  }

  // 2. Check for new updates on launch in standalone/preview builds
  if (!__DEV__ && Updates.isEnabled) {
    setTimeout(() => {
      checkAndFetchUpdateSilently().catch(() => {});
    }, 2500); // 2.5s delay to let UI render first smoothly

    // 3. Check on foreground resume
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAndFetchUpdateSilently().catch(() => {});
      }
    });
  }
}

/**
 * Silently checks if a new update is available and downloads it in the background.
 * When downloaded, it alerts the UI so a "New Update Received! Restart" banner appears.
 */
export async function checkAndFetchUpdateSilently(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;

  try {
    currentStatus.isChecking = true;
    currentStatus.lastCheckedAt = new Date();
    notifyListeners();

    const check = await Updates.checkForUpdateAsync();
    currentStatus.isChecking = false;

    if (check.isAvailable) {
      currentStatus.isUpdateAvailable = true;
      currentStatus.isDownloading = true;
      notifyListeners();

      const fetchResult = await Updates.fetchUpdateAsync();
      currentStatus.isDownloading = false;

      if (fetchResult.isNew) {
        currentStatus.isUpdatePending = true;
        notifyListeners();
        return true;
      }
    } else {
      currentStatus.isUpdateAvailable = false;
      notifyListeners();
    }
  } catch (err) {
    currentStatus.isChecking = false;
    currentStatus.isDownloading = false;
    notifyListeners();
  }
  return false;
}

/**
 * Manually triggered from Profile / Settings modal by user.
 * Returns full result object so UI can display specific alerts/toasts.
 */
export async function checkAndApplyUpdateManually(): Promise<{
  isNew: boolean;
  isAvailable: boolean;
  error?: string;
}> {
  if (__DEV__ || !Updates.isEnabled) {
    return {
      isNew: false,
      isAvailable: false,
      error: 'Updates are enabled in installed app builds.',
    };
  }

  try {
    currentStatus.isChecking = true;
    currentStatus.lastCheckedAt = new Date();
    notifyListeners();

    const check = await Updates.checkForUpdateAsync();
    currentStatus.isChecking = false;

    if (!check.isAvailable) {
      currentStatus.isUpdateAvailable = false;
      notifyListeners();
      return { isNew: false, isAvailable: false };
    }

    currentStatus.isUpdateAvailable = true;
    currentStatus.isDownloading = true;
    notifyListeners();

    const fetchResult = await Updates.fetchUpdateAsync();
    currentStatus.isDownloading = false;

    if (fetchResult.isNew) {
      currentStatus.isUpdatePending = true;
      notifyListeners();
      return { isNew: true, isAvailable: true };
    }

    notifyListeners();
    return { isNew: false, isAvailable: true };
  } catch (err: any) {
    currentStatus.isChecking = false;
    currentStatus.isDownloading = false;
    notifyListeners();
    return {
      isNew: false,
      isAvailable: false,
      error: err?.message || 'Failed to check for updates',
    };
  }
}

/**
 * Reloads the app to apply the newly downloaded update immediately.
 */
export async function reloadAppToApplyUpdate(): Promise<void> {
  if (Updates.isEnabled) {
    await Updates.reloadAsync();
  }
}

export function dismissUpdateBanner(): void {
  currentStatus.isUpdatePending = false;
  notifyListeners();
}
