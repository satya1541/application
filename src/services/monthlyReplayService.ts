import { SafeStorage } from './storage';
import { getListeningHistory } from './historyService';

const STORAGE_KEY_LAST_REPLAY_SHOWN = '@shorty_last_replay_shown_timestamp_v1';
// 30 days in milliseconds
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
// Minimum played tracks required to generate a meaningful Wrapped
const MIN_TRACKS_FOR_REPLAY = 5;

/**
 * Checks if 1 month (30 days) has passed since the user was last shown their Wrapped,
 * and confirms the user has sufficient listening history.
 */
export async function shouldShowMonthlyReplay(): Promise<boolean> {
  try {
    const history = await getListeningHistory();
    if (!history || history.length < MIN_TRACKS_FOR_REPLAY) {
      return false;
    }

    const lastShownStr = await SafeStorage.getItem(STORAGE_KEY_LAST_REPLAY_SHOWN);
    if (!lastShownStr) {
      // Never shown before and user has listened to >= 5 songs -> Ready to show!
      return true;
    }

    const lastShown = parseInt(lastShownStr, 10);
    if (isNaN(lastShown)) {
      return true;
    }

    const elapsed = Date.now() - lastShown;
    return elapsed >= THIRTY_DAYS_MS;
  } catch (err) {
    console.warn('[monthlyReplayService] Error checking monthly replay eligibility:', err);
    return false;
  }
}

/**
 * Records the current epoch timestamp so the replay will not show again for 30 days.
 */
export async function recordMonthlyReplayShown(): Promise<void> {
  try {
    await SafeStorage.setItem(STORAGE_KEY_LAST_REPLAY_SHOWN, Date.now().toString());
  } catch (err) {
    console.warn('[monthlyReplayService] Failed to record replay timestamp:', err);
  }
}

/**
 * Utility for testing or manual reset.
 */
export async function resetMonthlyReplayTimer(): Promise<void> {
  try {
    await SafeStorage.removeItem(STORAGE_KEY_LAST_REPLAY_SHOWN);
  } catch { }
}
