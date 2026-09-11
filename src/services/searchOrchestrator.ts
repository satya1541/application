import {
  searchSaavnSongs,
  searchSaavnArtists,
  searchSaavnAlbums,
} from '@/services/saavnStream';
import { searchYouTubeMusic } from '@/services/youtubeMusicApi';
import { INITIAL_SONGS, INITIAL_ARTISTS } from '@/services/musicCatalog';
import {
  ExploreSong,
  CanonicalSong,
  CanonicalArtist,
  CanonicalAlbum,
  ExploreSearchResult,
} from '@/types/explore';
import {
  parseSearchQuery,
  detectSearchIntent,
  normalizeQuery,
  determineSectionOrdering,
  SearchIntent,
  ParsedQuery,
} from './searchParser';
import { stringSimilarity, isCanonicalSongMatch } from './entityResolution';
import { generateTypoCorrection } from './searchCorrection';
import { cleanTitle, cleanArtist, isJunkOrDerivativeTrack, getCoreSongTitle } from './textCleaner';

// 60-second TTL in-memory artist search cache to ensure suggestions and full search never diverge
const artistCache = new Map<string, { data: CanonicalArtist[]; timestamp: number }>();
async function cachedSearchSaavnArtists(query: string, limit: number): Promise<CanonicalArtist[]> {
  const key = `${query.toLowerCase().trim()}_${limit}`;
  const hit = artistCache.get(key);
  if (hit && Date.now() - hit.timestamp < 60000) {
    return hit.data;
  }
  try {
    const res = await searchSaavnArtists(query, limit);
    artistCache.set(key, { data: res, timestamp: Date.now() });
    return res;
  } catch (err) {
    console.warn('[SearchOrchestrator] searchSaavnArtists failed:', err);
    return [];
  }
}

// Timeout wrapper to guarantee that hanging network endpoints do not freeze searches
function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export interface SearchSuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  type: 'song' | 'artist' | 'query' | 'album';
  image?: string;
  queryValue: string;
}

export interface GroupedSuggestions {
  artists: SearchSuggestionItem[];
  songs: SearchSuggestionItem[];
  albums: SearchSuggestionItem[];
  queries: SearchSuggestionItem[];
}

export class SearchOrchestrator {
  /**
   * Calculates balanced multi-signal relevance score between track and search query
   * Treats Lossless and Opus sources fairly based on token match accuracy.
   */
  static calculateMusicRankScore(song: ExploreSong, query: string): number {
    const qNorm = normalizeQuery(query);
    const titleNorm = normalizeQuery(cleanTitle(song.name));
    const coreTitleNorm = normalizeQuery(getCoreSongTitle(song.name));
    const artistNorm = normalizeQuery(cleanArtist(song.artist));
    const qTokens = qNorm.split(/\s+/).filter(Boolean);

    let titleMatch = 0;
    if (titleNorm === qNorm || coreTitleNorm === qNorm) {
      titleMatch = 1.0;
    } else if (titleNorm.startsWith(qNorm) || coreTitleNorm.startsWith(qNorm)) {
      titleMatch = 0.88;
    } else if (titleNorm.includes(qNorm) || coreTitleNorm.includes(qNorm)) {
      titleMatch = 0.75;
    } else {
      titleMatch = Math.max(stringSimilarity(titleNorm, qNorm), stringSimilarity(coreTitleNorm, qNorm));
    }

    let artistMatch = 0;
    if (artistNorm === qNorm) {
      artistMatch = 1.0;
    } else if (artistNorm.startsWith(qNorm)) {
      artistMatch = 0.85;
    } else if (artistNorm.includes(qNorm)) {
      artistMatch = 0.7;
    } else {
      artistMatch = stringSimilarity(artistNorm, qNorm);
    }

    // Check if query contains any artist token
    const queryHasArtistToken = qTokens.some((t) => artistNorm.includes(t));

    // Token intersection boost (e.g. searching "kesariya arijit")
    let matchedTokens = 0;
    for (const t of qTokens) {
      if (titleNorm.includes(t) || artistNorm.includes(t)) {
        matchedTokens++;
      }
    }
    const tokenScore = qTokens.length > 0 ? matchedTokens / qTokens.length : 0;

    // Popularity Score (Log-scale normalization & official studio release bonus)
    let popularityScore = 0.5;
    if (typeof (song as any).playCount === 'number' && (song as any).playCount > 0) {
      const logPlays = Math.log10((song as any).playCount);
      popularityScore = Math.min(1.0, Math.max(0.1, (logPlays - 3) / 5)); // 1k -> 0.1, 100M -> 1.0
    } else if (song.source === 'jiosaavn' || song.quality) {
      // Official Lossless 320kbps releases from labels have verified catalog popularity
      popularityScore = 0.85;
    } else {
      popularityScore = 0.5;
    }

    // Derivative / Junk penalty (penalize fan lofi, slowed reverb, fan remix, cover)
    // UNLESS the user explicitly searched for it
    const queryRequestsVariant = /\b(remix|lofi|cover|slowed|reverb|mashup|unplugged|acoustic|instrumental)\b/i.test(query);
    let derivativePenalty = 0;
    if (!queryRequestsVariant && isJunkOrDerivativeTrack(song.name, song.album)) {
      derivativePenalty = 0.35;
    }

    // Adaptive Weighting between Title-Only and Artist-Included Queries
    let finalScore = 0;
    if (queryHasArtistToken) {
      finalScore =
        0.35 * titleMatch +
        0.20 * artistMatch +
        0.10 * tokenScore +
        0.25 * popularityScore +
        0.10 * (song.quality ? 1.0 : 0.8) -
        derivativePenalty;
    } else {
      // Pure title query: Reallocate artistMatch weight to title & popularity
      finalScore =
        0.50 * titleMatch +
        0.05 * artistMatch +
        0.10 * tokenScore +
        0.25 * popularityScore +
        0.10 * (song.quality ? 1.0 : 0.8) -
        derivativePenalty;
    }

    return Math.max(0, finalScore);
  }

