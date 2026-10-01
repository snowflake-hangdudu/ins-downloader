const EXT = typeof browser !== 'undefined' ? browser : chrome;
const VERSION = EXT.runtime.getManifest().version;
const CONFIG = globalThis.DOWNLOADER_POPUP_CONFIG || {};
const $ = (id) => document.getElementById(id);

const copy = {
  'zh-CN': { title: 'Instagram 下载助手', statusInstagram: 'Instagram 下载步骤', statusOther: '请先打开 Instagram', heading: '在 Instagram 页面下载内容', leadInstagram: '首页帖子、内容详情和创作者主页均可下载。', leadOther: '下载入口会显示在 Instagram 内容页、创作者主页或信息流帖子旁。', stepOpen: '浏览首页帖子，或打开帖子详情、Reel、Story、创作者主页', stepEntry: '首页点击帖子右侧“下载”；详情页点击悬浮入口', stepDownload: '在“当前内容”或“创作者”中选择并下载', note: '首页支持逐帖下载。默认隐藏首页广告，可在设置中关闭；详情页和创作者主页提供常驻入口。', open: '打开 Instagram', faq: '常见问题', privacy: '隐私政策', help: '帮助链接', steps: '下载步骤', disclaimer: '仅供个人学习 · 请遵守 Instagram 使用条款' },
  en: { title: 'Instagram Downloader', statusInstagram: 'Instagram download guide', statusOther: 'Open Instagram first', heading: 'Download from Instagram', leadInstagram: 'Download from home feed posts, content pages, or creator profiles.', leadOther: 'Download entries appear on Instagram content pages, creator profiles, or beside feed posts.', stepOpen: 'Browse home feed posts, or open a post, Reel, Story, or profile', stepEntry: 'Click Download beside a feed post, or the floating entry on a detail page', stepDownload: 'Choose items in Current content or Creator, then download', note: 'Home feed posts support individual downloads. Feed ads are hidden by default; turn this off in Settings. Detail pages and profiles have a persistent entry.', open: 'Open Instagram', faq: 'FAQ', privacy: 'Privacy', help: 'Help links', steps: 'Download steps', disclaimer: 'For personal learning only. Follow Instagram’s terms.' }
};

function isInstagramUrl(value) {
  try { return /(^|\.)instagram\.com$/i.test(new URL(value).hostname); } catch (_) { return false; }
}
function setText(id, value) { const element = $(id); if (element) element.textContent = value; }

async function init() {
  const themeController = globalThis.DownloaderKit?.theme?.createController({ storageKey: CONFIG.themeKey, fallbackTheme: CONFIG.theme, initialTheme: CONFIG.initialTheme });
  themeController?.attach(document.body);
  try { await globalThis.DownloaderKit?.i18n?.ready; } catch (_) {}
  const language = globalThis.DownloaderKit?.i18n?.language?.() === 'zh-CN' ? 'zh-CN' : 'en';
  const text = copy[language];
  document.documentElement.lang = language;
  setText('app-title', text.title); setText('guide-title', text.heading); setText('step-open', text.stepOpen); setText('step-entry', text.stepEntry); setText('step-download', text.stepDownload); setText('detail-note', text.note); setText('btn-go-site', text.open); setText('disclaimer', text.disclaimer); setText('app-version', 'v' + VERSION);
  document.querySelector('.popup-footer-links')?.setAttribute('aria-label', text.help);
  document.querySelector('.popup-steps')?.setAttribute('aria-label', text.steps);
  const links = document.querySelectorAll('.popup-footer-link');
  if (links[0]) links[0].textContent = text.faq;
  if (links[1]) links[1].textContent = text.privacy;
  let tab;
  try { [tab] = await EXT.tabs.query({ active: true, currentWindow: true }); } catch (_) {}
  const onInstagram = isInstagramUrl(tab?.url);
  setText('page-status', onInstagram ? text.statusInstagram : text.statusOther);
  setText('guide-lead', onInstagram ? text.leadInstagram : text.leadOther);
  $('btn-go-site').hidden = onInstagram;
}
init();
