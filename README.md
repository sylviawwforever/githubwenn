# About Me · 我的生活记录

一个「暖色咖啡馆手写板」风格的每日生活记录网页，含 Node/Express 后端与 Netlify 云函数。

线上地址：<http://work.willowww.wang/>

> `.env` 内含短信/视觉模型的密钥，已通过 `.gitignore` 排除，**不会**进入 Git 仓库。
> 换机器后请复制 `.env.example` 为 `.env` 并自行填写。

## 目录结构

```
人工智能final/
├── public/                 只用于发布的静态页面（可安全拖到 Netlify）
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── data.js
│   ├── assets/
│   └── _redirects          /api/* → Netlify Functions
├── netlify/functions/
│   ├── link-preview.js     商品/店铺链接识别（无 CORS 限制）
│   ├── health.js
│   └── lib/link-preview-core.js
├── server.js               本地 Express 后端
├── netlify.toml            Netlify 发布目录与函数目录
├── package.json
├── .env.example
└── data/db.json            本地运行后自动生成
```

> 发布时只上传 `public/` 和 `netlify/functions/`。不要把根目录直接拖到 Netlify，否则 `server.js`、`data/db.json` 等文件会被公开。

## 启动方式

### 方式一：带本地后端（功能完整）

```bash
cd "人工智能结课作业网页"
npm install
npm start
```

然后浏览器打开 <http://localhost:3000>。

### 方式二：直接打开静态页（离线/Netlify）

打开 `public/index.html`，或部署 `public/`。数据保存在本机浏览器（localStorage）。

## 部署到 Netlify

```bash
NETLIFY_AUTH_TOKEN=你的Token npx netlify-cli deploy --prod --dir=public --functions=netlify/functions --site 3fc00d6b-329b-4f0e-bad0-d31bcad6a439
```

或者使用 Netlify API 的文件摘要方式上传 `public/` 静态文件，并把 `netlify/functions/link-preview.js`、`health.js` 及其 `lib/` 目录分别打成 zip 作为函数上传。

`public/_redirects` 已配置：

```
/api/link-preview  /.netlify/functions/link-preview  200
/api/health        /.netlify/functions/health        200
```

## With Friends 链接识别

购物车与 Data 现在使用同源的 `/api/link-preview`：

- 淘宝/天猫：从分享短链提取商品 ID 与价格，再按商品名匹配百度图片库，返回真实商品图和价格。
- 大众点评、美团、百度地图：按店铺名匹配门面/环境图。
- 请求之间加入随机的人类浏览节奏与 UA 轮换，降低触发风控概率；同一链接结果缓存 10 分钟，重复识别接近秒开。
- 所有平台都失败时才使用 `image.thum.io` 整页截图兜底。

## 开启「食物图片识别」

编辑 `.env`（可从 `.env.example` 复制）：

```
VISION_PROVIDER=zhipu
VISION_API_KEY=你的Key
```

- `zhipu`：智谱 GLM-4V，注册即送免费额度，默认模型 `glm-4v-flash`。
- `qwen`：通义千问 VL，默认 `qwen-vl-plus`。
- `openai`：默认 `gpt-4o-mini`。

重启 `npm start` 后，饮食页上传图片即可自动识别食物与热量。