  /**
   * Accurately resolves the Top Result entity (Artist, Album, or Song)
   * exactly mirroring the website's resolveTopResult engine.
   */
  static resolveTopResult(
    parsed: ParsedQuery,
    intent: SearchIntent,
    artists: CanonicalArtist[],
    albums: CanonicalAlbum[],
    songs: CanonicalSong[]
  ): CanonicalArtist | CanonicalAlbum | CanonicalSong | undefined {
    const normBase = parsed.normalizedBase;

    let bestArtist: CanonicalArtist | undefined;
    let bestAlbum: CanonicalAlbum | undefined;
    let bestSong: CanonicalSong | undefined;

    if (artists.length > 0) {
      bestArtist = artists.find((a) => normalizeQuery(a.name) === normBase) || artists[0];
    }
    if (albums.length > 0) {
      bestAlbum = albums.find((a) => normalizeQuery(a.name) === normBase) || albums[0];
    }
    if (songs.length > 0) {
      bestSong = songs.find((s) => normalizeQuery(s.name) === normBase) || songs[0];
    }

    // 1. High confidence intent overrides
    if (intent.confidence >= 0.8) {
      if (intent.requestedEntity === 'ARTIST' && bestArtist) return bestArtist;
      if (intent.requestedEntity === 'ALBUM' && bestAlbum) return bestAlbum;
      if (intent.requestedEntity === 'SONG' && bestSong) return bestSong;

      if (intent.primary === 'ARTIST' && bestArtist) return bestArtist;
      if (intent.primary === 'ALBUM' && bestAlbum) return bestAlbum;
      if (intent.primary === 'SONG' && bestSong) return bestSong;
    }

    // 2. Exact match check
    const isExactArtist = bestArtist && normalizeQuery(bestArtist.name) === normBase;
    const isExactAlbum = bestAlbum && normalizeQuery(bestAlbum.name) === normBase;
    const isExactSong = bestSong && normalizeQuery(bestSong.name) === normBase;

    if (isExactArtist && !isExactSong && !isExactAlbum) return bestArtist;
    if (isExactSong && !isExactArtist && !isExactAlbum) return bestSong;
    if (isExactAlbum && !isExactArtist && !isExactSong) return bestAlbum;

    // 3. Variant match (e.g. remix, live)
    if (parsed.variant && bestSong) {
      return bestSong;
    }

    // 4. Default priority fallback
    if (isExactArtist) return bestArtist;
    if (isExactSong) return bestSong;
    if (isExactAlbum) return bestAlbum;

    if (bestArtist && intent.primary === 'ARTIST') return bestArtist;
    if (bestSong) return bestSong;
    if (bestArtist) return bestArtist;
    if (bestAlbum) return bestAlbum;

    return undefined;
  }

