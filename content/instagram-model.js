(function initInstagramDownloaderModel(root) {
  'use strict';

  const AVATAR_HINT = /profile.?pic|profile.?photo|s150x150|s320x320|\/v\/t51\.\d+-19\//i;
  const STATIC_HINT = /\/static\/|\/rsrc\.php|instagram\.com\/accounts\//i;
  const THUMB_HINT = /s150x150|s240x240|s320x320|p150x150|stp=dst-jpg_e15|stp=dst-jpg_e35/i;

  function text(value, limit) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit || 500);
  }

  function httpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) return '';
    try {
      const url = new URL(raw, 'https://www.instagram.com/');
      if (url.protocol !== 'https:') return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function hostOf(value) {
    try { return new URL(value).hostname.toLowerCase(); } catch (_) { return ''; }
  }

  function isMediaHost(url) {
    const host = hostOf(url);
    if (!host) return false;
    if (host === 'www.instagram.com' || host === 'instagram.com') return false;
    return /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i.test(host);
  }

  function allowedMediaUrl(url) {
    const href = httpsUrl(url);
    return href && isMediaHost(href) ? href : '';
  }

  function looksLikeAvatar(url) {
    return AVATAR_HINT.test(String(url || ''));
  }

  function looksLikeThumb(url) {
    return THUMB_HINT.test(String(url || ''));
  }

  function shortcodeOf(value) {
    const raw = text(value, 80);
    if (/^[A-Za-z0-9_-]{5,15}$/.test(raw) && !/^\d+$/.test(raw)) return raw;
    const href = String(value || '');
    const match = href.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,15})/i);
    return match ? match[1] : '';
  }

  function idOf(value) {
    const raw = text(value, 80);
    if (/^\d+$/.test(raw)) return raw;
    const fromPk = String(value || '').split('_')[0];
    return /^\d+$/.test(fromPk) ? fromPk : '';
  }

  function unixTime(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '';
    const ms = num > 1e12 ? num : num * 1000;
    try { return new Date(ms).toISOString(); } catch (_) { return ''; }
  }

  function captionText(value) {
    if (!value) return '';
    if (typeof value === 'string') return String(value).replace(/\r/g, '').trim().slice(0, 2000);
    if (typeof value.text === 'string') return String(value.text).replace(/\r/g, '').trim().slice(0, 2000);
    const edges = value.edges || value.edge_media_to_caption?.edges;
    if (Array.isArray(edges) && edges[0]?.node?.text) return String(edges[0].node.text).replace(/\r/g, '').trim().slice(0, 2000);
    return '';
  }

  function postTitle(caption, id) {
    const line = text(String(caption || '').split(/\r?\n/)[0], 100);
    const cleaned = line.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || ('Instagram Post ' + (id || 'media'));
  }

  function authorFrom(node) {
    const user = node?.user || node?.owner || node?.author || {};
    return {
      id: idOf(user.pk || user.id) || text(user.pk || user.id, 80),
      username: text(user.username || user.unique_id, 80).replace(/^@/, ''),
      displayName: text(user.full_name || user.fullName || user.username, 120),
      avatar: allowedMediaUrl(user.profile_pic_url_hd || user.profile_pic_url || user.profilePicUrl) || httpsUrl(user.profile_pic_url)
    };
  }

  function candidate(url, extra) {
    const href = allowedMediaUrl(url);
    if (!href) return null;
    const width = Math.max(0, Number(extra?.width || extra?.config_width) || 0);
    const height = Math.max(0, Number(extra?.height || extra?.config_height) || 0);
    return {
      url: href,
      mime: text(extra?.mime || extra?.mime_type, 80),
      width,
      height,
      bitrate: Math.max(0, Number(extra?.bitrate) || 0),
      sizeBytes: Math.max(0, Number(extra?.sizeBytes || extra?.size) || 0),
      source: text(extra?.source, 40) || 'structured',
      backupUrls: []
    };
  }

  function dedupeCandidates(list) {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item?.url) return;
      const key = item.url.split('?')[0] + '|' + (item.width || 0) + '|' + (item.height || 0);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
    return result;
  }

  function area(item) {
    return (Number(item?.width) || 0) * (Number(item?.height) || 0);
  }

  function sortImageCandidates(list) {
    return dedupeCandidates(list).sort((a, b) => {
      const aThumb = looksLikeThumb(a.url) || looksLikeAvatar(a.url) ? 1 : 0;
      const bThumb = looksLikeThumb(b.url) || looksLikeAvatar(b.url) ? 1 : 0;
      if (aThumb !== bThumb) return aThumb - bThumb;
      const sourceRank = (item) => item.source === 'structured' ? 3 : item.source === 'srcset' ? 2 : 1;
      if (sourceRank(b) !== sourceRank(a)) return sourceRank(b) - sourceRank(a);
      if (area(b) !== area(a)) return area(b) - area(a);
      return Math.max(b.width, b.height) - Math.max(a.width, a.height);
    });
  }

  function sortVideoCandidates(list) {
    return dedupeCandidates(list).sort((a, b) => {
      const sourceRank = (item) => item.source === 'structured' ? 2 : 1;
      if (area(b) !== area(a)) return area(b) - area(a);
      if ((b.bitrate || 0) !== (a.bitrate || 0)) return (b.bitrate || 0) - (a.bitrate || 0);
      if (sourceRank(b) !== sourceRank(a)) return sourceRank(b) - sourceRank(a);
      return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    });
  }

  function pickBest(list, kind) {
    const sorted = kind === 'video' ? sortVideoCandidates(list) : sortImageCandidates(list);
    if (!sorted.length) return null;
    const primary = { ...sorted[0], backupUrls: sorted.slice(1).map((item) => item.url).filter(Boolean).slice(0, 12) };
    return primary;
  }

  function imageCandidatesFromApi(node, source) {
    const list = [];
    const versions = node?.image_versions2?.candidates || node?.image_versions2?.additional_candidates;
    const extras = [];
    if (Array.isArray(node?.image_versions2?.candidates)) extras.push(...node.image_versions2.candidates);
    if (node?.image_versions2?.additional_candidates?.igtv_first_frame) extras.push(node.image_versions2.additional_candidates.igtv_first_frame);
    if (Array.isArray(versions)) extras.push(...(Array.isArray(versions) ? versions : []));
    extras.forEach((item) => {
      const next = candidate(item?.url, { ...item, source: source || 'structured' });
      if (next) list.push(next);
    });
    ['display_url', 'display_src', 'thumbnail_src', 'thumbnail_url', 'image_url'].forEach((key) => {
      const next = candidate(node?.[key], { width: node?.original_width || node?.width, height: node?.original_height || node?.height, source: source || 'structured' });
      if (next) list.push(next);
    });
    (Array.isArray(node?.display_resources) ? node.display_resources : []).forEach((item) => {
      const next = candidate(item?.src, { width: item?.config_width, height: item?.config_height, source: source || 'structured' });
      if (next) list.push(next);
    });
    return sortImageCandidates(list);
  }

  function videoCandidatesFromApi(node, source) {
    const list = [];
    (Array.isArray(node?.video_versions) ? node.video_versions : []).forEach((item) => {
      const next = candidate(item?.url, { ...item, mime: 'video/mp4', source: source || 'structured' });
      if (next) list.push(next);
    });
    ['video_url', 'video_dash_manifest'].forEach((key) => {
      if (key === 'video_dash_manifest') return;
      const next = candidate(node?.[key], { width: node?.original_width, height: node?.original_height, mime: 'video/mp4', source: source || 'structured' });
      if (next) list.push(next);
    });
    (Array.isArray(node?.video_resources) ? node.video_resources : []).forEach((item) => {
      const next = candidate(item?.src || item?.url, { width: item?.config_width, height: item?.config_height, mime: 'video/mp4', source: source || 'structured' });
      if (next) list.push(next);
    });
    return sortVideoCandidates(list);
  }

  function mediaTypeOf(node, fallback) {
    if (fallback) return fallback;
    if (Number(node?.media_type) === 2 || node?.is_video === true || text(node?.__typename).toLowerCase().includes('video')) return 'video';
    if (Number(node?.media_type) === 1) return 'image';
    if (videoCandidatesFromApi(node).length) return 'video';
    return 'image';
  }

  function pageKindOf(node, routeKind) {
    const product = text(node?.product_type || node?.media_product_type).toLowerCase();
    if (routeKind === 'story' || product === 'story') return 'story';
    if (routeKind === 'reel' || product === 'clips' || product === 'reels' || product === 'igtv') return 'reel';
    const children = node?.carousel_media || node?.edge_sidecar_to_children?.edges;
    if ((Array.isArray(children) && children.length > 1) || Number(node?.media_type) === 8 || text(node?.__typename).includes('Sidecar')) return 'carousel';
    if (mediaTypeOf(node) === 'video') return routeKind === 'reel' ? 'reel' : 'video';
    return 'image';
  }

  function makeMediaItem(node, index, source) {
    const type = mediaTypeOf(node);
    const images = imageCandidatesFromApi(node, source);
    const videos = type === 'video' ? videoCandidatesFromApi(node, source) : [];
    const bestImage = pickBest(images, 'image');
    const bestVideo = pickBest(videos, 'video');
    const width = Number(node?.original_width || node?.dimensions?.width || bestVideo?.width || bestImage?.width) || 0;
    const height = Number(node?.original_height || node?.dimensions?.height || bestVideo?.height || bestImage?.height) || 0;
    const id = idOf(node?.pk || node?.id) || text(node?.id, 80) || String(index);
    return {
      id,
      index,
      type,
      width,
      height,
      duration: Number(node?.video_duration || node?.video_dash_manifest && 0) || Number(node?.duration) || 0,
      posterUrl: bestImage?.url || '',
      mime: type === 'video' ? 'video/mp4' : (bestImage?.mime || 'image/jpeg'),
      imageCandidates: images,
      videoCandidates: videos
    };
  }

  function sidecarNodes(node) {
    if (Array.isArray(node?.carousel_media) && node.carousel_media.length) return node.carousel_media;
    const edges = node?.edge_sidecar_to_children?.edges;
    if (Array.isArray(edges) && edges.length) return edges.map((edge) => edge?.node).filter(Boolean);
    return null;
  }

  function isMediaNode(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    return Boolean(
      node.image_versions2 || node.video_versions || node.carousel_media
      || node.display_url || node.video_url || node.edge_sidecar_to_children
      || node.display_resources || (node.code && (node.media_type || node.user || node.owner))
      || (node.shortcode && (node.display_url || node.is_video != null || node.edge_sidecar_to_children))
    );
  }

  function makePost(node, extras) {
    if (!isMediaNode(node) && !sidecarNodes(node)) return null;
    const children = sidecarNodes(node);
    const parentIsCarousel = Array.isArray(children) && children.length > 0;
    const source = extras?.source || 'structured';
    const media = parentIsCarousel
      ? children.map((child, index) => makeMediaItem(child, index + 1, source))
      : [makeMediaItem(node, 1, source)];
    const valid = parentIsCarousel ? media : media.filter((item) => item.videoCandidates.length || item.imageCandidates.length);
    if (!valid.length) return null;
    const author = authorFrom(node);
    const shortcode = shortcodeOf(node.code || node.shortcode || extras?.shortcode);
    const id = idOf(node.pk || node.id) || shortcode;
    if (!id && !shortcode) return null;
    const caption = captionText(node.caption || node.edge_media_to_caption);
    const kind = pageKindOf(node, extras?.routeKind);
    const pageUrl = extras?.pageUrl || (shortcode
      ? ('https://www.instagram.com/' + (kind === 'reel' ? 'reel' : 'p') + '/' + shortcode + '/')
      : '');
    return {
      id,
      shortcode,
      pageUrl,
      title: postTitle(caption, shortcode || id),
      caption,
      publishTime: unixTime(node.taken_at || node.taken_at_timestamp || node.device_timestamp),
      kind: kind === 'carousel' || valid.length > 1 ? (kind === 'reel' ? 'reel' : valid.length > 1 ? 'carousel' : kind) : kind,
      author,
      authors: [author, ...(Array.isArray(node.coauthor_producers) ? node.coauthor_producers : []).map((user) => authorFrom({ user }))].filter((item, index, list) => item.username && list.findIndex((other) => other.username.toLowerCase() === item.username.toLowerCase()) === index),
      expectedMediaCount: Math.max(valid.length, Number(node.carousel_media_count || node.edge_sidecar_to_children?.count) || 0),
      media: valid
    };
  }

  function downloadKey(postId, media) {
    const type = media?.type === 'video' ? 'video' : 'image';
    if (media?.id) return [postId || '', media.id, type].join(':');
    return [postId || '', Number(media?.index) || 1, type].join(':');
  }

  function padIndex(index, total) {
    const width = Math.max(2, String(Math.max(1, Number(total) || 1)).length);
    return String(Math.max(1, Number(index) || 1)).padStart(width, '0');
  }

  function templateHasIndex(template) {
    return /\{index\}/i.test(String(template || ''));
  }

  function withAutoIndex(filename, index, total, template) {
    if ((Number(total) || 1) <= 1 || templateHasIndex(template)) return filename;
    const raw = String(filename || '');
    const match = raw.match(/\.([a-z0-9]{1,8})$/i);
    const ext = match ? match[0] : '';
    const base = ext ? raw.slice(0, -ext.length) : raw;
    if (new RegExp('[-_ ]0*' + Number(index) + '$').test(base)) return filename;
    return base.replace(/[. ]+$/g, '') + ' - ' + padIndex(index, total) + ext;
  }

  function folderPrefix(prefs, post) {
    const parts = [];
    if (prefs?.creatorFolders && post?.author?.username) parts.push(text(post.author.username, 60));
    if (prefs?.carouselFolders && (post?.media?.length || 0) > 1) parts.push(text(post.shortcode || post.id, 40));
    return parts.length ? ('Instagram Downloads/' + parts.join('/') + '/') : '';
  }

  function collectFromJson(data, into, extras) {
    const posts = into?.posts || new Map();
    const stories = into?.stories || [];
    const creators = into?.creators || [];
    const seen = into?.seen || new WeakSet();
    const extrasSafe = extras || {};
    let count = extrasSafe.count || 0;
    function walk(node, depth) {
      if (count > 8000 || depth > 22 || !node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);
      count += 1;
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, depth + 1));
        return;
      }
      if (Array.isArray(node.reels_media)) {
        node.reels_media.forEach((reel) => {
          const user = authorFrom(reel);
          (Array.isArray(reel.items) ? reel.items : []).forEach((item, index) => {
            const post = makePost(item, { routeKind: 'story', source: 'structured' });
            if (!post) return;
            post.kind = 'story';
            post.author = post.author?.username ? post.author : user;
            post.media.forEach((media) => { media.index = index + 1; });
            stories.push(post);
          });
        });
      }
      if (isMediaNode(node)) {
        const post = makePost(node, extrasSafe);
        if (post) {
          const key = post.shortcode || post.id;
          const previous = posts.get(key);
          const score = (item) => (item?.media?.length || 0) * 10
            + (item?.media || []).reduce((total, media) => total + (media.videoCandidates?.length || 0) * 3 + (media.imageCandidates?.length || 0), 0);
          if (!previous || score(post) > score(previous)) posts.set(key, post);
        }
      }
      const user = node.user || node.owner;
      if (user && (user.username || user.full_name) && (user.profile_pic_url || user.id || user.pk)) {
        const author = authorFrom(node);
        if (author.username) creators.push(author);
      }
      Object.keys(node).forEach((key) => {
        if (key === 'carousel_media' || key === 'edge_sidecar_to_children') return;
        walk(node[key], depth + 1);
      });
    }
    walk(data, 0);
    into.posts = posts;
    into.stories = stories;
    into.creators = creators;
    into.seen = seen;
    into.count = count;
    return into;
  }

  function parseHtmlPayloads(html) {
    const payloads = [];
    const source = String(html || '');
    const patterns = [
      /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
      /<script[^>]*id=["']__additional_data["'][^>]*>([\s\S]*?)<\/script>/gi
    ];
    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(source))) {
        try { payloads.push(JSON.parse(match[1])); } catch (_) {}
      }
    });
    const shared = source.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});/);
    if (shared) {
      try { payloads.push(JSON.parse(shared[1])); } catch (_) {}
    }
    return payloads;
  }

  function routeFromUrl(href) {
    let url;
    try { url = new URL(String(href || ''), 'https://www.instagram.com/'); } catch (_) { return { kind: 'unsupported', url: String(href || '') }; }
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 3 && !['p', 'reel', 'reels', 'stories', 'explore'].includes(parts[0])
      && (parts[1] === 'p' || parts[1] === 'reel' || parts[1] === 'reels')) {
      return { kind: parts[1] === 'p' ? 'post' : 'reel', shortcode: parts[2], username: decodeURIComponent(parts[0]), url: url.href };
    }
    if (parts[0] === 'p' && parts[1]) return { kind: 'post', shortcode: parts[1], url: url.href };
    if ((parts[0] === 'reel' || parts[0] === 'reels' || parts[0] === 'tv') && parts[1] && parts[1] !== 'audio') {
      return { kind: 'reel', shortcode: parts[1], url: url.href };
    }
    if (parts[0] === 'stories' && parts[1]) {
      return { kind: 'story', username: decodeURIComponent(parts[1]), storyId: parts[2] || '', url: url.href };
    }
    if (['explore', 'accounts', 'direct', 'live', 'reels'].includes(parts[0]) && !parts[1]) {
      return { kind: parts[0] === 'reels' || parts[0] === 'explore' ? 'feed' : 'unsupported', url: url.href };
    }
    if (!parts.length) return { kind: 'feed', url: url.href };
    if (['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal'].includes(parts[0])) {
      return { kind: 'unsupported', url: url.href };
    }
    return { kind: 'profile', username: decodeURIComponent(parts[0]), url: url.href };
  }

  function snapshotFromCollected(route, collected) {
    const posts = [...(collected.posts || new Map()).values()];
    const stories = collected.stories || [];
    const creator = route.username
      ? (collected.creators || []).find((item) => item.username?.toLowerCase() === route.username.toLowerCase()) || null
      : collected.creators?.[0] || null;
    if (route.kind === 'post' || route.kind === 'reel') {
      const post = posts.find((item) => item.shortcode === route.shortcode) || null;
      if (!post) return { kind: route.kind, url: route.url, reason: 'unrecognized', post: null, creator, stories: [] };
      if (route.kind === 'reel') post.kind = post.media?.some((item) => item.type === 'video') ? 'reel' : post.kind;
      return { kind: route.kind, url: route.url, post, creator: post.author || creator, stories: [] };
    }
    if (route.kind === 'story') {
      const matched = stories.filter((item) => !route.username || item.author?.username?.toLowerCase() === route.username.toLowerCase());
      const current = matched.find((item) => !route.storyId || item.id === route.storyId || item.media?.[0]?.id === route.storyId) || matched[0] || null;
      return { kind: 'story', url: route.url, post: current, stories: matched, creator: current?.author || creator };
    }
    if (route.kind === 'profile') {
      return {
        kind: 'profile',
        url: route.url,
        creator: creator || { username: route.username, displayName: route.username, id: '', avatar: '' },
        posts: posts.filter((item) => item.author?.username?.toLowerCase() === String(route.username || '').toLowerCase()),
        stories: []
      };
    }
    if (route.kind === 'feed') {
      const post = posts[0] || null;
      return { kind: 'feed', url: route.url, post, creator: post?.author || creator, stories: [] };
    }
    return { kind: 'unsupported', url: route.url, reason: 'unsupported', post: null, creator, stories: [] };
  }

  function filterTimelineAds(payload, directTimeline) {
    let removed = 0;
    const isAd = (item) => {
      const node = item?.node || item;
      const unit = node?.explore_story || node;
      const media = unit?.media || node?.media || node;
      return media?.is_ad === true || media?.is_sponsored === true || Boolean(media?.ad_id) ||
        Boolean(node?.ad_id) || Boolean(node?.ad) || Boolean(unit?.ad) || Boolean(node?.ad4ad_in_webfeed);
    };
    const filter = (items) => items.filter((item) => { if (!isAd(item)) return true; removed += 1; return false; });
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 24) return;
      if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (/^(?:xdt_api__v1__feed__timeline(?:__connection)?|edge_web_feed_timeline|feed_timeline)$/.test(key) && value && typeof value === 'object') {
          if (Array.isArray(value.edges)) value.edges = filter(value.edges);
          if (Array.isArray(value.items)) value.items = filter(value.items);
          if (Array.isArray(value.feed_items)) value.feed_items = filter(value.feed_items);
        } else if (key === 'xdt_injected_story_units' && value && Array.isArray(value.ad_media_items)) {
          removed += value.ad_media_items.length;
          value.ad_media_items = [];
        } else if (key === 'feed_items' && Array.isArray(value)) node[key] = filter(value);
        else if (['data', 'user', 'viewer', 'require', '__bbox', 'result'].includes(key)) visit(value, depth + 1);
      }
    };
    visit(payload, 0);
    if (directTimeline && Array.isArray(payload?.items)) payload.items = filter(payload.items);
    return removed;
  }

  const api = {
    filterTimelineAds,
    text,
    httpsUrl,
    allowedMediaUrl,
    isMediaHost,
    looksLikeAvatar,
    looksLikeThumb,
    shortcodeOf,
    idOf,
    captionText,
    postTitle,
    authorFrom,
    pickBest,
    sortImageCandidates,
    sortVideoCandidates,
    makePost,
    makeMediaItem,
    downloadKey,
    padIndex,
    templateHasIndex,
    withAutoIndex,
    folderPrefix,
    collectFromJson,
    parseHtmlPayloads,
    routeFromUrl,
    snapshotFromCollected,
    STATIC_HINT
  };

  root.InstagramDownloaderModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
