import { SafeStorage } from './storage';

export interface YouTubePostVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  url: string;
}

export interface YouTubePostPollChoice {
  text: string;
  voteRatio?: number;
}

export interface YouTubePostPoll {
  type?: string;
  choices: YouTubePostPollChoice[];
  totalVotes?: string;
}

export interface YouTubePost {
  postId: string;
  url: string;
  author: string;
  avatar: string;
  publishedTime: string;
  text: string;
  likes: string;
  comments: string;
  images: string[];
  video?: YouTubePostVideo | null;
  poll?: YouTubePostPoll | null;
}

export interface YouTubePostsResult {
  channelTitle: string;
  channelAvatar: string;
  posts: YouTubePost[];
  continuationToken: string | null;
}

const DEFAULT_CHANNEL_URL = 'https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ/posts';
const CACHE_KEY = '@deluxe_yt_posts_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let inMemoryPostsCache: { timestamp: number; data: YouTubePostsResult } | null = null;

/**
 * Returns cached posts instantly if available (0ms instant UI rendering).
 */
export async function getCachedYouTubePosts(): Promise<YouTubePostsResult | null> {
  if (inMemoryPostsCache && inMemoryPostsCache.data.posts.length > 0) {
    return inMemoryPostsCache.data;
  }
  try {
    const raw = await SafeStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as YouTubePostsResult;
      if (parsed && Array.isArray(parsed.posts) && parsed.posts.length > 0) {
        inMemoryPostsCache = { timestamp: Date.now(), data: parsed };
        return parsed;
      }
    }
  } catch {}
  return null;
}

function parsePostRenderer(
  p: any,
  channelTitle: string,
  channelAvatar: string,
  seenPostIds: Set<string>
): YouTubePost | null {
  if (!p || !p.postId || seenPostIds.has(p.postId)) return null;
  seenPostIds.add(p.postId);

  const text = p.contentText?.runs?.map((r: any) => r.text).join('') || '';
  const publishedTime = p.publishedTimeText?.runs?.map((r: any) => r.text).join('') || '';
  const likes = p.voteCount?.simpleText || p.voteCount?.runs?.[0]?.text || '0';
  const comments =
    p.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text?.simpleText ||
    p.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text?.runs?.[0]?.text ||
    '0';
  const author = p.authorText?.runs?.map((r: any) => r.text).join('') || channelTitle;
  const avatar = p.authorThumbnail?.thumbnails?.slice(-1)[0]?.url || channelAvatar;

  // Attachments (Images, Video, Poll)
  const images: string[] = [];
  let video: YouTubePostVideo | null = null;
  let poll: YouTubePostPoll | null = null;

  const att = p.backstageAttachment;
  if (att) {
    if (att.backstageImageRenderer) {
      const url = att.backstageImageRenderer.image?.thumbnails?.slice(-1)[0]?.url;
      if (url) images.push(url);
    } else if (att.postMultiImageRenderer) {
      for (const imgItem of att.postMultiImageRenderer.images || []) {
        const url = imgItem.backstageImageRenderer?.image?.thumbnails?.slice(-1)[0]?.url;
        if (url) images.push(url);
      }
    } else if (att.videoRenderer) {
      const vr = att.videoRenderer;
      video = {
        videoId: vr.videoId,
        title: vr.title?.runs?.map((r: any) => r.text).join('') || vr.title?.simpleText || 'YouTube Video',
        thumbnail: vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
        duration: vr.lengthText?.simpleText || '',
        views: vr.viewCountText?.simpleText || '',
        url: `https://www.youtube.com/watch?v=${vr.videoId}`,
      };
    } else if (att.pollRenderer) {
      poll = {
        type: att.pollRenderer.type,
        choices: att.pollRenderer.choices?.map((c: any) => ({
          text: c.text?.runs?.map((r: any) => r.text).join('') || c.text?.simpleText || '',
          voteRatio: c.voteRatioIfVoted,
        })),
        totalVotes: att.pollRenderer.totalVotes?.runs?.map((r: any) => r.text).join('') || '',
      };
    }
  }

  return {
    postId: p.postId,
    url: `https://www.youtube.com/post/${p.postId}`,
    author,
    avatar,
    publishedTime,
    text,
    likes,
    comments,
    images,
    video,
    poll,
  };
}

function processItems(items: any[], channelTitle: string, channelAvatar: string, seenIds: Set<string>) {
  const posts: YouTubePost[] = [];
  let nextContinuationToken: string | null = null;

  for (const item of items) {
    if (item.backstagePostThreadRenderer) {
      const postNode =
        item.backstagePostThreadRenderer.post?.backstagePostRenderer ||
        item.backstagePostThreadRenderer.post?.sharedPostRenderer;
      const parsed = parsePostRenderer(postNode, channelTitle, channelAvatar, seenIds);
      if (parsed) posts.push(parsed);
    }
    if (item.continuationItemRenderer) {
      nextContinuationToken =
        item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
    }
  }

  return { posts, nextContinuationToken };
}

