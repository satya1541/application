/**
 * YouTube Community / Channel Posts Dynamic Extractor
 * Extracts all posts (text, images, attached videos, polls, timestamps, likes, comments)
 * from any YouTube channel using InnerTube API and token pagination.
 */

async function extractYouTubePosts(channelUrl, maxPosts = 50) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Ensure channel URL points to /posts or /community
  let targetUrl = channelUrl.trim();
  if (!targetUrl.endsWith('/posts') && !targetUrl.endsWith('/community')) {
    targetUrl = targetUrl.replace(/\/+$/, '') + '/posts';
  }

  const res = await fetch(targetUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch channel page: HTTP ${res.status}`);
  }

  const html = await res.text();
  const match =
    html.match(/ytInitialData\s*=\s*({.+?});<\/script>/) ||
    html.match(/var ytInitialData = ({.*?});<\/script>/) ||
    html.match(/ytInitialData\s*=\s*({.*?});/);

  if (!match) {
    throw new Error('Failed to find ytInitialData in response');
  }

  const data = JSON.parse(match[1]);

  const channelTitle =
    data.metadata?.channelMetadataRenderer?.title ||
    data.header?.c4TabbedHeaderRenderer?.title ||
    data.header?.pageHeaderRenderer?.pageTitle ||
    'YouTube Channel';

  const channelAvatar =
    data.metadata?.channelMetadataRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
    data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
    '';

  const posts = [];
  const seenPostIds = new Set();

  function parsePostRenderer(p) {
    if (!p || !p.postId || seenPostIds.has(p.postId)) return null;
    seenPostIds.add(p.postId);

    const text = p.contentText?.runs?.map((r) => r.text).join('') || '';
    const publishedTime = p.publishedTimeText?.runs?.map((r) => r.text).join('') || '';
    const likes = p.voteCount?.simpleText || p.voteCount?.runs?.[0]?.text || '0';
    const comments =
      p.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text?.simpleText ||
      p.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text?.runs?.[0]?.text ||
      '0';
    const author = p.authorText?.runs?.map((r) => r.text).join('') || channelTitle;
    const avatar = p.authorThumbnail?.thumbnails?.slice(-1)[0]?.url || channelAvatar;

    // Attachments (Images, Video, Poll)
    const images = [];
    let video = null;
    let poll = null;

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
          title: vr.title?.runs?.map((r) => r.text).join('') || vr.title?.simpleText || '',
          thumbnail: vr.thumbnail?.thumbnails?.slice(-1)[0]?.url,
          duration: vr.lengthText?.simpleText || '',
          views: vr.viewCountText?.simpleText || '',
          url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        };
      } else if (att.pollRenderer) {
        poll = {
          type: att.pollRenderer.type,
          choices: att.pollRenderer.choices?.map((c) => ({
            text: c.text?.runs?.map((r) => r.text).join('') || c.text?.simpleText || '',
            voteRatio: c.voteRatioIfVoted,
          })),
          totalVotes: att.pollRenderer.totalVotes?.runs?.map((r) => r.text).join('') || '',
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

  function processItems(items) {
    let nextContinuationToken = null;
    for (const item of items) {
      if (item.backstagePostThreadRenderer) {
        const postNode =
          item.backstagePostThreadRenderer.post?.backstagePostRenderer ||
          item.backstagePostThreadRenderer.post?.sharedPostRenderer;
        const parsed = parsePostRenderer(postNode);
        if (parsed) posts.push(parsed);
      }
      if (item.continuationItemRenderer) {
        nextContinuationToken =
          item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
      }
    }
    return nextContinuationToken;
  }

  // 1. Parse initial posts tab
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const postsTab = tabs.find(
    (t) =>
      t.tabRenderer?.title === 'Posts' ||
      t.tabRenderer?.title === 'Community' ||
      t.tabRenderer?.selected
  );

  const initialSections = postsTab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  let token = null;

  for (const s of initialSections) {
    const items = s.itemSectionRenderer?.contents || [];
    const t = processItems(items);
    if (t) token = t;
  }

  // 2. Paginate dynamically using InnerTube API while tokens exist and limit not reached
  let page = 1;
  while (token && posts.length < maxPosts) {
    page++;
    try {
      const nextRes = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
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
          continuation: token,
        }),
      });

      if (!nextRes.ok) break;
      const nextData = await nextRes.json();
      const actions = nextData.onResponseReceivedEndpoints || [];
      let foundItems = false;

      for (const act of actions) {
        const continuationItems =
          act.appendContinuationItemsAction?.continuationItems || [];
        if (continuationItems.length > 0) {
          foundItems = true;
          token = processItems(continuationItems);
        }
      }

      if (!foundItems) break;
    } catch (err) {
      console.warn(`Error on continuation page ${page}:`, err.message);
      break;
    }
  }

  return {
    channel: {
      title: channelTitle,
      avatar: channelAvatar,
      url: targetUrl,
    },
    totalExtracted: posts.length,
    posts: posts.slice(0, maxPosts),
  };
}

// If run directly via node
if (require.main === module) {
  const targetUrl = process.argv[2] || 'https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ/posts';
  const limit = parseInt(process.argv[3] || '20', 10);

  console.log(`Extracting posts from: ${targetUrl} (Limit: ${limit})...\n`);

  extractYouTubePosts(targetUrl, limit)
    .then((res) => {
      console.log(`Successfully extracted ${res.totalExtracted} posts from "${res.channel.title}":\n`);
      res.posts.forEach((p, i) => {
        console.log(`=======================================================`);
        console.log(`[#${i + 1}] Post ID: ${p.postId} | ${p.publishedTime}`);
        console.log(`Direct URL: ${p.url}`);
        console.log(`Likes: ${p.likes} | Comments: ${p.comments}`);
        if (p.text) {
          console.log(`Text:\n${p.text}\n`);
        }
        if (p.images.length > 0) {
          console.log(`Images (${p.images.length}):`);
          p.images.forEach((img, imgIdx) => console.log(`  [${imgIdx + 1}] ${img}`));
        }
        if (p.video) {
          console.log(`Attached Video: "${p.video.title}"`);
          console.log(`  URL: ${p.video.url}`);
          if (p.video.duration) console.log(`  Duration: ${p.video.duration}`);
        }
        if (p.poll) {
          console.log(`Attached Poll (${p.poll.totalVotes || 'active'}):`);
          p.poll.choices.forEach((c) => console.log(`  - ${c.text}`));
        }
      });
      console.log(`=======================================================`);
      console.log(`\nDone! Total ${res.totalExtracted} posts extracted.`);
    })
    .catch((err) => {
      console.error('Extraction failed:', err);
      process.exit(1);
    });
}

module.exports = { extractYouTubePosts };
