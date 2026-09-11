import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '@/contexts/AudioContext';
import { SongItemRow } from '../common/SongItemRow';
import { ArtistProfileSkeleton } from '../common/SkeletonLoader';
import { MiniPlayer } from '../player/MiniPlayer';
import { NoInternetView } from '../common/NoInternetView';
import { OfflineBanner } from '../common/OfflineBanner';
import { useNetwork } from '@/contexts/NetworkContext';

import {
  getSaavnArtistDetails,
  SaavnArtistFullDetails,
} from '@/services/saavnStream';
import { Song } from '@/types/music';
import { SafeStorage } from '@/services/storage';

const { width } = Dimensions.get('window');

interface ArtistProfileModalProps {
  visible: boolean;
  artistId: string | null;
  artistName?: string;
  artistImage?: string;
  onClose: () => void;
  onOpenAlbum?: (albumId: string) => void;
}

export const ArtistProfileModal: React.FC<ArtistProfileModalProps> = ({
  visible,
  artistId,
  artistName = 'Artist',
  artistImage,
  onClose,
  onOpenAlbum,
}) => {
  const { playSong } = useAudio();
  const { isOffline, refreshNetwork } = useNetwork();
  const [details, setDetails] = useState<SaavnArtistFullDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [discoFilter, setDiscoFilter] = useState<'all' | 'albums' | 'singles'>('all');
  const [showAllPopular, setShowAllPopular] = useState<boolean>(false);


  useEffect(() => {
    if (!visible || !artistId) return;

    setIsLoading(true);
    getSaavnArtistDetails(artistId, artistName)
      .then((data) => {
        setDetails(data);
      })
      .catch((err) => {
        console.warn('Failed to load artist:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });

    SafeStorage.getItem('deluxe_followed_artists')
      .then((raw) => {
        if (raw) {
          const list: string[] = JSON.parse(raw);
          setIsFollowing(list.includes(artistId));
        }
      })
      .catch(() => {});
  }, [visible, artistId, artistName]);

  const toggleFollow = () => {
    if (!artistId) return;
    setIsFollowing((prev) => {
      const next = !prev;
      SafeStorage.getItem('deluxe_followed_artists')
        .then((raw) => {
          const list: string[] = raw ? JSON.parse(raw) : [];
          const updated = next
            ? [...list, artistId]
            : list.filter((id) => id !== artistId);
          SafeStorage.setItem('deluxe_followed_artists', JSON.stringify(updated)).catch(() => {});
        })
        .catch(() => {});
      return next;
    });
  };

  if (!visible) return null;

  const topSongs: Song[] = details?.topSongs ? (details.topSongs as unknown as Song[]) : [];
  const displayedTopSongs = showAllPopular ? topSongs : topSongs.slice(0, 5);

  const displayedReleases =
    discoFilter === 'albums'
      ? details?.albums || []
      : discoFilter === 'singles'
      ? details?.singles || []
      : [...(details?.albums || []), ...(details?.singles || [])];

  const heroImage =
    details?.image ||
    artistImage ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Floating Top Back Button */}
        <SafeAreaView style={styles.floatingHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={26} color="#ffffff" />
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero Artist Banner */}
          <View style={styles.heroContainer}>
            <Image source={{ uri: heroImage }} style={styles.heroImage} />
            <LinearGradient
              colors={['transparent', 'rgba(18, 18, 18, 0.7)', '#121212']}
              locations={[0.2, 0.75, 1]}
              style={styles.heroGradient}
            >
              <View style={styles.verifiedRow}>
                <Ionicons name="checkmark-circle" size={18} color="#1DB954" />
                <Text style={styles.verifiedText}>Verified Artist</Text>
              </View>
              <Text style={styles.artistHeroName} numberOfLines={2}>
                {details?.name || artistName}
              </Text>
              <Text style={styles.monthlyListeners}>
                {details?.followerCount || '2,450,890'} monthly listeners
              </Text>
            </LinearGradient>
          </View>

          {/* Action Row (Play, Shuffle, Follow, Share) */}
          <View style={styles.actionRow}>
            <View style={styles.leftActions}>
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={toggleFollow}
                activeOpacity={0.8}
              >
                <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rightActions}>
              <TouchableOpacity
                style={styles.shuffleBtn}
                onPress={() => {
                  if (topSongs.length > 0) {
                    const shuffled = [...topSongs].sort(() => Math.random() - 0.5);
                    playSong(shuffled[0], shuffled);
                  }
                }}
              >
                <Ionicons name="shuffle" size={24} color="#1DB954" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playFab}
                activeOpacity={0.85}
                onPress={() => {
                  if (topSongs.length > 0) {
                    playSong(topSongs[0], topSongs);
                  }
                }}
              >
                <Ionicons name="play" size={26} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <ArtistProfileSkeleton />
          ) : isOffline && !details ? (
            <NoInternetView onRetry={refreshNetwork} style={{ minHeight: 320 }} />
          ) : (
            <View style={styles.bodyContent}>
              {/* 🌟 Latest Release Spotlight Card */}
              {details?.latestRelease && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>Latest Release</Text>
                  <TouchableOpacity
                    style={styles.spotlightCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenAlbum) onOpenAlbum(details.latestRelease!.id);
                    }}
                  >
                    <Image
                      source={{ uri: details.latestRelease.image }}
                      style={styles.spotlightImage}
                    />
                    <View style={styles.spotlightMeta}>
                      <Text style={styles.spotlightTag}>LATEST • {details.latestRelease.year}</Text>
                      <Text style={styles.spotlightTitle} numberOfLines={1}>
                        {details.latestRelease.name}
                      </Text>
                      <Text style={styles.spotlightSub}>
                        {details.latestRelease.type === 'album' ? 'Full Studio Album' : 'Single / EP'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* 🔥 Popular Tracks */}
              {topSongs.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>Popular</Text>
                  {displayedTopSongs.map((song, idx) => (
                    <SongItemRow
                      key={`${song.id}-${idx}`}
                      song={song}
                      index={idx}
                      playlistContext={topSongs}
                      showTrackNumber={true}
                    />
                  ))}

                  {topSongs.length > 5 && (
                    <TouchableOpacity
                      style={styles.seeMoreBtn}
                      onPress={() => setShowAllPopular((prev) => !prev)}
                    >
                      <Text style={styles.seeMoreText}>
                        {showAllPopular ? 'Show Less' : `See more (${topSongs.length} tracks)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 💿 Discography Filters */}
              {displayedReleases.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>Discography</Text>
                  <View style={styles.filterChipsRow}>
                    {(['all', 'albums', 'singles'] as const).map((filter) => {
                      const isActive = discoFilter === filter;
                      const label =
                        filter === 'all'
                          ? 'All Releases'
                          : filter === 'albums'
                          ? `Albums (${details?.albums.length || 0})`
                          : `Singles & EPs (${details?.singles.length || 0})`;
                      return (
                        <TouchableOpacity
                          key={filter}
                          style={[styles.discoChip, isActive && styles.activeDiscoChip]}
                          onPress={() => setDiscoFilter(filter)}
                        >
                          <Text style={[styles.discoChipText, isActive && styles.activeDiscoChipText]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumsScroll}
                  >
                    {displayedReleases.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.albumCard}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (onOpenAlbum) onOpenAlbum(item.id);
                        }}
                      >
                        <Image source={{ uri: item.image }} style={styles.albumCover} />
                        <Text style={styles.albumTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.albumYear}>
                          {item.year} • {item.releaseType === 'album' ? `${item.songCount} songs` : 'Single'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Floating MiniPlayer inside Artist Modal */}
        <MiniPlayer
          bottomOffset={
            isOffline
              ? (Platform.OS === 'ios' ? 24 : 0) + 40
              : Platform.OS === 'ios'
              ? 24
              : 0
          }
        />

        {/* Persistent Offline Banner */}
        <OfflineBanner positionAbsolute={true} bottomOffset={Platform.OS === 'ios' ? 24 : 0} />
      </View>
    </Modal>

  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 10 : 0,
    left: 16,
    zIndex: 50,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  heroContainer: {
    width: width,
    height: 320,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  verifiedText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  artistHeroName: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  monthlyListeners: {
    color: '#b3b3b3',
    fontSize: 13,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  followingBtn: {
    borderColor: '#1DB954',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
  },
  followBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  followingBtnText: {
    color: '#1DB954',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  shuffleBtn: {
    padding: 6,
  },
  playFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#b3b3b3',
    fontSize: 13,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  sectionBlock: {
    marginBottom: 26,
  },
  sectionHeader: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  spotlightCard: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    gap: 14,
  },
  spotlightImage: {
    width: 68,
    height: 68,
    borderRadius: 6,
  },
  spotlightMeta: {
    flex: 1,
  },
  spotlightTag: {
    color: '#1DB954',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  spotlightTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  spotlightSub: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  seeMoreBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  seeMoreText: {
    color: '#b3b3b3',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  discoChip: {
    backgroundColor: '#242424',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeDiscoChip: {
    backgroundColor: '#ffffff',
  },
  discoChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  activeDiscoChipText: {
    color: '#000000',
    fontWeight: '800',
  },
  albumsScroll: {
    gap: 14,
    paddingRight: 20,
  },
  albumCard: {
    width: 130,
  },
  albumCover: {
    width: 130,
    height: 130,
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: '#242424',
  },
  albumTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  albumYear: {
    color: '#888888',
    fontSize: 11,
  },
});
