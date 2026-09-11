import { ExploreSong } from './explore';

// ─── Ranking Modes ───────────────────────────────────────────────
export type RankingMode = 'chart' | 'discovery' | 'personalized';

// ─── 4 Deterministic Session Intents ──────────────────────────────
export type SessionIntent =
  | 'DEEP_FOCUS_ARTIST' // Continuous streak of same artist/album
  | 'MOOD_FLOW'         // Diverse artists, tightly aligned emotional valence/tempo
  | 'CHARTS_POPULAR'    // Hit songs & trending charts
  | 'ACTIVE_DISCOVERY'; // High skip rate or active genre exploration

// ─── Exploration Mix Ratios ──────────────────────────────────────
export interface ExplorationMixRatio {
  exploitation: number; // High-confidence affinity tracks (0.45 – 0.85)
  exploration: number;  // Adjacent mood / genre tracks (0.10 – 0.35)
  discovery: number;    // Serendipitous & fresh gems (0.05 – 0.20)
}

// ─── Dynamic Feature Weights ─────────────────────────────────────
export interface DynamicWeights {
  sessionAffinity: number;
  userAffinity: number;
  artistAffinity: number;
  languageAffinity: number;
  moodSimilarity: number;
  popularity: number;
  novelty: number;
  freshness: number;
}

// ─── Listening Events ────────────────────────────────────────────
export type ListeningAction = 'play' | 'skip' | 'complete' | 'replay' | 'like';

export interface ListeningEvent {
  trackId: string;
  canonicalKey?: string;
  artist?: string;
  language?: string;
  action: ListeningAction;
  timestamp: number;

  /** How much of the track was consumed (0.0 – 1.0). */
  progress?: number;

  /** Duration listened in seconds. */
  listenedSeconds?: number;
}

// ─── Session Context ─────────────────────────────────────────────
export interface SessionContext {
  recentHistory: ListeningEvent[];

  activeLanguage?: string;
  currentMood?: string;
  currentArtist?: string;
  sessionIntent?: SessionIntent;

  /** Tracks explicitly excluded from recommendation. */
  excludedTrackIds?: string[];
  excludedCanonicalKeys?: string[];
}

// ─── Recommendation Reason ───────────────────────────────────────
export type RecommendationReasonType =
  | 'same_artist'
  | 'similar_artist'
  | 'session_affinity'
  | 'language_affinity'
  | 'mood_similarity'
  | 'trending'
  | 'fresh'
  | 'novel'
  | 'exploration'
  | 'intent_alignment';

export interface RecommendationReason {
  type: RecommendationReasonType;
  score: number;
  explanation?: string;
}

// ─── Per-Track Feature Vector ────────────────────────────────────
export interface RecommendationFeatures {
  userAffinity: number;
  sessionAffinity: number;
  artistAffinity: number;
  languageAffinity: number;
  moodSimilarity: number;
  popularity: number;
  freshness: number;
  novelty: number;
  audioQuality?: number; // Optional metadata, decoupled from recommendation scoring
}

// ─── Scored Recommendation Result (per track) ────────────────────
export interface RecommendationResult {
  track: ExploreSong;
  score: number;
  reasons: RecommendationReason[];
  features: RecommendationFeatures;
}

// ─── API Response ────────────────────────────────────────────────
export interface RecommendationResponse {
  tracks: RecommendationResult[];
  rankingMode: RankingMode;
  sessionIntent?: SessionIntent;
  weightsApplied?: DynamicWeights;
  explorationRatios?: ExplorationMixRatio;
  emotion?: {
    type: string;
    label: string;
    icon: string;
    color: string;
    secondary: string;
  };
  generatedAt: number;
  source: string;
  candidateCount: number;
  latencyMs: number;
}
