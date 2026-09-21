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
import {
  fetchYouTubeArtistDetails,
  YouTubeArtistDetails,
} from '@/services/youtubeExploreService';
import { YOUTUBE_OPUS_BADGE } from '@/services/youtubeMusicApi';
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

  // Internal navigation state so tapping a related artist smoothly transitions
  const [currentArtistId, setCurrentArtistId] = useState<string | null>(artistId);
  const [currentArtistName, setCurrentArtistName] = useState<string>(artistName);
  const [currentArtistImage, setCurrentArtistImage] = useState<string | undefined>(artistImage);

  const [details, setDetails] = useState<YouTubeArtistDetails | SaavnArtistFullDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [discoFilter, setDiscoFilter] = useState<'all' | 'albums' | 'singles'>('all');
  const [showAllPopular, setShowAllPopular] = useState<boolean>(false);
  const [showFullBio, setShowFullBio] = useState<boolean>(false);

  // Sync state whenever props change from parent
  useEffect(() => {
    setCurrentArtistId(artistId);
    setCurrentArtistName(artistName);
    setCurrentArtistImage(artistImage);
    setShowAllPopular(false);
    setShowFullBio(false);
    setDiscoFilter('all');
  }, [artistId, artistName, artistImage, visible]);

  useEffect(() => {
    if (!visible || !currentArtistId) return;

    setIsLoading(true);
    const cleanId = currentArtistId.trim();
    const isExplicitYouTube =
      cleanId.startsWith('UC') ||
      cleanId.startsWith('@') ||
      cleanId.startsWith('http') ||
      cleanId.startsWith('chart_artist_');

    if (isExplicitYouTube) {
      fetchYouTubeArtistDetails(cleanId, currentArtistName)
        .then((ytData) => {
          if (ytData) {
            setDetails(ytData);
          } else {
            return getSaavnArtistDetails(cleanId, currentArtistName).then((sData) => {
              if (sData) setDetails(sData as unknown as YouTubeArtistDetails);
            });
          }
        })
        .catch(() => {
          getSaavnArtistDetails(cleanId, currentArtistName)
            .then((sData) => {
              if (sData) setDetails(sData as unknown as YouTubeArtistDetails);
            })
            .catch((err) => console.warn('Failed to load artist:', err));
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // Prioritize authentic YouTube Music artist channel (https://music.youtube.com/@...)
      fetchYouTubeArtistDetails(cleanId, currentArtistName)
        .then((ytData) => {
          if (ytData && ytData.topSongs && ytData.topSongs.length > 0) {
            setDetails(ytData);
          } else {
            return getSaavnArtistDetails(cleanId, currentArtistName).then((sData) => {
              if (sData) setDetails(sData as unknown as YouTubeArtistDetails);
            });
          }
        })
        .catch(() => {
          getSaavnArtistDetails(cleanId, currentArtistName)
            .then((sData) => {
              if (sData) setDetails(sData as unknown as YouTubeArtistDetails);
            })
            .catch((err) => console.warn('Failed to load artist:', err));
        })
        .finally(() => {
          setIsLoading(false);
        });
    }

    SafeStorage.getItem('deluxe_followed_artists')
      .then((raw) => {
        if (raw) {
          const list: string[] = JSON.parse(raw);
          setIsFollowing(list.includes(cleanId));
        }
      })
      .catch(() => {});
  }, [visible, currentArtistId, currentArtistName]);

  const toggleFollow = () => {
    if (!currentArtistId) return;
    setIsFollowing((prev) => {
      const next = !prev;
      SafeStorage.getItem('deluxe_followed_artists')
        .then((raw) => {
          const list: string[] = raw ? JSON.parse(raw) : [];
          const updated = next
            ? [...list, currentArtistId]
            : list.filter((id) => id !== currentArtistId);
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
    currentArtistImage ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80';

  const ytDetails = details as YouTubeArtistDetails | null;

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
                {details?.name || currentArtistName}
              </Text>
              <Text style={styles.monthlyListeners}>
                {details?.followerCount || '2,450,890 monthly listeners'}
              </Text>
            </LinearGradient>
          </View>

          {/* Action Row (Play, Shuffle, Follow) */}
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
                activeOpacity={0.8}
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
                      activeOpacity={0.7}
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

              {/* 🎬 Music Videos Section */}
              {ytDetails?.videos && ytDetails.videos.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>Music Videos</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.videosScroll}
                  >
                    {ytDetails.videos.map((vid) => (
                      <TouchableOpacity
                        key={vid.id}
                        style={styles.videoCard}
                        activeOpacity={0.8}
                        onPress={() => {
                          playSong({
                            id: vid.id,
                            name: vid.title,
                            artist: vid.artist || details?.name || 'Artist',
                            album: 'Music Video',
                            cover: vid.artwork,
                            streamUrl: '',
                            duration: 0,
                            quality: 'Opus',
                            source: 'youtube',
                            sourceBadge: YOUTUBE_OPUS_BADGE,
                          } as unknown as Song);
                        }}
                      >
                        <View style={styles.videoThumbWrapper}>
                          <Image source={{ uri: vid.artwork }} style={styles.videoCover} />
                          <View style={styles.videoPlayOverlay}>
                            <Ionicons name="play" size={16} color="#ffffff" />
                          </View>
                        </View>
                        <Text style={styles.videoTitle} numberOfLines={2}>
                          {vid.title}
                        </Text>
                        {vid.views ? <Text style={styles.videoViews}>{vid.views}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 👥 Fans Also Like (Related Artists) */}
              {ytDetails?.relatedArtists && ytDetails.relatedArtists.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>Fans Also Like</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.artistsScroll}
                  >
                    {ytDetails.relatedArtists.map((rel) => (
                      <TouchableOpacity
                        key={rel.id}
                        style={styles.relatedArtistCard}
                        activeOpacity={0.8}
                        onPress={() => {
                          setCurrentArtistId(rel.id);
                          setCurrentArtistName(rel.name);
                          setCurrentArtistImage(rel.image);
                        }}
                      >
                        <Image source={{ uri: rel.image }} style={styles.relatedArtistAvatar} />
                        <Text style={styles.relatedArtistName} numberOfLines={1}>
                          {rel.name}
                        </Text>
                        <Text style={styles.relatedArtistSubs} numberOfLines={1}>
                          {rel.subscribers || 'Artist'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 📖 About / Bio Section */}
              {ytDetails?.bio && ytDetails.bio.trim().length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>About</Text>
                  <TouchableOpacity
                    style={styles.bioCard}
                    activeOpacity={0.85}
                    onPress={() => setShowFullBio((prev) => !prev)}
                  >
                    <Text style={styles.bioText} numberOfLines={showFullBio ? undefined : 4}>
                      {ytDetails.bio}
                    </Text>
                    <Text style={styles.bioToggleText}>
                      {showFullBio ? 'Read Less' : 'Read More'}
                    </Text>
                  </TouchableOpacity>
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
  /* Music Videos */
  videosScroll: {
    gap: 14,
    paddingRight: 20,
  },
  videoCard: {
    width: 200,
  },
  videoThumbWrapper: {
    width: 200,
    height: 112,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#242424',
    position: 'relative',
    marginBottom: 8,
  },
  videoCover: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoPlayOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 2,
  },
  videoViews: {
    color: '#888888',
    fontSize: 11,
  },
  /* Fans Also Like / Related Artists */
  artistsScroll: {
    gap: 16,
    paddingRight: 20,
  },
  relatedArtistCard: {
    width: 100,
    alignItems: 'center',
  },
  relatedArtistAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#242424',
    marginBottom: 8,
  },
  relatedArtistName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  relatedArtistSubs: {
    color: '#888888',
    fontSize: 10,
    textAlign: 'center',
    width: '100%',
  },
  /* Bio Card */
  bioCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#282828',
  },
  bioText: {
    color: '#cccccc',
    fontSize: 13,
    lineHeight: 20,
  },
  bioToggleText: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
});