  /**
   * Unified search across live multi-sources (JioSaavn 320k + YouTube Music Opus 160k)
   * with multi-source fallback merging, automatic typo zero-result recovery,
   * deduplicated top result, and intent-aware section ordering.
   */
  static async searchAll(
    query: string,
    languageFilter?: string,
    limit: number = 25
  ): Promise<ExploreSearchResult> {
    if (!query || !query.trim()) {
      return {
        songs: INITIAL_SONGS.map((s) => ({ ...s, type: 'song' as const })),
        artists: INITIAL_ARTISTS.map((a) => ({
          id: a.id,
          name: a.name,
          cover: a.image,
          type: 'artist' as const,
          source: 'local' as const,
          role: 'Featured Artist',
          verified: a.verified,
        })),
        albums: [],
        sections: ['TopResult', 'Songs', 'Artists', 'Albums'],
      };
    }

    const parsed = parseSearchQuery(query);
    const intent = detectSearchIntent(parsed);
    const effectiveQuery = parsed.baseQuery;
    const trimmed = effectiveQuery.toLowerCase();

    // 1. Filter local curated catalog
    const localSongMatches = INITIAL_SONGS.filter(
      (s) =>
        s.name.toLowerCase().includes(trimmed) ||
        s.artist.toLowerCase().includes(trimmed) ||
        s.album.toLowerCase().includes(trimmed)
    ).map((s) => ({ ...s, type: 'song' as const }));

    const localArtistMatches = INITIAL_ARTISTS.filter((a) =>
      a.name.toLowerCase().includes(trimmed)
    ).map((a) => ({
      id: a.id,
      name: a.name,
      cover: a.image,
      type: 'artist' as const,
      source: 'local' as const,
      role: 'Featured Artist',
      verified: a.verified,
    }));

    // Helper: Execute live parallel search across JioSaavn & YouTube Music
    // Helper: Execute live parallel search across JioSaavn & YouTube Music with balanced volume & per-source timeouts
    const fetchLiveCandidates = async (searchTarget: string) => {
      let onlineSongs: ExploreSong[] = [];
      let onlineArtists: CanonicalArtist[] = [];
      let onlineAlbums: CanonicalAlbum[] = [];

      try {
        const [saavnSongs, ytSongs, saavnArtists, saavnAlbums] = await Promise.allSettled([
          fetchWithTimeout(searchSaavnSongs(searchTarget, 1, 20), 4000, []),
          fetchWithTimeout(searchYouTubeMusic(searchTarget, 20), 4000, []),
          fetchWithTimeout(cachedSearchSaavnArtists(searchTarget, 6), 3500, []),
          fetchWithTimeout(searchSaavnAlbums(searchTarget, 6), 3500, []),
        ]);

        if (saavnSongs.status === 'rejected') {
          console.warn('[SearchOrchestrator] JioSaavn song search failed:', saavnSongs.reason);
        }
        if (ytSongs.status === 'rejected') {
          console.warn('[SearchOrchestrator] YouTube song search failed:', ytSongs.reason);
        }

        const saavnResults = saavnSongs.status === 'fulfilled' ? saavnSongs.value : [];
        const ytResults = ytSongs.status === 'fulfilled' ? ytSongs.value : [];
        onlineSongs = [...saavnResults, ...ytResults];

        if (saavnArtists.status === 'fulfilled') {
          onlineArtists = saavnArtists.value;
        }
        if (saavnAlbums.status === 'fulfilled') {
          onlineAlbums = saavnAlbums.value;
        }
      } catch (err) {
        console.warn('Online search fetch failed:', err);
      }

      return { onlineSongs, onlineArtists, onlineAlbums };
    };

    // 2. First Pass: Primary Retrieval
    let { onlineSongs, onlineArtists, onlineAlbums } = await fetchLiveCandidates(effectiveQuery);

    // 3. Multi-Source Deduplication & Per-Item Quality Comparison (Lossless + Opus)
    const buildMergedSongs = (rawList: ExploreSong[]): CanonicalSong[] => {
      const canonicalSongs: CanonicalSong[] = [];

      for (const raw of rawList) {
        const existingIdx = canonicalSongs.findIndex((c) => isCanonicalSongMatch(c, raw));

        if (existingIdx !== -1) {
          // Merge as fallback source
          const existing = canonicalSongs[existingIdx];
          if (!existing.fallbackSources) {
            existing.fallbackSources = [];
          }

          // Per-item quality comparison:
          // 1. Authentic studio recording beats fan cover/derivative upload
          // 2. Verified stream beats broken/missing stream
          // 3. Lossless 320kbps beats standard audio
          const existingIsDerivative = isJunkOrDerivativeTrack(existing.name, existing.album);
          const rawIsDerivative = isJunkOrDerivativeTrack(raw.name, raw.album);
          const existingIsLossless = !!existing.quality;
          const rawIsLossless = !!raw.quality;
          const existingHasStream = !!existing.streamUrl;
          const rawHasStream = !!raw.streamUrl;

          const shouldPromoteRaw =
            (!rawIsDerivative && existingIsDerivative) ||
            (!existingHasStream && rawHasStream) ||
            (rawIsLossless && !existingIsLossless && !rawIsDerivative);

          if (shouldPromoteRaw && raw.source && existing.source) {
            const demoted = {
              source: existing.source,
              id: existing.id,
              streamUrl: existing.streamUrl,
              quality: (existing.quality || 'standard') as string,
              sourceBadge: existing.sourceBadge,
            };
            existing.source = raw.source;
            existing.id = raw.id;
            existing.streamUrl = raw.streamUrl;
            existing.quality = raw.quality;
            existing.sourceBadge = raw.sourceBadge;
            existing.fallbackSources.push(demoted);
          } else if (raw.source) {
            existing.fallbackSources.push({
              source: raw.source,
              id: raw.id,
              streamUrl: raw.streamUrl,
              quality: (raw.quality || 'standard') as string,
              sourceBadge: raw.sourceBadge,
            });
          }

          if ((!existing.duration || existing.duration <= 0) && raw.duration) {
            existing.duration = raw.duration;
          }
        } else {
          // Create new canonical track
          canonicalSongs.push({
            ...raw,
            name: cleanTitle(raw.name),
            artist: cleanArtist(raw.artist),
            type: 'song' as const,
            fallbackSources: raw.source
              ? [
                  {
                    source: raw.source,
                    id: raw.id,
                    streamUrl: raw.streamUrl,
                    quality: raw.quality,
                    sourceBadge: raw.sourceBadge,
                  },
                ]
              : [],
          });
        }
      }

      return canonicalSongs;
    };

    let mergedSongs = buildMergedSongs([...localSongMatches, ...onlineSongs]);

    // 4. Rank songs using multi-signal scorer
    mergedSongs.sort((a, b) => {
      const scoreA = SearchOrchestrator.calculateMusicRankScore(a, effectiveQuery);
      const scoreB = SearchOrchestrator.calculateMusicRankScore(b, effectiveQuery);
      return scoreB - scoreA;
    });

    // 5. Language Filter (if specified)
    let finalSongs =
      languageFilter && languageFilter !== 'all'
        ? mergedSongs.filter((s) => s.language?.toLowerCase() === languageFilter.toLowerCase())
        : mergedSongs;

    let allArtists = [...localArtistMatches, ...onlineArtists];
    let allAlbums = onlineAlbums;
    let correctedQuery: string | undefined = undefined;

    // 6. Proactive Typo Recovery: triggers if 0 results OR if top song relevance score is weak (< 0.60)
    const topScore = finalSongs.length > 0 ? SearchOrchestrator.calculateMusicRankScore(finalSongs[0], effectiveQuery) : 0;
    const shouldAttemptTypoRecovery = (finalSongs.length === 0 && allArtists.length === 0) || (topScore < 0.60);

    if (shouldAttemptTypoRecovery) {
      const suggestedCorrection = generateTypoCorrection(effectiveQuery);
      if (suggestedCorrection && normalizeQuery(suggestedCorrection) !== normalizeQuery(effectiveQuery)) {
        const retry = await fetchLiveCandidates(suggestedCorrection);
        if (retry.onlineSongs.length > 0 || retry.onlineArtists.length > 0 || retry.onlineAlbums.length > 0) {
          onlineSongs = retry.onlineSongs;
          onlineArtists = retry.onlineArtists;
          allAlbums = retry.onlineAlbums;

          mergedSongs = buildMergedSongs(onlineSongs);
          mergedSongs.sort((a, b) => {
            const scoreA = SearchOrchestrator.calculateMusicRankScore(a, suggestedCorrection);
            const scoreB = SearchOrchestrator.calculateMusicRankScore(b, suggestedCorrection);
            return scoreB - scoreA;
          });

          finalSongs = mergedSongs;
          allArtists = onlineArtists;
          correctedQuery = suggestedCorrection;
        }
      }
    }

    // 7. Resolve Top Result (Exact match, intent overrides, variant recognition)
    const topResult = SearchOrchestrator.resolveTopResult(
      parsed,
      intent,
      allArtists,
      allAlbums,
      finalSongs
    );

    // 8. Deduplicate Top Result from Main Lists (Prevent repeating #1 item right below hero card)
    let displaySongs = finalSongs;
    let displayArtists = allArtists;
    let displayAlbums = allAlbums;

    if (topResult) {
      if (topResult.type === 'song') {
        displaySongs = displaySongs.filter((s) => s.id !== topResult.id);
      } else if (topResult.type === 'artist') {
        displayArtists = displayArtists.filter((a) => a.id !== topResult.id);
      } else if (topResult.type === 'album') {
        displayAlbums = displayAlbums.filter((a) => a.id !== topResult.id);
      }
    }

    // 9. Intent-Aware Section Ordering
    const sectionOrdering = determineSectionOrdering(intent);

    return {
      topResult,
      songs: displaySongs.slice(0, limit),
      artists: displayArtists.slice(0, 8),
      albums: displayAlbums.slice(0, 8),
      correctedQuery,
      intent: { primary: intent.primary, confidence: intent.confidence },
      sections: sectionOrdering.sections,
    };
  }

