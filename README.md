# 王诗雯 · 个人主页 + 一键去除图片背景

一个单页个人网站，包含三屏：

1. **关于我** — 头像（完整露出头部与肩部）、昵称、学校专业、兴趣爱好、学习目标
2. **我的学习记录** — 时间线
3. **一键去除图片背景** — 上传图片，调用 Replicate 的 [`lucataco/remove-bg`](https://replicate.com/lucataco/remove-bg/api) 模型自动抠图，可对比原图 / 结果并下载

右上角还会显示北京实时天气（Open-Meteo，无需 Key）。

## 目录结构

```
├── index.html        # 前端（单文件，三屏）
├── avatar.JPG        # 头像
├── server.js         # Node.js + Express 后端
├── package.json
├── .env.example      # 环境变量示例
└── README.md
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Token
cp .env.example .env
#   编辑 .env，填入你的 REPLICATE_API_TOKEN
#   Token 获取: https://replicate.com/account/api-tokens

# 3. 启动
npm start
```

浏览器打开 **http://localhost:3000** 即可。

开发时可用 `npm run dev`（文件改动自动重启）。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `REPLICATE_API_TOKEN` | **必填**，Replicate API Token，仅放服务端，不会写进前端代码 |
| `PORT` | 可选，服务端口，默认 `3000` |

> `.env` 已被 `.gitignore` 忽略，请勿把 Token 提交到仓库。

## 工作原理

```
浏览器 --上传图片--> Express(/api/remove-bg) --replicate.run("lucataco/remove-bg")--> Replicate
       <--返回 dataURL--  Express 下载结果并转 base64  <--生成图片 URL--
```

- 后端用官方 SDK 的 `replicate.run()`，**自动等待图片生成完成**。
- 结果由后端下载后转成 base64 data URL 返回，前端展示与下载都不受跨域影响。
- 处理期间按钮变灰显示「处理中…」，失败会在页面红色提示。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/remove-bg` | 表单字段 `image`，返回 `{ "result": "data:image/png;base64,..." }` |

## 自定义

- **颜色 / 头像**：编辑 `index.html` 顶部的 `:root { }`
- **头像裁剪**：`--avatar-size`（大小）、`--avatar-pos`（位置，第二个数值越小越靠上）、`--avatar-zoom`（缩放）
- **新增学习记录**：复制第二屏中的 `<div class="timeline-item">` 整段

## 常见问题

- **页面红色提示 `Failed to fetch`**：说明后端没在运行（或没通过后端访问）。请确认已 `npm start`；如果你双击打开了 `index.html`，也要先让后端跑起来，页面会自动连到 `http://localhost:3000`。
- **启动提示「未检测到 REPLICATE_API_TOKEN」**：页面仍可打开，但去背景不可用。创建 `.env` 并填写 Token 后重启。
- **提示 `Replicate Token 无效`**：`.env` 里的 Token 不对，重新复制一个真实 Token。
- **提示余额不足 / `Payment required`**：Replicate 需要账户有额度。
- **端口被占用**：在 `.env` 里改 `PORT`，然后重启。

> 说明：后端已开启 CORS，所以直接双击 `index.html`（`file://`）时，只要本地后端在 `localhost:3000` 运行，去背景也能正常工作。
