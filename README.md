# Instagram 下载助手

Instagram Downloader 是一款本地优先的浏览器扩展，用于识别用户当前可正常访问的 Instagram 公开内容，并由用户主动保存图片、视频、轮播、Reels 或 Story。

## 支持范围

- 单图 / 单视频帖子、多图或图+视频轮播、Reels、首页当前帖子、Story 查看器、创作者主页扫描。
- 下载任务本地持久化，并发 1–3；支持暂停、继续、取消、重试和历史。
- 只展示页面实际识别到的媒体候选，不伪造原图、去水印或绕过访问控制。

## 运行

在 Edge 或 Chrome 的扩展管理页打开开发者模式，选择“加载解压缩的扩展”，并选择本目录。安装或更新后刷新 Instagram 标签页。

## 测试

```bash
npm.cmd test
```

## 打包

```bash
python scripts/pack.py
python scripts/pack_firefox.py
```

- 常见问题：https://snowflake-hangdudu.github.io/ins-downloader/faq.html
- 隐私政策：https://snowflake-hangdudu.github.io/ins-downloader/
