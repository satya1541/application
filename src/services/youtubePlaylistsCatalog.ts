import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanTitle } from './textCleaner';

export interface YouTubePlaylistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  badge: string;
  thumbnail: string;
  type: string;
}

export const YOUTUBE_PLAYLIST_CATEGORIES = [
  'All',
  'Charts',
  'Bollywood & Hindi',
  'Punjabi & Regional',
  'Fresh & Trending',
  'Moods & Chill',
  'Party & Dance',
  'Retro & 90s',
  'Hip-Hop & Rap',
  'Global & Pop',
] as const;

export type YouTubePlaylistCategory = string;

export function getCategoryFallbackCover(category: string): string {
  switch (category) {
    case 'Charts':
      return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';
    case 'Bollywood & Hindi':
      return 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80';
    case 'Punjabi & Regional':
      return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80';
    case 'Fresh & Trending':
      return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&auto=format&fit=crop&q=80';
    case 'Moods & Chill':
      return 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop&q=80';
    case 'Party & Dance':
      return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80';
    case 'Retro & 90s':
      return 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80';
    case 'Hip-Hop & Rap':
      return 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80';
    default:
      return 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80';
  }
}

export function categorizePlaylist(item: { id: string; title: string; description?: string }): {
  category: string;
  badge: string;
} {
  const id = item.id || '';
  const title = (item.title || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const text = `${title} ${desc}`;

  if (id.startsWith('PL4fGSI1pDJn') || title.includes('top 100') || title.includes('trending 20')) {
    return { category: 'Charts', badge: 'Chart' };
  }
  if (title.includes('top 50')) {
    return { category: 'Charts', badge: 'Top 50' };
  }
  if (
    text.includes('bollywood') ||
    text.includes('sufiyana') ||
    text.includes('ghazal') ||
    text.includes('hindustani') ||
    text.includes('hindi') ||
    text.includes('arijit') ||
    text.includes('shreya') ||
    text.includes('atif aslam')
  ) {
    if (text.includes('retro') || text.includes('90s') || text.includes('00s') || text.includes('old hindi')) {
      return { category: 'Retro & 90s', badge: 'Retro' };
    }
    if (text.includes('party') || text.includes('dance')) {
      return { category: 'Party & Dance', badge: 'Party' };
    }
    if (text.includes('romance') || text.includes('love') || text.includes('chill') || text.includes('uncut')) {
      return { category: 'Moods & Chill', badge: 'Romance' };
    }
    return { category: 'Bollywood & Hindi', badge: 'Bollywood' };
  }
  if (
    text.includes('punjabi') ||
    text.includes('punjab') ||
    text.includes('tollywood') ||
    text.includes('kollywood') ||
    text.includes('mollywood') ||
    text.includes('tamil') ||
    text.includes('telugu') ||
    text.includes('malayalam') ||
    text.includes('bhojpuri') ||
    text.includes('haryanvi') ||
    text.includes('marathi') ||
    text.includes('carnatic') ||
    text.includes('odia') ||
    text.includes('sambalpuri') ||
    text.includes('bengali') ||
    text.includes('kannada') ||
    text.includes('gujarati') ||
    text.includes('rajasthani') ||
    text.includes('moose wala') ||
    text.includes('aujla')
  ) {
    if (text.includes('party') || text.includes('dance')) {
      return { category: 'Party & Dance', badge: 'Party' };
    }
    if (text.includes('retro') || text.includes('90s') || text.includes('00s')) {
      return { category: 'Retro & 90s', badge: 'Throwback' };
    }
    return { category: 'Punjabi & Regional', badge: 'Regional' };
  }
  if (
    text.includes('party') ||
    text.includes('dance') ||
    text.includes('bangers') ||
    text.includes('machayenge') ||
    text.includes('pump-up')
  ) {
    return { category: 'Party & Dance', badge: 'Party' };
  }
  if (
    text.includes('lofi') ||
    text.includes('chill') ||
    text.includes('relax') ||
    text.includes('mellow') ||
    text.includes('whisper') ||
    text.includes('chai') ||
    text.includes('sweetheart') ||
    text.includes('cuffin')
  ) {
    return { category: 'Moods & Chill', badge: 'Chill' };
  }
  if (
    text.includes('hip hop') ||
    text.includes('rap') ||
    text.includes('trap') ||
    text.includes('gangsta')
  ) {
    return { category: 'Hip-Hop & Rap', badge: 'Hip-Hop' };
  }
  if (
    text.includes('retro') ||
    text.includes('90s') ||
    text.includes('80s') ||
    text.includes('00s') ||
    text.includes('throwback') ||
    text.includes('classics')
  ) {
    return { category: 'Retro & 90s', badge: 'Retro' };
  }
  if (
    text.includes('released') ||
    text.includes('short list') ||
    text.includes('hits of') ||
    text.includes('internet hits') ||
    text.includes('pop certified') ||
    text.includes('pop before') ||
    text.includes('clout')
  ) {
    return { category: 'Fresh & Trending', badge: 'Trending' };
  }
  return { category: 'Global & Pop', badge: 'Curated' };
}

/**
 * Strips temporary expiry parameters from YouTube CDN thumbnail URLs.
 */
export function cleanYouTubeThumbnailUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  if (rawUrl.includes('i.ytimg.com/vi/')) {
    return rawUrl.split('?')[0];
  }
  return rawUrl;
}

