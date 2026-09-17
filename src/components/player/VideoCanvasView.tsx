import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useAudioProgress,
  getExactAudioCurrentTime,
  registerAudioSeekListener,
} from '@/contexts/AudioContext';
import {
  lockLandscapeAsync,
  lockPortraitAsync,
  addOrientationListener,
} from '@/services/orientationManager';
import { FullscreenVideoOverlay } from './FullscreenVideoOverlay';

interface VideoCanvasViewProps {
  videoUrl: string;
  isPlaying: boolean;
  isVisible?: boolean;
  qualityBadge?: string;
  width?: number;
  height?: number;
  borderRadius?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_CARD_SIZE = Math.min(SCREEN_WIDTH - 72, 320);

export const VideoCanvasView: React.FC<VideoCanvasViewProps> = React.memo(({
  videoUrl,
  isPlaying,
  isVisible = true,
  qualityBadge = '1080p',
  width = DEFAULT_CARD_SIZE,
  height = DEFAULT_CARD_SIZE,
  borderRadius = 24,
}) => {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { position } = useAudioProgress();

  // Stable references for timer callbacks and native listeners
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const isVisibleRef = useRef<boolean>(isVisible);
  isVisibleRef.current = isVisible;

  // Track seeking state and seek timestamps
  const isSeekingRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);
  const seekSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [cardRemountKey, setCardRemountKey] = useState<number>(0);

  const handleEnterFullscreen = useCallback(async () => {
    await lockLandscapeAsync();
    setIsFullscreen(true);
  }, []);

  const handleExitFullscreen = useCallback(async () => {
    await lockPortraitAsync();
    setIsFullscreen(false);
    setCardRemountKey((prev) => prev + 1);
  }, []);

  // Listen for device physical rotation while video tab is visible
  useEffect(() => {
    if (!isVisible) {
      if (isFullscreen) {
        setIsFullscreen(false);
        lockPortraitAsync();
      }
      return;
    }

    const unsubscribe = addOrientationListener((isLand) => {
      if (isLand && !isFullscreen) {
        setIsFullscreen(true);
      } else if (!isLand && isFullscreen) {
        handleExitFullscreen();
      }
    });

    return () => unsubscribe();
  }, [isVisible, isFullscreen, handleExitFullscreen]);

  // Configure high-performance source with browser-matching headers and caching
  const videoSource = useMemo(() => {
    return {
      uri: videoUrl,
      useCaching: true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
    };
  }, [videoUrl]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    // Exact frame accuracy on Android ExoPlayer and iOS AVPlayer:
    // Zero tolerance ensures seek snaps to the exact timestamp, not the nearest keyframe!
    try {
      p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    } catch {}
    try {
      p.bufferOptions = {
        preferredForwardBufferDuration: 45,
        minBufferForPlayback: 1.5,
        prioritizeTimeOverSizeThreshold: false,
        maxBufferBytes: 35 * 1024 * 1024,
      };
    } catch {}

    const curPos = getExactAudioCurrentTime();
    if (curPos > 0) {
      try {
        p.currentTime = curPos;
      } catch {}
    }
    if (isPlayingRef.current && isVisibleRef.current) {
      p.play();
    }
  });

  // When returning from fullscreen to normal card player, re-sync time and ensure playback resumes
  useEffect(() => {
    if (cardRemountKey === 0 || !player || !isVisible) return;
    const timer = setTimeout(() => {
      try {
        const audioTime = getExactAudioCurrentTime();
        if (audioTime > 0) {
          player.currentTime = audioTime;
        }
        if (isPlayingRef.current) {
          player.play();
        }
      } catch {}
    }, 100);

    return () => clearTimeout(timer);
  }, [cardRemountKey, player, isVisible]);

  // 1. Direct Parallel Seek Listener:
  // When user drags scrubber, taps a timestamp, or skips, seekTo() fires this immediately (0ms).
  // Native video player seeks in parallel with the audio player!
  useEffect(() => {
    if (!player) return;

    const unregister = registerAudioSeekListener((targetSeconds) => {
      isSeekingRef.current = true;
      lastSeekTimeRef.current = Date.now();

      try {
        player.currentTime = targetSeconds;
      } catch {}

      if (isPlayingRef.current && isVisibleRef.current) {
        try {
          player.play();
        } catch {}
      }

      // Allow a 400ms settling window for ExoPlayer/AVPlayer buffer
      if (seekSafetyTimerRef.current) clearTimeout(seekSafetyTimerRef.current);
      seekSafetyTimerRef.current = setTimeout(() => {
        isSeekingRef.current = false;
      }, 400);
    });

    return () => {
      unregister();
      if (seekSafetyTimerRef.current) clearTimeout(seekSafetyTimerRef.current);
    };
  }, [player]);

