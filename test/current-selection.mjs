import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual renderer and button handlers, including repeated renders.
const source = readFileSync(new URL('../content/content.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('  function renderCurrent() {'), source.indexOf('  function mergeCreatorPosts('));
const controls = [];
const elements = [];
const element = () => ({ classList: { add() {} }, addEventListener(type, callback) { this[type] = callback; }, replaceChildren() {} });
const context = vm.createContext({
  Set, snapshot: { kind: 'feed', stories: [] }, viewedPost: {}, viewedPostLoading: false, viewedPostToken: 1,
  selectedMedia: new Set(), mediaSelectionPost: '', currentBody: element(),
  post: { shortcode: 'one', author: { username: 'creator' }, media: [1, 2, 3].map(index => ({ index, type: 'image' })) },
  t: key => key, currentPost() { return context.post; }, downloadKey: (post, media) => `${post.shortcode}:${media.index}`,
  pageType: () => 'image', pageTypeLabel: () => 'Photo', coverUrl: () => '', setMediaPreview() {}, creatorReady: () => true,
  completedKeys: async () => new Set(['one:1', 'one:2', 'one:3']),
  node(parent, tag, cls, text) { const el = element(); el.tag = tag; el.text = text; elements.push(el); return el; },
  button(parent, label, cls, callback) { const el = element(); el.label = label; el.callback = callback; controls.push(el); return el; },
  enqueueMedia() {},
});
vm.runInContext(renderer, context);
const render = () => { controls.length = 0; elements.length = 0; context.renderCurrent(); };
const click = async label => { await controls.findLast(control => control.label === label).callback(); };
render();
assert.equal(context.selectedMedia.size, 3);
await click('clearShort');
assert.equal(context.selectedMedia.size, 0);
assert.equal(controls.findLast(control => control.label === 'downloadSelected').disabled, true);
render();
assert.equal(context.selectedMedia.size, 0, 'a redraw must preserve explicit empty selection');
await click('selectVideos');
assert.equal(context.selectedMedia.size, 0, 'zero matching media must remain unselected');
await click('selectAllShort');
assert.equal(context.selectedMedia.size, 3);
await click('selectNewShort');
assert.equal(context.selectedMedia.size, 0, 'all downloaded items must remain unselected');
context.post = { ...context.post, shortcode: 'two' };
render();
assert.equal(context.selectedMedia.size, 3, 'a new post gets the initial default selection');
const checks = elements.filter(el => el.tag === 'input');
for (const check of checks) { check.checked = false; check.change(); }
assert.equal(context.selectedMedia.size, 0);
assert.equal(controls.findLast(control => control.label === 'downloadSelected').disabled, true);
console.log('current selection: clear, empty filters, redraw, new post and download disabling passed');

