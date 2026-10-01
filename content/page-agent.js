/**
 * Instagram Downloader -- page data reader (MAIN world).
 * Reads public page state, clones Instagram's own network responses, and
 * falls back to the current article DOM. Does not change page behavior.
 */
(function bootInstagramPageAgent() {
  'use strict';
  if (window.__INSTAGRAM_DOWNLOADER_PAGE_AGENT__) return;
  window.__INSTAGRAM_DOWNLOADER_PAGE_AGENT__ = true;
  window.__INSTAGRAM_DOWNLOADER_PAGE_AGENT_VERSION__ = 1;

  const Model = window.InstagramDownloaderModel;
  if (!Model) return;

  const SOURCE = 'instagram-downloader-page-agent';
  const CONTENT_SOURCE = 'instagram-downloader-content';
  const collected = { posts: new Map(), stories: [], creators: [], seen: new WeakSet(), count: 0 };
  const scannedScripts = new WeakSet();
  let initialHtmlScanned = false;
  const detailCache = new Map();
  const detailFailures = new Map();
  const resolveQueue = [];
  const resolveControllers = new Set();
  let resolveActive = 0;
  let resolveEpoch = 0;
  let hideFeedAds = false;
  let lastSnapshotJson = '';
  let lastUrl = location.href;
  let scheduled = 0;

  function ingest(data, extra) {
    if (!data) return;
    Model.collectFromJson(data, collected, extra || {});
    while (collected.posts.size > 400) collected.posts.delete(collected.posts.keys().next().value);
    if (collected.stories.length > 80) collected.stories = collected.stories.slice(-80);
  }

  function parseMaybeJson(value) {
    if (!value) return;
    if (typeof value === 'object') {
      ingest(value);
      return;
    }
    const raw = String(value).trim();
    if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return;
    try { ingest(JSON.parse(raw)); } catch (_) {}
  }

  function scanScripts() {
    const scripts = document.querySelectorAll('script');
    for (const node of scripts) {
      if (scannedScripts.has(node)) continue;
      scannedScripts.add(node);
      const type = String(node.type || '').toLowerCase();
      if (type === 'application/json' || node.id === '__additional_data' || /scheduledServerJS|additional-data/i.test(node.id || '')) {
        parseMaybeJson(node.textContent);
      }
    }
    if (window._sharedData) ingest(window._sharedData);
    if (window.__additionalData) ingest(window.__additionalData);
    if (!initialHtmlScanned && document.readyState !== 'loading') {
      initialHtmlScanned = true;
      Model.parseHtmlPayloads(document.documentElement?.innerHTML || '').forEach((payload) => ingest(payload));
    }
  }

  function currentArticle() {
    const articles = [...document.querySelectorAll('article, [role="dialog"] article, main [role="presentation"]')];
    let best = null;
    let bestScore = -1;
    articles.forEach((node) => {
      if (node.closest('#instagram-dl-root')) return;
      const rect = node.getBoundingClientRect();
      if (rect.height < 80 || rect.bottom < 80 || rect.top > window.innerHeight - 40) return;
      const score = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    });
    return best || document.querySelector('article');
  }

  function shortcodeFromDom(root) {
    const scope = root || document;
    const links = scope.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    for (const link of links) {
      const code = Model.shortcodeOf(link.href);
      if (code) return code;
    }
    return Model.shortcodeOf(location.href);
  }

  function candidatesFromImage(image, source) {
    if (!image) return [];
    const list = [];
    const push = (url, extra) => {
      const href = Model.allowedMediaUrl(url);
      if (!href || Model.looksLikeAvatar(href) || Model.STATIC_HINT.test(href)) return;
      list.push({
        url: href,
        mime: '',
        width: Number(extra?.width) || image.naturalWidth || 0,
        height: Number(extra?.height) || image.naturalHeight || 0,
        bitrate: 0,
        sizeBytes: 0,
        source: source || 'dom',
        backupUrls: []
      });
    };
    push(image.currentSrc || image.src, {});
    String(image.srcset || '').split(',').forEach((part) => {
      const bits = part.trim().split(/\s+/);
      const url = bits[0];
      const width = parseInt(bits[1], 10) || 0;
      push(url, { width, height: width ? Math.round(width * ((image.naturalHeight || 1) / (image.naturalWidth || 1))) : 0 });
      if (list.length) list[list.length - 1].source = 'srcset';
    });
    return list;
  }

  function domPost(route) {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.querySelector('video, img'));
    const article = currentArticle();
    const root = dialog || (article?.querySelector('video, img') ? article : null);
    if (!root) return null;
    const shortcode = route.shortcode || shortcodeFromDom(root);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100 && rect.bottom > 0 && rect.top < innerHeight;
    };
    const images = [...root.querySelectorAll('img')].filter((image) => {
      if (image.closest('#instagram-dl-root')) return false;
      const href = Model.httpsUrl(image.currentSrc || image.src);
      if (!href || Model.looksLikeAvatar(href) || Model.STATIC_HINT.test(href)) return false;
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      if (width && height && width < 120 && height < 120) return false;
      const alt = String(image.alt || '');
      if (/profile picture|头像/i.test(alt)) return false;
      return true;
    });
    const videos = [...root.querySelectorAll('video')].filter((video) => !video.closest('#instagram-dl-root') && visible(video));
    videos.sort((left, right) => {
      const area = (video) => { const rect = video.getBoundingClientRect(); return rect.width * Math.min(rect.bottom, innerHeight) - rect.width * Math.max(rect.top, 0); };
      return area(right) - area(left);
    });
    const currentVideos = route.kind === 'reel' || route.kind === 'post' ? videos.slice(0, 1) : videos;
    const card = shortcode ? [...document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')]
      .find((link) => Model.shortcodeOf(link.href) === shortcode) : null;
    const background = card?.querySelector('[style*="background-image"]')?.style.backgroundImage || '';
    const backgroundPoster = Model.allowedMediaUrl(background.match(/url\(["']?(.*?)["']?\)/)?.[1]);
    const metaPoster = Model.allowedMediaUrl(document.querySelector('meta[property="og:image"]')?.content);
    const poster = backgroundPoster || (!Model.looksLikeAvatar(metaPoster) ? metaPoster : '') || '';
    const media = [];
    const seen = new Set();
    function addMedia(type, node, candidates, poster) {
      const best = Model.pickBest(candidates, type === 'video' ? 'video' : 'image');
      if (!best && type !== 'video') return;
      const key = best?.url?.split('?')[0] || 'visible-video-' + media.length;
      if (seen.has(key)) return;
      seen.add(key);
      media.push({
        id: shortcode ? shortcode + '-' + (media.length + 1) : key.slice(-24),
        index: media.length + 1,
        type,
        width: best?.width || node?.videoWidth || node?.naturalWidth || 0,
        height: best?.height || node?.videoHeight || node?.naturalHeight || 0,
        duration: Number(node?.duration) > 0 && Number.isFinite(node.duration) ? node.duration : 0,
        posterUrl: poster || '',
        mime: type === 'video' ? 'video/mp4' : 'image/jpeg',
        imageCandidates: type === 'image' ? Model.sortImageCandidates(candidates) : Model.sortImageCandidates(poster ? [{
          url: poster, mime: 'image/jpeg', width: 0, height: 0, bitrate: 0, sizeBytes: 0, source: 'dom', backupUrls: []
        }] : []),
        videoCandidates: type === 'video' ? Model.sortVideoCandidates(candidates) : []
      });
    }
    currentVideos.forEach((video) => {
      const list = [];
      const src = Model.allowedMediaUrl(video.currentSrc || video.src);
      if (src) list.push({ url: src, mime: 'video/mp4', width: video.videoWidth || 0, height: video.videoHeight || 0, bitrate: 0, sizeBytes: 0, source: 'dom', backupUrls: [] });
      video.querySelectorAll('source').forEach((source) => {
        const href = Model.allowedMediaUrl(source.src);
        if (href) list.push({ url: href, mime: source.type || 'video/mp4', width: video.videoWidth || 0, height: video.videoHeight || 0, bitrate: 0, sizeBytes: 0, source: 'dom', backupUrls: [] });
      });
      addMedia('video', video, list, Model.allowedMediaUrl(video.poster) || poster);
    });
    if (!currentVideos.length) images.forEach((image) => addMedia('image', image, candidatesFromImage(image), Model.allowedMediaUrl(image.currentSrc || image.src)));
    if (!media.length) return null;
    const profileLink = root.querySelector('h2 a[href^="/"], a[href^="/"][role="link"]') || root.querySelector('a[href^="/"]');
    const username = route.username || Model.text(profileLink?.getAttribute('href'), 80).split('/').filter(Boolean)[0] || '';
    const metaDescription = document.querySelector('meta[property="og:description"]')?.content || '';
    const caption = Model.text(root.querySelector('h1, [data-testid="post-comment-root"]')?.textContent
      || metaDescription.match(/: ["“]([^"”]+)["”]/)?.[1] || '', 200);
    return {
      id: shortcode || media[0].id,
      shortcode: shortcode || '',
      pageUrl: location.href,
      title: Model.postTitle(caption, shortcode),
      caption,
      publishTime: '',
      isPartial: media.length > 1,
      kind: media.length > 1 ? 'carousel' : (route.kind === 'reel' || media[0].type === 'video' ? (route.kind === 'story' ? 'story' : 'reel') : 'image'),
      author: { id: '', username, displayName: username, avatar: '' },
      media
    };
  }

  function mergePost(target, extra) {
    if (!extra) return target;
    if (!target) return extra;
    const byId = new Map((target.media || []).map((item) => [item.id + ':' + item.index, item]));
    (extra.media || []).forEach((item) => {
      const key = item.id + ':' + item.index;
      const previous = byId.get(key);
      if (!previous || (item.videoCandidates?.length || item.imageCandidates?.length || 0) > (previous.videoCandidates?.length || previous.imageCandidates?.length || 0)) {
        byId.set(key, item);
      }
    });
    const media = [...byId.values()].sort((a, b) => (a.index || 0) - (b.index || 0));
    return {
      ...target,
      ...extra,
      media: media.length ? media : target.media,
      author: extra.author?.username ? extra.author : target.author
    };
  }

  function buildSnapshot() {
    const route = Model.routeFromUrl(location.href);
    scanScripts();
    const snapshot = Model.snapshotFromCollected(route, collected);
    if ((route.kind === 'post' || route.kind === 'reel' || route.kind === 'feed' || route.kind === 'story') && !snapshot.post) {
      const fallback = domPost(route);
      if (fallback) snapshot.post = fallback;
    } else if (snapshot.post) {
      const fallback = (route.kind === 'feed' || route.kind === 'post' || route.kind === 'reel') ? domPost(route) : null;
      if (fallback && fallback.shortcode && snapshot.post.shortcode && fallback.shortcode !== snapshot.post.shortcode) {
        if (route.kind === 'feed') snapshot.post = fallback;
      } else if (fallback && (!snapshot.post.media || snapshot.post.media.length < fallback.media.length)) {
        snapshot.post = mergePost(snapshot.post, fallback);
      }
    }
    if (route.kind === 'feed' && snapshot.post) snapshot.kind = snapshot.post.kind === 'reel' ? 'reel' : 'feed';
    if (route.kind === 'profile') snapshot.posts = [];
    snapshot.url = location.href;
    return snapshot;
  }

  function emit(force) {
    const payload = buildSnapshot();
    const json = JSON.stringify(payload);
    if (!force && json === lastSnapshotJson && location.href === lastUrl) return;
    lastSnapshotJson = json;
    lastUrl = location.href;
    window.postMessage({ source: SOURCE, version: 1, type: 'SNAPSHOT', payload }, location.origin);
  }

  function queueEmit() {
    if (scheduled) return;
    scheduled = 1;
    setTimeout(() => {
      scheduled = 0;
      emit();
    }, 180);
  }

  function installNetworkHooks() {
    const rawJsonParse = JSON.parse;
    // The first timeline is delivered in ScheduledServerJS JSON, without a
    // fetch/XHR request. Filter that exact schema before React consumes it.
    JSON.parse = function instagramParse(text, reviver) {
      const data = rawJsonParse.apply(this, arguments);
      if (hideFeedAds && typeof text === 'string' &&
          /xdt_api__v1__feed__timeline|edge_web_feed_timeline|xdt_injected_story_units/.test(text) &&
          Model.routeFromUrl(location.href).kind === 'feed') {
        Model.filterTimelineAds(data, false);
      }
      return data;
    };
    const filterText = (body, direct) => {
      const prefix = body.match(/^\s*for\s*\(\s*;;\s*\)\s*;/)?.[0] || '';
      let removed = 0;
      const lines = body.slice(prefix.length).split('\n').map((line) => {
        if (!line.trim()) return line;
        const data = rawJsonParse(line);
        const count = Model.filterTimelineAds(data, direct);
        removed += count;
        return count ? JSON.stringify(data) : line;
      });
      return removed ? prefix + lines.join('\n') : body;
    };
    const instagramRequest = (value) => {
      try {
        const url = new URL(String(value || ''), location.href);
        return /(^|\.)instagram\.com$/i.test(url.hostname) ? url : null;
      } catch (_) { return null; }
    };
    const rawFetch = window.fetch;
    if (typeof rawFetch === 'function' && !rawFetch.__instagramDownloaderHook) {
      const hooked = function patchedFetch(input, init) {
        const request = rawFetch.apply(this, arguments).then(async (response) => {
          const url = instagramRequest(input?.url || input);
          if (!hideFeedAds || Model.routeFromUrl(location.href).kind !== 'feed' || !url || !response.ok ||
              !/(?:json|javascript)/i.test(response.headers.get('content-type') || '')) return response;
          try {
            const original = await response.clone().text();
            const body = filterText(original, /\/api\/v1\/feed\/timeline\//.test(url.pathname));
            if (body === original) return response;
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            const filtered = new Response(body, { status: response.status, statusText: response.statusText, headers });
            Object.defineProperties(filtered, { url: { value: response.url }, redirected: { value: response.redirected }, type: { value: response.type } });
            return filtered;
          } catch (_) { return response; }
        });
        try {
          const url = instagramRequest(input?.url || input);
          if (url) {
            request.then((response) => {
              try {
                const clone = response.clone();
                const type = clone.headers.get('content-type') || '';
                if (/json/i.test(type)) clone.json().then((data) => { ingest(data); queueEmit(); }).catch(() => {});
                else if (/html/i.test(type) && /\/(p|reel)\//i.test(url.pathname)) {
                  clone.text().then((html) => {
                    Model.parseHtmlPayloads(html).forEach((payload) => ingest(payload));
                    queueEmit();
                  }).catch(() => {});
                }
              } catch (_) {}
            }).catch(() => {});
          }
        } catch (_) {}
        return request;
      };
      hooked.__instagramDownloaderHook = true;
      window.fetch = hooked;
    }
    // Filter the response at the getter, before either readyState or load handlers
    // pass it to React. Keep all non-timeline and non-JSON responses untouched.
    const transformXHR = (xhr, value) => {
      if (!hideFeedAds || xhr.readyState !== 4 || Model.routeFromUrl(location.href).kind !== 'feed') return value;
      const url = instagramRequest(xhr.__instagramDownloaderUrl);
      if (!url) return value;
      if (xhr.__instagramFilteredOriginal === value) return xhr.__instagramFilteredValue;
      try {
        if (typeof value === 'string') {
          const filtered = filterText(value, /\/api\/v1\/feed\/timeline\//.test(url.pathname));
          xhr.__instagramFilteredOriginal = value;
          xhr.__instagramFilteredValue = filtered;
          return filtered;
        }
        const data = rawJsonParse(JSON.stringify(value));
        if (!Model.filterTimelineAds(data, /\/api\/v1\/feed\/timeline\//.test(url.pathname))) return value;
        xhr.__instagramFilteredOriginal = value;
        xhr.__instagramFilteredValue = typeof value === 'string' ? JSON.stringify(data) : data;
        return xhr.__instagramFilteredValue;
      } catch (_) { return value; }
    };
    if (!XMLHttpRequest.prototype.__instagramDownloaderHook) {
      for (const name of ['response', 'responseText']) {
        const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name);
        if (!descriptor?.get || !descriptor.configurable) continue;
        Object.defineProperty(XMLHttpRequest.prototype, name, { ...descriptor, get() {
          const value = descriptor.get.call(this);
          if (name === 'response' && this.responseType && this.responseType !== 'json' && this.responseType !== 'text') return value;
          return transformXHR(this, value);
        } });
      }
    }
    const rawOpen = XMLHttpRequest.prototype.open;
    const rawSend = XMLHttpRequest.prototype.send;
    if (!XMLHttpRequest.prototype.__instagramDownloaderHook) {
      XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
        this.__instagramDownloaderUrl = String(url || '');
        this.__instagramFilteredOriginal = undefined;
        this.__instagramFilteredValue = undefined;
        return rawOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function patchedSend() {
        this.addEventListener('load', function onLoad() {
          try {
            const url = instagramRequest(this.__instagramDownloaderUrl);
            if (!url) return;
            parseMaybeJson(this.responseText);
            queueEmit();
          } catch (_) {}
        });
        return rawSend.apply(this, arguments);
      };
      XMLHttpRequest.prototype.__instagramDownloaderHook = true;
    }
  }

  function permalinkUrl(post) {
    const href = post?.pageUrl || post?.url;
    if (href && /^https:\/\/www\.instagram\.com\//i.test(href)) return href;
    const code = post?.shortcode || Model.shortcodeOf(href);
    if (!code) return '';
    const kind = post?.kind === 'reel' ? 'reel' : 'p';
    return 'https://www.instagram.com/' + kind + '/' + code + '/';
  }

  function resolvePost(input) {
    const url = permalinkUrl(input);
    if (!url) return Promise.resolve(null);
    const code = input.shortcode || Model.shortcodeOf(url);
    const captured = [...collected.posts.values()].find((post) => post.shortcode === code && post.media?.length && (!post.expectedMediaCount || post.media.length >= post.expectedMediaCount) && post.media.every((media) => (media.type === 'video' ? media.videoCandidates : media.imageCandidates)?.length));
    if (captured) return Promise.resolve(captured);
    const cached = detailCache.get(url);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return Promise.resolve(cached.post);
    if (cached) detailCache.delete(url);
    if (Date.now() - (detailFailures.get(url) || 0) < 20000) return Promise.resolve(null);
    if (typeof window.fetch !== 'function') return Promise.resolve(null);
    const controller = new AbortController();
    resolveControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      const local = { posts: new Map(), stories: [], creators: [], seen: new WeakSet(), count: 0 };
      Model.parseHtmlPayloads(html).forEach((payload) => {
        Model.collectFromJson(payload, local, { pageUrl: url });
        ingest(payload);
      });
      const route = Model.routeFromUrl(url);
      const snapshot = Model.snapshotFromCollected(route, local.posts.size ? local : collected);
      const post = [snapshot.post, ...local.posts.values()].find((item) => item?.shortcode === route.shortcode) || null;
      if (post) {
        detailCache.set(url, { post, at: Date.now() });
        while (detailCache.size > 30) detailCache.delete(detailCache.keys().next().value);
      }
      queueEmit();
      return post || null;
    }).catch(() => {
      detailFailures.set(url, Date.now());
      return null;
    }).finally(() => { clearTimeout(timeout); resolveControllers.delete(controller); });
  }

  function pumpResolve() {
    while (resolveActive < 2 && resolveQueue.length) {
      const job = resolveQueue.shift();
      if (!job) break;
      resolveActive += 1;
      resolvePost(job.post).then((post) => {
        window.postMessage({
          source: SOURCE,
          type: 'RESOLVE_RESULT',
          epoch: job.epoch,
          requestId: job.requestId,
          post
        }, location.origin);
      }).finally(() => {
        resolveActive -= 1;
        pumpResolve();
      });
    }
  }

  function hookHistory() {
    const wrap = (method) => {
      const raw = history[method];
      if (typeof raw !== 'function' || raw.__instagramDownloaderHook) return;
      const hooked = function patchedHistory() {
        const result = raw.apply(this, arguments);
        queueEmit();
        return result;
      };
      hooked.__instagramDownloaderHook = true;
      history[method] = hooked;
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', queueEmit);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== CONTENT_SOURCE) return;
    if (event.data.type === 'AD_SETTINGS') hideFeedAds = event.data.hideAds === true;
    if (event.data.type === 'GET_SNAPSHOT') emit(true);
    if (event.data.type === 'CANCEL_RESOLVE') {
      resolveQueue.length = 0;
      resolveControllers.forEach((controller) => controller.abort());
    }
    if (event.data.type === 'RESOLVE_POSTS') {
      resolveEpoch = Number(event.data.epoch) || resolveEpoch;
      (Array.isArray(event.data.posts) ? event.data.posts : []).forEach((post) => {
        resolveQueue.push({ post, epoch: resolveEpoch, requestId: event.data.requestId || '' });
      });
      pumpResolve();
    }
  });

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((item) =>
      item.nodeType === 1 && !item.closest?.('#instagram-dl-root, .ig-dl-post-entry') && item.id !== 'instagram-dl-root' && !item.classList?.contains('ig-dl-post-entry')))) queueEmit();
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

  installNetworkHooks();
  window.postMessage({ source: SOURCE, type: 'AD_SETTINGS_REQUEST' }, location.origin);
  hookHistory();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => emit(true), { once: true });
  else emit(true);
  setInterval(() => {
    if (location.href !== lastUrl) queueEmit();
  }, 500);
})();
