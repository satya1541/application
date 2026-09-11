import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isOffline: boolean;
  refreshNetwork: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  isOffline: false,
  refreshNetwork: async () => true,
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);

  const handleStateChange = useCallback((state: NetInfoState) => {
    const connected = state.isConnected ?? true;
    const reachable = state.isInternetReachable;
    setIsConnected(connected);
    setIsInternetReachable(reachable);
  }, []);

  useEffect(() => {
    // Initial fetch
    NetInfo.fetch()
      .then(handleStateChange)
      .catch(() => {});

    // Listen to real-time network transitions
    const unsubscribe = NetInfo.addEventListener(handleStateChange);

    // Browser fallbacks when running on Web
    let handleOnline: (() => void) | undefined;
    let handleOffline: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handleOnline = () => {
        setIsConnected(true);
        setIsInternetReachable(true);
      };
      handleOffline = () => {
        setIsConnected(false);
        setIsInternetReachable(false);
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      if (window.navigator) {
        setIsConnected(window.navigator.onLine);
        setIsInternetReachable(window.navigator.onLine);
      }
    }

    return () => {
      unsubscribe();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (handleOnline) window.removeEventListener('online', handleOnline);
        if (handleOffline) window.removeEventListener('offline', handleOffline);
      }
    };
  }, [handleStateChange]);

  const refreshNetwork = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.navigator) {
        const onLine = window.navigator.onLine;
        setIsConnected(onLine);
        setIsInternetReachable(onLine);
        return onLine;
      }
      const state = await NetInfo.refresh();
      handleStateChange(state);
      return (state.isConnected && state.isInternetReachable !== false) ?? false;
    } catch {
      return false;
    }
  }, [handleStateChange]);

  // Considered offline if isConnected is false or isInternetReachable is false
  const isOffline = !isConnected || isInternetReachable === false;

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable, isOffline, refreshNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
