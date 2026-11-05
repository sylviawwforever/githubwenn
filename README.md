# About Me · 我的生活记录

一个「暖色咖啡馆手写板」风格的每日生活记录网页：Express 后端 + `public/` 静态前端。

线上地址：<https://aboutme.willowww.wang/>（Vercel，Express）。另有 Netlify 站点可指向 `work.willowww.wang`。

> `.env` 里的短信 / 视觉密钥已通过 `.gitignore` 排除，**不要**把真实 Key 提交进仓库。
> 换机器后复制 `.env.example` 为 `.env` 再填写。

## 目录结构

```
├── public/                 静态页面（Vercel 会直接托管这个目录）
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data.js             食物热量 + 碳水 / 蛋白质 / 膳食纤维
├── server.js               Express：登录、同步、识图、链接预览
├── netlify/functions/      Netlify 备用函数（主站走 Vercel 上的 server.js）
├── vercel.json             函数最长 20 秒；链接预览内部约 8 秒软截止
├── package.json
└── .env.example
```

## 本地启动

```bash
npm install
npm start
```

浏览器打开 <http://localhost:3000>。

## 部署到 Vercel（aboutme.willowww.wang）

`server.js` 导出 Express 应用，并在非 Vercel 环境下 `listen`。Vercel 会把它识别成一个函数；`public/` 由 CDN 提供静态文件。

1. 把本仓库接到 Vercel 项目，生产分支用 `main`。
2. 域名 `aboutme.willowww.wang` 已绑定时，合并到 `main` 会自动发布。
3. 在 Vercel → Settings → Environment Variables 配置（不要把 Key 写进代码）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VISION_PROVIDER` | 建议 | `deepseek`。也可改为 `zhipu` / `qwen` / `openai` |
| `VISION_API_KEY` | 要识图就必填 | 用户的 DeepSeek API Key |
| `VISION_MODEL` | 可选 | 默认 `deepseek-flash`（官方图像理解模型） |
| `VISION_BASE_URL` | 可选 | 默认 `https://api.deepseek.com`。`https://api.deepseek.com/v1` 同样可用，服务会自动补 `/chat/completions` |

不设置 `VISION_API_KEY` 时，首页可以正常打开；拍照识别会提示缺少 Key，手动录入和常见食物库估算不受影响。

`/api/link-preview` 有大约 8 秒的软截止（可用 `LINK_PREVIEW_BUDGET_MS` 调整，上限 12 秒），函数本身在 `vercel.json` 里限制为 20 秒，避免大众点评等慢页面把请求挂死。

登录后的云端同步依赖进程内的 JSON 数据文件。Vercel 函数磁盘是临时的，实例回收后云端副本可能丢失；这时页面会静默退回本机 localStorage，不再弹出「读取云端数据失败」。本机 `npm start` 的长驻进程可以正常跨刷新同步。

## 食物图片识别

默认走 DeepSeek：

```
VISION_PROVIDER=deepseek
VISION_API_KEY=你的DeepSeekKey
VISION_BASE_URL=https://api.deepseek.com
VISION_MODEL=deepseek-flash
```

`deepseek-flash` 接受 OpenAI 兼容的 `image_url`（支持 data URL）。`deepseek-v4-pro` 不能看图，不要改成它。

仍可改回智谱、通义或 OpenAI，见 `.env.example`。识别结果包含热量，以及每项食物的碳水、蛋白质、膳食纤维；缺省时按 `public/data.js` 里的常见食物库估算。今日摄入会汇总这三项。

## With Friends 链接识别

购物车和 Data 使用同源的 `POST /api/link-preview`：

- 淘宝 / 天猫 / 淘口令短链：解析商品名、价格、主图和候选图。
- 大众点评（含 `dpurl.cn`）：解析店名、店铺图，人均写入 `avgPrice`（同时放进 `price.kind = "avg"`）。
- 请求前有随机停顿和 UA 轮换；被拦后放慢再试，不会对同一页并发猛刷。
- 到软截止就返回已经拿到的字段。

## 部署到 Netlify（可选）

`netlify.toml` 仍发布 `public/`，函数在 `netlify/functions/`。主站 aboutme.willowww.wang 走的是上面的 Vercel Express，不依赖这些函数。
