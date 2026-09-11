import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Song } from '@/types/music';
import { getHighResCoverArt, isYouTubeCover } from '@/services/imageUtils';

interface Deck3DCarouselProps {
  currentSong: Song;
  upcomingQueue: Song[];
  historyStack: Song[];
  onSelectSong: (song: Song) => void;
}

const { width } = Dimensions.get('window');
const MAIN_CARD_SIZE = Math.min(width - 72, 320);
const SIDE_CARD_SIZE = MAIN_CARD_SIZE * 0.75;

/**
 * High-res artwork renderer for full-screen carousel cards.
 * Automatically loads 1280x720 Ultra-HD YouTube artwork and falls back gracefully
 * to sddefault (640x480) or hqdefault (480x360) if a video lacks maxres.
 */
const DeckArtworkImage: React.FC<{
  song: Song;
  isMain?: boolean;
}> = ({ song, isMain }) => {
  const isYT = isYouTubeCover(song.cover, song.id, song.source);
  const initialUri = getHighResCoverArt(song.cover, song.id);
  const [coverUri, setCoverUri] = useState<string>(initialUri);

  useEffect(() => {
    setCoverUri(getHighResCoverArt(song.cover, song.id));
  }, [song.id, song.cover]);

  const handleError = () => {
    if (coverUri.includes('/maxresdefault.jpg') || coverUri.includes('/hq720.jpg')) {
      // Fallback from 1280x720 to 640x480
      setCoverUri(
        coverUri
          .replace('/maxresdefault.jpg', '/sddefault.jpg')
          .replace('/hq720.jpg', '/sddefault.jpg')
      );
    } else if (coverUri.includes('/sddefault.jpg')) {
      // Fallback from 640x480 to 480x360
      setCoverUri(coverUri.replace('/sddefault.jpg', '/hqdefault.jpg'));
    }
  };

  // Only 4:3 letterboxed YouTube thumbnails (hqdefault / sddefault / mqdefault) need scale 1.35
  // Native 16:9 Ultra-HD (maxresdefault / hq720) have NO black bars and fill the square card via contentFit="cover"
  const needsLetterboxZoom =
    isYT &&
    (coverUri.includes('/hqdefault.jpg') ||
      coverUri.includes('/sddefault.jpg') ||
      coverUri.includes('/mqdefault.jpg'));

  return (
    <ExpoImage
      source={{ uri: coverUri }}
      style={[
        isMain ? styles.mainArtwork : styles.sideArtwork,
        needsLetterboxZoom && styles.youtubeCrop,
      ]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={handleError}
    />
  );
};

export const Deck3DCarousel: React.FC<Deck3DCarouselProps> = React.memo(({
  currentSong,
  upcomingQueue,
  historyStack,
  onSelectSong,
}) => {
  const prevSong = historyStack.length > 0 ? historyStack[historyStack.length - 1] : null;
  const nextSong = upcomingQueue.length > 0 ? upcomingQueue[0] : null;

  return (
    <View style={styles.carouselContainer}>
      {/* Previous Card (Peek on left) */}
      {prevSong && (
        <TouchableOpacity
          style={[styles.sideCard, styles.leftCard]}
          activeOpacity={0.7}
          onPress={() => onSelectSong(prevSong)}
        >
          <View style={styles.sideClipper}>
            <DeckArtworkImage song={prevSong} isMain={false} />
          </View>
          <View style={styles.sideOverlay} />
        </TouchableOpacity>
      )}

      {/* Main Center Active Artwork */}
      <View style={styles.mainCard} pointerEvents="none">
        <View style={styles.mainClipper}>
          <DeckArtworkImage song={currentSong} isMain={true} />
        </View>
      </View>

      {/* Next Card (Peek on right) */}
      {nextSong && (
        <TouchableOpacity
          style={[styles.sideCard, styles.rightCard]}
          activeOpacity={0.7}
          onPress={() => onSelectSong(nextSong)}
        >
          <View style={styles.sideClipper}>
            <DeckArtworkImage song={nextSong} isMain={false} />
          </View>
          <View style={styles.sideOverlay} />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  carouselContainer: {
    height: MAIN_CARD_SIZE + 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  mainCard: {
    width: MAIN_CARD_SIZE,
    height: MAIN_CARD_SIZE,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 16,
    zIndex: 10,
    backgroundColor: '#181818',
  },
  mainClipper: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },
  mainArtwork: {
    width: '100%',
    height: '100%',
  },
  sideCard: {
    position: 'absolute',
    width: SIDE_CARD_SIZE,
    height: SIDE_CARD_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 2,
    opacity: 0.45,
  },
  sideClipper: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  sideArtwork: {
    width: '100%',
    height: '100%',
  },
  youtubeCrop: {
    transform: [{ scale: 1.35 }],
  },
  leftCard: {
    left: 8,
    transform: [{ scale: 0.85 }],
  },
  rightCard: {
    right: 8,
    transform: [{ scale: 0.85 }],
  },
  sideOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
});

