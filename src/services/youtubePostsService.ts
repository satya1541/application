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

export const MUSIC_AVATAR =
  'https://yt3.googleusercontent.com/M1Hbe-1uiAYWJI8-1ZzV3uf7MwoWcEmKAPbIivbKs3buggZcVLov91trUzy8y-96unrkOcv3oA=s900-c-k-c0x00ffffff-no-rj';

export function normalizeUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) {
    return 'https:' + trimmed;
  }
  return trimmed;
}

/**
 * Built-in initial seed posts guaranteeing instant 0ms rendering on cold start or offline mode.
 */
export const SEED_POSTS: YouTubePost[] = [
  {
    postId: 'Ugkxso-xFFNJ0K6jUuVXJ3KzYZJKotiWURKW',
    url: 'https://www.youtube.com/post/Ugkxso-xFFNJ0K6jUuVXJ3KzYZJKotiWURKW',
    author: 'YouTube Music',
    avatar: MUSIC_AVATAR,
    publishedTime: '1 year ago',
    text: 'It. Is. Here! Unlock and share your 2024 #YouTubeMusicRecap now https://yt.be/ZTpSn featuring top artists like @sabrinacarpenter @TeddySwims @officialcharlixcx @KarolG @Shaboozey and more!',
    likes: '70K',
    comments: '9.2K',
    images: [
      'https://yt3.ggpht.com/joLBV44E2n8INeol5HKkDua1PufX5ce1yyOckR40F3Pcw3bSPE_knfHTRGMauIxBn3LkZOefe6mRDw=s1080-c-fcrop64=1,00000000ffffffff-rw-nd-v1',
      'https://yt3.ggpht.com/jP6yYrwxGGi2SptYWFueezUW89ywJl36d1RepDNzQnySjJhUpEBhVaL9FfQw81unDgVS1t1ThzdRvA=s1080-c-fcrop64=1,00000000ffffffff-rw-nd-v1',
      'https://yt3.ggpht.com/_AXBvZC76JQZG8syGbbz8KAxPlVnIPr0YfoqxL_8qp_RzSE2vHS4dM4pGV9_F0A6RL_IGHeJehkg=s1080-c-fcrop64=1,00000000ffffffff-rw-nd-v1',
      'https://yt3.ggpht.com/AWvyqFELWRg8F6vQdOywT7rhBeu1jkd0cCjDK9Lv0NxNadIInorytEv6Yd0nR3R_R94tIfTfqoj0=s1080-c-fcrop64=1,00000000ffffffff-rw-nd-v1',
      'https://yt3.ggpht.com/LTzW6SYuBah_Gx9bnmXF7JCz0UNnpZ4Dowef6tmmS1FpVTZZmlwfHALcyvT2D1pXWGBtsgSL-LnL=s1080-c-fcrop64=1,00000000ffffffff-rw-nd-v1',
    ],
    video: null,
  },
  {
    postId: 'Ugkxfy3oJxdkn-rynetu7Bh8Ux_-o5IBx6BO',
    url: 'https://www.youtube.com/post/Ugkxfy3oJxdkn-rynetu7Bh8Ux_-o5IBx6BO',
    author: 'YouTube Music',
    avatar: MUSIC_AVATAR,
    publishedTime: '2 years ago',
    text: 'can you feel the love on Shorts? that’s bc @KarolG & @tiesto wanna see your #KarolGContigo challenge with their new song “Contigo” 💌',
    likes: '63K',
    comments: '6.9K',
    images: [
      'https://yt3.ggpht.com/3vnvrEMcXYjkrHrAtoX0TxwV91gQk34NTl8Isa2xLkHkwmTK4e80GQCIomIUb8oRcxImCqT3ajpi=s500-c-fcrop64=1,00000000ffffffff-nd-v1-rwa',
    ],
    video: null,
  },
  {
    postId: 'UgkxbZanHr8asvWt_NjOhhga6AMR8VpfZolj',
    url: 'https://www.youtube.com/post/UgkxbZanHr8asvWt_NjOhhga6AMR8VpfZolj',
    author: 'YouTube Music',
    avatar: MUSIC_AVATAR,
    publishedTime: '2 years ago',
    text: 'yaaaaa…that’s a no ♥️ join @dualipa & show off how you #DuaLipaHoudini on Shorts → https://yt.be/dualipa',
    likes: '38K',
    comments: '3.4K',
    images: [
      'https://yt3.ggpht.com/YKWnLSq7WJPlDqdulUapEYSCEF4MGvWjlRhFxYoSOTGBgPUagdKgWSoODumRJqDn0yC2Xj6njexs0Q=s648-c-fcrop64=1,00000000ffffffff-nd-v1-rwa',
    ],
    video: null,
  },
  {
    postId: 'Ugkx54XQBqOv1H4T8GkH23EpE_NR_Xyz-xEz',
    url: 'https://www.youtube.com/post/Ugkx54XQBqOv1H4T8GkH23EpE_NR_Xyz-xEz',
    author: 'YouTube Music',
    avatar: MUSIC_AVATAR,
    publishedTime: '3 years ago',
    text: 'OMG @NewJeans_official has our Attention with their new song #ImSuperShy 💕 check out the choreo and upload your own on Shorts! http://yt.be/ImSuperShy',
    likes: '54K',
    comments: '5K',
    images: [
      'https://yt3.ggpht.com/c-du6wE-3Tt1BWAzg7ppreJtvBTKTKkKqSRfmBnUMTJooL8T36-fAwGgOQwrbdLOdeduiq9DKIKVUw=s320-c-fcrop64=1,00000000ffffffff-nd-v1-rwa',
    ],
    video: null,
  },
  {
    postId: 'Ugkxlf6zPzGk8B4l4A9yXfQZ8mI-9kyTW8Zk',
    url: 'https://www.youtube.com/post/Ugkxlf6zPzGk8B4l4A9yXfQZ8mI-9kyTW8Zk',
    author: 'YouTube Music',
    avatar: MUSIC_AVATAR,
    publishedTime: '2 years ago',
    text: 'Global Music Spotlight: Dive into this week’s freshest chart toppers and trending releases on YouTube Music 🚀🎧',
    likes: '42K',
    comments: '4.1K',
    images: [
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1080',
    ],
    video: null,
  },
];

