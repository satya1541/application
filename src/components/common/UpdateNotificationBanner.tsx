import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  subscribeToUpdates,
  reloadAppToApplyUpdate,
  dismissUpdateBanner,
  type AppUpdateStatus,
} from '@/services/updateService';

export const UpdateNotificationBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const slideAnim = useState(new Animated.Value(-120))[0];

  useEffect(() => {
    const unsubscribe = subscribeToUpdates((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const showBanner = Boolean(status?.isUpdatePending || status?.recentlyUpdated);

  useEffect(() => {
    if (showBanner) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showBanner, slideAnim]);

  if (!showBanner && !status?.recentlyUpdated && !status?.isUpdatePending) {
    return null;
  }

  // Case 1: App was recently updated (Toast notification on launch)
  if (status?.recentlyUpdated) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            top: Math.max(insets.top, 12),
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.pill, styles.successPill]}>
          <View style={styles.iconCircleSuccess}>
            <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.titleText}>App Updated Successfully!</Text>
            <Text style={styles.subText}>
              Build {status.shortUpdateId} • Version {status.runtimeVersion}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  // Case 2: New update downloaded in background and waiting to restart
  if (status?.isUpdatePending) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            top: Math.max(insets.top, 12),
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.pill}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={16} color="#38bdf8" />
          </View>

          <View style={styles.textCol}>
            <Text style={styles.titleText}>New Update Received!</Text>
            <Text style={styles.subText}>Restart to apply latest improvements</Text>
          </View>

          <TouchableOpacity
            style={styles.restartBtn}
            onPress={reloadAppToApplyUpdate}
            activeOpacity={0.8}
          >
            <Text style={styles.restartBtnText}>Restart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={dismissUpdateBanner}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="rgba(255, 255, 255, 0.6)" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 24, 38, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    width: '100%',
    maxWidth: 420,
  },
  successPill: {
    borderColor: 'rgba(34, 197, 94, 0.45)',
    shadowColor: '#22c55e',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconCircleSuccess: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textCol: {
    flex: 1,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  restartBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  restartBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 4,
  },
});