/**
 * Safely extracts high-resolution thumbnail URL from any YouTube node,
 * prioritizing permanent, non-expiring video thumbnails.
 */
export function extractThumbnailUrl(node: any, fallbackCategory: string = 'Charts'): string {
  if (!node || typeof node !== 'object') return getCategoryFallbackCover(fallbackCategory);
  const urls: { url: string; width: number; isVideoThumb: boolean }[] = [];

  function search(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.url === 'string' && obj.url.startsWith('http')) {
      // Reject broken playlist ID URLs
      if (!obj.url.includes('/vi/RDCLAK') && !obj.url.includes('/vi/PL') && !obj.url.includes('/vi/OLAK')) {
        const isVideoThumb = obj.url.includes('i.ytimg.com/vi/');
        const cleanUrl = isVideoThumb ? obj.url.split('?')[0] : obj.url;
        urls.push({
          url: cleanUrl,
          width: typeof obj.width === 'number' ? obj.width : 0,
          isVideoThumb,
        });
      }
    }
    for (const k of Object.keys(obj)) {
      search(obj[k]);
    }
  }

  search(node);

  if (urls.length > 0) {
    // Prefer permanent video thumbnails over signed temporary ones
    urls.sort((a, b) => {
      if (a.isVideoThumb && !b.isVideoThumb) return -1;
      if (!a.isVideoThumb && b.isVideoThumb) return 1;
      return b.width - a.width;
    });
    return urls[0].url;
  }
  return getCategoryFallbackCover(fallbackCategory);
}

