const DEFAULT_MUSIC_COVER =
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';

/**
 * Returns a high-res cover artwork URL.
 * Preserves native YouTube HD (hq720.jpg / maxresdefault.jpg) provided by YouTube InnerTube,
 * and upgrades JioSaavn covers to 500x500 HD.
 */
export function getSafeCoverArt(url?: string, songId?: string): string {
  if (!url || !url.trim()) {
    if (songId) {
      const cleanId = songId.replace(/^yt_/, '').trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
        return `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;
      }
    }
    return DEFAULT_MUSIC_COVER;
  }

  let clean = url.trim();

  // Upgrade JioSaavn thumbnails to 500x500 HD
  if (clean.includes('saavncdn.com')) {
    return clean
      .replace(/50x50\.jpg/gi, '500x500.jpg')
      .replace(/150x150\.jpg/gi, '500x500.jpg')
      .replace(/250x250\.jpg/gi, '500x500.jpg');
  }

  return clean;
}

/**
 * Returns the highest resolution Ultra-HD cover available (1280x720 maxresdefault).
 * Used specifically by the full-screen player so thumbnails are crystal clear on high-DPI screens.
 */
export function getHighResCoverArt(url?: string, songId?: string): string {
  if (!url || !url.trim()) {
    if (songId) {
      const cleanId = songId.replace(/^yt_/, '').trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
        return `https://i.ytimg.com/vi/${cleanId}/maxresdefault.jpg`;
      }
    }
    return DEFAULT_MUSIC_COVER;
  }

  let clean = url.trim();

  // Upgrade JioSaavn thumbnails to 500x500 HD
  if (clean.includes('saavncdn.com')) {
    return clean
      .replace(/50x50\.jpg/gi, '500x500.jpg')
      .replace(/150x150\.jpg/gi, '500x500.jpg')
      .replace(/250x250\.jpg/gi, '500x500.jpg');
  }

  // If it's a YouTube URL, extract video ID to get uncompressed, un-downsampled 1280x720 maxresdefault
  const ytMatch = clean.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  if (ytMatch && ytMatch[1]) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  }

  // Preserve native 1280x720 hq720.jpg or maxresdefault.jpg (strip query parameters like ?sqp= only for standard /vi/ video tracks, NEVER for /s_p/ playlist covers where sqp is mandatory)
  if ((clean.includes('/hq720.jpg') || clean.includes('/maxresdefault.jpg')) && !clean.includes('/s_p/')) {
    return clean.split('?')[0];
  }


  // Upgrade standard YouTube 480x360 / 640x480 thumbnails to 1280x720 Ultra HD
  if (clean.includes('ytimg.com')) {
    if (clean.includes('/hqdefault.jpg')) {
      return clean.replace('/hqdefault.jpg', '/maxresdefault.jpg').split('?')[0];
    }
    if (clean.includes('/sddefault.jpg')) {
      return clean.replace('/sddefault.jpg', '/maxresdefault.jpg').split('?')[0];
    }
    if (clean.includes('/mqdefault.jpg')) {
      return clean.replace('/mqdefault.jpg', '/maxresdefault.jpg').split('?')[0];
    }
  } else if (songId && songId.startsWith('yt_')) {
    const cleanId = songId.replace(/^yt_/, '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
      return `https://i.ytimg.com/vi/${cleanId}/maxresdefault.jpg`;
    }
  }

  return clean;
}

/**
 * Detects whether a cover artwork URL or track is from YouTube.
 * YouTube standard thumbnails (hqdefault.jpg / sddefault.jpg) have baked-in 4:3 letterboxing
 * with black bars at the top and bottom.
 * JioSaavn and other catalog songs have native 1:1 square artwork without letterboxing.
 */
export function isYouTubeCover(url?: string, songId?: string, source?: string): boolean {
  if (source === 'jiosaavn') return false;
  if (url && url.includes('saavncdn.com')) return false;

  if (source === 'youtube') return true;
  if (songId && songId.startsWith('yt_')) return true;
  if (!url) return false;

  return (
    url.includes('ytimg.com') ||
    url.includes('youtube.com') ||
    url.includes('/hqdefault.jpg') ||
    url.includes('/sddefault.jpg') ||
    url.includes('/mqdefault.jpg') ||
    url.includes('/maxresdefault.jpg') ||
    url.includes('/hq720.jpg')
  );
}
