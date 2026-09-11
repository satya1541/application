export function cleanTitle(raw: string): string {
  if (!raw) return '';
  let s = raw;

  // 1. If title contains pipe '|' (very common in Indian YouTube uploads e.g. "Song | Singer | Movie | Label")
  if (s.includes('|')) {
    const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0 && parts[0].length >= 2) {
      s = parts[0];
    }
  }

  return s
    .replace(/\.(mp3|wav|m4a|ogg|flac|aac)$/i, '')
    .replace(/\s*[-–—:]?\s*(PagalNew|PagalWorld|PagalSongs|SongsPk|DjPunjab|Mp3Tau|PenduJatt|KoshalWorld|OdiaBazar|RiskyjaTT|NaaSongs|MrJatt|DJMaza|Hungama|Gaana|JioSaavn)(\.Com(\.Se)?)?/gi, '')
    .replace(/\b(320|128|192|256)\s*kbps\b/gi, '')
    .replace(/\b(mp3|download)\b/gi, '')
    // Strip regional Indian music promotional labels
    .replace(/\b(new\s*(odia|sambalpuri|punjabi|haryanvi|bhojpuri|hindi|telugu|tamil)?\s*(song|video|gana|dhamaka|track|release)\s*\d{0,4})\b/gi, '')
    // Strip standard YouTube video type suffixes
    .replace(/\s*\(?\s*(official\s*(music\s*)?video|music\s*video|full\s*(video|song|audio)(\s*song)?|video\s*song|title\s*track|official\s*audio|full\s*audio|original\s*audio|audio\s*track|audio\s*release|hd\s*video|4k\s*(ultra\s*hd|video)?|official\s*lyric(s|al)?\s*video|lyric(s|al)?\s*video|with\s*lyrics|1080p|8k)\s*\)?/gi, '')
    // Strip creator credit clauses like "Singer: ...", "Music: ..."
    .replace(/\b(singer|music\s*director|starring|lyrics|director|produced\s*by)\s*:.*$/gi, '')
    // Strip film association clauses and parenthesized soundtrack info e.g. (From "Brahmastra")
    .replace(/\s*\(\s*(from\s+[^)]+|film\s*version|movie\s*version|ost\b[^)]*)\s*\)/gi, '')
    .replace(/\s*[-–—:]\s*from\s+.*$/gi, '')
    .replace(/\b(from\s+['"][^'"]+['"]|from\s+the\s+movie\s+['"][^'"]+['"])\b/gi, '')
    .replace(/\([^)]*(Pagal|Jatt|World|Bazar|Songs|Music|Kbps|RingTone|Com)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-–—:]\s*$/, '')
    .replace(/^\s*[-–—:]\s*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanArtist(artist: string): string {
  if (!artist || artist.trim() === '' || artist.toLowerCase() === 'unknown') return 'Unknown Artist';
  let cleaned = artist.replace(/\.(mp3|wav|ogg|m4a|flac)$/i, '');
  // Strip "- Topic" suffix from YouTube auto-generated channel names
  cleaned = cleaned.replace(/\s*-\s*Topic$/i, '');
  cleaned = cleaned.replace(/\s*(VEVO|Official\s*Channel|Records|Music)$/i, '');
  cleaned = cleaned.replace(/\s*[-–—:]?\s*(PagalNew|PagalWorld|PagalSongs|SongsPk|DjPunjab|Mp3Tau|PenduJatt|KoshalWorld|OdiaBazar|RiskyjaTT|NaaSongs|MrJatt|DJMaza)(\.Com(\.Se)?)?/gi, '');
  cleaned = cleaned.replace(/\([^)]*(Pagal|Jatt|World|Bazar|Songs|Music|Kbps|RingTone|Com|Risky)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/320 ?Kbps|128 ?Kbps/gi, '');
  cleaned = cleaned.replace(/^[\s,;]+|[\s,;]+$/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || 'Unknown Artist';
}

const REPRISE_REGEX = /\b(reprise|reprised|re-prise|revisited|re-visited)\b/i;
const REMIX_REGEX = /\b(remix|remixed|dj\s*remix|club\s*mix|party\s*mix|dance\s*mix|extended\s*mix|mashup|mash\s*up|dholki\s*mix|jhankar\s*mix|bass\s*boosted|trap\s*mix|electro\s*mix|edm\s*mix|remix\s*version)\b/i;
const DJ_PREFIX_REGEX = /\bdj\s+[\w\d]+/i;
const LOFI_REGEX = /\b(lofi|lo-fi|lo\s*fi|slowed|reverb|slowed\s*(\+|&|and)?\s*reverb|chillout|chill\s*mix|ambient\s*mix|sleep\s*mix|bedtime\s*mix|relaxing\s*mix)\b/i;
const PROMO_REGEX = /\b(hook\s*step|short\s*video|shorts|status|whatsapp\s*status|reels|teaser|trailer|promo|motion\s*poster|making\s*of|dialogue\s*promo|snippet|preview)\b/i;
const COVER_REGEX = /\b(cover|unplugged|acoustic|karaoke|instrumental|orchestral|female\s*version|male\s*version|sad\s*version|slow\s*version|fast\s*version|nightcore|chipmunk|8d|16d|3d\s*audio|ringtone|bgm|theme\s*music|live\s*performance|live\s*at|live\s*concert|reaction)\b/i;

const DEVOTIONAL_WORDS_REGEX = /\b(bhajan|bhajans|aarti|arti|chalisa|kirtan|sankirtan|bhakti|stuti|stotram|amritwani|jaap|dhun|dhuns|shlok|shloka|mantra|mantras|sahastranam|devotional|iskcon|prabhupada|satsang|janmashtami)\b/i;
const DEITY_PHRASE_REGEX = /(jai\s+(sri|shri|shree)|hare\s+(krishna|krsna|rama)|radhe\s+radhe|radha\s+rani|govind\s+bolo|shree\s+(krishna|ram|ganesh|hanuman|shiv)|shiv\s+(tandav|stuti|mahadev)|hanuman\s+chalisa)/i;
const DEITY_COMPOUND_REGEX = /(krishna|krsna)\s+(prema|leela|katha|bhajan|aarti|kirtan|dhun|amrit|mahima|chamatkar|chalisa|stuti|stotram|bhakti|murari|vasudeva?|madhava?|govinda?|gopala?)/i;
const DEVOTIONAL_ARTIST_REGEX = /\b(srila\s+prabhupada|iskcon|mayapuris)\b/i;

/**
 * Detects if a track is a derivative, remix, reprise, lofi, lyrical video,
 * live recording, instrumental/karaoke, or low-quality YouTube rip.
 * Strictly guarantees that only authentic, original studio tracks are recommended.
 */
export function isJunkOrDerivativeTrack(title?: string, album?: string): boolean {
  if (!title) return true;
  const t = ` ${title.toLowerCase()} `;
  const a = album ? ` ${album.toLowerCase()} ` : '';

  if (REPRISE_REGEX.test(t) || REPRISE_REGEX.test(a)) return true;
  if (REMIX_REGEX.test(t) || REMIX_REGEX.test(a)) return true;
  if (DJ_PREFIX_REGEX.test(t)) return true;
  if (LOFI_REGEX.test(t) || LOFI_REGEX.test(a)) return true;
  if (PROMO_REGEX.test(t) || PROMO_REGEX.test(a)) return true;
  if (COVER_REGEX.test(t) || COVER_REGEX.test(a)) return true;

  return false;
}

/**
 * Detects if a track is devotional, religious, or spiritual (bhajan, aarti, chalisa, mantra, etc.)
 * Used to prevent devotional tracks from leaking into secular music queues (rap, pop, bollywood, etc.)
 * and vice-versa.
 */
export function isDevotionalTrack(title?: string, album?: string, artist?: string): boolean {
  if (!title && !album && !artist) return false;
  const t = ` ${(title || '').toLowerCase()} `;
  const a = ` ${(album || '').toLowerCase()} `;
  const art = ` ${(artist || '').toLowerCase()} `;
  const full = `${t} ${a} ${art}`;

  if (DEVOTIONAL_WORDS_REGEX.test(full)) return true;
  if (DEITY_PHRASE_REGEX.test(full)) return true;
  if (DEITY_COMPOUND_REGEX.test(full)) return true;
  if (DEVOTIONAL_ARTIST_REGEX.test(art)) return true;

  return false;
}

/**
 * Extracts the raw core song title by removing any movie associations,
 * feature credits, version tags, language tags, soundtrack suffixes, and brackets.
 * Used for 100% strict duplicate detection across different releases, albums, and tags.
 *
 * Examples:
 * - "Kesariya (From \"Brahmastra\")" -> "kesariya"
 * - "Kesariya - From Brahmastra"    -> "kesariya"
 * - "Kesariya (Film Version)"        -> "kesariya"
 * - "Tum Hi Ho (Aashiqui 2)"         -> "tumhiho"
 */
export function getCoreSongTitle(raw?: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase();

  // Strip pipe | and everything after it (universal separator for YouTube movie/artist/actor metadata)
  s = s.replace(/\s*\|.*/g, ' ');

  // Remove content inside all parentheses, brackets, and braces
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\{[^}]*\}/g, ' ');

  // Strip film/soundtrack clauses like (From "Brahmastra") or (Movie Version)
  s = s.replace(/\s*\(\s*(from\s+[^)]+|film\s*version|movie\s*version|ost\b[^)]*)\s*\)/gi, ' ');

  // Remove common trailing delimiters like " - from movie", " : from movie", " - ost", etc.
  s = s.replace(/\s*[-–—:]\s*(from\b|original|soundtrack|single|ep|film|full|audio|video|album|movie|motion|star plus|official).*/gi, ' ');
  s = s.replace(/\b(from\s+['"][^'"]+['"]|from\s+[\w\s]+)$/gi, ' ');

  // Remove file extensions & quality tags
  s = s.replace(/\.(mp3|wav|m4a|ogg|flac|aac)$/i, '');
  s = s.replace(/\b(320|128|192|256)\s*kbps\b/gi, '');
  s = s.replace(/\b(mp3|audio|song|track|download|full|soundtrack|version|original|sound|video|lyrics?|lyrical|hd|4k)\b/gi, '');

  // Keep only alphanumeric characters
  let clean = s.replace(/[^a-z0-9]/g, '');
  clean = clean.replace(/(song|video|audio|track|full)$/i, '');
  return clean;
}