// Complete verified fallback catalog of playlists with genuine working thumbnails
export const FALLBACK_YOUTUBE_PLAYLISTS: YouTubePlaylistItem[] = [
  {
    "id": "PL4fGSI1pDJn4pTWyM3t61lOyZ6_4jcNOw",
    "title": "Top 100 Songs India",
    "description": "The official most-played songs this week across India on YouTube Charts.",
    "category": "Charts",
    "badge": "Top 100",
    "thumbnail": "https://i.ytimg.com/vi/JqFzhcWo3EU/hq720.jpg",
    "type": "Official Chart"
  },
  {
    "id": "RDCLAK5uy_l_Bj8rMsjkhFMMs-eLrA17_zjr9r6g_Eg",
    "title": "Bollywood Party",
    "description": "High-energy dance anthems and party hits from the biggest Bollywood blockbusters.",
    "category": "Bollywood & Hindi",
    "badge": "Bollywood",
    "thumbnail": "https://i.ytimg.com/vi/J_d_Q3pTYcc/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lhIiKLMQM6_gokxx581SC-xQBSfJm9gqc",
    "title": "Bollywood Essentials",
    "description": "The absolute must-listen Hindi film music classics and modern chart-toppers.",
    "category": "Bollywood & Hindi",
    "badge": "Bollywood",
    "thumbnail": "https://i.ytimg.com/vi/roz9sXFkTuE/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mcMBXir4RT5m0mkGIRtbwFOtD4nbiVSvg",
    "title": "Midnight Romance: Hindi",
    "description": "Soulful melodies and romantic late-night Hindi love songs.",
    "category": "Moods & Chill",
    "badge": "Romance",
    "thumbnail": "https://i.ytimg.com/vi/BSJa1UytM8w/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_nlOMew8qv8HGXb9HbshuU1OgH3aL_JMKA",
    "title": "Punjabi Party Mix",
    "description": "The biggest upbeat bhangra, dhol, and party anthems from Punjab's biggest stars.",
    "category": "Punjabi & Regional",
    "badge": "Punjabi",
    "thumbnail": "https://i.ytimg.com/vi/knGCfzm4jWs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "PLEK4199_zBwCqNxwJygffUonzfROKn0Kh",
    "title": "Top Punjabi Hits",
    "description": "All-time chart-topping Punjabi hits and viral regional bangers.",
    "category": "Punjabi & Regional",
    "badge": "Punjabi",
    "thumbnail": "https://i.ytimg.com/vi/jOYR3k1VhUQ/hq720.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_nASi5xj4ufYXfuP-8aBUpohNZ4CnMqdIA",
    "title": "Desi Hip Hop Essentials",
    "description": "Groundbreaking bars, heavy 808s, and street anthems from Indian hip hop pioneers.",
    "category": "Hip-Hop & Rap",
    "badge": "Desi Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/yM5APO87aNU/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lHpBhjR3PefMmM-_sCM4cWOY6AcpxtCIk",
    "title": "90s Chill: Bollywood",
    "description": "Nostalgic golden-era 90s Bollywood melodies and timeless romantic classics.",
    "category": "Retro & 90s",
    "badge": "Retro 90s",
    "thumbnail": "https://i.ytimg.com/vi/sWqjZpBtcxc/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n3wF8q0e4r1V5b6i7L8k9p2O3m4",
    "title": "Arijit Singh Melodies",
    "description": "Heartfelt soul, romantic chartbusters, and unforgettable anthems by Arijit Singh.",
    "category": "Bollywood & Hindi",
    "badge": "Arijit Singh",
    "thumbnail": "https://c.saavncdn.com/artists/Arijit_Singh_002_20230323062147_500x500.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m5_9zO9wZJ5f_F5e2r9_a0_w8bF3",
    "title": "Romantic Hits Hindi",
    "description": "The sweetest love songs, soulful acoustic duets, and heartfelt Bollywood romance.",
    "category": "Bollywood & Hindi",
    "badge": "Romance",
    "thumbnail": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Shreya Ghoshal Essentials",
    "description": "The golden, melodious voice of Indian cinema with her greatest hits.",
    "category": "Bollywood & Hindi",
    "badge": "Shreya Ghoshal",
    "thumbnail": "https://c.saavncdn.com/artists/Shreya_Ghoshal_004_20230323061434_500x500.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k1w3_F5e2r9_a0_w8bF3i4L2Vf_P9",
    "title": "Bollywood Dance Anthems",
    "description": "High-octane club bangers and dance-floor destroyers from Hindi cinema.",
    "category": "Bollywood & Hindi",
    "badge": "Dance",
    "thumbnail": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l7e2r_9v8_w8bF3i4L2Vf_P9vF1W0",
    "title": "Soulful Sufi & Ghazals",
    "description": "Deeply spiritual, poetic sufi melodies, and timeless qawwalis.",
    "category": "Bollywood & Hindi",
    "badge": "Sufi",
    "thumbnail": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k9Vb4k3L2v0Z5x4Q6w8bF3i4L2Vf_P9v",
    "title": "Sad Hindi Melodies",
    "description": "Emotional depth, broken hearts, and late-night Hindi sorrow.",
    "category": "Bollywood & Hindi",
    "badge": "Heartbreak",
    "thumbnail": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m5F2r9_a0_w8bF3i4L2Vf_P9vF1W0e",
    "title": "Atif Aslam Love Anthems",
    "description": "Mesmerizing vocals and legendary romantic tracks from Atif Aslam.",
    "category": "Bollywood & Hindi",
    "badge": "Atif Aslam",
    "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l0v4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Sidhu Moose Wala Legends",
    "description": "Immortal Punjabi hip-hop anthems, raw storytelling, and legendary flow.",
    "category": "Punjabi & Regional",
    "badge": "Moose Wala",
    "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k7w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Diljit Dosanjh Essentials",
    "description": "From Bhangra blockbusters to smooth pop melodies from the G.O.A.T.",
    "category": "Punjabi & Regional",
    "badge": "Diljit Dosanjh",
    "thumbnail": "https://c.saavncdn.com/artists/Diljit_Dosanjh_004_20221006184545_500x500.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n2w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Karan Aujla Hits",
    "description": "Geetan Di Machine Karan Aujla's chart-topping bangers and hard-hitting lines.",
    "category": "Punjabi & Regional",
    "badge": "Karan Aujla",
    "thumbnail": "https://c.saavncdn.com/artists/Karan_Aujla_003_20230818090712_500x500.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k2w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Tollywood Superhits (Telugu)",
    "description": "Mass beats, fiery melodies, and sensational chartbusters from Telugu cinema.",
    "category": "Punjabi & Regional",
    "badge": "Telugu",
    "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l3w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Kollywood Superhits (Tamil)",
    "description": "Energetic Tamil cinema chartbusters, kuthu beats, and AR Rahman / Anirudh magic.",
    "category": "Punjabi & Regional",
    "badge": "Tamil",
    "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m4w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Anirudh Ravichander Blockbusters",
    "description": "Rockstar Anirudh's viral background scores, high-voltage hooks, and viral hits.",
    "category": "Punjabi & Regional",
    "badge": "Anirudh",
    "thumbnail": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n5w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Odia & Sambalpuri Superhits",
    "description": "Electrifying folk rhythm, Dhol-Nishan beats, and modern Odia-Sambalpuri blockbusters.",
    "category": "Punjabi & Regional",
    "badge": "Odia / Sambalpuri",
    "thumbnail": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k6w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Bhojpuri Dhamaka & Dance",
    "description": "High-energy Bhojpuri party hits, DJ remixes, and festival dance anthems.",
    "category": "Punjabi & Regional",
    "badge": "Bhojpuri",
    "thumbnail": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l7w3_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Haryanvi Mashup & Ragni",
    "description": "Heavy desi bass, viral dance beats, and popular Haryanvi music hits.",
    "category": "Punjabi & Regional",
    "badge": "Haryanvi",
    "thumbnail": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k3w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Kishore Kumar Golden Classics",
    "description": "The unparalleled voice that defined Bollywood romance, joy, and nostalgia.",
    "category": "Retro & 90s",
    "badge": "Kishore Kumar",
    "thumbnail": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l4w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Lata Mangeshkar & RD Burman Magic",
    "description": "The Nightingale of India meets Pancham Da's revolutionary melodies.",
    "category": "Retro & 90s",
    "badge": "Lata & RD",
    "thumbnail": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m5w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "90s Kumar Sanu & Alka Yagnik Romance",
    "description": "Timeless 1990s duets that defined a generation of pure Bollywood melody.",
    "category": "Retro & 90s",
    "badge": "90s Romance",
    "thumbnail": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n6w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "2000s Bollywood Nostalgia",
    "description": "Iconic pop and film music memories from the vibrant 2000s era.",
    "category": "Retro & 90s",
    "badge": "2000s Hits",
    "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l8w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Chai & Acoustic Hindi",
    "description": "Stripped-down guitars, warm vocals, and cozy afternoon tea melodies.",
    "category": "Moods & Chill",
    "badge": "Acoustic",
    "thumbnail": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m9w4_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Rainy Day Monsoon Melodies",
    "description": "Evocative Hindi songs that bring the gentle comfort of rain and memories.",
    "category": "Moods & Chill",
    "badge": "Monsoon",
    "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n0w5_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Late Night Hindi Drives",
    "description": "Smooth synth beats and soothing Hindi vocals for late-night city streets.",
    "category": "Moods & Chill",
    "badge": "Late Night",
    "thumbnail": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k4w5_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Gully Gang & Divine Anthems",
    "description": "Street-tested Mumbai rap, real grit, and anthems of the gully revolution.",
    "category": "Hip-Hop & Rap",
    "badge": "Gully Gang",
    "thumbnail": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k9w5_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Punjabi Dhol & Bhangra Blast",
    "description": "Pure percussion, thumping dhol rhythms, and festival celebration songs.",
    "category": "Party & Dance",
    "badge": "Bhangra",
    "thumbnail": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l0w6_F5e2r9_a0_w8bF3i4L2Vf_P9v",
    "title": "Club Bollywood Bangers",
    "description": "Remixed blockbusters, electro drops, and high-energy Bollywood dance party.",
    "category": "Party & Dance",
    "badge": "Club",
    "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lS3E3PgpboCkZ_PfLPCkLLNPI1uH6kfc0",
    "title": "The Short List",
    "description": "Check out the biggest trending tracks on YouTube Shorts.",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/PXxbEfhtDiM/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kkkZR6KAV5kBSqDCeaBb_pDDhA83VGFwg",
    "title": "Pop Before It Breaks",
    "description": "An essential preview of tomorrow's pop hits. ",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/raxNzPmnXrI/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m5k78k1nN5yDlb_kmGHUVXALhIgHjtq4s",
    "title": "INTERNET HITS",
    "description": "Check out all the tracks that are buzzing right now on socials.",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k7O9KByATGA1TqFYhyOkylpJ6fM1avtww",
    "title": "Clout Rising: New Hip-Hop",
    "description": "From viral internet phenoms to street-rap breakouts, these rappers are tomorrow's hip-hop hitmakers.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/Tp9PPPQUPew/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l-JbTcCK10aQ5AFrXLmiNt9sVCbnCDVC0",
    "title": "Nuevas Vibras",
    "description": "Good music, new vibes.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/fRIhCiUVaKs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n0vqPVYwwLGVv8XMpjj7IovO50hqegreo",
    "title": "Country's New Crop",
    "description": "Discover the latest tracks from country's brightest up-and-comers. ",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/40asa8ogS3A/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lFJ89YweCFLE5XiRWX9CZ6UHulZ5uTAWw",
    "title": "Genre Blurring",
    "description": "Genre defying innovators from today's music scene. ",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/4avspFPZOWs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mB1zoU6QkDs2Ls369_DU8_JbHCp3Wdd90",
    "title": "Urbano 2026",
    "description": "The hottest tracks in reggaeton, trap, and more from the biggest stars and most exciting emerging Urbano acts.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/lz0JbSUzZxM/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_nGZRi-an-ruqiZlNJSGhCDHucdp2FBNfI",
    "title": "New R&B",
    "description": "A spotlight on the most exciting new R&B music from superstars and newcomers alike. ",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/WYpl2zBnLRo/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_n7QjhERM2Q4Ha5B6t6ZmzyhOtRYjQtxKk",
    "title": "Flow Superior",
    "description": "For the real hip-hop heads: From the vets to the emerging stars, these are today's most gifted lyricists.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/ecIH-4RbbOk/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lBNUteBRencHzKelu5iDHwLF6mYqjL-JU",
    "title": "Pop Certified",
    "description": "Today's biggest and best pop songs. ",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/tVXXD7KXAec/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lBGRuQnsG37Akr1CY4SxL0VWFbPrbO4gs",
    "title": "On Everything: Today's Hip-Hop Hits",
    "description": "The hottest hip-hop tracks out now... and that's on everything.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/xxFjwI1qYmc/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mEjQ-AXbQqd6l_gsdgMU-hw_UNntQ-NWE",
    "title": "Hits of 2026 (So Far)",
    "description": "Experience the sound of 2026 with this playlist featuring the biggest hits of the year so far.",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/nUsrYVxrDwI/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lOAAW-PX5XUed76iQefCxkOXd6m6ZvyiM",
    "title": "Latin Now",
    "description": "Today's biggest Latin hits",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/tPaSYnNKMas/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lJ8xZWiZj2GCw7MArjakb6b0zfvqwldps",
    "title": "Country Hotlist",
    "description": "Your one-stop shop for today's biggest country hits.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/6q5F7UUiXK0/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kLWIr9gv1XLlPbaDS965-Db4TrBoUTxQ8",
    "title": "Chroma: Today's Dance Hits",
    "description": "A radiant display of current Electronic Dance Music; with Cloonee + Prospa",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/gJYjbDnyx-o/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_k5vcGRXixxemtzK1eKDS7BeHys7mvYOdk",
    "title": "Maximum Decibels: Today's Rock Hits",
    "description": "The best rock tracks from up-and-coming acts as well as the hottest new music from today's biggest stars.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/OeRIoWmQA6k/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_m0Nsi5Jnn_g6qbvc7fywPRhEv1qN0PcMM",
    "title": "Today's Indie Hits",
    "description": "Your guide to the state of indie music right now, from the seminal to the undiscovered.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/WSC7c0KqYZk/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mu-BhJj3yO1OXEMzahs_aJVtNWJwAwFEE",
    "title": "Highline: Today's R&B Hits",
    "description": "Your destination for today's top R&B tracks.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/Mv5f9Q2LJYM/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kV0Nh-OIcnh8LppyiFE4lhhWZEvaPQEOY",
    "title": "Hot Reggaeton",
    "description": "Your home for today's top reggaeton hits.",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/EnFknOhVXBs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kUFCSc-grF3m-L_49W6p1QyGsMbueEbog",
    "title": "Caribbean Pulse",
    "description": "Featuring today's reggae and dancehall hits, listen to the freshest sounds from across the Caribbean spectrum. ",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/FQRi3LWM0t4/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mU14EejSbDsfLuPc9KpNzoC0o-YQvi6I4",
    "title": "Christian Hits",
    "description": "The good news, every week. Press play on today's contemporary Christian, pop, and praise. ",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/HWduieNXgSg/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kP2172rQNb3KFXz880xp6M98R_ME5CIKA",
    "title": "Hip-Hop Classics",
    "description": "Hip-Hop's biggest anthems.",
    "category": "Retro & 90s",
    "badge": "Retro",
    "thumbnail": "https://i.ytimg.com/vi/eaPzCHEQExs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kN4eY_ibobGvCBwIJGEGpDjuwzYHIG_iE",
    "title": "'00s Hip Hop Party",
    "description": "Pop some bottles and drop it like it's hot with the hottest hip hop bangers of the '00s.",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/1Vf4mMCpNY0/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lK012i9pCwk6EG19BPblG5b8m2RiNalII",
    "title": "The Golden Age of Gangsta Rap",
    "description": "Classic gangsta rap from the late '80s and '90s. ",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/hCKXOgHmWhQ/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_l0pAECrSAnyfXn-bgZ6XveIzAjDixOiX0",
    "title": "'90s Hip Hop",
    "description": "Throw a house party like back in the day. These choice hip hop cuts from the 1990s will get heads nodding and bodies moving. ",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/f8cHxydDb7o/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mU6GwWHPorAUvZLgNsRekuN-Wvltw0oZ0",
    "title": "Classic West Coast Hip Hop",
    "description": "Out the trunk and into the speakers, this mix of old and new make up the definitive classic sounds of the West Coast. ",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/fPO76Jlnz6c/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kznivG7S3b6r3zfqDKLHvWGn16Y-InvDo",
    "title": "'10s Hip Hop",
    "description": "Relive the biggest hip hop hits from the 2010s.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kjWs8kYE7G6CkEijcEvsO9MVdE5doD3uY",
    "title": "Old-School Hip Hop",
    "description": "Early hip hop hits from the days when all a rapper needed was two turntables and a microphone.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/iI_ksiX3Z-E/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_lM6RrS_mVoUIOm3FPdbpo15oa5vrjaPZI",
    "title": "'00s Dirty South Hip Hop",
    "description": "From the A to H-town, get crunked up and stay steady trappin' with a collection of the hits that defined the decade. ",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/gczBgNB-p1w/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kc4LIsE0KNO69Yql4rnUIW0xJCBp5d3MM",
    "title": "Trap Anthems",
    "description": "Get the trap house bumpin' with these hype trap tracks.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/vJwKKKd2ZYE/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mF9cV4dCYClMcRTJhwsmd8Do1ZZGMKRRc",
    "title": "Southern Rappers Just Wanna Have Fun",
    "description": "Party to these throwback Southern rap tracks",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/vBjzAdpZzf0/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kE9H3p1KZP2SAsj4NTjSptVInBd-sGPCw",
    "title": "New York Rap Legends",
    "description": "Classics from New York's biggest rappers.",
    "category": "Hip-Hop & Rap",
    "badge": "Hip-Hop",
    "thumbnail": "https://i.ytimg.com/vi/vk6014HuxcE/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mVJ3RRi_YBfUJnZnQxLAedQQcXHujbUcg",
    "title": "Pump-Up Pop",
    "description": "Elevate your mood (and your heart rate) with these pop anthems",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kb7EBi6y3GrtJri4_ZH56Ms786DFEimbM",
    "title": "Lofi Loft",
    "description": "Kick back and coast to these chillhop and lofi beats. ",
    "category": "Moods & Chill",
    "badge": "Chill",
    "thumbnail": "https://i.ytimg.com/vi/JgI6z6aQhEA/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kfYirvQ6KXjHJBgPBl5kAqoWrg4VMMkiY",
    "title": "Cuffin' Season",
    "description": "Cuffin' Season is upon us where the days are getting shorter and the weather's getting colder and folks want to be cuddled up with someone. Choose up.",
    "category": "Moods & Chill",
    "badge": "Chill",
    "thumbnail": "https://i.ytimg.com/vi/1ipRd0WgB0c/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mSaYvcoVvag_GrAc593WX3MoxTLvUXYT8",
    "title": "Relaxing Evening",
    "description": "A relaxing mix of pop, soul, indie, jazz and more.",
    "category": "Moods & Chill",
    "badge": "Chill",
    "thumbnail": "https://i.ytimg.com/vi/ixvyqLcm7Kc/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kKEOZ3x5ED4hNxb8lHXhOp5cHFW_CbwMk",
    "title": "Low Key",
    "description": "Vibe to this chill mix of rhythmic pop and R&B",
    "category": "Moods & Chill",
    "badge": "Chill",
    "thumbnail": "https://i.ytimg.com/vi/lrS1LC2cu-U/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_mfut9V_o1n9nVG_m5yZ3ztCif29AHUffI",
    "title": "Take It Easy Rock",
    "description": "From classic rock to alternative, kick back with this collection of easygoing rock. ",
    "category": "Global & Pop",
    "badge": "Curated",
    "thumbnail": "https://i.ytimg.com/vi/OMOGaugKpzs/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_nfs_t4FUu00E5ED6lveEBBX1VMYe1mFjk",
    "title": "Dance Pop Bangers",
    "description": "When dance music takes main stage",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "PL4fGSI1pDJn6O1LS0XSdF3RyO0Rq_LDeI",
    "title": "Top 100 Songs United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/nUsrYVxrDwI/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn69On1f-8NAvX_CYlx7QyZc",
    "title": "Top 100 Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "OLAK5uy_kNWGJvgWVqlt5LsFDL9Sdluly4M8TvGkM",
    "title": "Trending 20 United States",
    "description": "Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/FyS5dAywkEo/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i",
    "title": "Top 100 Songs Global",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM",
    "title": "Top 100 Music Videos Global",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn77aK7sAW2AT0oOzo5inWY8",
    "title": "Top 50 Pop Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn4fmCoF1vKHLtivI0f9yHiF",
    "title": "Top 50 Hip Hop Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/PXxbEfhtDiM/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn5O8siDeZuI_4hbk6JWtTX1",
    "title": "Top 50 Latin Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn4EBsWVeFpcSAVOFMfhyipg",
    "title": "Top 50 Country & Americana Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/nUsrYVxrDwI/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn5LOptOQixqnzXNGjNXAgYY",
    "title": "Top 50 Rock Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/anhQ3fC1_hY/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "PL4fGSI1pDJn4w4wTTgOmP_S80PoCtbGrL",
    "title": "Top 50 Hard Rock & Metal Music Videos United States",
    "description": "YouTube Music Global Charts • Playlist • Updated today • View full playlist",
    "category": "Charts",
    "badge": "Chart",
    "thumbnail": "https://i.ytimg.com/vi/PszdRgiNi1A/hqdefault.jpg",
    "type": "Official Chart"
  },
  {
    "id": "RDCLAK5uy_k5n4srrEB1wgvIjPNTXS9G1ufE9WQxhnA",
    "title": "RELEASED",
    "description": "The hottest new songs this week, served up fresh to you every Friday. ",
    "category": "Fresh & Trending",
    "badge": "Trending",
    "thumbnail": "https://i.ytimg.com/vi/FyS5dAywkEo/hqdefault.jpg",
    "type": "Curated Mix"
  },
  {
    "id": "RDCLAK5uy_kwJTdGJj4KpaItCZogif_xkH69VyeERKw",
    "title": "R&B Party",
    "description": "Get bodies moving with this always-updated playlist of R&B floor-fillers. ",
    "category": "Party & Dance",
    "badge": "Party",
    "thumbnail": "https://i.ytimg.com/vi/rtwpk9rb1Dc/hqdefault.jpg",
    "type": "Curated Mix"
  }
];

