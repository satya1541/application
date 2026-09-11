# Deluxe Songs — Search Architecture & Technical Specification

This document details the end-to-end architecture of the **Search Engine** in Deluxe Songs, covering user interaction, input debouncing, request sequencing, multi-source retrieval, live autocomplete suggestions, deduplication, scoring, ranking, and UI rendering.

---

## 1. High-Level Architecture Diagram

```
                       User Types in Search Field
                                   │
              ┌────────────────────┴────────────────────┐
              ▼ (200ms debounce)                         ▼ (350ms debounce)
     Live Suggestions Engine                   Full Search Orchestrator
   (SearchOrchestrator.getSuggestions)       (SearchOrchestrator.searchAll)
              │                                         │
              │ (activeSuggestionIdRef guard)           │ (activeSearchIdRef guard)
              │                                         │
    ┌─────────┼──────────┐                   ┌──────────┼──────────┐
    ▼         ▼          ▼                   ▼          ▼          ▼
JioSaavn   Google/YT   60s Cached        JioSaavn    YouTube     60s Cached
Auto-API   Music Filter Artists          (20 tracks) (20 tracks) Artists
(2.5s TO)  (2.5s TO)   (Memory)          (4.0s TO)   (4.0s TO)   (Memory)
    │         │          │                   │          │          │
    └─────────┬──────────┘                   └──────────┬──────────┘
              ▼                                         ▼
   Grouped Suggestions Dropdown             Per-Item Quality Deduplication &
   (Artists, Songs, Albums, Queries)         Multi-Signal Rank Scorer
              │                              (Popularity + Core Title + Duration)
              │                                         │
              │                                         ▼
              │                              Intent-Aware Top Result &
              │                              Guarded Section Ordering (>= 0.75)
              │                                         │
              └────────────────────┬────────────────────┘
                                   ▼
                    MobileSearchScreen UI State
   (Top Result Hero Card → Songs List → Artists Grid → Albums Carousel)
```

---

## 2. Component & File Hierarchy

| Layer | File Path | Core Responsibility |
|---|---|---|
| **View / UI** | `src/components/mobile/MobileSearchScreen.tsx` | Search bar, debouncing, request sequencing, animations, suggestions dropdown |
| **Orchestrator** | `src/services/searchOrchestrator.ts` | Multi-source dispatch, per-item dedup, scoring, popularity weighting, artist cache |
| **Query Parser** | `src/services/searchParser.ts` | Non-destructive token parsing, high-confidence intent classification ($\ge 0.75$) |
| **Fuzzy Matching** | `src/services/entityResolution.ts` | Duration gate ($\pm 8$s), short-title guard ($\le 4$ chars), multi-artist Jaccard sets |
| **Text Cleaner** | `src/services/textCleaner.ts` | Strips YouTube promo tags, pipe delimiters (`|`), movie clauses, preserves real words |
| **Typo Engine** | `src/services/searchCorrection.ts` | Proactive & reactive typo correction across Indian & global artist/song corpus |
| **Data Providers** | `src/services/saavnStream.ts`, `src/services/youtubeMusicApi.ts` | Live network search across JioSaavn and YouTube Music |

---

## 3. The Search Screen UI & Input Lifecycle (`MobileSearchScreen.tsx`)

The Search Screen operates as a state-driven machine with 4 distinct modes:

```
[1. Idle / Browse]  ──(Focus & Typing <2 chars)──► [2. Typing / Recent]
        ▲                                                      │
        │ (Clear / Back)                           (Query >= 2 chars)
        │                                                      ▼
[4. Results Grid]   ◄──(Debounced 350ms Search)─── [3. Suggestions Dropdown]
```

### A. Focus & Keyboard Handling
- **`isInputFocused` & `isInputFocusedRef`**: React state paired with a mutable reference to prevent stale closure bugs in async timers.
- **`Keyboard.addListener('keyboardDidHide')`**: Automatically collapses suggestions and blurs the `TextInput` when the Android soft keyboard is dismissed by the user.
- **Edge Swipe & Gesture Back Handler**: Supports Android hardware back, edge swipe back, and an in-screen horizontal swipe gesture (`panResponder`), gracefully unwinding:
  `Artist/Album Modal → Category Chart → Search Results → Clear Query → Home Screen`.

### B. Request Sequencing & Stale Response Interception (Point 1)
To eliminate out-of-order responses (e.g. typing `"ari"` $\rightarrow$ `"arijit"` where the slower response for `"ari"` finishes last and overwrites `"arijit"`):
```typescript
const activeSearchIdRef = useRef<number>(0);
const activeSuggestionIdRef = useRef<number>(0);

// In search effect:
const searchId = ++activeSearchIdRef.current;
const res = await SearchOrchestrator.searchAll(query.trim());
if (searchId !== activeSearchIdRef.current) return; // Stale request, discard!
setSearchResult(res);
```

### C. Dual-Tier Debouncing Pipeline
1. **Suggestion Debounce (200ms)**: Fast, lightweight lookup for auto-complete suggestions while typing.
2. **Search Query Debounce (350ms)**: Full multi-source catalog search when typing pauses.

---

## 4. Live Search Suggestions Engine (`SearchOrchestrator.getSuggestions`)

When the user types $\ge 2$ characters, `SearchOrchestrator.getSuggestions(query)` dispatches **3 parallel promises**:

### A. Unified Query Parameter (Point 9)
All three endpoints receive the identical `effectiveQuery` variable:
```typescript
const [saavnRes, ytRes, directArtistsRes] = await Promise.allSettled([
  fetchWithTimeout(fetch(`...jiosaavn...&query=${encodeURIComponent(effectiveQuery)}`), 2500, null),
  fetchWithTimeout(fetch(`...google...&q=${encodeURIComponent(effectiveQuery)}`), 2500, null),
  cachedSearchSaavnArtists(effectiveQuery, 4),
]);
```

