import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In Node.js SSR / prerender environments on web, window does not exist.
const isNodeServer = Platform.OS === 'web' && typeof window === 'undefined';
const memoryStore = new Map<string, string>();

export const SafeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isNodeServer) {
      return memoryStore.get(key) || null;
    }
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        memoryStore.set(key, value);
        return value;
      }
    } catch {
      // Fallback to memory store if AsyncStorage fails
    }
    return memoryStore.get(key) || null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
    if (isNodeServer) {
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Retain in memory
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
    if (isNodeServer) {
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Memory removed
    }
  },
};