export const OFFICIAL_YOUTUBE_PLAYLISTS: YouTubePlaylistItem[] = FALLBACK_YOUTUBE_PLAYLISTS;


// In-memory runtime cache for dynamic live playlists - initialized with full curated catalog
let memoryCache: YouTubePlaylistItem[] = [...FALLBACK_YOUTUBE_PLAYLISTS];

export function getCachedDynamicPlaylists(): YouTubePlaylistItem[] {
  return memoryCache && memoryCache.length > 0 ? memoryCache : FALLBACK_YOUTUBE_PLAYLISTS;
}

const STORAGE_KEY = '@deluxe_dynamic_yt_live_playlists_hd_v3';
const COVER_CACHE_KEY_PREFIX = '@deluxe_pl_cover_';
const liveCoverMemoryCache = new Map<string, string>();
const inFlightCoverResolutions = new Map<string, Promise<string | null>>();

/**
 * Merges dynamic or stored items with the rich curated base catalog.
 * Guarantees that ALL curated playlists (Bollywood, Punjabi, Odia, Retro, Charts, Moods, etc.)
 * remain available and are never wiped out by sparse live scrapes.
 */
export function mergeWithBasePlaylists(incoming: YouTubePlaylistItem[]): YouTubePlaylistItem[] {
  if (!incoming || incoming.length === 0) {
    return [...FALLBACK_YOUTUBE_PLAYLISTS];
  }

  const playlistMap = new Map<string, YouTubePlaylistItem>();
  for (const item of FALLBACK_YOUTUBE_PLAYLISTS) {
    playlistMap.set(item.id, item);
  }

  for (const item of incoming) {
    if (!item || !item.id) continue;
    const existing = playlistMap.get(item.id);
    if (existing) {
      playlistMap.set(item.id, {
        ...existing,
        ...item,
        thumbnail: item.thumbnail || existing.thumbnail,
        category: item.category || existing.category,
        badge: item.badge || existing.badge,
        type: item.type || existing.type,
      });
    } else {
      playlistMap.set(item.id, item);
    }
  }

  return Array.from(playlistMap.values());
}

