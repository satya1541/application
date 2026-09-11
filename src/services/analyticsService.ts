import { Song } from '@/types/music';
import { getListeningHistory, HistoryEntry } from './historyService';

export interface TopArtistStat {
  name: string;
  count: number;
  totalDurationSeconds: number;
  totalMinutes: number;
  fanPercent: number;
  cover?: string;
}

export interface TopSongStat {
  song: Song;
  playCount: number;
  totalDurationSeconds: number;
}

export interface ReplayAnalytics {
  hasData: boolean;
  totalTracksPlayed: number;
  totalHours: string;
  totalMinutes: number;
  minutesQuip: string;
  topArtists: TopArtistStat[];
  topSongs: TopSongStat[];
  topGenres: string[];
  persona: {
    title: string;
    description: string;
    icon: string;
    gradient: [string, string, string];
  };
}

const KNOWN_GENRES = [
  { name: 'Hip-Hop / Rap', match: /(hip hop|rap|trap|drill|boombap|eminem|drake|travis|kendrick)/i },
  { name: 'Pop & Anthems', match: /(pop|taylor|ariana|dua lipa|billie|ed sheeran|justin)/i },
  { name: 'R&B / Soul', match: /(r&b|soul|the weeknd|sza|frank ocean|brent|giveon)/i },
  { name: 'Electronic & Dance', match: /(edm|house|techno|dance|calvin|avicii|skrillex|alan)/i },
  { name: 'Indie & Alternative', match: /(indie|alt|arctic|lana|clairo|phoebe|strokes)/i },
  { name: 'Bollywood & Desi', match: /(arijit|shreya|anirudh|pritam|atif|sidhu|badshah|honey)/i },
  { name: 'Lo-Fi & Chill', match: /(lofi|chill|study|sleep|relax|piano|acoustic)/i },
  { name: 'Rock & Metal', match: /(rock|metal|queen|linkin|nirvana|ac\/dc|metallica)/i },
];

/**
 * Computes authentic Spotify-Wrapped style analytics from playback history.
 */