  // 2. Handle ready status from native player
  useEffect(() => {
    if (!player) return;
    const subscription = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        setHasLoadedOnce(true);
        isSeekingRef.current = false;
        if (isVisibleRef.current && isPlayingRef.current) {
          try {
            player.play();
          } catch {}
        }
      }
    });

    return () => {
      subscription?.remove?.();
    };
  }, [player]);

  // 3. Handle visibility transitions ("Song" <-> "Video")
  // When user switches from Song to Video, snap video currentTime to the exact audio time immediately
  useEffect(() => {
    if (!player) return;

    if (isVisible) {
      const audioTime = getExactAudioCurrentTime();
      try {
        if (audioTime > 0) {
          player.currentTime = audioTime;
        }
      } catch {}

      if (isPlayingRef.current) {
        try {
          player.play();
        } catch {}
      }
    } else {
      // In Song mode, pause to save battery and network bandwidth
      try {
        player.pause();
      } catch {}
    }
  }, [isVisible, player]);

  // 4. Keep play/pause strictly in sync with song state
  useEffect(() => {
    if (!player || !isVisible) return;
    if (isPlaying) {
      const audioTime = getExactAudioCurrentTime();
      if (Math.abs(player.currentTime - audioTime) > 0.8) {
        try {
          player.currentTime = audioTime;
        } catch {}
      }
      try {
        player.play();
      } catch {}
    } else {
      try {
        player.pause();
      } catch {}
    }
  }, [isPlaying, player, isVisible]);

  // 5. High-Frequency Micro-Sync Engine (Runs every 200ms when playing & visible):
  // Measures drift against the real, high-resolution audio position.
  // Because video is muted, we can dynamically vary playback speed (0.7x to 1.35x)
  // to seamlessly eliminate any buffer delays after seeking without re-buffering!
  useEffect(() => {
    if (!player || !isVisible || !isPlaying) return;

    const syncInterval = setInterval(() => {
      // Allow decoder to settle right after an active seek command
      if (isSeekingRef.current && Date.now() - lastSeekTimeRef.current < 350) {
        return;
      }

      try {
        const audioTime = getExactAudioCurrentTime();
        const videoTime = player.currentTime;

        if (typeof videoTime !== 'number' || isNaN(videoTime) || videoTime < 0) return;
        if (typeof audioTime !== 'number' || isNaN(audioTime) || audioTime < 0) return;

        const drift = audioTime - videoTime; // positive: video lagging behind audio

        // Zone 1: Tight Lip Sync (|drift| <= 0.08s / 80ms) -> Perfect sync, keep 1.0x normal speed
        if (Math.abs(drift) <= 0.08) {
          if (player.playbackRate !== 1.0) {
            player.playbackRate = 1.0;
          }
        }
        // Zone 2: Minor lag (80ms to 350ms) -> Gentle 1.12x speedup
        else if (drift > 0.08 && drift <= 0.35) {
          if (player.playbackRate !== 1.12) {
            player.playbackRate = 1.12;
          }
        }
        // Zone 3: Moderate lag (350ms to 1.50s, e.g. after a manual skip or buffer delay)
        // Muted video catches up ~350ms per second seamlessly without stuttering or re-buffering!
        else if (drift > 0.35 && drift <= 1.50) {
          if (player.playbackRate !== 1.35) {
            player.playbackRate = 1.35;
          }
        }
        // Zone 4: Major lag (> 1.50s, e.g. network stall or huge jump)
        // Hard-snap currentTime to exact audio time
        else if (drift > 1.50) {
          if (player.status === 'readyToPlay') {
            player.currentTime = audioTime;
            player.playbackRate = 1.0;
          } else {
            player.playbackRate = 1.35;
          }
        }
        // Zone 5: Minor lead (-80ms to -350ms) -> Gentle 0.90x slowdown
        else if (drift < -0.08 && drift >= -0.35) {
          if (player.playbackRate !== 0.90) {
            player.playbackRate = 0.90;
          }
        }
        // Zone 6: Moderate lead (-350ms to -1.50s) -> 0.70x slowdown
        else if (drift < -0.35 && drift >= -1.50) {
          if (player.playbackRate !== 0.70) {
            player.playbackRate = 0.70;
          }
        }
        // Zone 7: Major lead (< -1.50s) -> Hard snap
        else if (drift < -1.50) {
          if (player.status === 'readyToPlay') {
            player.currentTime = audioTime;
            player.playbackRate = 1.0;
          }
        }
      } catch {}
    }, 200);

    return () => {
      clearInterval(syncInterval);
    };
  }, [player, isVisible, isPlaying]);

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius },
      ]}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {/* Card VideoView: unmounted while in fullscreen so it cleanly remounts & re-attaches surface on return */}
      {!isFullscreen && (
        <VideoView
          key={`card-video-${cardRemountKey}`}
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        />
      )}
      {/* Only show initial loading spinner before first frame renders */}
      {!hasLoadedOnce && isVisible && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}
      {/* Bottom info & actions row */}
      <View style={styles.bottomRow}>
        <View style={styles.canvasBadge}>
          <Text style={styles.canvasBadgeText}>{qualityBadge || 'VIDEO'}</Text>
        </View>

        {/* Fullscreen Expand Button (Four-corner expand bracket icon matching user image) */}
        <TouchableOpacity
          style={styles.fullscreenBtn}
          onPress={handleEnterFullscreen}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="fullscreen" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Fullscreen Video Overlay (YouTube-style landscape player) */}
      <FullscreenVideoOverlay
        player={player}
        isVisible={isFullscreen}
        qualityBadge={qualityBadge}
        onExitFullscreen={handleExitFullscreen}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#0a0a0c',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.58,
    shadowRadius: 16.0,
    elevation: 24,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomRow: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  canvasBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  canvasBadgeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  fullscreenBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
