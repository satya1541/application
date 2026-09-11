import { Share } from 'react-native';
import { UserPlaylist } from './userPlaylistService';

/**
 * Formats total duration in seconds into a human-friendly string (e.g., "42 mins" or "1 hr 15 mins")
 */
function formatTotalDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${remMins > 0 ? `${remMins}m` : ''}`.trim();
}

/**
 * Generates a rich, shareable text payload and triggers the native OS Share dialog.
 */
export async function sharePlaylist(playlist: UserPlaylist): Promise<void> {
  if (!playlist) return;

  const totalDuration = playlist.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const durationLabel = formatTotalDuration(totalDuration);

  const previewTrackCount = Math.min(playlist.songs.length, 12);
  const trackList = playlist.songs
    .slice(0, previewTrackCount)
    .map((s, idx) => `${idx + 1}. ${s.name} - ${s.artist}`)
    .join('\n');

  const extraCount = playlist.songs.length - previewTrackCount;
  const extraSuffix = extraCount > 0 ? `\n...and ${extraCount} more tracks!` : '';

  const message =
    `🎧 PLAYLIST: ${playlist.name.toUpperCase()}\n` +
    (playlist.description ? `📝 "${playlist.description}"\n` : '') +
    `🔥 ${playlist.songs.length} tracks ${durationLabel ? `• ${durationLabel}` : ''}\n\n` +
    `TRACKS:\n` +
    (trackList || 'No tracks yet') +
    extraSuffix +
    `\n\n` +
    `Stream in lossless 320kbps on Shorty! ⚡`;

  try {
    await Share.share({
      title: playlist.name,
      message,
    });
  } catch (err) {
    console.warn('[playlistShareService] Failed to share playlist:', err);
  }
}