  /**
   * Fast autocomplete suggestions for live search bar (combining JioSaavn + Google search hints)
   */
  static async getSuggestions(query: string): Promise<GroupedSuggestions> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { artists: [], songs: [], albums: [], queries: [] };
    }

    const parsed = parseSearchQuery(trimmed);
    const effectiveQuery = parsed.baseQuery;

    try {
      const [saavnRes, ytRes, directArtistsRes] = await Promise.allSettled([
        fetchWithTimeout(
          fetch(
            `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&api_version=4&ctx=web6dot0&query=${encodeURIComponent(
              effectiveQuery
            )}`
          ),
          2500,
          null
        ),
        fetchWithTimeout(
          fetch(
            `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(
              effectiveQuery
            )}`
          ),
          2500,
          null
        ),
        cachedSearchSaavnArtists(effectiveQuery, 4),
      ]);

      const artists: SearchSuggestionItem[] = [];
      const songs: SearchSuggestionItem[] = [];
      const albums: SearchSuggestionItem[] = [];
      const queries: SearchSuggestionItem[] = [];

      const seenTitles = new Set<string>();

      // Direct verified artists
      if (directArtistsRes.status === 'fulfilled' && Array.isArray(directArtistsRes.value)) {
        for (const art of directArtistsRes.value) {
          const lower = art.name.toLowerCase();
          if (!seenTitles.has(lower)) {
            seenTitles.add(lower);
            artists.push({
              id: `art-${art.id}`,
              title: art.name,
              subtitle: art.role || 'Verified Artist',
              type: 'artist',
              image: art.cover,
              queryValue: art.name,
            });
          }
        }
      }

      // YouTube suggestions (music-scoped filter)
      const NON_MUSIC_FILTER = /\b(trailer|gameplay|vlog|vlogs|episode|reaction|news|tutorial|interview|roast|unboxing|movie|scene|comedy|prank)\b/i;
      if (ytRes.status === 'fulfilled' && ytRes.value && ytRes.value.ok) {
        try {
          const ytData = await ytRes.value.json();
          const qList = Array.isArray(ytData[1]) ? ytData[1] : [];
          for (const q of qList.slice(0, 6)) {
            const title = String(q).trim();
            if (title && !seenTitles.has(title.toLowerCase()) && !NON_MUSIC_FILTER.test(title)) {
              seenTitles.add(title.toLowerCase());
              queries.push({
                id: `q-${Math.random().toString(36).substring(7)}`,
                title,
                subtitle: 'Trending Search',
                type: 'query',
                queryValue: title,
              });
            }
          }
        } catch {}
      }

      // JioSaavn autocomplete
      if (saavnRes.status === 'fulfilled' && saavnRes.value && saavnRes.value.ok) {
        try {
          const data = await saavnRes.value.json();

          if (Array.isArray(data.songs?.data)) {
            for (const item of data.songs.data.slice(0, 4)) {
              const title = cleanTitle(item.title || item.song || '');
              if (title && !seenTitles.has(title.toLowerCase())) {
                seenTitles.add(title.toLowerCase());
                songs.push({
                  id: `song-${item.id || Math.random()}`,
                  title,
                  subtitle: cleanArtist(item.description || item.more_info?.primary_artists || 'Song'),
                  type: 'song',
                  image: item.image,
                  queryValue: title,
                });
              }
            }
          }

          if (Array.isArray(data.albums?.data)) {
            for (const item of data.albums.data.slice(0, 3)) {
              const title = item.title || '';
              if (title && !seenTitles.has(title.toLowerCase())) {
                seenTitles.add(title.toLowerCase());
                albums.push({
                  id: `alb-${item.id || Math.random()}`,
                  title,
                  subtitle: item.music || item.description || 'Album',
                  type: 'album',
                  image: item.image,
                  queryValue: title,
                });
              }
            }
          }
        } catch {}
      }

      return {
        artists: artists.slice(0, 2),
        songs: songs.slice(0, 4),
        albums: albums.slice(0, 3),
        queries: queries.slice(0, 3),
      };
    } catch {
      return { artists: [], songs: [], albums: [], queries: [] };
    }
  }
}
