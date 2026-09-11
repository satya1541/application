import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  Animated,
  Share,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { computeListeningAnalytics, ReplayAnalytics } from '@/services/analyticsService';
import { getSafeCoverArt } from '@/services/imageUtils';

interface ShortyReplayModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TOTAL_SLIDES = 7;
const SLIDE_DURATION = 5500; // 5.5s per slide

export const ShortyReplayModal: React.FC<ShortyReplayModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReplayAnalytics | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Animation values for the progress bars
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Load analytics whenever opened
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setCurrentSlide(0);
    computeListeningAnalytics()
      .then((data) => {
        setStats(data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible]);

  // Handle slide transitions and auto-advance animation
  const startSlideAnimation = useCallback(
    (slideIdx: number) => {
      progressAnim.setValue(0);
      animRef.current?.stop();

      // Don't auto-advance on the final poster slide
      if (slideIdx >= TOTAL_SLIDES - 1) return;

      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: SLIDE_DURATION,
        useNativeDriver: false,
      });

      animRef.current.start(({ finished }) => {
        if (finished) {
          setCurrentSlide((prev) => {
            if (prev < TOTAL_SLIDES - 1) return prev + 1;
            return prev;
          });
        }
      });
    },
    [progressAnim]
  );

  useEffect(() => {
    if (!visible || loading || isPaused) return;
    startSlideAnimation(currentSlide);

    return () => {
      animRef.current?.stop();
    };
  }, [visible, loading, currentSlide, isPaused, startSlideAnimation]);

  const goToNext = () => {
    if (currentSlide < TOTAL_SLIDES - 1) {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handlePressIn = () => {
    setIsPaused(true);
    animRef.current?.stop();
  };

  const handlePressOut = () => {
    setIsPaused(false);
  };

  const handleTapNavigation = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_WIDTH * 0.32) {
      goToPrev();
    } else {
      goToNext();
    }
  };

  const handleShareStory = async () => {
    if (!stats) return;
    try {
      const topSong = stats.topSongs[0]?.song?.name || 'My Top Hit';
      const topArtist = stats.topArtists[0]?.name || 'My Top Artist';

      const message =
        `🔥 MY 2026 WRAPPED ON SHORTY 🔥\n\n` +
        `⏱️ ${stats.totalMinutes.toLocaleString()} minutes streamed\n` +
        `🏆 Top Artist: ${topArtist}\n` +
        `🎵 Top Track: ${topSong}\n` +
        `🎭 Persona: ${stats.persona.icon} ${stats.persona.title}\n\n` +
        `Check out your Wrapped on Shorty! ⚡`;

      await Share.share({
        message,
        title: 'Shorty 2026 Wrapped',
      });
    } catch { }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingScreen}>
            <ActivityIndicator size="large" color="#FAFF00" />
            <Text style={styles.loadingText}>CALCULATING YOUR 2026 WRAPPED...</Text>
          </View>
        ) : !stats || !stats.hasData ? (
          <View style={styles.emptyScreen}>
            <Ionicons name="sparkles" size={56} color="#FAFF00" />
            <Text style={styles.emptyTitle}>YOUR WRAPPED IS BREWING</Text>
            <Text style={styles.emptyDesc}>
              Listen to more songs to unlock your giant minutes count, top artists, and listening persona!
            </Text>
            <TouchableOpacity style={styles.emptyCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.emptyCloseText}>Back to Library</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableWithoutFeedback
            onPress={handleTapNavigation}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <View style={styles.storySurface}>
              {/* SLIDE CONTENT RENDERER */}
              {renderSlide(currentSlide, stats, handleShareStory)}

              {/* TOP SEGMENTED PROGRESS BARS */}
              <View style={[styles.topBarContainer, { paddingTop: Math.max(insets.top, 14) }]}>
                <View style={styles.segmentsRow}>
                  {Array.from({ length: TOTAL_SLIDES }).map((_, idx) => {
                    return (
                      <View key={idx} style={styles.segmentTrack}>
                        {idx < currentSlide ? (
                          <View style={styles.segmentFilled} />
                        ) : idx === currentSlide ? (
                          <Animated.View
                            style={[
                              styles.segmentActive,
                              {
                                width: progressAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0%', '100%'],
                                }),
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {/* Header Controls */}
                <View style={styles.headerControls}>
                  <View style={styles.headerBrand}>
                    <View style={styles.brandLogoDot} />
                    <Text style={styles.brandTitle}>WRAPPED 2026</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* BOTTOM SHARE BAR (On non-poster slides) */}
              {currentSlide < TOTAL_SLIDES - 1 && (
                <View style={[styles.bottomShareBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                  <TouchableOpacity activeOpacity={0.85} onPress={handleShareStory} style={styles.storySharePill}>
                    <Ionicons name="share-outline" size={15} color="#000000" />
                    <Text style={styles.storySharePillText}>Share this story</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        )}
      </View>
    </Modal>
  );
};

/**
 * Slide Renderer with authentic Spotify Wrapped brutalist & acid-pop aesthetics
 */
function renderSlide(slideIdx: number, stats: ReplayAnalytics, onShare: () => void) {
  const topArtist = stats.topArtists[0];
  const topSong = stats.topSongs[0];

  switch (slideIdx) {
    // -------------------------------------------------------------
    // SLIDE 0: THE INTRO COVER (Exploding Starburst & Bold Typography)
    // -------------------------------------------------------------
    case 0:
      return (
        <LinearGradient
          colors={['#FF0055', '#7928CA', '#0A0A0A']}
          style={styles.fullSlide}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Abstract Starburst Decorative Pattern */}
          <View style={styles.starburstBackdrop}>
            <View style={styles.concentricCircle1} />
            <View style={styles.concentricCircle2} />
          </View>

          <View style={styles.introContent}>
            <View style={styles.yellowTag}>
              <Text style={styles.yellowTagText}>IT'S FINALLY HERE</Text>
            </View>

            <Text style={styles.introGiantYear}>2026</Text>
            <Text style={styles.introGiantTitle}>WRAPPED</Text>

            <View style={styles.introDivider} />

            <Text style={styles.introSubtitle}>
              You listened like nobody was watching. Here is how your year sounded.
            </Text>
          </View>

          <View style={styles.tapPrompt}>
            <Text style={styles.tapPromptText}>TAP TO EXPLORE →</Text>
          </View>
        </LinearGradient>
      );

    // -------------------------------------------------------------
    // SLIDE 1: MINUTES STREAMED (The Giant Repeating Stacked Typography)
    // -------------------------------------------------------------
    case 1:
      const minFormatted = (stats.totalMinutes || 42).toLocaleString();
      return (
        <View style={[styles.fullSlide, { backgroundColor: '#FAFF00' }]}>
          {/* Top Headline */}
          <View style={styles.slideHeaderSpace}>
            <Text style={styles.brutalistTopLabel}>ALL THAT LISTENING ADDED UP</Text>
          </View>

          {/* Stacked Repeating Neon Typography (Image 2 Replica) */}
          <View style={styles.stackedMinutesWrapper}>
            {[
              { color: '#7928CA', bg: '#FF0080' },
              { color: '#00F5D4', bg: '#000000' },
              { color: '#FF0055', bg: '#7928CA' },
              { color: '#000000', bg: '#FAFF00' },
              { color: '#FAFF00', bg: '#7928CA' },
            ].map((st, i) => (
              <View key={i} style={[styles.stackedMinuteRow, { backgroundColor: st.bg }]}>
                <Text style={[styles.stackedMinuteText, { color: st.color }]}>
                  {minFormatted}
                </Text>
              </View>
            ))}
          </View>

          {/* Punchline Card */}
          <View style={styles.minutesPunchlineCard}>
            <Text style={styles.minutesPunchlineTitle}>
              You streamed for <Text style={{ color: '#FAFF00', fontWeight: '900' }}>{minFormatted} minutes</Text>.
            </Text>
            <Text style={styles.minutesPunchlineSub}>{stats.minutesQuip}</Text>
          </View>
        </View>
      );

    // -------------------------------------------------------------
    // SLIDE 2: TOP GENRES (Black Tape-Label Blocks & Polka Dots)
    // -------------------------------------------------------------
    case 2:
      return (
        <View style={[styles.fullSlide, { backgroundColor: '#F0F0F0' }]}>
          {/* Red Graphic Dots Backdrop (Image 1 Replica) */}
          <View style={styles.dotsBackdrop}>
            <View style={[styles.redDot, { top: 80, right: 20 }]} />
            <View style={[styles.redDot, { top: 220, right: 35 }]} />
            <View style={[styles.redDot, { bottom: 200, left: 30 }]} />
            <View style={[styles.redDot, { bottom: 120, right: 50 }]} />
            <View style={[styles.blackCirclePattern, { bottom: 60, left: -20 }]} />
          </View>

          <View style={styles.genresContainer}>
            <Text style={styles.genresHeader}>YOUR TOP GENRES</Text>

            <View style={styles.genreList}>
              {stats.topGenres.map((genre, idx) => (
                <View key={idx} style={styles.genreTapeRow}>
                  <Text style={styles.genreRankNum}>{idx + 1}</Text>
                  <View style={[styles.genreTapeBox, idx === 0 && { backgroundColor: '#FF0055' }]}>
                    <Text style={styles.genreTapeText}>{genre}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      );

    // -------------------------------------------------------------
    // SLIDE 3: YOUR TOP ARTIST (Sombr-style Polaroid & Percent Fan)
    // -------------------------------------------------------------
    case 3:
      return (
        <View style={[styles.fullSlide, { backgroundColor: '#0B0B0B' }]}>
          {/* Op-art Optical Wavy Lines Background */}
          <View style={styles.opArtBackdrop}>
            <View style={styles.wavyDoodle} />
          </View>

          <View style={styles.artistHeroWrap}>
            <Text style={styles.artistSpotlightLabel}>YOUR TOP ARTIST</Text>

            {/* Polaroid Artwork (Image 1 Replica) */}
            <View style={styles.polaroidCard}>
              {topArtist?.cover ? (
                <ExpoImage
                  source={{ uri: getSafeCoverArt(topArtist.cover) }}
                  style={styles.polaroidImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.polaroidPlaceholder}>
                  <Ionicons name="musical-notes" size={70} color="#FAFF00" />
                </View>
              )}
              <View style={styles.polaroidBanner}>
                <Text style={styles.polaroidBannerText}>#1 ON REPEAT</Text>
              </View>
            </View>

            <Text style={styles.topArtistName} numberOfLines={1}>
              {topArtist?.name || 'Unknown Artist'}
            </Text>

            <View style={styles.fanBadgeCard}>
              <Text style={styles.fanBadgeText}>
                You spent <Text style={{ color: '#FAFF00', fontWeight: '900' }}>{topArtist?.totalMinutes || 12} minutes</Text> with them.
              </Text>
              <Text style={styles.fanBadgeHighlight}>
                Which makes you a top {topArtist?.fanPercent || 1}% fan worldwide. 🏆
              </Text>
            </View>
          </View>
        </View>
      );

    // -------------------------------------------------------------
    // SLIDE 4: TOP TRACKS ON REPEAT (Barcode & Countdown Blocks)
    // -------------------------------------------------------------
    case 4:
      return (
        <LinearGradient colors={['#101018', '#050508']} style={styles.fullSlide}>
          <View style={styles.topTracksContainer}>
            <View style={styles.tracksHeaderRow}>
              <Text style={styles.tracksHeaderLabel}>YOUR TOP SONGS</Text>
              <View style={styles.barcodeIcon}>
                <Ionicons name="barcode-outline" size={24} color="#00F5D4" />
              </View>
            </View>

            <View style={styles.tracksList}>
              {stats.topSongs.slice(0, 5).map((item, idx) => (
                <View key={item.song.id} style={styles.trackCardRow}>
                  <View style={[styles.trackRankCircle, idx === 0 && { backgroundColor: '#00F5D4' }]}>
                    <Text style={[styles.trackRankDigit, idx === 0 && { color: '#000000' }]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <ExpoImage
                    source={{ uri: getSafeCoverArt(item.song.cover) }}
                    style={styles.trackThumb}
                    contentFit="cover"
                  />
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.song.name}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.song.artist}
                    </Text>
                  </View>
                  <View style={styles.trackLoopCount}>
                    <Text style={styles.trackLoopText}>{item.playCount}x</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>
      );

    // -------------------------------------------------------------
    // SLIDE 5: LISTENING PERSONA / AURA (Shapeshifter Vibrant Glow)
    // -------------------------------------------------------------
    case 5:
      return (
        <LinearGradient
          colors={stats.persona.gradient}
          style={styles.fullSlide}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.personaContainer}>
            <View style={styles.personaAuraRing}>
              <Text style={styles.personaLargeIcon}>{stats.persona.icon}</Text>
            </View>

            <View style={styles.personaPill}>
              <Text style={styles.personaPillText}>YOUR LISTENING PERSONALITY</Text>
            </View>

            <Text style={styles.personaTitleText}>{stats.persona.title}</Text>

            <View style={styles.personaBioCard}>
              <Text style={styles.personaBioText}>{stats.persona.description}</Text>
            </View>
          </View>
        </LinearGradient>
      );

    // -------------------------------------------------------------
    // SLIDE 6: THE WRAPPED POSTER CARD (The Final Instagram Story Poster)
    // -------------------------------------------------------------
    case 6:
      return (
        <View style={[styles.fullSlide, { backgroundColor: '#000000', paddingHorizontal: 20 }]}>
          <LinearGradient
            colors={['#1E1B4B', '#0F172A', '#000000']}
            style={styles.posterCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Poster Header */}
            <View style={styles.posterHeader}>
              <View>
                <Text style={styles.posterBrandBadge}>SHORTY 2026</Text>
                <Text style={styles.posterTitle}>MY WRAPPED</Text>
              </View>
              <View style={styles.posterLogo}>
                <Ionicons name="disc" size={28} color="#FAFF00" />
              </View>
            </View>

            {/* Two Column Grid: Top Artists & Top Songs */}
            <View style={styles.posterColumnsRow}>
              {/* Left Column: Top Songs */}
              <View style={styles.posterColumn}>
                <Text style={styles.posterColHeading}>TOP SONGS</Text>
                {stats.topSongs.slice(0, 5).map((s, idx) => (
                  <View key={s.song.id} style={styles.posterItemRow}>
                    <Text style={styles.posterIndex}>{idx + 1}</Text>
                    <Text style={styles.posterItemText} numberOfLines={1}>
                      {s.song.name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Right Column: Top Artists */}
              <View style={styles.posterColumn}>
                <Text style={styles.posterColHeading}>TOP ARTISTS</Text>
                {stats.topArtists.slice(0, 5).map((a, idx) => (
                  <View key={a.name} style={styles.posterItemRow}>
                    <Text style={styles.posterIndex}>{idx + 1}</Text>
                    <Text style={styles.posterItemText} numberOfLines={1}>
                      {a.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Poster Bottom Stats */}
            <View style={styles.posterBottomBar}>
              <View>
                <Text style={styles.posterStatLabel}>MINUTES LISTENED</Text>
                <Text style={styles.posterStatValue}>
                  {stats.totalMinutes.toLocaleString()}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.posterStatLabel}>PERSONALITY</Text>
                <Text style={styles.posterStatValue}>
                  {stats.persona.icon} {stats.persona.title}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Final CTA Share Button */}
          <TouchableOpacity activeOpacity={0.88} onPress={onShare} style={styles.posterShareBtn}>
            <Ionicons name="share-social" size={20} color="#000000" />
            <Text style={styles.posterShareBtnText}>Share My 2026 Wrapped</Text>
          </TouchableOpacity>
        </View>
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    gap: 16,
  },
  loadingText: {
    color: '#FAFF00',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 36,
    gap: 14,
  },
  emptyTitle: {
    color: '#FAFF00',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  emptyDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyCloseBtn: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyCloseText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  storySurface: {
    flex: 1,
  },
  fullSlide: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 50,
  },
  segmentsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
  },
  segmentTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  segmentFilled: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  segmentActive: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1DB954',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomShareBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  storySharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  storySharePillText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },

  // SLIDE 0: INTRO
  starburstBackdrop: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    left: -SCREEN_WIDTH * 0.2,
    width: SCREEN_WIDTH * 1.4,
    height: SCREEN_WIDTH * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.2,
  },
  concentricCircle1: {
    width: '100%',
    height: '100%',
    borderRadius: SCREEN_WIDTH * 0.7,
    borderWidth: 32,
    borderColor: '#FFFFFF',
  },
  concentricCircle2: {
    position: 'absolute',
    width: '60%',
    height: '60%',
    borderRadius: SCREEN_WIDTH * 0.35,
    borderWidth: 24,
    borderColor: '#FAFF00',
  },
  introContent: {
    alignItems: 'flex-start',
  },
  yellowTag: {
    backgroundColor: '#FAFF00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 16,
  },
  yellowTagText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  introGiantYear: {
    color: '#FFFFFF',
    fontSize: 84,
    fontWeight: '900',
    lineHeight: 88,
    letterSpacing: -4,
  },
  introGiantTitle: {
    color: '#FAFF00',
    fontSize: 54,
    fontWeight: '900',
    lineHeight: 58,
    letterSpacing: -2,
  },
  introDivider: {
    width: 60,
    height: 6,
    backgroundColor: '#FFFFFF',
    marginVertical: 20,
  },
  introSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    maxWidth: 280,
  },
  tapPrompt: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
  },
  tapPromptText: {
    color: '#FAFF00',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // SLIDE 1: MINUTES
  slideHeaderSpace: {
    marginTop: 80,
    marginBottom: 20,
  },
  brutalistTopLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  stackedMinutesWrapper: {
    gap: 6,
    marginVertical: 10,
  },
  stackedMinuteRow: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderRadius: 4,
  },
  stackedMinuteText: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
  },
  minutesPunchlineCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  minutesPunchlineTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  minutesPunchlineSub: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    marginTop: 8,
    lineHeight: 22,
  },

  // SLIDE 2: TOP GENRES
  dotsBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  redDot: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF0055',
  },
  blackCirclePattern: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 16,
    borderColor: '#000000',
    opacity: 0.15,
  },
  genresContainer: {
    marginTop: 80,
  },
  genresHeader: {
    color: '#000000',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 32,
  },
  genreList: {
    gap: 16,
  },
  genreTapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  genreRankNum: {
    color: '#000000',
    fontSize: 26,
    fontWeight: '900',
    width: 28,
  },
  genreTapeBox: {
    backgroundColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 4,
  },
  genreTapeText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  // SLIDE 3: TOP ARTIST
  opArtBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  wavyDoodle: {
    position: 'absolute',
    top: 100,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artistHeroWrap: {
    alignItems: 'center',
    marginTop: 40,
  },
  artistSpotlightLabel: {
    color: '#FAFF00',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 20,
  },
  polaroidCard: {
    width: 240,
    height: 240,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#FAFF00',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  polaroidImage: {
    width: '100%',
    height: '100%',
  },
  polaroidPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    paddingVertical: 6,
    alignItems: 'center',
  },
  polaroidBannerText: {
    color: '#FAFF00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  topArtistName: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 22,
    textAlign: 'center',
    letterSpacing: -1,
  },
  fanBadgeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fanBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
  },
  fanBadgeHighlight: {
    color: '#FAFF00',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },

  // SLIDE 4: TOP TRACKS
  topTracksContainer: {
    marginTop: 60,
  },
  tracksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  tracksHeaderLabel: {
    color: '#00F5D4',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  barcodeIcon: {
    padding: 4,
  },
  tracksList: {
    gap: 12,
  },
  trackCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 10,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  trackRankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackRankDigit: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  trackArtist: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  trackLoopCount: {
    backgroundColor: 'rgba(0, 245, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  trackLoopText: {
    color: '#00F5D4',
    fontSize: 12,
    fontWeight: '900',
  },

  // SLIDE 5: PERSONA
  personaContainer: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  personaAuraRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  personaLargeIcon: {
    fontSize: 64,
  },
  personaPill: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  personaPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  personaTitleText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 16,
  },
  personaBioCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  personaBioText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    fontWeight: '600',
  },

  // SLIDE 6: POSTER CARD
  posterCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#FAFF00',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    marginTop: 40,
  },
  posterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 16,
    marginBottom: 18,
  },
  posterBrandBadge: {
    color: '#FAFF00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  posterTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  posterLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterColumnsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  posterColumn: {
    flex: 1,
  },
  posterColHeading: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  posterItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  posterIndex: {
    color: '#FAFF00',
    fontSize: 12,
    fontWeight: '900',
    width: 14,
  },
  posterItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  posterBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  posterStatLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  posterStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  posterShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFF00',
    paddingVertical: 16,
    borderRadius: 32,
    marginTop: 20,
    gap: 8,
    shadowColor: '#FAFF00',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  posterShareBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
});
