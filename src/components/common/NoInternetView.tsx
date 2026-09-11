import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';

interface NoInternetViewProps {
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
  customTitle?: string;
  customSubtitle?: string;
  showRetryButton?: boolean;
}

/**
 * Centered offline screen empty state matching Spotify UI (Image 1).
 * Displays:
 *   No internet connection
 *   Go online and try again.
 */
export const NoInternetView: React.FC<NoInternetViewProps> = ({
  onRetry,
  style,
  customTitle,
  customSubtitle,
  showRetryButton = false,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{customTitle || 'No internet connection'}</Text>
      <Text style={styles.subtitle}>{customSubtitle || 'Go online and try again.'}</Text>
      {showRetryButton && onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14.5,
    fontWeight: '400',
    color: '#a7a7a7',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});