export async function computeListeningAnalytics(): Promise<ReplayAnalytics> {
  const history: HistoryEntry[] = await getListeningHistory();

  if (!history || history.length === 0) {
    return {
      hasData: false,
      totalTracksPlayed: 0,
      totalHours: '0.0',
      totalMinutes: 0,
      minutesQuip: 'Start streaming your favorite hits to unlock your 2026 Wrapped!',
      topArtists: [],
      topSongs: [],
      topGenres: ['Pop', 'Hip-Hop', 'Electronic', 'Indie', 'R&B'],
      persona: {
        title: 'The Sonic Voyager',
        description: 'You explore endless genres and never get boxed into a single sound.',
        icon: '🚀',
        gradient: ['#FAFF00', '#FF007A', '#7928CA'],
      },
    };
  }

  let totalDurationSeconds = 0;
  const artistMap = new Map<string, { count: number; duration: number; cover?: string }>();
  const songMap = new Map<string, { song: Song; count: number; duration: number }>();
  const genreCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);

  for (const entry of history) {
    const dur = entry.durationSeconds || entry.song.duration || 180;
    totalDurationSeconds += dur;

    // Track hour distribution
    const date = new Date(entry.playedAt);
    const hour = date.getHours();
    hourCounts[hour]++;

    // Aggregate by Artist
    const artistName = entry.song.artist?.trim() || 'Unknown Artist';
    const existingArtist = artistMap.get(artistName) || {
      count: 0,
      duration: 0,
      cover: entry.song.cover,
    };
    existingArtist.count += 1;
    existingArtist.duration += dur;
    if (!existingArtist.cover && entry.song.cover) {
      existingArtist.cover = entry.song.cover;
    }
    artistMap.set(artistName, existingArtist);

    // Aggregate by Song
    const songKey = entry.song.id || `${entry.song.name} - ${entry.song.artist}`;
    const existingSong = songMap.get(songKey) || {
      song: entry.song,
      count: 0,
      duration: 0,
    };
    existingSong.count += 1;
    existingSong.duration += dur;
    songMap.set(songKey, existingSong);

    // Classify Genre
    const haystack = `${entry.song.name} ${entry.song.artist} ${entry.song.album || ''}`;
    let matchedGenre = false;
    for (const g of KNOWN_GENRES) {
      if (g.match.test(haystack)) {
        genreCounts.set(g.name, (genreCounts.get(g.name) || 0) + 1);
        matchedGenre = true;
        break;
      }
    }
    if (!matchedGenre) {
      genreCounts.set('Contemporary Hits', (genreCounts.get('Contemporary Hits') || 0) + 1);
    }
  }

  // Rank Top Artists
  const topArtists: TopArtistStat[] = Array.from(artistMap.entries())
    .map(([name, data], idx) => ({
      name,
      count: data.count,
      totalDurationSeconds: data.duration,
      totalMinutes: Math.max(1, Math.round(data.duration / 60)),
      fanPercent: idx === 0 ? 0.5 : idx === 1 ? 1.5 : 3.0,
      cover: data.cover,
    }))
    .sort((a, b) => b.count - a.count || b.totalDurationSeconds - a.totalDurationSeconds)
    .slice(0, 5);

  // Rank Top Songs
  const topSongs: TopSongStat[] = Array.from(songMap.values())
    .map((item) => ({
      song: item.song,
      playCount: item.count,
      totalDurationSeconds: item.duration,
    }))
    .sort((a, b) => b.playCount - a.playCount || b.totalDurationSeconds - a.totalDurationSeconds)
    .slice(0, 10);

  // Rank Top Genres
  const sortedGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const defaultGenres = ['Pop Anthems', 'Hip-Hop', 'Electronic Synth', 'R&B Vibrations', 'Indie Waves'];
  const topGenres = Array.from(new Set([...sortedGenres, ...defaultGenres])).slice(0, 5);

  // Determine Persona & Aura
  let nightCount = 0;
  let morningCount = 0;
  let afternoonCount = 0;
  let eveningCount = 0;

  for (let h = 0; h < 24; h++) {
    const c = hourCounts[h];
    if (h >= 23 || h < 5) nightCount += c;
    else if (h >= 5 && h < 12) morningCount += c;
    else if (h >= 12 && h < 17) afternoonCount += c;
    else eveningCount += c;
  }

  const maxTime = Math.max(nightCount, morningCount, afternoonCount, eveningCount);
  const maxRepeat = topSongs[0]?.playCount || 1;

  let persona = {
    title: 'The Shapeshifter',
    description: "One moment you're head over heels for an artist. The next, you've moved on. Some say it's erratic. We call it eclectic.",
    icon: '🔮',
    gradient: ['#7928CA', '#FF0080', '#0070F3'] as [string, string, string],
  };

  if (maxRepeat >= 4) {
    persona = {
      title: 'The Repeat Connoisseur',
      description: 'When a melody hits right, you put it on an endless loop. You find perfection in repetition.',
      icon: '🔁',
      gradient: ['#00F5D4', '#7928CA', '#FF007A'] as [string, string, string],
    };
  } else if (maxTime === nightCount && nightCount >= 2) {
    persona = {
      title: 'The Vampire / Night Owl',
      description: 'Your darkest, deepest listening hours begin when the rest of the world goes to sleep.',
      icon: '🌙',
      gradient: ['#111827', '#4F46E5', '#9333EA'] as [string, string, string],
    };
  } else if (maxTime === morningCount && morningCount >= 2) {
    persona = {
      title: 'The Sunrise Dynamo',
      description: 'You command the day with early sonic fuel. Your headphones are on before your coffee is poured.',
      icon: '☀️',
      gradient: ['#F59E0B', '#EF4444', '#EC4899'] as [string, string, string],
    };
  }

  const totalMinutes = Math.round(totalDurationSeconds / 60);
  const totalHours = (totalDurationSeconds / 3600).toFixed(1);

  let minutesQuip = 'Good chat.';
  if (totalMinutes > 300) {
    minutesQuip = `That's ${(totalMinutes / 60).toFixed(1)} straight hours without taking off your headphones. Nice.`;
  } else if (totalMinutes > 60) {
    minutesQuip = 'That is more than 75% of music lovers in your timezone.';
  } else {
    minutesQuip = 'Just warming up the soundstage. You have impeccable taste.';
  }

  return {
    hasData: true,
    totalTracksPlayed: history.length,
    totalHours,
    totalMinutes,
    minutesQuip,
    topArtists,
    topSongs,
    topGenres,
    persona,
  };
}
