import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ globalThis: {}, console, URL, Map, Set, WeakSet, Array, Object, String, Number, Date, Math, JSON, module: { exports: {} } });
context.globalThis = context;
vm.runInContext(readFileSync(path.join(root, 'content', 'instagram-model.js'), 'utf8'), context, { filename: 'instagram-model.js' });
const Model = context.InstagramDownloaderModel;

const image = (url, width, height) => ({ url, width, height });
const video = (url, width, height) => ({ url, width, height, type: 101 });

const singleImage = {
  pk: '111',
  id: '111_1',
  code: 'ABCDE1',
  media_type: 1,
  taken_at: 1700000000,
  user: { pk: '9', username: 'alice', full_name: 'Alice', profile_pic_url: 'https://scontent.cdninstagram.com/v/t51.2885-19/avatar.jpg' },
  caption: { text: 'Hello from a photo\nsecond line' },
  original_width: 1440,
  original_height: 1800,
  image_versions2: {
    candidates: [
      image('https://scontent.cdninstagram.com/v/t51.2885-15/s320x320/small.jpg', 320, 400),
      image('https://scontent.cdninstagram.com/v/t51.2885-15/full.jpg', 1440, 1800)
    ]
  }
};

const singleVideo = {
  pk: '222',
  code: 'VIDEO1',
  media_type: 2,
  product_type: 'feed',
  taken_at: 1700000000,
  user: { username: 'bob' },
  caption: { text: 'A video post' },
  original_width: 720,
  original_height: 1280,
  image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/cover.jpg', 720, 1280)] },
  video_versions: [
    video('https://scontent.cdninstagram.com/v/low.mp4', 540, 960),
    video('https://scontent.cdninstagram.com/v/high.mp4', 720, 1280)
  ]
};

const carousel = {
  pk: '333',
  code: 'CARO10',
  media_type: 8,
  user: { username: 'cara' },
  caption: { text: 'Ten photos' },
  carousel_media: Array.from({ length: 10 }, (_, index) => ({
    pk: '333' + index,
    id: '333' + index + '_1',
    media_type: 1,
    original_width: 1080,
    original_height: 1350,
    image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/slide-' + (index + 1) + '.jpg', 1080, 1350)] }
  }))
};

const mixed = {
  pk: '444',
  code: 'MIXED1',
  media_type: 8,
  user: { username: 'mix' },
  caption: { text: 'Photo then video' },
  carousel_media: [
    {
      pk: '4441',
      media_type: 1,
      image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/mix-1.jpg', 1080, 1080)] }
    },
    {
      pk: '4442',
      media_type: 2,
      video_duration: 8,
      image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/mix-cover.jpg', 720, 1280)] },
      video_versions: [video('https://scontent.cdninstagram.com/v/mix-2.mp4', 720, 1280)]
    }
  ]
};

const reel = {
  ...singleVideo,
  pk: '555',
  code: 'REEL99',
  product_type: 'clips',
  caption: { text: 'Reel caption' }
};

const storyImage = {
  pk: '666',
  media_type: 1,
  taken_at: 1700000000,
  user: { username: 'storyuser' },
  image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/story.jpg', 1080, 1920)] }
};

const storyVideo = {
  pk: '667',
  media_type: 2,
  taken_at: 1700000000,
  user: { username: 'storyuser' },
  video_versions: [video('https://scontent.cdninstagram.com/v/story.mp4', 1080, 1920)],
  image_versions2: { candidates: [image('https://scontent.cdninstagram.com/v/story-cover.jpg', 1080, 1920)] }
};

function collect(data) {
  const into = { posts: new Map(), stories: [], creators: [], seen: new WeakSet(), count: 0 };
  Model.collectFromJson(data, into);
  return into;
}

const photo = Model.makePost(singleImage);
assert.equal(photo.media.length, 1);
assert.equal(photo.media[0].type, 'image');
assert.equal(photo.shortcode, 'ABCDE1');
assert.equal(photo.title, 'Hello from a photo');
assert.equal(Model.pickBest(photo.media[0].imageCandidates, 'image').url.endsWith('full.jpg'), true);
assert.equal(Model.downloadKey(photo.id, photo.media[0]), '111:111:image');

const videoPost = Model.makePost(singleVideo);
assert.equal(videoPost.media[0].type, 'video');
assert.equal(Model.pickBest(videoPost.media[0].videoCandidates, 'video').url.endsWith('high.mp4'), true);
assert.equal(Model.pickBest([
  { url: 'https://scontent.cdninstagram.com/low.mp4', width: 360, height: 640, source: 'structured' },
  { url: 'https://scontent.cdninstagram.com/full.mp4', width: 1080, height: 1920, source: 'dom' }
], 'video').url.endsWith('full.mp4'), true, 'resolution must take priority over candidate source');