### B. In-Memory 60s Artist Cache (Point 13)
To ensure the artist shown in the suggestion dropdown perfectly matches what the results screen surfaces for the exact same query, `cachedSearchSaavnArtists` maintains a 60-second in-memory LRU cache. This completely eliminates suggestion-vs-search discrepancies and eliminates redundant network calls.

### C. Music-Scoped Query Filter (Point 4)
YouTube autocomplete suggestions are filtered through `NON_MUSIC_FILTER` to reject non-music queries (`trailer`, `gameplay`, `vlog`, `reaction`, `interview`, `unboxing`, `news`).

### D. Per-Source Timeout Protection (Point 15)
Suggestion fetches are wrapped in `fetchWithTimeout(..., 2500ms, null)`. If an external autocomplete API stalls, it returns null without hanging the search suggestions UI.

---

## 5. Multi-Source Search Orchestration (`searchOrchestrator.ts`)

When the 350ms debounce completes, `SearchOrchestrator.searchAll(query)` executes a federated search across both major sources:

### A. Non-Destructive Query Parsing (Point 10)
Instead of deleting words that match stopword patterns, `searchParser.ts` only extracts trailing intent tags if preceded by at least 3 characters of substantive query words. Real song titles like *"The Nights"*, *"A Kind of Magic"*, *"Love Songs"*, or *"Tu Hai Kahan"* retain all their constituent words.

### B. Balanced Candidate Volume (Point 14)
JioSaavn and YouTube Music fetch an equal volume of candidates:
- `searchSaavnSongs(query, 1, 20)`: 20 candidate tracks.
- `searchYouTubeMusic(query, 20)`: 20 candidate tracks.
This balances candidate representation before deduplication and scoring.

### C. Per-Source Timeouts & Telemetry (Points 12 & 15)
Every candidate fetch is capped at a 4000ms timeout. If an API rejects or times out, telemetry logging records the failure:
```typescript
if (saavnSongs.status === 'rejected') {
  console.warn('[SearchOrchestrator] JioSaavn song search failed:', saavnSongs.reason);
}
```

---

## 6. Canonical Deduplication & Multi-Signal Scoring

### A. Deduplication Gates & Near-Match Rules (Point 5)
1. **Track Duration Gate**: If both tracks report positive durations and differ by $> 8$ seconds, they are **never** merged.
2. **Short Title Guard**: For titles $\le 4$ characters (e.g. *"Aaj"*, *"Dil"*, *"Tu"*), fuzzy matching is disabled; exact string equality is required.
3. **Multi-Artist Jaccard Sets**: Artist credits are split on delimiters, sorted alphabetically, and compared via Jaccard set overlap ($\ge 0.40$).

### B. Per-Item Quality Comparison (Points 11 & 18)
Rather than hardcoding source priority, candidate tracks are evaluated on quality metrics:
```typescript
const shouldPromoteRaw =
  (!rawIsDerivative && existingIsDerivative) ||
  (!existingHasStream && rawHasStream) ||
  (rawIsLossless && !existingIsLossless && !rawIsDerivative);
```
- Authentic studio tracks always beat fan covers/bedroom remixes.
- Verified audio streams beat broken or missing streams.
- 320kbps CD Lossless audio is promoted over standard audio.
- Between same-source YouTube results, the clean audio-only upload is promoted over the music video version.

### C. Dual Title Normalization in Scoring (Point 17)
To prevent soundtrack suffixes like `(From "Brahmastra")` from ruining character-level exact matching:
```typescript
const titleNorm = normalizeQuery(cleanTitle(song.name));
const coreTitleNorm = normalizeQuery(getCoreSongTitle(song.name));

if (titleNorm === qNorm || coreTitleNorm === qNorm) {
  titleMatch = 1.0; // 100% Exact Match achieved for soundtrack titles
}
```

### D. Hit-Song Ranking Formula & Derivative Penalty (Points 2 & 3)
```typescript
// Query containing artist tokens:
FinalScore = 0.35·TitleMatch + 0.20·ArtistMatch + 0.10·Tokens + 0.25·PopularityScore + 0.10·Quality - DerivativePenalty

// Title-only query (e.g. "Kesariya"):
FinalScore = 0.50·TitleMatch + 0.05·ArtistMatch + 0.10·Tokens + 0.25·PopularityScore + 0.10·Quality - DerivativePenalty
```
- **Popularity Score ($0.25$)**: Log-scale play counts ($100\text{k} - 100\text{M}$ plays) + verified studio label credit ($0.85$).
- **Derivative Penalty ($-0.35$)**: Applied to fan remixes, slowed reverb, and covers unless the user explicitly searched for them.

### E. Proactive Typo Recovery (Point 19)
Typo recovery triggers not only when zero results are found, but also proactively if the top result relevance score is weak ($< 0.60$) and a canonical alias match exists:
```typescript
const shouldAttemptTypoRecovery = (finalSongs.length === 0 && allArtists.length === 0) || (topScore < 0.60);
```

---

## 7. Intent-Aware Layout & Guarded Section Ordering (Point 16)

To prevent brittle keyword checks from disrupting the results screen:
- A high confidence threshold ($\ge 0.75$) is required before changing section ordering.
- Ambiguous queries consistently default to the balanced layout:
  `[Top Result Hero Card] → [Songs] → [Artists] → [Albums]`
- The Top Result item is automatically deduplicated from subsequent list sections.
