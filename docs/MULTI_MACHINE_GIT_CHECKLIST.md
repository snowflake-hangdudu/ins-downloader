# 下载类多机协作：各仓该提交 / 不该提交清单

> 适用：多台电脑联合开发。原则是「能复现构建与运行的进 Git；能本地生成 / 体积大 / 密钥 / 公开仓不允许的不进 Git」。

更新日期：2026-09-29

---

## 总原则

| 该提交 | 不该提交 |
|--------|----------|
| 源码（`content/` `popup/` `shared/` `background.js` `manifest*.json`） | `node_modules/` |
| 运行时图标（`icons/icon16~128.png`、必要的 `icon-source.png`） | `__pycache__/` `*.pyc` |
| 主题与公共样式、脚本（尤其 `shared-download-kit`） | `*.zip` `*.xpi` 上架/备份包 |
| `.gitignore`、`README`、打包脚本（`.py`） | `_metadata/`（Chrome 加载残留） |
| 远程配置相关的 `docs/`（faq/privacy/公告页） | `.DS_Store` `Thumbs.db` |
| 需要多机共用的 `store/` 文案与正式截图（按仓约定） | 密钥、`.env`、私有 token |
| 测试脚本（不含巨大 fixture 时可提交） | 可本地生成的超大测试音视频（可选忽略） |

**不要「放开全部 gitignore」**：依赖目录和打包产物进仓会让多机 pull 变慢且易冲突。

---

## shared-download-kit（公共仓，应优先同步）

**该提交**

- `themes.json`、`brand-assets/`（含 `processed/`）
- `shared/`（含 `design-system.css`、`panel.js` 等）
- `popup/`、`template/`、`scripts/`、`docs/`、`kit.json`、`README.md`
- `icons/`（kit 通用图标）

**不该提交**

- `node_modules/`、`__pycache__/`、`*.zip`、系统垃圾

多机流程：先 pull/push 本仓，再在各扩展跑 `python scripts/sync_brand.py`。

---

## bilibili-downloader

**该提交**

- `content/` `popup/` `shared/` `lib/` `background.js` `manifest.json` `_locales/`
- `icons/`、必要 `assets/` 运行时图
- `scripts/pack*.py` `scripts/gen_icons.py`
- `docs/`、约定好的 `store/` 提交材料

**不该提交**

- `*.zip` `*.xpi`、`test/node_modules/` `test/_out/`、`__pycache__/`

说明：本仓为完整实现，无「公开阉割」层。

---

## youtube-downloader（公开仓 + 本机私有实现）

**该提交（公开 GitHub）**

- 面板壳、`content/content.js` / `content.css`、`popup/`、`shared/design-system.css`
- 合并库 `lib/m4s-mux.js` 等已公开部分
- `icons/`、`docs/`、`store/` 文案与截图、`scripts/pack*.py`

**不该提交（已在 `.gitignore`，本机保留）**

- `content/page-agent.js`
- `lib/nsig.js` `lib/webpo-minter.js` `lib/pot-provider.js` `lib/ejs/`
- `sandbox/` `offscreen/`
- `DEVELOPER.private.md`
- 任意 `*.zip`

**多机注意**

- 公开仓 `git pull` 后**不能下载**，需另行同步上述私有文件（推荐：单独私有仓 / 加密盘 / 内网同步，不要强行取消 ignore 推到公开仓）。
- 调试开关：开发本机可用 `YT_DL_SHOW_DEBUG = true`，提交前保持 `false` 或交给 `pack.py` 关掉。

---

## douyin-downloader

**该提交**

- `content/` `shared/` `popup/` `lib/` `rules/` `background.js` `manifest.json`
- `icons/`、`docs/`、`scripts/`、需要共用的 `store/` 素材

**不该提交**

- `node_modules/` `package-lock` 可视团队约定（有 lock 建议提交；`node_modules` 永不提交）
- `*.zip` `*.xpi` `_metadata/` `__pycache__/`

---

## weibo-downloader / xiaohongshu-downloader / tiktok-downloader

**该提交**

- 与扩展运行相关的全部源码与 `icons/`
- `shared/`（若已接入公共样式）
- 打包脚本、`README`、选定 `store/` 材料

**不该提交**

- `*.zip` `*.xpi` `_metadata/` `node_modules/` `__pycache__/`
- 一次性裁图脚本的临时输出目录（如 `store/upload-assets-*` 若仅本机用）

---

## 尚无 Git 仓的目录

| 目录 | 建议 |
|------|------|
| `image-downloader` / `ins-downloader` / `twitter-downloader` | 需要多机联调时再 `git init` + 建 GitHub 仓；创建时套用本清单的忽略规则 |

---

## 推荐多机日更流程

1. 各机：先 `git pull` `shared-download-kit`，再 pull 各扩展。
2. 改品牌色/图标：只改 kit → `sync_brand.py` → 各扩展出现 diff 再分别 commit。
3. 改单站逻辑：只在该扩展仓 commit/push。
4. YouTube 私有实现：用私有通道同步，**不要**推到公开 `youtube-downloader`。
5. 发版：本机 `pack.py` 生成 zip/xpi，产物不进 Git；版本号与商店材料进 Git。
