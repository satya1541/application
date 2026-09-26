/**
 * YouTube Channel Service
 * Fetches full YouTube channel metadata, hero banners, subscriber count, video uploads, and playlists.
 *
 * Handles YouTube's current InnerTube API structure:
 *  - pageHeaderRenderer → pageHeaderViewModel (banner, avatar, metadata rows)
 *  - richGridRenderer → lockupViewModel (video uploads on Videos tab)
 *  - Fallback: c4TabbedHeaderRenderer (legacy) and RSS feed
 */

import { getYouTubeVisitorData } from './youtubeStreamResolver';
import { fetchChannelRssUploads } from './youtubeUserFeedService';
import { YouTubeVideoSearchResult } from './youtubeVideoSearchService';

export interface YouTubeChannelDetails {
  channelId: string;
  title: string;
  handle?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  description?: string;
  isVerified?: boolean;
  uploads: YouTubeVideoSearchResult[];
}

function parseDurationSeconds(str: string): number {
  if (!str) return 0;
  const parts = str.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return parseInt(str, 10) || 0;
}

/**
 * If the input isn't a UC... browseId, resolve it by searching YouTube for a channel with that name.
 */
async function resolveChannelBrowseId(nameOrHandle: string): Promise<string | null> {
  try {
    const payload = {
      context: {
        client: { clientName: 'WEB', clientVersion: '2.20240105.01.00', hl: 'en', gl: 'IN' },
      },
      query: nameOrHandle,
      params: 'EgIQAg%3D%3D', // Filter: Channels only
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item?.channelRenderer?.channelId) {
            return item.channelRenderer.channelId;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[resolveChannelBrowseId] Error:', e);
  }
  return null;
}

/**
 * Parse channel header from the new pageHeaderViewModel structure.
 */
function parsePageHeaderViewModel(phvm: any) {
  const title = phvm?.title?.dynamicTextViewModel?.text?.content || undefined;

  // Avatar: decoratedAvatarViewModel → avatarViewModel → image → sources
  const avatarSources =
    phvm?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources || [];
  const avatarUrl = avatarSources[avatarSources.length - 1]?.url || undefined;

  // Banner: imageBannerViewModel → image → sources
  const bannerSources = phvm?.banner?.imageBannerViewModel?.image?.sources || [];
  const bannerUrl = bannerSources[bannerSources.length - 1]?.url || undefined;

  // Metadata rows contain handle, subscriber count, video count
  let handle: string | undefined;
  let subscriberCount: string | undefined;
  let videoCount: string | undefined;

  const metadataRows = phvm?.metadata?.contentMetadataViewModel?.metadataRows || [];
  for (const row of metadataRows) {
    const parts = row?.metadataParts || [];
    for (const part of parts) {
      const text = part?.text?.content?.trim();
      if (!text) continue;
      if (text.startsWith('@')) {
        handle = text;
      } else if (text.toLowerCase().includes('subscriber')) {
        subscriberCount = text;
      } else if (text.toLowerCase().includes('video')) {
        videoCount = text;
      }
    }
  }

  // Description
  const description =
    phvm?.description?.descriptionPreviewViewModel?.description?.content || undefined;

  return { title, avatarUrl, bannerUrl, handle, subscriberCount, videoCount, description };
}

/**
 * Parse uploads from richGridRenderer → lockupViewModel items (YouTube's current format).
 */
function parseLockupViewModelUploads(
  items: any[],
  channelTitle: string,
  channelAvatar: string | undefined,
  channelId: string
): YouTubeVideoSearchResult[] {
  const uploads: YouTubeVideoSearchResult[] = [];

  for (const item of items) {
    const lvm = item?.richItemRenderer?.content?.lockupViewModel;
    if (!lvm || !lvm.contentId) continue;

    const vId = lvm.contentId;
    const vTitle = lvm.metadata?.lockupMetadataViewModel?.title?.content || 'Untitled Video';

    // Thumbnail
    const thumbSources = lvm.contentImage?.thumbnailViewModel?.image?.sources || [];
    let bestThumb = thumbSources[thumbSources.length - 1]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
    if (bestThumb.startsWith('//')) bestThumb = `https:${bestThumb}`;

    // Duration from overlay badge
    let duration = '';
    const overlays = lvm.contentImage?.thumbnailViewModel?.overlays || [];
    for (const ov of overlays) {
      const badge = ov?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel;
      if (badge?.text) {
        duration = badge.text;
        break;
      }
    }
    // Fallback: parse from accessibility label ("Title 2 minutes, 4 seconds")
    if (!duration) {
      const label = lvm.rendererContext?.accessibilityContext?.label || '';
      const hourMatch = label.match(/(\d+)\s*hours?,?\s*(\d+)?\s*minutes?,?\s*(\d+)?\s*seconds?/);
      const minMatch = label.match(/(\d+)\s*minutes?,?\s*(\d+)?\s*seconds?/);
      const secMatch = label.match(/(\d+)\s*seconds?/);
      if (hourMatch) {
        const h = parseInt(hourMatch[1], 10) || 0;
        const m = parseInt(hourMatch[2], 10) || 0;
        const s = parseInt(hourMatch[3], 10) || 0;
        duration = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      } else if (minMatch) {
        const m = parseInt(minMatch[1], 10) || 0;
        const s = parseInt(minMatch[2], 10) || 0;
        duration = `${m}:${s.toString().padStart(2, '0')}`;
      } else if (secMatch) {
        duration = `0:${parseInt(secMatch[1], 10).toString().padStart(2, '0')}`;
      }
    }

    // View count and published time from metadata rows
    const metaRows =
      lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const metaParts = metaRows
      .flatMap((r: any) => r.metadataParts || [])
      .map((p: any) => p.text?.content)
      .filter(Boolean);
    const viewCount = metaParts[0] || '';
    const publishedTime = metaParts[1] || '';

    uploads.push({
      id: vId,
      videoId: vId,
      title: vTitle,
      author: channelTitle,
      channelId,
      channelAvatar,
      duration: duration || '3:30',
      durationSeconds: parseDurationSeconds(duration),
      viewCount,
      publishedTime,
      thumbnail: bestThumb,
    });
  }

  return uploads;
}

/**
 * Parse uploads from legacy gridVideoRenderer / videoRenderer items.
 */
function parseLegacyUploads(
  items: any[],
  channelTitle: string,
  channelAvatar: string | undefined,
  channelId: string
): YouTubeVideoSearchResult[] {
  const uploads: YouTubeVideoSearchResult[] = [];

  for (const item of items) {
    const vr =
      item?.gridVideoRenderer ||
      item?.richItemRenderer?.content?.videoRenderer ||
      item?.videoRenderer;
    if (!vr || !vr.videoId) continue;

    const vId = vr.videoId;
    const vTitle =
      vr.title?.runs?.map((r: any) => r.text).join('') || vr.title?.simpleText || 'Untitled Video';

    const duration = vr.lengthText?.simpleText || '';
    const durationSeconds = parseDurationSeconds(duration);

    const thumbs = vr.thumbnail?.thumbnails || [];
    let bestThumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
    if (bestThumb.startsWith('//')) bestThumb = `https:${bestThumb}`;

    uploads.push({
      id: vId,
      videoId: vId,
      title: vTitle,
      author: channelTitle,
      channelId,
      channelAvatar,
      duration,
      durationSeconds,
      viewCount: vr.shortViewCountText?.simpleText || vr.viewCountText?.simpleText || '',
      publishedTime: vr.publishedTimeText?.simpleText || '',
      thumbnail: bestThumb,
    });
  }

  return uploads;
}

/**
 * Fetches full YouTube Channel details including avatar, banner, sub count, and recent uploads.
 */
export async function fetchYouTubeChannelDetails(
  channelIdOrHandle: string,
  initialTitle?: string,
  initialAvatar?: string
): Promise<YouTubeChannelDetails> {
  const cleanId = channelIdOrHandle.trim();
  const cleanAuthor = (initialTitle || 'YouTube Creator').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'YT';
  const defaultAvatar = initialAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanAuthor)}&background=1f1f1f&color=ff0000&bold=true&size=256`;

  const fallbackResult: YouTubeChannelDetails = {
    channelId: cleanId,
    title: initialTitle || 'YouTube Channel',
    avatarUrl: defaultAvatar,
    uploads: [],
  };

  if (!cleanId) return fallbackResult;

  // Step 1: Resolve to a UC... browseId if needed
  let browseId = cleanId;
  if (!cleanId.startsWith('UC') || cleanId.length < 20) {
    const resolved = await resolveChannelBrowseId(cleanId);
    if (resolved) {
      browseId = resolved;
    } else {
      // Can't resolve — return fallback with RSS if original was UC...
      if (cleanId.startsWith('UC')) {
        return await fetchFallbackRss(cleanId, initialTitle, defaultAvatar);
      }
      return fallbackResult;
    }
  }

  try {
    const visitorData = await getYouTubeVisitorData();

    // Step 2: Fetch the Videos tab directly (includes header + video list)
    const payload: any = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240105.01.00',
          hl: 'en',
          gl: 'IN',
          visitorData: visitorData || undefined,
        },
      },
      browseId,
      params: 'EgZ2aWRlb3PyBgQKAjoA', // Videos tab token
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://www.youtube.com',
        ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();

      // ---- Parse Header ----
      const phvm = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
      const c4 = data?.header?.c4TabbedHeaderRenderer;

      let title: string;
      let avatarUrl: string;
      let bannerUrl: string | undefined;
      let handle: string | undefined;
      let subscriberCount: string | undefined;
      let videoCount: string | undefined;
      let description: string | undefined;

      if (phvm) {
        // New pageHeaderViewModel structure
        const parsed = parsePageHeaderViewModel(phvm);
        title = parsed.title || data?.header?.pageHeaderRenderer?.pageTitle || initialTitle || 'YouTube Channel';
        avatarUrl = parsed.avatarUrl || data?.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.[0]?.url || defaultAvatar;
        bannerUrl = parsed.bannerUrl;
        handle = parsed.handle;
        subscriberCount = parsed.subscriberCount;
        videoCount = parsed.videoCount;
        description = parsed.description || data?.metadata?.channelMetadataRenderer?.description;
      } else if (c4) {
        // Legacy c4TabbedHeaderRenderer
        title = c4.title || data?.metadata?.channelMetadataRenderer?.title || initialTitle || 'YouTube Channel';

        const c4Avatars = c4.avatar?.thumbnails || data?.metadata?.channelMetadataRenderer?.avatar?.thumbnails || [];
        avatarUrl = c4Avatars[c4Avatars.length - 1]?.url || defaultAvatar;

        const c4Banners = c4.banner?.thumbnails || [];
        bannerUrl = c4Banners[c4Banners.length - 1]?.url;

        handle =
          c4.channelHandleText?.runs?.map((r: any) => r.text).join('') ||
          data?.metadata?.channelMetadataRenderer?.vanityChannelUrl;

        subscriberCount =
          c4.subscriberCountText?.simpleText ||
          c4.subscriberCountText?.runs?.map((r: any) => r.text).join('');

        videoCount = c4.videosCountText?.runs?.map((r: any) => r.text).join('');
        description = data?.metadata?.channelMetadataRenderer?.description;
      } else {
        // Minimal header
        title =
          data?.metadata?.channelMetadataRenderer?.title ||
          data?.header?.pageHeaderRenderer?.pageTitle ||
          initialTitle ||
          'YouTube Channel';
        avatarUrl = data?.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.[0]?.url || defaultAvatar;
        description = data?.metadata?.channelMetadataRenderer?.description;
      }

      // Normalize URLs
      if (avatarUrl?.startsWith('//')) avatarUrl = `https:${avatarUrl}`;
      if (bannerUrl?.startsWith('//')) bannerUrl = `https:${bannerUrl}`;

      // ---- Parse Video Uploads ----
      let uploads: YouTubeVideoSearchResult[] = [];
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

      for (const tab of tabs) {
        const tr = tab?.tabRenderer;
        if (!tr) continue;

        // richGridRenderer (current YouTube format with lockupViewModel)
        const richItems = tr?.content?.richGridRenderer?.contents || [];
        if (richItems.length > 0) {
          uploads.push(...parseLockupViewModelUploads(richItems, title, avatarUrl, browseId));
        }

        // sectionListRenderer (legacy format with gridRenderer / videoRenderer)
        const sections = tr?.content?.sectionListRenderer?.contents || [];
        for (const sec of sections) {
          const isr = sec?.itemSectionRenderer;
          if (!isr) continue;
          for (const content of isr.contents || []) {
            const gridItems = content?.gridRenderer?.items || [];
            if (gridItems.length > 0) {
              uploads.push(...parseLegacyUploads(gridItems, title, avatarUrl, browseId));
            }
          }
        }
      }

      // If InnerTube tabs returned nothing, try RSS feed
      if (uploads.length === 0 && browseId.startsWith('UC')) {
        const rssRaw = await fetchChannelRssUploads(browseId, 20);
        if (rssRaw && rssRaw.length > 0) {
          uploads = rssRaw.map((raw, idx) => ({
            id: `yt_ch_${raw.videoId}`,
            videoId: raw.videoId,
            title: raw.title,
            author: title,
            channelId: browseId,
            channelAvatar: avatarUrl,
            duration: '3:30',
            durationSeconds: 210,
            viewCount: '',
            publishedTime: raw.publishedTime,
            thumbnail: raw.thumbnail,
            rank: idx + 1,
          }));
        }
      }

      return {
        channelId: browseId,
        title,
        handle,
        avatarUrl,
        bannerUrl,
        subscriberCount,
        videoCount,
        description,
        isVerified: true,
        uploads,
      };
    }
  } catch (err) {
    console.warn('[fetchYouTubeChannelDetails] InnerTube browse error:', err);
  }

  // Final fallback: RSS
  return await fetchFallbackRss(browseId, initialTitle, defaultAvatar);
}

/**
 * RSS-only fallback when InnerTube API fails completely.
 */
async function fetchFallbackRss(
  channelId: string,
  initialTitle: string | undefined,
  defaultAvatar: string
): Promise<YouTubeChannelDetails> {
  if (channelId.startsWith('UC')) {
    try {
      const rssRaw = await fetchChannelRssUploads(channelId, 20);
      if (rssRaw && rssRaw.length > 0) {
        const rssUploads: YouTubeVideoSearchResult[] = rssRaw.map((raw, idx) => ({
          id: `yt_ch_${raw.videoId}`,
          videoId: raw.videoId,
          title: raw.title,
          author: initialTitle || raw.author,
          channelId,
          channelAvatar: defaultAvatar,
          duration: '3:30',
          durationSeconds: 210,
          viewCount: '',
          publishedTime: raw.publishedTime,
          thumbnail: raw.thumbnail,
          rank: idx + 1,
        }));

        return {
          channelId,
          title: initialTitle || rssRaw[0]?.author || 'YouTube Channel',
          avatarUrl: defaultAvatar,
          uploads: rssUploads,
        };
      }
    } catch {}
  }

  return {
    channelId,
    title: initialTitle || 'YouTube Channel',
    avatarUrl: defaultAvatar,
    uploads: [],
  };
}
