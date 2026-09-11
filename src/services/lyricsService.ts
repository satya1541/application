export interface LyricLine {
  time: number; // In seconds
  text: string;
}

export interface LyricsResponse {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  source: 'lrclib' | 'netease' | 'jiosaavn' | 'catalog' | 'none';
}

const lyricsCache = new Map<string, LyricsResponse>();
const inFlightRequests = new Map<string, Promise<LyricsResponse>>();

/**
 * Cleans metadata string by removing extensions, bitrates, audio tags, and parenthesis noise.
 */
function cleanMetadataString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\.mp3$/i, '')
    .replace(/\b(320|128|192|256|64)\s*kbps\b/gi, '')
    .replace(/\b(pendujatt|pagalworld|mr-jatt|jiosaavn|spotify|itunes|youtube|official|video|audio|lyrics)\b[.\w]*/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*official[^)]*\)/gi, '')
    .replace(/\([^)]*video[^)]*\)/gi, '')
    .replace(/\([^)]*audio[^)]*\)/gi, '')
    .replace(/\([^)]*lyrics[^)]*\)/gi, '')
    .replace(/\([^)]*remix[^)]*\)/gi, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts primary artist from comma or 'ft.' separated string.
 */
function getPrimaryArtist(artistStr: string): string {
  if (!artistStr) return '';
  const primary = artistStr.split(/[,&/]|(\b(feat|ft|and)\b)/i)[0].trim();
  return primary || artistStr.trim();
}

/**
 * Parses [mm:ss.xx] formatted LRC strings into structured timestamped lines.
 */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc || typeof lrc !== 'string') return [];

  const lines = lrc.split('\n');
  const parsedLines: LyricLine[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Matches [01:23.45] or [01:23]
    const matches = [...trimmed.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = trimmed.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();

    if (matches.length > 0 && text.length > 0) {
      for (const match of matches) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const fracStr = match[3] || '0';
        const fractional = parseFloat(`0.${fracStr}`);
        const totalSeconds = parseFloat((mins * 60 + secs + fractional).toFixed(2));

        parsedLines.push({
          time: totalSeconds,
          text,
        });
      }
    }
  }

  parsedLines.sort((a, b) => a.time - b.time);
  return parsedLines;
}

/**
 * Provider 1: LRCLIB (Primary Synced Database)
 */
async function fetchLrclib(
  cleanTrack: string,
  cleanArtist: string,
  durationSec: number
): Promise<LyricsResponse | null> {
  // 1. Try Exact Track + Artist + Duration Match first
  if (durationSec > 0) {
    try {
      let exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&duration=${Math.round(durationSec)}`;
      if (cleanArtist) exactUrl += `&artist_name=${encodeURIComponent(cleanArtist)}`;

      const exactRes = await fetch(exactUrl, {
        headers: { 'User-Agent': 'DeluxeSongsMobile/3.0' },
        signal: AbortSignal.timeout(3000),
      });

      if (exactRes.ok) {
        const item = await exactRes.json();
        if (item.syncedLyrics && !item.instrumental) {
          const parsed = parseLrc(item.syncedLyrics);
          if (parsed.length >= 2) {
            return {
              synced: true,
              lines: parsed,
              plainLyrics: item.plainLyrics || undefined,
              source: 'lrclib',
            };
          }
        }
      }
    } catch {}
  }

  // 2. Search Query Fallback
  const queries = [
    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack + (cleanArtist ? ' ' + cleanArtist : ''))}`,
    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack)}`,
  ];

  for (const url of queries) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DeluxeSongsMobile/3.0' },
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          // Priority 1: First item with Synced Lyrics
          const withSynced = list.find((item: any) => item.syncedLyrics && item.syncedLyrics.length > 10 && !item.instrumental);
          if (withSynced) {
            const parsed = parseLrc(withSynced.syncedLyrics);
            if (parsed.length >= 2) {
              return {
                synced: true,
                lines: parsed,
                plainLyrics: withSynced.plainLyrics || undefined,
                source: 'lrclib',
              };
            }
          }

          // Priority 2: Item with plain lyrics
          const withPlain = list.find((item: any) => item.plainLyrics && item.plainLyrics.trim().length > 15);
          if (withPlain) {
            const splitPlain = withPlain.plainLyrics.split('\n').map((l: string, idx: number) => ({
              time: idx * 4,
              text: l.trim(),
            })).filter((l: any) => l.text.length > 0);

            return {
              synced: false,
              lines: splitPlain,
              plainLyrics: withPlain.plainLyrics,
              source: 'lrclib',
            };
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Provider 2: NetEase Cloud Music (International Synced Database)
 */
async function fetchNetEase(cleanTrack: string, primaryArtist: string): Promise<LyricsResponse | null> {
  const query = cleanTrack + (primaryArtist ? ' ' + primaryArtist : '');
  try {
    const params = new URLSearchParams({ s: query, type: '1', limit: '5' });
    const searchRes = await fetch('https://music.163.com/api/search/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(3500),
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      const songs = data?.result?.songs;
      if (Array.isArray(songs) && songs.length > 0) {
        const songId = songs[0].id;
        const lrcRes = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`, {
          headers: { 'Referer': 'https://music.163.com' },
          signal: AbortSignal.timeout(3000),
        });

        if (lrcRes.ok) {
          const lrcData = await lrcRes.json();
          const lrcText = lrcData?.lrc?.lyric;
          if (lrcText && lrcText.length > 20) {
            const parsed = parseLrc(lrcText);
            if (parsed.length >= 4) {
              return {
                synced: true,
                lines: parsed,
                source: 'netease',
              };
            }
          }
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Master Lyrics Fetcher with Strict In-Flight Deduplication and In-Memory Caching
 */
export async function getLiveLyrics(
  trackName: string,
  artistName: string = '',
  durationSec: number = 0
): Promise<LyricsResponse> {
  const cleanTrack = cleanMetadataString(trackName);
  const cleanArtist = cleanMetadataString(artistName);
  const primaryArtist = getPrimaryArtist(cleanArtist);

  if (!cleanTrack) {
    return { synced: false, lines: [], source: 'none' };
  }

  const cacheKey = `${cleanTrack.toLowerCase()}__${cleanArtist.toLowerCase()}`;
  
  // 1. Check instant cache
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  // 2. Prevent duplicate in-flight requests for the exact same track
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      // Tier 1: LRCLIB (Direct Synced Lyrics)
      const lrclibRes = await fetchLrclib(cleanTrack, cleanArtist, durationSec);
      if (lrclibRes && lrclibRes.lines.length >= 2) {
        lyricsCache.set(cacheKey, lrclibRes);
        return lrclibRes;
      }

      // Tier 2: NetEase Cloud Music (Fallback Synced Lyrics)
      const netEaseRes = await fetchNetEase(cleanTrack, primaryArtist);
      if (netEaseRes && netEaseRes.lines.length >= 2) {
        lyricsCache.set(cacheKey, netEaseRes);
        return netEaseRes;
      }

      const emptyResponse: LyricsResponse = { synced: false, lines: [], source: 'none' };
      lyricsCache.set(cacheKey, emptyResponse);
      return emptyResponse;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}