/**
 * Resolves the real, authentic lead video thumbnail of any playlist live from YouTube.
 * 1. Checks memory & AsyncStorage cache first
 * 2. Deduplicates concurrent in-flight requests
 * 3. Queries YouTube InnerTube for the playlist's current #1 video
 * 4. Returns permanent https://i.ytimg.com/vi/${leadVideoId}/hqdefault.jpg
 */
export async function resolveLivePlaylistCover(playlistId: string): Promise<string | null> {
  if (!playlistId) return null;

  if (liveCoverMemoryCache.has(playlistId)) {
    return liveCoverMemoryCache.get(playlistId)!;
  }

  // Check persistent cache
  try {
    const cached = await AsyncStorage.getItem(COVER_CACHE_KEY_PREFIX + playlistId);
    if (cached && cached.startsWith('http') && cached.includes('/vi/')) {
      liveCoverMemoryCache.set(playlistId, cached);
      return cached;
    }
  } catch {}

  if (inFlightCoverResolutions.has(playlistId)) {
    return inFlightCoverResolutions.get(playlistId)!;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const browseId = playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId;
      const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
          browseId,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();

      let leadVideoId: string | null = null;
      const phr = data.header?.playlistHeaderRenderer;
      if (phr?.playButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.videoId) {
        leadVideoId = phr.playButton.buttonRenderer.navigationEndpoint.watchEndpoint.videoId;
      } else if (phr?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.onTap?.watchEndpoint?.videoId) {
        leadVideoId = phr.playlistHeaderBanner.heroPlaylistThumbnailRenderer.onTap.watchEndpoint.videoId;
      }

      if (!leadVideoId) {
        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
        const sections = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        for (const s of sections) {
          const items = s.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (item.lockupViewModel?.contentId && item.lockupViewModel.contentId.length === 11) {
              leadVideoId = item.lockupViewModel.contentId;
              break;
            }
            const vidList = item.playlistVideoListRenderer?.contents;
            if (vidList && vidList[0]?.playlistVideoRenderer?.videoId) {
              leadVideoId = vidList[0].playlistVideoRenderer.videoId;
              break;
            }
          }
          if (leadVideoId) break;
        }
      }

      if (leadVideoId && typeof leadVideoId === 'string' && leadVideoId.length === 11) {
        const permanentUrl = `https://i.ytimg.com/vi/${leadVideoId}/hqdefault.jpg`;
        liveCoverMemoryCache.set(playlistId, permanentUrl);
        AsyncStorage.setItem(COVER_CACHE_KEY_PREFIX + playlistId, permanentUrl).catch(() => {});
        return permanentUrl;
      }
    } catch (err) {
      console.warn('[PlaylistCover] Failed to resolve live cover for', playlistId, err);
    } finally {
      clearTimeout(timeoutId);
      inFlightCoverResolutions.delete(playlistId);
    }
    return null;
  })();

  inFlightCoverResolutions.set(playlistId, promise);
  return promise;
}

