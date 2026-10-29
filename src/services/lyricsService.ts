export interface LyricLine {
  time: number; // In seconds
  text: string;
}

export interface LyricsResponse {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  source: 'lrclib' | 'youtube' | 'catalog' | 'none';
}

const lyricsCache = new Map<string, LyricsResponse>();
const inFlightRequests = new Map<string, Promise<LyricsResponse>>();

/**
 * Checks if a string contains Chinese, Japanese, or Korean (CJK) characters.
 */
export function containsCjkCharacters(text: string): boolean {
  if (!text) return false;
  // Unicode ranges: CJK Unified Ideographs, Hiragana, Katakana, Hangul
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

/**
 * Validates that a lyrics candidate's title actually matches the requested track name.
 * Prevents fuzzy search engines from returning completely unrelated tracks.
 */
export function isTitleMatch(targetTrack: string, candidateTrack: string): boolean {
  if (!targetTrack || !candidateTrack) return false;
  const cleanTarget = cleanMetadataString(targetTrack).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const cleanCand = cleanMetadataString(candidateTrack).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();

  if (cleanTarget === cleanCand) return true;
  if (cleanTarget.length > 3 && (cleanCand.includes(cleanTarget) || cleanTarget.includes(cleanCand))) return true;

  const targetWords = cleanTarget.split(/\s+/).filter((w) => w.length > 1);
  const candWords = new Set(cleanCand.split(/\s+/).filter((w) => w.length > 1));
  if (targetWords.length === 0) return false;

  let matches = 0;
  for (const word of targetWords) {
    if (candWords.has(word)) matches++;
  }
  return matches / targetWords.length >= 0.5;
}

/**
 * Cleans metadata string by removing extensions, bitrates, audio tags, and parenthesis noise.
 */
export function cleanMetadataString(str: string): string {
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
export function getPrimaryArtist(artistStr: string): string {
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
 * Provider 1: LRCLIB (Primary Synced Database with strict title and script validation)
 */
async function fetchLrclib(
  cleanTrack: string,
  cleanArtist: string,
  durationSec: number,
  allowCjk: boolean
): Promise<LyricsResponse | null> {
  // 1. Try Exact Track + Artist + Duration Match first
  if (durationSec > 0) {
    try {
      let exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&duration=${Math.round(durationSec)}`;
      if (cleanArtist) exactUrl += `&artist_name=${encodeURIComponent(cleanArtist)}`;

      const exactRes = await fetch(exactUrl, {
        headers: { 'User-Agent': 'ShortyApp/5.0' },
        signal: AbortSignal.timeout(3000),
      });

      if (exactRes.ok) {
        const item = await exactRes.json();
        // Title validation
        if (item && !item.instrumental && isTitleMatch(cleanTrack, item.trackName)) {
          if (item.syncedLyrics) {
            // Reject if query is non-CJK but lyrics contain CJK
            if (!allowCjk && containsCjkCharacters(item.syncedLyrics)) {
              return null;
            }
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
      }
    } catch {}
  }

  // 2. Search Query Fallback with strict title & script checks
  const queries = [
    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack + (cleanArtist ? ' ' + cleanArtist : ''))}`,
    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack)}`,
  ];

  for (const url of queries) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ShortyApp/5.0' },
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          // Priority 1: First item matching title with Synced Lyrics
          const withSynced = list.find((item: any) => {
            if (!item.syncedLyrics || item.syncedLyrics.length < 10 || item.instrumental) return false;
            if (!isTitleMatch(cleanTrack, item.trackName)) return false;
            if (!allowCjk && containsCjkCharacters(item.syncedLyrics)) return false;
            return true;
          });

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

          // Priority 2: Item matching title with plain lyrics
          const withPlain = list.find((item: any) => {
            if (!item.plainLyrics || item.plainLyrics.trim().length < 15) return false;
            if (!isTitleMatch(cleanTrack, item.trackName)) return false;
            if (!allowCjk && containsCjkCharacters(item.plainLyrics)) return false;
            return true;
          });

          if (withPlain) {
            const splitPlain = withPlain.plainLyrics
              .split('\n')
              .map((l: string, idx: number) => ({
                time: idx * 4,
                text: l.trim(),
              }))
              .filter((l: any) => l.text.length > 0);

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
 * Provider 2: YouTube Music InnerTube (Verified Multi-Language Lyrics Provider)
 * Fetches authentic native lyrics from LyricFind / Musixmatch across Indian languages (Odia, Hindi, etc.)
 */
async function fetchYouTubeMusicLyrics(
  cleanTrack: string,
  cleanArtist: string,
  allowCjk: boolean,
  videoIdHint?: string
): Promise<LyricsResponse | null> {
  try {
    let resolvedVideoId = videoIdHint;

    // 1. If videoId not provided, search YouTube Music for top candidate
    if (!resolvedVideoId) {
      const searchRes = await fetch('https://music.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': '1.20240105.01.00',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240105.01.00', hl: 'en', gl: 'IN' } },
          query: `${cleanTrack} ${cleanArtist}`.trim(),
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const rawText = JSON.stringify(searchData);
      const match = rawText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (!match) return null;
      resolvedVideoId = match[1];
    }

    if (!resolvedVideoId) return null;

    // 2. Query InnerTube 'next' endpoint to extract the official Lyrics browseId
    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240105.01.00',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240105.01.00', hl: 'en', gl: 'IN' } },
        videoId: resolvedVideoId,
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (!nextRes.ok) return null;
    const nextData = await nextRes.json();
    const tabs =
      nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
        ?.tabs;
    const lyricsTab = tabs?.find((t: any) => t.tabRenderer?.title?.toLowerCase() === 'lyrics');
    const browseId = lyricsTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (!browseId) return null;

    // 3. Browse official lyrics payload
    const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240105.01.00',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240105.01.00', hl: 'en', gl: 'IN' } },
        browseId: browseId,
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (!browseRes.ok) return null;
    const browseData = await browseRes.json();
    const descriptionText =
      browseData.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs?.[0]
        ?.text;

    if (!descriptionText || descriptionText.trim().length < 15) return null;

    // CJK protection
    if (!allowCjk && containsCjkCharacters(descriptionText)) {
      return null;
    }

    // Split plain text lines and assign spaced timestamps
    const rawLines = descriptionText
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    if (rawLines.length === 0) return null;

    const formattedLines: LyricLine[] = rawLines.map((line: string, idx: number) => ({
      time: idx * 4,
      text: line,
    }));

    return {
      synced: false,
      lines: formattedLines,
      plainLyrics: descriptionText,
      source: 'youtube',
    };
  } catch {
    return null;
  }
}

/**
 * Master Lyrics Fetcher with Strict In-Flight Deduplication and In-Memory Caching
 */
export async function getLiveLyrics(
  trackName: string,
  artistName: string = '',
  durationSec: number = 0,
  videoIdHint?: string
): Promise<LyricsResponse> {
  const cleanTrack = cleanMetadataString(trackName);
  const cleanArtist = cleanMetadataString(artistName);

  if (!cleanTrack) {
    return { synced: false, lines: [], source: 'none' };
  }

  // Check if original metadata contains CJK. If NOT, any CJK returned is an error and must be rejected.
  const allowCjk = containsCjkCharacters(trackName + ' ' + artistName);

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
      // Tier 1: LRCLIB (Direct Synced Lyrics with strict title and script validation)
      const lrclibRes = await fetchLrclib(cleanTrack, cleanArtist, durationSec, allowCjk);
      if (lrclibRes && lrclibRes.lines.length >= 2) {
        lyricsCache.set(cacheKey, lrclibRes);
        return lrclibRes;
      }

      // Tier 2: YouTube Music InnerTube (Verified Multi-Language Native Lyrics)
      const ytRes = await fetchYouTubeMusicLyrics(cleanTrack, cleanArtist, allowCjk, videoIdHint);
      if (ytRes && ytRes.lines.length >= 2) {
        lyricsCache.set(cacheKey, ytRes);
        return ytRes;
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