const ten = Model.makePost(carousel);
assert.equal(ten.media.length, 10);
assert.deepEqual(ten.media.map((item) => item.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.ok(ten.media.every((item) => item.type === 'image'));

const mixPost = Model.makePost(mixed);
assert.equal(mixPost.media.length, 2);
assert.equal(mixPost.media[0].type, 'image');
assert.equal(mixPost.media[1].type, 'video');
assert.equal(mixPost.media[0].index, 1);
assert.equal(mixPost.media[1].index, 2);

const reelPost = Model.makePost(reel, { routeKind: 'reel' });
assert.equal(reelPost.kind, 'reel');
const previewOnlyReel = Model.makePost({ ...reel, code: 'PREVIEW1', video_versions: [] }, { routeKind: 'reel' });
assert.equal(previewOnlyReel.media[0].type, 'video');
assert.equal(previewOnlyReel.media[0].videoCandidates.length, 0);
assert.equal(previewOnlyReel.media[0].imageCandidates.length, 1);

const stories = collect({ reels_media: [{ user: { username: 'storyuser' }, items: [storyImage, storyVideo] }] });
assert.equal(stories.stories.length, 2);
assert.equal(stories.stories[0].kind, 'story');
assert.equal(stories.stories[1].media[0].type, 'video');

const missing = Model.makePost({ pk: 'x', code: 'NODATA', media_type: 1, user: { username: 'z' } });
assert.equal(missing, null);

const graph = Model.makePost({
  shortcode: 'GRAPH1',
  __typename: 'XDTGraphSidecar',
  owner: { username: 'graph' },
  edge_media_to_caption: { edges: [{ node: { text: 'Graph carousel' } }] },
  edge_sidecar_to_children: {
    edges: [
      { node: { id: '1', display_url: 'https://scontent.cdninstagram.com/v/g1.jpg', display_resources: [{ src: 'https://scontent.cdninstagram.com/v/g1.jpg', config_width: 1080, config_height: 1080 }] } },
      { node: { id: '2', is_video: true, video_url: 'https://scontent.cdninstagram.com/v/g2.mp4', display_url: 'https://scontent.cdninstagram.com/v/g2.jpg' } }
    ]
  }
});
assert.equal(graph.media.length, 2);
assert.equal(graph.media[1].type, 'video');

const name = Model.withAutoIndex('Caption - username.jpg', 2, 3, '{title} - {author}');
assert.equal(name, 'Caption - username - 02.jpg');
const already = Model.withAutoIndex('Caption - username - 02.jpg', 2, 3, '{title} - {author} - {index}');
assert.equal(already, 'Caption - username - 02.jpg');
assert.equal(Model.postTitle('', 'ZZZ'), 'Instagram Post ZZZ');
assert.equal(Model.routeFromUrl('https://www.instagram.com/p/ABCDE1/').kind, 'post');
assert.equal(Model.routeFromUrl('https://www.instagram.com/reel/REEL99/').kind, 'reel');
assert.equal(Model.routeFromUrl('https://www.instagram.com/alice/reel/REEL99/').shortcode, 'REEL99');
assert.equal(Model.routeFromUrl('https://www.instagram.com/alice/reel/REEL99/').kind, 'reel');
assert.equal(Model.snapshotFromCollected(Model.routeFromUrl('https://www.instagram.com/reel/OTHER1/'), collect({ item: reel })).post, null);
assert.equal(Model.routeFromUrl('https://www.instagram.com/stories/alice/123/').kind, 'story');
assert.equal(Model.routeFromUrl('https://www.instagram.com/alice/').kind, 'profile');
const staleProfile = collect({ item: singleImage });
staleProfile.creators.push({ username: 'alice', displayName: 'Alice' });
const otherProfile = Model.snapshotFromCollected(Model.routeFromUrl('https://www.instagram.com/bob/'), staleProfile);
assert.equal(otherProfile.creator.username, 'bob');
assert.equal(otherProfile.posts.length, 0);

console.log('instagram parse fixtures, quality pick, carousel order, filename index and routes passed');

const partialCarousel = Model.makePost({ pk: 'partial', code: 'PARTIAL5', media_type: 8, carousel_media_count: 5, carousel_media: [singleImage, { pk: 'pending-video', media_type: 2 }, singleImage, { pk: 'pending-image', media_type: 1 }, singleVideo] });
assert.equal(partialCarousel.media.length, 5, 'missing URLs must not erase carousel members');
assert.equal(partialCarousel.expectedMediaCount, 5);
assert.equal(partialCarousel.media[1].type, 'video');
assert.equal(partialCarousel.media[3].index, 4);

const collaboration = Model.makePost({ ...singleImage, coauthor_producers: [{ username: 'bob' }, { username: 'carol' }, { username: 'alice' }] });
assert.equal(collaboration.authors.map((author) => author.username).join(','), 'alice,bob,carol');