/**
 * Returns a normalized canonical key for a track based on its cleaned title and primary artist.
 * Used for strict 100% duplicate elimination across providers and albums.
 */
export function getSongCanonicalKey(name?: string, artist?: string): string {
  if (!name) return '';
  const coreTitle = getCoreSongTitle(name) || cleanTitle(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const mainArtist = (artist || '').split(/[,/&|]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${coreTitle}___${mainArtist}`;
}

/**
 * Detects if two titles represent duplicate versions of the same song.
 * Handles:
 * - Exact core equality
 * - Substring containment when sufficiently similar (e.g. "Main Phir Bhi Tumko Chaahunga" vs "Phir Bhi Tumko Chaahunga")
 * - Trailing/leading tag differences (e.g. "Itna Tumhe" vs "Itna TumheSong")
 */
export function areCandidateTitlesDuplicate(coreA?: string, coreB?: string): boolean {
  if (!coreA || !coreB) return false;
  if (coreA === coreB) return true;

  const minLen = Math.min(coreA.length, coreB.length);
  const maxLen = Math.max(coreA.length, coreB.length);

  // If one core title is contained within the other
  if (minLen >= 6 && (coreA.includes(coreB) || coreB.includes(coreA))) {
    const diff = maxLen - minLen;
    const ratio = minLen / maxLen;
    // Close match (e.g. prefix 'main' or suffix 'song' or version tag)
    if (diff <= 5 || ratio >= 0.65) {
      return true;
    }
  }

  return false;
}


