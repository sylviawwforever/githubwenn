import express from "express";
import multer from "multer";
import Replicate from "replicate";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { REPLICATE_API_TOKEN, PORT = 3000 } = process.env;

// 没有 Token 也允许启动服务，方便先用浏览器打开页面；
// 真正调用去背景接口时再给出清晰提示。
let replicate = null;
if (REPLICATE_API_TOKEN) {
  replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
} else {
  console.warn(
    "\n[警告] 未检测到 REPLICATE_API_TOKEN，去背景功能将不可用。\n" +
      "请复制 .env.example 为 .env 并填入 Token：https://replicate.com/account/api-tokens\n"
  );
}

const app = express();

// lucataco/remove-bg 需要指定版本号（默认版本接口会返回 404）
const REMOVE_BG_MODEL =
  process.env.REPLICATE_MODEL ||
  "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";

// Replicate SDK 的返回值可能是字符串、URL 或带 url() 方法的文件对象
function toUrl(output) {
  let v = Array.isArray(output) ? output[0] : output;
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v.url === "function") return v.url().toString();
  if (v.url) return v.url.toString();
  return String(v);
}

// 允许直接双击打开本地文件（file://）时也能调用本后端
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const upload = multer({  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("只支持上传图片文件"));
  },
});

// 只暴露必要文件，避免把 .env、server.js 等暴露出去
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/avatar.JPG", (_req, res) => res.sendFile(path.join(__dirname, "avatar.JPG")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, token: Boolean(replicate) });
});

app.post("/api/remove-bg", (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "图片太大，最大 10MB" : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: "请先选择一张图片" });
    }
    if (!replicate) {
      return res
        .status(503)
        .json({ error: "后端未配置 REPLICATE_API_TOKEN，请在 .env 中填写后重启" });
    }

    try {
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

      const output = await replicate.run(REMOVE_BG_MODEL, {
        input: { image: dataUri },
      });

      const outUrl = toUrl(output);
      if (!outUrl) throw new Error("模型未返回结果");

      const imgRes = await fetch(outUrl);
      if (!imgRes.ok) throw new Error("下载处理结果失败");
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/png";
      const resultDataUri = `data:${contentType};base64,${buf.toString("base64")}`;

      res.json({ result: resultDataUri });
    } catch (e) {
      const raw = e?.response?.data?.detail || e?.message || "";
      console.error("[remove-bg] 失败:", raw || e);
      let msg = "处理失败，请稍后重试";
      if (/401|Unauthenticated|authentication/i.test(raw)) {
        msg = "Replicate Token 无效或未授权，请检查 .env 中的 REPLICATE_API_TOKEN";
      } else if (/402|payment|billing|insufficient/i.test(raw)) {
        msg = "Replicate 账户额度不足，请充值后再试";
      } else if (/429|rate.?limit/i.test(raw)) {
        msg = "请求过于频繁，请稍后再试";
      } else if (raw) {
        msg = raw;
      }
      res.status(500).json({ error: msg });
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n个人主页已启动:  http://localhost:${PORT}`);
  console.log(`若你直接双击打开了 index.html，也能通过该地址调用去背景功能。\n`);
});
