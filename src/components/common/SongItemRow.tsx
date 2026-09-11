import React, { useState, useEffect, useRef, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '@/types/music';
import { useAudio } from '@/contexts/AudioContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { SourceBadge } from './SourceBadge';
import { getSafeCoverArt, isYouTubeCover } from '@/services/imageUtils';
import { SongActionController } from '@/services/songActionController';

interface SongItemRowProps {
  song: Song;
  index?: number;
  playlistContext?: Song[];
  showTrackNumber?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

const MiniAnimatedEqualizer: React.FC<{ color?: string }> = ({ color = '#1DB954' }) => {
  const bar1 = useRef(new Animated.Value(4)).current;
  const bar2 = useRef(new Animated.Value(12)).current;
  const bar3 = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const createAnim = (val: Animated.Value, min: number, max: number, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: max,
            duration,
            useNativeDriver: false,
          }),
          Animated.timing(val, {
            toValue: min,
            duration,
            useNativeDriver: false,
          }),
        ])
      );
    };

    const a1 = createAnim(bar1, 2, 14, 260);
    const a2 = createAnim(bar2, 4, 16, 320);
    const a3 = createAnim(bar3, 2, 13, 480);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View style={styles.eqContainer}>
      <Animated.View style={[styles.eqBar, { height: bar1, backgroundColor: color }]} />
      <Animated.View style={[styles.eqBar, { height: bar2, backgroundColor: color }]} />
      <Animated.View style={[styles.eqBar, { height: bar3, backgroundColor: color }]} />
    </View>
  );
};

export const SongItemRow: React.FC<SongItemRowProps> = memo(({
  song,
  index,
  playlistContext,
  showTrackNumber = false,
  priority,
}) => {
  const { accent } = useAppTheme();
  const { currentSong, isPlaying, playSong, togglePlay, toggleLike, isLiked } = useAudio();
  const [imgError, setImgError] = useState(false);
  const isCurrent = currentSong?.id === song.id;
  const liked = isLiked(song.id);

  const handlePress = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playSong(song, playlistContext);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const coverUri = imgError
    ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'
    : getSafeCoverArt(song.cover, song.id);

  const imagePriority = priority || (index !== undefined && index < 12 ? 'high' : 'normal');

  return (
    <TouchableOpacity
      style={[styles.container, isCurrent && styles.activeContainer]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {showTrackNumber && index !== undefined && (
        <View style={styles.trackNumberCol}>
          {isCurrent && isPlaying ? (
            <MiniAnimatedEqualizer color={accent.hex} />
          ) : (
            <Text
              style={[
                styles.trackNumber,
                isCurrent && { color: accent.hex, fontWeight: '700' },
              ]}
            >
              {index + 1}
            </Text>
          )}
        </View>
      )}

      <View style={styles.coverWrapper}>
        <ExpoImage
          source={{ uri: coverUri }}
          style={[
            styles.cover,
            isYouTubeCover(song.cover, song.id, song.source) && styles.youtubeCrop,
          ]}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
          priority={imagePriority}
          recyclingKey={song.id}
          onError={() => {
            if (!imgError) setImgError(true);
          }}
        />
      </View>

      <View style={styles.metaContainer}>
        <Text
          style={[
            styles.title,
            isCurrent && { color: accent.hex, fontWeight: '700' },
          ]}
          numberOfLines={1}
        >
          {song.name}
        </Text>
        <View style={styles.subMeta}>
          <Text style={styles.artist} numberOfLines={1}>
            {song.artist}
          </Text>
          <View style={styles.badgeWrapper}>
            <SourceBadge source={song.source} quality={song.quality} />
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.heartButton}
        onPress={(e) => {
          e.stopPropagation?.();
          toggleLike(song.id, song);
        }}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? accent.hex : '#b3b3b3'}
        />
      </TouchableOpacity>

      <Text style={styles.duration}>{formatDuration(song.duration)}</Text>

      <TouchableOpacity
        style={styles.moreButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={(e) => {
          e.stopPropagation?.();
          SongActionController.open(song);
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="ellipsis-vertical" size={17} color="#9CA3AF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  activeContainer: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
  },
  trackNumberCol: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  trackNumber: {
    color: '#b3b3b3',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  eqContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    width: 16,
    gap: 2,
    justifyContent: 'center',
  },
  eqBar: {
    width: 3,
    backgroundColor: '#1DB954',
    borderRadius: 1,
  },
  coverWrapper: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#282828',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  youtubeCrop: {
    transform: [{ scale: 1.35 }],
  },
  metaContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  subMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 13,
    marginRight: 8,
  },
  badgeWrapper: {
    marginTop: 1,
  },
  activeText: {
    color: '#1DB954',
    fontWeight: '700',
  },
  heartButton: {
    padding: 8,
    marginLeft: 4,
  },
  duration: {
    color: '#b3b3b3',
    fontSize: 12,
    width: 38,
    textAlign: 'right',
    marginLeft: 4,
  },
  moreButton: {
    padding: 6,
    marginLeft: 6,
  },
});
