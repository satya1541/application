import { normalizeQuery } from './searchParser';
import { cleanArtist, cleanTitle } from './textCleaner';

export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const matrix = Array(bLen + 1)
    .fill(null)
    .map(() => Array(aLen + 1).fill(null));

  for (let i = 0; i <= aLen; i += 1) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= bLen; j += 1) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= bLen; j += 1) {
    for (let i = 1; i <= aLen; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[bLen][aLen];
}

export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeQuery(a);
  const normB = normalizeQuery(b);
  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const distance = levenshteinDistance(normA, normB);
  const maxLength = Math.max(normA.length, normB.length);
  return 1 - distance / maxLength;
}

/**
 * Splits multi-artist credits into sorted, normalized individual artist tokens.
 * Handles variations: "Arijit Singh, Shreya Ghoshal" vs "Arijit Singh Ft. Shreya Ghoshal"
 */
export function splitAndNormalizeArtists(artistStr: string): string[] {
  if (!artistStr) return [];
  const cleaned = cleanArtist(artistStr);
  return cleaned
    .split(/[,&/|+]|\b(?:feat\.?|ft\.?|with|and|x)\b/i)
    .map((s) => normalizeQuery(s.trim()))
    .filter((s) => s.length > 1)
    .sort();
}

/**
 * Calculates Jaccard set similarity between two multi-artist lists.
 */
export function artistSetOverlap(artistsA: string[], artistsB: string[]): number {
  if (artistsA.length === 0 || artistsB.length === 0) return 0;
  let matches = 0;
  for (const a of artistsA) {
    if (artistsB.some((b) => b === a || stringSimilarity(a, b) >= 0.85)) {
      matches++;
    }
  }
  const union = new Set([...artistsA, ...artistsB]).size;
  return union > 0 ? matches / union : 0;
}

/**
 * Robust Canonical Song Matcher
 * Gates comparison with track duration, guards short titles, and normalizes multi-artist credits.
 */
export function isCanonicalSongMatch(
  song1: { name: string; artist: string; duration?: number },
  song2: { name: string; artist: string; duration?: number }
): boolean {
  // 1. Duration Near-Match Gate
  // If both tracks have reported positive durations, require them within ±8 seconds.
  if (
    typeof song1.duration === 'number' &&
    typeof song2.duration === 'number' &&
    song1.duration > 15 &&
    song2.duration > 15
  ) {
    if (Math.abs(song1.duration - song2.duration) > 8) {
      return false; // Different cut, preview, or completely different song
    }
  }

  const title1 = normalizeQuery(cleanTitle(song1.name));
  const title2 = normalizeQuery(cleanTitle(song2.name));

  // 2. Short Title Guard:
  // For short titles (<= 4 chars like "Aaj", "Dil", "Tu"), fuzzy distance 1 is 25-33% different. Require exact match!
  if (title1.length <= 4 || title2.length <= 4) {
    if (title1 !== title2) return false;
  } else {
    const titleSim = stringSimilarity(title1, title2);
    if (titleSim < 0.88 && title1 !== title2) return false;
  }

  // 3. Multi-Artist Set Overlap & String Similarity
  const artist1 = normalizeQuery(cleanArtist(song1.artist));
  const artist2 = normalizeQuery(cleanArtist(song2.artist));

  if (artist1 === artist2) return true;

  const artistTokens1 = splitAndNormalizeArtists(song1.artist);
  const artistTokens2 = splitAndNormalizeArtists(song2.artist);

  const setOverlap = artistSetOverlap(artistTokens1, artistTokens2);
  if (setOverlap >= 0.4) return true;

  const artistSim = stringSimilarity(artist1, artist2);
  return artistSim >= 0.78;
}

