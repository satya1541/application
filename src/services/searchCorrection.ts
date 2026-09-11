import { stringSimilarity, levenshteinDistance } from './entityResolution';
import { normalizeQuery } from './searchParser';

const CANONICAL_CORPUS = [
  // Top Bollywood & Pop Artists
  'Arijit Singh',
  'Atif Aslam',
  'Shreya Ghoshal',
  'Jubin Nautiyal',
  'Neha Kakkar',
  'A.R. Rahman',
  'Pritam',
  'Vishal Mishra',
  'Sonu Nigam',
  'KK',
  'Mohit Chauhan',
  'Sunidhi Chauhan',
  'Kumar Sanu',
  'Alka Yagnik',
  'Udit Narayan',
  'Lata Mangeshkar',
  'Kishore Kumar',
  'B Praak',
  'Darshan Raval',
  'Armaan Malik',
  'Anuv Jain',
  'Prateek Kuhad',

  // Punjabi & Hip Hop
  'Sidhu Moose Wala',
  'Diljit Dosanjh',
  'Karan Aujla',
  'AP Dhillon',
  'Yo Yo Honey Singh',
  'Badshah',
  'Raftaar',
  'DIVINE',
  'MC Stan',
  'King',
  'Shubh',
  'Ammy Virk',
  'Guru Randhawa',
  'Hardy Sandhu',
  'Jassi Gill',
  'Prem Dhillon',

  // South Indian Stars
  'Anirudh Ravichander',
  'Sid Sriram',
  'Devi Sri Prasad',
  'Thaman S',
  'G.V. Prakash Kumar',
  'Santhosh Narayanan',
  'Yuvan Shankar Raja',
  'Harris Jayaraj',

  // Regional (Odia, Sambalpuri, Bhojpuri, Haryanvi)
  'Humane Sagar',
  'Asim Azhar',
  'Khesari Lal Yadav',
  'Pawan Singh',
  'Silu Malang',
  'Mantu Chhuria',
  'Renuka Panwar',
  'Fazilpuria',
  'Gulzaar Chhaniwala',

  // Iconic Songs & Soundtracks
  'Kesariya',
  'Channa Mereya',
  'Tum Hi Ho',
  'Aashiqui 2',
  'Kalank',
  'Kabir Singh',
  'Raataan Lambiyan',
  'Pehle Bhi Main',
  'Satranga',
  'Animal',
  'Jawan',
  'Brahmastra',
  'Rangabati',
  'Illuminati',
  'Tauba Tauba',
];

const DIRECT_ALIASES: Record<string, string> = {
  'arjit': 'Arijit Singh',
  'arjit singh': 'Arijit Singh',
  'arijeet': 'Arijit Singh',
  'arijeet singh': 'Arijit Singh',
  'arijitt': 'Arijit Singh',
  'atif': 'Atif Aslam',
  'atif aslan': 'Atif Aslam',
  'shreya': 'Shreya Ghoshal',
  'shreya ghosal': 'Shreya Ghoshal',
  'jubin': 'Jubin Nautiyal',
  'jubin nautial': 'Jubin Nautiyal',
  'neha': 'Neha Kakkar',
  'neha kakar': 'Neha Kakkar',
  'ar rehman': 'A.R. Rahman',
  'rehman': 'A.R. Rahman',
  'rahman': 'A.R. Rahman',
  'yo yo': 'Yo Yo Honey Singh',
  'honey sing': 'Yo Yo Honey Singh',
  'honey singh': 'Yo Yo Honey Singh',
  'sidhu': 'Sidhu Moose Wala',
  'musewala': 'Sidhu Moose Wala',
  'sidhu musewala': 'Sidhu Moose Wala',
  'sidhu moosewala': 'Sidhu Moose Wala',
  'diljit': 'Diljit Dosanjh',
  'diljeet': 'Diljit Dosanjh',
  'diljit dosanj': 'Diljit Dosanjh',
  'karan ojla': 'Karan Aujla',
  'aujla': 'Karan Aujla',
  'humane': 'Humane Sagar',
  'humane sagr': 'Humane Sagar',
  'anirud': 'Anirudh Ravichander',
  'anirudh': 'Anirudh Ravichander',
  'ashiqui': 'Aashiqui 2',
  'ashiqui 2': 'Aashiqui 2',
  'chana mereya': 'Channa Mereya',
  'kesaria': 'Kesariya',
};

/**
 * Generates an intelligent typo / phonetics correction for queries
 * Uses direct alias table + dynamic Levenshtein / similarity search across canon corpus.
 */
export function generateTypoCorrection(query: string): string | undefined {
  const qNorm = normalizeQuery(query);
  if (!qNorm || qNorm.length < 3) return undefined;

  // 1. Check direct alias lookup
  if (DIRECT_ALIASES[qNorm]) {
    return DIRECT_ALIASES[qNorm];
  }

  // 2. Dynamic Levenshtein / Similarity Scan across canonical corpus
  let bestCandidate: string | undefined;
  let highestScore = 0;

  for (const item of CANONICAL_CORPUS) {
    const itemNorm = normalizeQuery(item);
    if (itemNorm === qNorm) return undefined; // Already exact match, no correction needed

    const sim = stringSimilarity(qNorm, itemNorm);
    const dist = levenshteinDistance(qNorm, itemNorm);

    // Adaptive threshold: Allow edit distance of 1-2 for medium words, or sim >= 0.78
    const isEditClose = dist <= 2 && qNorm.length >= 4;
    const isSimilarityHigh = sim >= 0.78;

    if ((isEditClose || isSimilarityHigh) && sim > highestScore) {
      highestScore = sim;
      bestCandidate = item;
    }
  }

  return highestScore >= 0.75 ? bestCandidate : undefined;
}

