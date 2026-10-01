# 下载类多机协作：各仓该提交 / 不该提交清单 V2.0

> 适用：多台电脑联合开发。原则是「调试扩展与家里一致」——`git pull` 各仓 `main` 后，加载源码目录即可对齐；打包产物与依赖目录仍不进 Git。

更新日期：2026-09-29（V2.0：YouTube 解析已进私有仓）

---

## 另一台电脑怎么对齐

1. 用同一 GitHub 账号（或已授权的 SSH / PAT）克隆/拉取下列仓库的 `main`。
2. **YouTube 仓已改为私有**，且包含完整解析栈；未授权账号无法 pull。
3. Chrome：加载已解压扩展 → 指向各仓根目录（不要用旧 zip）。
4. 仍忽略本地：`*.zip`、`node_modules/`、`_metadata/`、`__pycache__/`。

| 仓库 | 可见性 | 远程 |
|------|--------|------|
| `shared-download-kit` | 私有 | https://github.com/snowflake-hangdudu/shared-download-kit |
| `youtube-downloader` | **私有**（含解析） | https://github.com/snowflake-hangdudu/youtube-downloader |
| `bili-downloader` | 公开 | https://github.com/snowflake-hangdudu/bili-downloader |
| `douyin-downloader` | 公开 | https://github.com/snowflake-hangdudu/douyin-downloader |
| `weibo-downloader` | 公开 | https://github.com/snowflake-hangdudu/weibo-downloader |
| `xiaohongshu-downloader` | 公开 | https://github.com/snowflake-hangdudu/xiaohongshu-downloader |
| `tiktok-downloader` | 公开 | https://github.com/snowflake-hangdudu/tiktok-downloader |

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
| **YouTube 解析实现**（见下节，仓已私有） | 可本地生成的超大测试音视频（可选忽略） |

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

多机流程：先 pull/push 本仓，再在各扩展跑 `python scripts/sync_brand.py`（仅改品牌时需要）。

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

## youtube-downloader（私有仓，完整调试实现）

仓已设为 **private**，解析与壳层一并进 Git，另一台 `git pull` 即可与家里一致。

**该提交**

- 面板壳、`content/`（含 `page-agent.js`）、`popup/`、`shared/`
- `lib/`（含 `nsig.js`、`webpo-minter.js`、`pot-provider.js`、`ejs/`、`m4s-mux.js` 等）
- `sandbox/`、`offscreen/`
- `icons/`、`docs/`、`store/`、`scripts/pack*.py`

**不该提交**

- 任意 `*.zip` / `*.xpi`
- `test/node_modules/`、`test/_out/`、`__pycache__/`
- `DEVELOPER.private.md`（若含本机路径/密钥，仍可本地保留不提交）

**多机注意**

- 必须用有权限的账号 pull；公开匿名克隆会失败。
- 调试开关：开发本机可用 `YT_DL_SHOW_DEBUG = true`，提交前保持 `false` 或交给 `pack.py` 关掉。

---

## douyin-downloader

**该提交**

- `content/` `shared/` `popup/` `lib/` `rules/` `background.js` `manifest.json`
- `icons/`、`docs/`、`scripts/`、需要共用的 `store/` 素材

**不该提交**

- `node_modules/`（`package-lock` 有则建议提交）
- `*.zip` `*.xpi` `_metadata/` `__pycache__/`

---

## weibo-downloader / xiaohongshu-downloader / tiktok-downloader

**该提交**

- 与扩展运行相关的全部源码与 `icons/`
- `shared/`（含 `design-system.css`）
- 打包脚本、`README`、选定 `store/` 材料
- 需要多机共用的 `store/upload-assets-*`（已约定入仓的正式素材）

**不该提交**

- `*.zip` `*.xpi` `_metadata/` `node_modules/` `__pycache__/`

---

## 尚无 Git 仓的目录

| 目录 | 建议 |
|------|------|
| `image-downloader` / `ins-downloader` / `twitter-downloader` | 需要多机联调时再 `git init` + 建 GitHub 仓；创建时套用本清单的忽略规则 |

---

## 推荐多机日更流程

1. 各机：先 `git pull` `shared-download-kit`，再 pull 各扩展（含私有 `youtube-downloader`）。
2. 改品牌色/图标：只改 kit → `sync_brand.py` → 各扩展出现 diff 再分别 commit。
3. 改单站逻辑：只在该扩展仓 commit/push。
4. YouTube：解析与壳层同一私有仓同步；勿再改回公开可见性。
5. 发版：本机 `pack.py` 生成 zip/xpi，产物不进 Git；版本号与商店材料进 Git。
