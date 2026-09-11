export function normalizeQuery(q: string): string {
  if (!q) return '';
  return q
    .normalize('NFD') // Decompose Unicode
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/gi, ' ') // Keep alphanumeric and regional Hindi/Odia/Devanagari
    .replace(/\b(official audio|official video|lyric video|lyrics|hd|4k|audio|video)\b/gi, '') // Noise
    .replace(/\s+/g, ' ')
    .trim();
}

export type IntentType = 'ARTIST' | 'ALBUM' | 'SONG' | 'DISCOVERY' | 'MOVIE' | 'GENERIC';
export type VariantType = 'REMIX' | 'LIVE' | 'ACOUSTIC' | 'COVER' | 'SLOWED' | 'INSTRUMENTAL' | 'KARAOKE' | 'ORIGINAL';

export interface SearchIntent {
  primary: IntentType;
  confidence: number;
  secondary?: {
    type: string;
    confidence: number;
  }[];
  requestedEntity?: 'ARTIST' | 'ALBUM' | 'SONG';
  variant?: {
    type: VariantType;
    confidence: number;
  };
}

export interface ParsedQuery {
  original: string;
  baseQuery: string;
  normalizedBase: string;
  modifiers: string[];
  variant: VariantType | null;
}

export function parseSearchQuery(query: string): ParsedQuery {
  let baseQuery = query.trim();
  const modifiers: string[] = [];
  let variant: VariantType | null = null;

  // Extract Modifiers: only strip trailing modifier if preceded by real query words
  if (/\b(?:all\s+)?songs$/i.test(baseQuery) && baseQuery.replace(/\b(?:all\s+)?songs$/i, '').trim().length >= 3) {
    modifiers.push('SONGS');
    baseQuery = baseQuery.replace(/\b(?:all\s+)?songs$/i, '').trim();
  }
  if (/\balbums?$/i.test(baseQuery) && baseQuery.replace(/\balbums?$/i, '').trim().length >= 3) {
    modifiers.push('ALBUMS');
    baseQuery = baseQuery.replace(/\balbums?$/i, '').trim();
  }
  if (/\bartists?$/i.test(baseQuery) && baseQuery.replace(/\bartists?$/i, '').trim().length >= 3) {
    modifiers.push('ARTISTS');
    baseQuery = baseQuery.replace(/\bartists?$/i, '').trim();
  }

  // Extract Variants
  if (/\bremix(es)?\b/i.test(baseQuery) || /\bmashup(s)?\b/i.test(baseQuery)) {
    variant = 'REMIX';
  } else if (/\blive\b/i.test(baseQuery)) {
    variant = 'LIVE';
  } else if (/\bacoustic\b/i.test(baseQuery) || /\bunplugged\b/i.test(baseQuery) || /\breprise\b/i.test(baseQuery)) {
    variant = 'ACOUSTIC';
  } else if (/\bcover\b/i.test(baseQuery)) {
    variant = 'COVER';
  } else if (/\bslowed\b/i.test(baseQuery) || /\breverb\b/i.test(baseQuery)) {
    variant = 'SLOWED';
  } else if (/\binstrumental\b/i.test(baseQuery)) {
    variant = 'INSTRUMENTAL';
  } else if (/\bkaraoke\b/i.test(baseQuery)) {
    variant = 'KARAOKE';
  }

  return {
    original: query,
    baseQuery: baseQuery.replace(/\s+/g, ' ').trim(),
    normalizedBase: normalizeQuery(baseQuery),
    modifiers,
    variant,
  };
}

export function detectSearchIntent(parsed: ParsedQuery): SearchIntent {
  const norm = parsed.normalizedBase;
  const originalLower = parsed.original.toLowerCase();

  // Strict prefixes
  if (originalLower.startsWith('artist:')) {
    return { primary: 'ARTIST', confidence: 1.0, requestedEntity: 'ARTIST' };
  }
  if (originalLower.startsWith('album:')) {
    return { primary: 'ALBUM', confidence: 1.0, requestedEntity: 'ALBUM' };
  }
  if (originalLower.startsWith('song:')) {
    return { primary: 'SONG', confidence: 1.0, requestedEntity: 'SONG' };
  }

  let primary: IntentType = 'GENERIC';
  let confidence = 0.1;
  let requestedEntity: 'ARTIST' | 'ALBUM' | 'SONG' | undefined;

  // Determine requested entity based on modifiers
  if (parsed.modifiers.includes('ARTISTS')) {
    requestedEntity = 'ARTIST';
    primary = 'ARTIST';
    confidence = 0.8;
  } else if (parsed.modifiers.includes('ALBUMS')) {
    requestedEntity = 'ALBUM';
    primary = 'ARTIST';
    confidence = 0.8;
  } else if (parsed.modifiers.includes('SONGS')) {
    requestedEntity = 'SONG';
    primary = 'ARTIST';
    confidence = 0.8;
  }

  if (norm.match(/\b(album|soundtrack|ost)\b/)) {
    primary = 'ALBUM';
    confidence = Math.max(confidence, 0.85);
  }

  // Generic vibe/mood detection
  if (/^(love|sad|rock|dance|party|gym|workout|chill|romantic)$/.test(norm)) {
    primary = 'DISCOVERY';
    confidence = 0.7;
  }

  return {
    primary,
    confidence,
    requestedEntity,
    variant: parsed.variant ? { type: parsed.variant, confidence: 0.9 } : undefined,
  };
}

export interface SectionOrdering {
  sections: Array<'TopResult' | 'Artists' | 'Albums' | 'Songs'>;
}

export function determineSectionOrdering(intent: SearchIntent): SectionOrdering {
  let primary = intent.requestedEntity || intent.primary;

  // High threshold required to prevent jarring section flipping on ambiguous queries
  if (intent.confidence < 0.75) {
    primary = 'GENERIC';
  }

  switch (primary) {
    case 'ARTIST':
      return { sections: ['TopResult', 'Artists', 'Songs', 'Albums'] };
    case 'ALBUM':
      return { sections: ['TopResult', 'Albums', 'Songs', 'Artists'] };
    case 'SONG':
      return { sections: ['TopResult', 'Songs', 'Artists', 'Albums'] };
    case 'DISCOVERY':
    case 'GENERIC':
    default:
      return { sections: ['TopResult', 'Songs', 'Artists', 'Albums'] };
  }
}
