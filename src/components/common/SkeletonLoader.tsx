import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, DimensionValue, ViewStyle } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Base pulsing skeleton block with buttery-smooth 60fps native-driven animation.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}) => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width,
          height,
          borderRadius,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
};

/**
 * Skeleton placeholder for song rows, matching SongItemRow layout.
 */
export const SongItemSkeleton: React.FC<{ count?: number; showTrackNumber?: boolean }> = ({
  count = 6,
  showTrackNumber = true,
}) => {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={`song-skeleton-${index}`} style={styles.songRow}>
          {showTrackNumber && (
            <Skeleton width={16} height={14} borderRadius={4} style={{ marginRight: 10 }} />
          )}
          <Skeleton width={46} height={46} borderRadius={6} style={{ marginRight: 12 }} />
          <View style={styles.songTextContainer}>
            <Skeleton
              width={index % 2 === 0 ? '70%' : '55%'}
              height={14}
              borderRadius={4}
              style={{ marginBottom: 6 }}
            />
            <Skeleton
              width={index % 2 === 0 ? '45%' : '35%'}
              height={11}
              borderRadius={4}
            />
          </View>
          <Skeleton width={38} height={18} borderRadius={4} />
        </View>
      ))}
    </View>
  );
};



/**
 * Full skeleton layout for the Search Screen results view.
 */
export const SearchScreenSkeleton: React.FC = () => {
  return (
    <View style={styles.searchSkeletonContainer}>
      {/* Top Result Card Skeleton */}
      <View style={styles.topResultSkeleton}>
        <Skeleton width={64} height={64} borderRadius={8} style={{ marginBottom: 12 }} />
        <Skeleton width="60%" height={20} borderRadius={4} style={{ marginBottom: 8 }} />
        <Skeleton width="30%" height={12} borderRadius={4} />
      </View>

      {/* Songs Section Header Skeleton */}
      <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 10 }}>
        <Skeleton width="35%" height={16} borderRadius={4} />
      </View>

      {/* Song Rows Skeleton */}
      <SongItemSkeleton count={5} showTrackNumber={false} />
    </View>
  );
};

/**
 * Full skeleton layout for Artist Profile Modal.
 */
export const ArtistProfileSkeleton: React.FC = () => {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      {/* Latest release spotlight skeleton */}
      <Skeleton width="40%" height={16} borderRadius={4} style={{ marginBottom: 12 }} />
      <View style={styles.spotlightSkeleton}>
        <Skeleton width={72} height={72} borderRadius={6} style={{ marginRight: 14 }} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Skeleton width="35%" height={10} borderRadius={3} style={{ marginBottom: 6 }} />
          <Skeleton width="75%" height={15} borderRadius={4} style={{ marginBottom: 6 }} />
          <Skeleton width="50%" height={11} borderRadius={4} />
        </View>
      </View>

      {/* Popular Tracks Section */}
      <Skeleton width="35%" height={16} borderRadius={4} style={{ marginTop: 24, marginBottom: 12 }} />
      <SongItemSkeleton count={6} showTrackNumber={true} />
    </View>
  );
};

/**
 * Full skeleton layout for Album Modal.
 */
export const AlbumModalSkeleton: React.FC = () => {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      <Skeleton width="40%" height={12} borderRadius={4} style={{ marginBottom: 16 }} />
      <SongItemSkeleton count={8} showTrackNumber={true} />
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: '#262626',
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  songTextContainer: {
    flex: 1,
  },
  searchSkeletonContainer: {
    paddingTop: 8,
  },
  topResultSkeleton: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#1c1c1c',
  },
  spotlightSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1c1c1c',
  },
});