/**
 * Fetches the latest community posts from YouTube Music channel.
 * Implements Stale-While-Revalidate with SafeStorage.
 */
export async function fetchYouTubePosts(
  channelUrl: string = DEFAULT_CHANNEL_URL,
  forceRefresh: boolean = false
): Promise<YouTubePostsResult> {
  // Check memory cache
  if (!forceRefresh && inMemoryPostsCache && Date.now() - inMemoryPostsCache.timestamp < CACHE_TTL_MS) {
    return inMemoryPostsCache.data;
  }

  // Ensure channel URL points to /posts or /community
  let targetUrl = channelUrl.trim();
  if (!targetUrl.endsWith('/posts') && !targetUrl.endsWith('/community')) {
    targetUrl = targetUrl.replace(/\/+$/, '') + '/posts';
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      const cached = await getCachedYouTubePosts();
      if (cached) return cached;
      throw new Error(`Failed to fetch channel posts: HTTP ${res.status}`);
    }

    const html = await res.text();
    const match =
      html.match(/ytInitialData\s*=\s*({.+?});<\/script>/) ||
      html.match(/var ytInitialData = ({.*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({.*?});/);

    if (!match) {
      const cached = await getCachedYouTubePosts();
      if (cached) return cached;
      throw new Error('Could not parse ytInitialData from YouTube response');
    }

    const data = JSON.parse(match[1]);

    const channelTitle =
      data.metadata?.channelMetadataRenderer?.title ||
      data.header?.c4TabbedHeaderRenderer?.title ||
      data.header?.pageHeaderRenderer?.pageTitle ||
      'YouTube Music';

    const channelAvatar =
      data.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
      data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
      'https://yt3.googleusercontent.com/M1Hbe-1uiAYWJI8-1ZzV3uf7MwoWcEmKAPbIivbKs3buggZcVLov91trUzy8y-96unrkOcv3oA=s900-c-k-c0x00ffffff-no-rj';

    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const postsTab = tabs.find(
      (t: any) =>
        t.tabRenderer?.title === 'Posts' ||
        t.tabRenderer?.title === 'Community' ||
        t.tabRenderer?.selected
    );

    const initialSections = postsTab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const seenIds = new Set<string>();
    const allPosts: YouTubePost[] = [];
    let continuationToken: string | null = null;

    for (const s of initialSections) {
      const items = s.itemSectionRenderer?.contents || [];
      const processed = processItems(items, channelTitle, channelAvatar, seenIds);
      allPosts.push(...processed.posts);
      if (processed.nextContinuationToken) {
        continuationToken = processed.nextContinuationToken;
      }
    }

    const result: YouTubePostsResult = {
      channelTitle,
      channelAvatar,
      posts: allPosts,
      continuationToken,
    };

    if (allPosts.length > 0) {
      inMemoryPostsCache = { timestamp: Date.now(), data: result };
      SafeStorage.setItem(CACHE_KEY, JSON.stringify(result)).catch(() => {});
    }

    return result;
  } catch (err) {
    console.warn('[youtubePostsService] Failed to fetch live posts:', err);
    const cached = await getCachedYouTubePosts();
    if (cached) return cached;
    return {
      channelTitle: 'YouTube Music',
      channelAvatar: '',
      posts: [],
      continuationToken: null,
    };
  }
}

/**
 * Loads the next page of community posts using an InnerTube continuation token.
 */
export async function fetchNextYouTubePosts(
  continuationToken: string,
  channelTitle: string = 'YouTube Music',
  channelAvatar: string = '',
  seenIds: Set<string> = new Set()
): Promise<{ posts: YouTubePost[]; nextContinuationToken: string | null }> {
  if (!continuationToken) {
    return { posts: [], nextContinuationToken: null };
  }

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240101.00.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        continuation: continuationToken,
      }),
    });

    if (!res.ok) {
      return { posts: [], nextContinuationToken: null };
    }

    const data = await res.json();
    const actions = data.onResponseReceivedEndpoints || [];
    const newPosts: YouTubePost[] = [];
    let nextToken: string | null = null;

    for (const act of actions) {
      const continuationItems = act.appendContinuationItemsAction?.continuationItems || [];
      if (continuationItems.length > 0) {
        const processed = processItems(continuationItems, channelTitle, channelAvatar, seenIds);
        newPosts.push(...processed.posts);
        if (processed.nextContinuationToken) {
          nextToken = processed.nextContinuationToken;
        }
      }
    }

    return { posts: newPosts, nextContinuationToken: nextToken };
  } catch (err) {
    console.warn('[youtubePostsService] Error fetching continuation page:', err);
    return { posts: [], nextContinuationToken: null };
  }
}