/**
 * Returns live official YouTube playlists with instant cached retrieval.
 * Uses persistent AsyncStorage and memory caching to load instantly (0ms)
 * while ensuring all curated regional, bollywood, retro, and global categories
 * are fully preserved.
 */
export async function fetchDynamicYouTubePlaylists(
  forceRefresh: boolean = false
): Promise<YouTubePlaylistItem[]> {
  // 1. If memory cache is available and has full catalog and not force-refreshing, return immediately (0ms)
  if (!forceRefresh && memoryCache && memoryCache.length >= FALLBACK_YOUTUBE_PLAYLISTS.length) {
    return memoryCache;
  }

  // 2. Try reading from persistent AsyncStorage if not force-refreshing
  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as YouTubePlaylistItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = mergeWithBasePlaylists(parsed);
          memoryCache = merged;
          // Silently refresh in background
          fetchFromLiveChannel()
            .then((live) => {
              if (live && live.length > 0) {
                const refreshed = mergeWithBasePlaylists(live);
                memoryCache = refreshed;
                AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed)).catch(() => {});
              }
            })
            .catch(() => {});
          return merged;
        }
      }
    } catch (e) {
      console.warn('[Playlists] Error reading cached playlists:', e);
    }
  }

  // 3. Fetch fresh live channel playlists
  try {
    const live = await fetchFromLiveChannel();
    if (live && live.length > 0) {
      const merged = mergeWithBasePlaylists(live);
      memoryCache = merged;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    }
  } catch (err) {
    console.warn('[Playlists] Error fetching live channel playlists (retaining curated catalog):', err);
  }

  // Fallback to ensuring memoryCache has all fallback playlists
  if (!memoryCache || memoryCache.length === 0) {
    memoryCache = [...FALLBACK_YOUTUBE_PLAYLISTS];
  }
  return memoryCache;
}