let inMemoryPostsCache: { timestamp: number; data: YouTubePostsResult } | null = null;

/**
 * Returns cached posts instantly if available (0ms instant UI rendering).
 * Falls back to built-in seed posts if no local cache exists yet.
 */
export async function getCachedYouTubePosts(): Promise<YouTubePostsResult> {
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

  const defaultResult: YouTubePostsResult = {
    channelTitle: 'YouTube Music',
    channelAvatar: MUSIC_AVATAR,
    posts: SEED_POSTS,
    continuationToken: null,
  };
  inMemoryPostsCache = { timestamp: Date.now(), data: defaultResult };
  return defaultResult;
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
  const rawAvatar = p.authorThumbnail?.thumbnails?.slice(-1)[0]?.url || channelAvatar || MUSIC_AVATAR;
  const avatar = normalizeUrl(rawAvatar) || MUSIC_AVATAR;

  // Attachments (Images, Video, Poll)
  const images: string[] = [];
  let video: YouTubePostVideo | null = null;
  let poll: YouTubePostPoll | null = null;

  const att = p.backstageAttachment;
  if (att) {
    if (att.backstageImageRenderer) {
      const url = att.backstageImageRenderer.image?.thumbnails?.slice(-1)[0]?.url;
      if (url) images.push(normalizeUrl(url));
    } else if (att.postMultiImageRenderer) {
      for (const imgItem of att.postMultiImageRenderer.images || []) {
        const url = imgItem.backstageImageRenderer?.image?.thumbnails?.slice(-1)[0]?.url;
        if (url) images.push(normalizeUrl(url));
      }
    } else if (att.videoRenderer) {
      const vr = att.videoRenderer;
      video = {
        videoId: vr.videoId,
        title: vr.title?.runs?.map((r: any) => r.text).join('') || vr.title?.simpleText || 'YouTube Video',
        thumbnail: normalizeUrl(vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || ''),
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
 * Fetches the latest community posts from YouTube channel.
 * Uses official YouTube InnerTube Browse API (pure JSON) as primary strategy,
 * which avoids Android webview/consent blocking in standalone APKs.
 */
export async function fetchYouTubePosts(
  channelUrl: string = DEFAULT_CHANNEL_URL,
  forceRefresh: boolean = false
): Promise<YouTubePostsResult> {
  // Check memory cache
  if (!forceRefresh && inMemoryPostsCache && Date.now() - inMemoryPostsCache.timestamp < CACHE_TTL_MS) {
    return inMemoryPostsCache.data;
  }

  // Extract channel ID or browseId
  let browseId = 'UC-9-kyTW8ZkZNDHQJ6FgpwQ';
  const channelIdMatch = channelUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelIdMatch) {
    browseId = channelIdMatch[1];
  }

  // Strategy 1: YouTube InnerTube API (Direct JSON, zero web scraping, works on Android APK)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240105.01.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240105.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId,
        params: 'EgVwb3N0c_IGBAoCSgA%3D', // InnerTube params for Community / Posts tab
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const channelTitle =
        data.metadata?.channelMetadataRenderer?.title ||
        data.header?.c4TabbedHeaderRenderer?.title ||
        data.header?.pageHeaderRenderer?.pageTitle?.text ||
        data.header?.pageHeaderRenderer?.pageTitle ||
        'YouTube Music';

      const rawChannelAvatar =
        data.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
        data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
        MUSIC_AVATAR;
      const channelAvatar = normalizeUrl(rawChannelAvatar) || MUSIC_AVATAR;

      const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      const postsTab = tabs.find(
        (t: any) =>
          t.tabRenderer?.selected ||
          t.tabRenderer?.title === 'Posts' ||
          t.tabRenderer?.title === 'Community'
      );

      const sections = postsTab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const seenIds = new Set<string>();
      const allPosts: YouTubePost[] = [];
      let continuationToken: string | null = null;

      for (const s of sections) {
        const items = s.itemSectionRenderer?.contents || [];
        const processed = processItems(items, channelTitle, channelAvatar, seenIds);
        allPosts.push(...processed.posts);
        if (processed.nextContinuationToken) {
          continuationToken = processed.nextContinuationToken;
        }
      }

      if (allPosts.length > 0) {
        const result: YouTubePostsResult = {
          channelTitle,
          channelAvatar,
          posts: allPosts,
          continuationToken,
        };
        inMemoryPostsCache = { timestamp: Date.now(), data: result };
        SafeStorage.setItem(CACHE_KEY, JSON.stringify(result)).catch(() => {});
        return result;
      }
    }
  } catch (innerErr) {
    console.warn('[youtubePostsService] InnerTube API error, attempting fallback:', innerErr);
  }

  // Strategy 2: Web scrape fallback
  try {
    let targetUrl = channelUrl.trim();
    if (!targetUrl.endsWith('/posts') && !targetUrl.endsWith('/community')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/posts';
    }

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (res.ok) {
      const html = await res.text();
      const match =
        html.match(/ytInitialData\s*=\s*({.+?});<\/script>/) ||
        html.match(/var ytInitialData = ({.*?});<\/script>/) ||
        html.match(/ytInitialData\s*=\s*({.*?});/);

      if (match) {
        const data = JSON.parse(match[1]);
        const channelTitle =
          data.metadata?.channelMetadataRenderer?.title ||
          data.header?.c4TabbedHeaderRenderer?.title ||
          'YouTube Music';
        const rawChannelAvatar =
          data.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
          data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
          MUSIC_AVATAR;
        const channelAvatar = normalizeUrl(rawChannelAvatar) || MUSIC_AVATAR;

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

        if (allPosts.length > 0) {
          const result: YouTubePostsResult = {
            channelTitle,
            channelAvatar,
            posts: allPosts,
            continuationToken,
          };
          inMemoryPostsCache = { timestamp: Date.now(), data: result };
          SafeStorage.setItem(CACHE_KEY, JSON.stringify(result)).catch(() => {});
          return result;
        }
      }
    }
  } catch (htmlErr) {
    console.warn('[youtubePostsService] HTML scrape fallback error:', htmlErr);
  }

  // Strategy 3: Check cached or seed posts
  return getCachedYouTubePosts();
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
        'X-YouTube-Client-Version': '2.20240105.01.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240105.01.00',
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
