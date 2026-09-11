import { AppState, AppStateStatus, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import { SafeStorage } from './storage';

// 200 MB Maximum Hard Cap for Disk Cache
export const MAX_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB

// 120 MB Target Size when Pruning (leaves 80 MB buffer for daily playback)
export const TARGET_CACHE_BYTES = 120 * 1024 * 1024; // 120 MB

// Minimum interval between automatic full filesystem scans (6 hours)
const MIN_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STORAGE_KEY_LAST_PRUNE = 'deluxe_cache_last_prune_time';

export interface CacheStats {
  totalBytes: number;
  totalMB: string;
  maxMB: number;
  usagePercent: number;
  fileCount: number;
}

interface CacheFileInfo {
  uri: string;
  size: number;
  modificationTime: number;
}

/**
 * Recursively scans a directory and collects file metadata (size, modification time).
 */
async function scanDirectoryRecursive(dirUri: string, depth: number = 0): Promise<CacheFileInfo[]> {
  if (depth > 4) return []; // guard against overly deep recursion
  const files: CacheFileInfo[] = [];

  try {
    const entries = await FileSystem.readDirectoryAsync(dirUri);
    const normalizedDir = dirUri.endsWith('/') ? dirUri : `${dirUri}/`;

    for (const entry of entries) {
      const entryUri = `${normalizedDir}${entry}`;
      try {
        const info = await FileSystem.getInfoAsync(entryUri);
        if (!info.exists) continue;

        if (info.isDirectory) {
          const subFiles = await scanDirectoryRecursive(entryUri, depth + 1);
          files.push(...subFiles);
        } else {
          files.push({
            uri: entryUri,
            size: info.size || 0,
            modificationTime: (info as any).modificationTime || Date.now(),
          });
        }
      } catch {
        // Individual entry access failure; continue scanning others
      }
    }
  } catch {
    // Directory unreadable or doesn't exist
  }

  return files;
}

/**
 * Inspects current disk cache usage.
 */
export async function getCacheStats(): Promise<CacheStats> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir || Platform.OS === 'web') {
    return {
      totalBytes: 0,
      totalMB: '0.0',
      maxMB: 200,
      usagePercent: 0,
      fileCount: 0,
    };
  }

  try {
    const files = await scanDirectoryRecursive(cacheDir);
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    const usagePercent = Math.min(100, Math.round((totalBytes / MAX_CACHE_BYTES) * 100));

    return {
      totalBytes,
      totalMB,
      maxMB: 200,
      usagePercent,
      fileCount: files.length,
    };
  } catch {
    return {
      totalBytes: 0,
      totalMB: '0.0',
      maxMB: 200,
      usagePercent: 0,
      fileCount: 0,
    };
  }
}

/**
 * Enforces the 200MB LRU disk cache cap.
 * If disk usage exceeds MAX_CACHE_BYTES (200MB), removes oldest files first until below 120MB.
 */
export async function autoPruneCache(force: boolean = false): Promise<{ pruned: boolean; freedMB: string }> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir || Platform.OS === 'web') {
    return { pruned: false, freedMB: '0.0' };
  }

  // Throttle automatic scans to avoid excessive disk I/O on rapid app launches
  if (!force) {
    try {
      const lastPruneStr = await SafeStorage.getItem(STORAGE_KEY_LAST_PRUNE);
      if (lastPruneStr) {
        const lastPruneTime = parseInt(lastPruneStr, 10);
        if (Date.now() - lastPruneTime < MIN_SCAN_INTERVAL_MS) {
          return { pruned: false, freedMB: '0.0' };
        }
      }
    } catch {}
  }

  try {
    const files = await scanDirectoryRecursive(cacheDir);
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    // If cache is within limits, update last scan timestamp and return
    if (totalBytes <= MAX_CACHE_BYTES && !force) {
      await SafeStorage.setItem(STORAGE_KEY_LAST_PRUNE, String(Date.now())).catch(() => {});
      return { pruned: false, freedMB: '0.0' };
    }

    // Sort files by Least Recently Used (oldest modificationTime first)
    files.sort((a, b) => a.modificationTime - b.modificationTime);

    let currentBytes = totalBytes;
    let freedBytes = 0;

    for (const file of files) {
      if (currentBytes <= TARGET_CACHE_BYTES) {
        break;
      }
      try {
        await FileSystem.deleteAsync(file.uri, { idempotent: true });
        currentBytes -= file.size;
        freedBytes += file.size;
      } catch {
        // Continue with remaining files if one fails
      }
    }

    // If still above max, trigger image disk cache purge
    if (currentBytes > MAX_CACHE_BYTES) {
      try {
        await ExpoImage.clearDiskCache();
      } catch {}
    }

    await SafeStorage.setItem(STORAGE_KEY_LAST_PRUNE, String(Date.now())).catch(() => {});
    const freedMB = (freedBytes / (1024 * 1024)).toFixed(1);

    return {
      pruned: freedBytes > 0,
      freedMB,
    };
  } catch {
    return { pruned: false, freedMB: '0.0' };
  }
}

/**
 * Performs a complete manual purge of all disk and memory caches.
 */
export async function clearAllCache(): Promise<void> {
  try {
    // 1. Clear Image caches
    await ExpoImage.clearMemoryCache().catch(() => {});
    await ExpoImage.clearDiskCache().catch(() => {});

    // 2. Clear FileSystem cache directory
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir && Platform.OS !== 'web') {
      const entries = await FileSystem.readDirectoryAsync(cacheDir).catch(() => []);
      for (const entry of entries) {
        try {
          const itemUri = cacheDir.endsWith('/') ? `${cacheDir}${entry}` : `${cacheDir}/${entry}`;
          await FileSystem.deleteAsync(itemUri, { idempotent: true });
        } catch {}
      }
    }

    await SafeStorage.setItem(STORAGE_KEY_LAST_PRUNE, String(Date.now())).catch(() => {});
  } catch {}
}

/**
 * Initializes auto-pruning lifecycle:
 * 1. Runs non-blocking LRU check on app startup.
 * 2. Purges Image memory cache when app transitions to background (releasing RAM).
 * 3. Returns a cleanup unsubscribe handler.
 */
export function initCacheLifecycle(): () => void {
  // 1. Check disk cache 5 seconds after startup so app launch is instantaneous
  const startupTimer = setTimeout(() => {
    autoPruneCache().catch(() => {});
  }, 5000);

  // 2. Listen to AppState transitions
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background') {
      // Free uncompressed image memory cache back to OS
      ExpoImage.clearMemoryCache().catch(() => {});
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    clearTimeout(startupTimer);
    subscription.remove();
  };
}