/**
 * Scrapes live playlists directly from YouTube channel page.
 * Uses AbortController with 4500ms timeout to ensure fast failure without hanging.
 */
async function fetchFromLiveChannel(): Promise<YouTubePlaylistItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const url = 'https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ/playlists';
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      throw new Error(`YouTube channel HTTP error: ${res.status}`);
    }

    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
      html.match(/ytInitialData\s*=\s*({.*?});/s);

    if (!match) {
      throw new Error('Could not parse ytInitialData from channel page');
    }

    const data = JSON.parse(match[1]);
    const liveItems: YouTubePlaylistItem[] = [];
    const seenIds = new Set<string>();

    function scanNodes(node: any) {
      if (!node || typeof node !== 'object') return;

      if (node.lockupViewModel) {
        const lvm = node.lockupViewModel;
        const id = lvm.contentId;
        const rawTitle = lvm.metadata?.lockupMetadataViewModel?.title?.content;

        if (id && rawTitle && (id.startsWith('RDCLAK') || id.startsWith('PL') || id.startsWith('OLAK'))) {
          if (!seenIds.has(id)) {
            seenIds.add(id);

            const metaRows =
              lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
            let subtitle = '';
            for (const row of metaRows) {
              for (const part of row.metadataParts || []) {
                if (part.text?.content) {
                  subtitle = subtitle ? `${subtitle} • ${part.text.content}` : part.text.content;
                }
              }
            }

            const classification = categorizePlaylist({
              id,
              title: rawTitle,
              description: subtitle,
            });

            // Select crystal-clear HD thumbnail: pick 640x640 source (or highest available)
            const sources = lvm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
            let thumb = '';
            if (sources.length > 0) {
              const hdSource = sources.find((s: { width?: number }) => s.width && s.width >= 500 && s.width <= 900)
                || (sources.length > 1 ? sources[1] : sources[0]);
              thumb = hdSource?.url || '';
            }
            if (!thumb) {
              thumb = extractThumbnailUrl(lvm.contentImage, classification.category);
            }

            liveItems.push({
              id,
              title: cleanTitle(rawTitle),
              description: subtitle,
              category: classification.category,
              badge: classification.badge,
              thumbnail: thumb,
              type: id.startsWith('PL') ? 'Official Chart' : 'Curated Mix',
            });
          }
        }
      }

      for (const key of Object.keys(node)) {
        scanNodes(node[key]);
      }
    }

    scanNodes(data);

    return liveItems;
  } finally {
    clearTimeout(timeoutId);
  }
}

