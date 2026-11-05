/* =========================================================
   About Me · server.js
   Node + Express 后端
   - 手机号验证码登录（开发模式：验证码直接返回 / 打印在终端）
   - 用户数据同步（待办/饮食/运动/记账/睡眠/目标/收藏/观影/分享/购物车/地点）
   - 好友：通过 6 位邀请码跨设备查看对方公开内容
   - 食物图片识别：接大模型视觉 API（智谱 / 通义 / OpenAI 兼容）
   ========================================================= */
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { browserCandidates, searchImages, searchWebImages } = require('./browser-preview');
const { collectCandidates, rankCandidates, isUsableImage, decodeEntities } = require('./image-picker');
const { previewLink, parsePrice: coreParsePrice, parseAvgPrice, hintFrom: coreHintFrom, detectKind: coreDetectKind } = require('./netlify/functions/lib/link-preview-core');
const { normalizeFoodItems } = require('./public/data');
const { sendSms } = require('./sms');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.ABOUTME_DB || path.join(DATA_DIR, 'db.json');

/* 允许跨域：双击打开的页面（file://，Origin 为 null）也能调用本机后端 */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* ---------- 持久化 ---------- */
function loadDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) return { users: {}, sessions: {}, codes: {} };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('读取数据库失败，使用空库', e.message);
    return { users: {}, sessions: {}, codes: {} };
  }
}
let db = loadDB();
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.error('写入数据库失败', e.message); }
  }, 120);
}

/* ---------- 工具 ---------- */
const genCode = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};
const uniqueCode = () => {
  const used = new Set(Object.values(db.users).map(u => u.code));
  let c;
  do { c = genCode(); } while (used.has(c));
  return c;
};
const emptyData = () => ({
  todos: [], diet: [], exercise: [],
  ledger: [], sleep: [], goals: [], collection: [], watch: [],
  shares: [], cart: [], places: []
});
const api = (fn) => (req, res) => {
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
  });
};

app.use(express.json({ limit: '30mb' }));

/* 保护敏感文件不被静态访问 */
app.use((req, res, next) => {
  if (/^\/(data\/|data$|server\.js$|package(-lock)?\.json$|\.env$|\.git\/|netlify\/|node_modules\/)/.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

/* ---------- 鉴权中间件 ---------- */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const phone = db.sessions[token];
  if (!phone || !db.users[phone]) return res.status(401).json({ ok: false, error: '未登录或登录已过期' });
  req.phone = phone;
  req.user = db.users[phone];
  next();
}

/* =========================================================
   认证：手机号 + 验证码（开发模式）
   ========================================================= */
app.post('/api/auth/send-code', api(async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ ok: false, error: '手机号格式不正确' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.codes[phone] = { code, expires: Date.now() + 5 * 60 * 1000 };
  saveDB();

  let sent;
  try { sent = await sendSms(phone, code); }
  catch (e) {
    console.error('[短信] 发送失败：', e.message);
    return res.status(500).json({ ok: false, error: '验证码发送失败：' + e.message });
  }

  if (sent.provider === 'console') {
    console.log(`\n[短信·开发模式] 向 ${phone} 发送验证码：${code}（5 分钟内有效）\n`);
    // 未配置短信服务：直接把验证码返回给前端，方便本地测试。
    return res.json({ ok: true, devMode: true, devCode: code, message: '未配置短信服务，已用开发模式（验证码见下方）' });
  }
  console.log(`[短信·${sent.provider}] 已向 ${phone} 发送验证码`);
  res.json({ ok: true, devMode: false, message: '验证码已发送到手机' });
}));

app.post('/api/auth/verify', api((req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const rec = db.codes[phone];
  if (!rec || rec.expires < Date.now()) return res.status(400).json({ ok: false, error: '验证码已过期，请重新获取' });
  if (rec.code !== code) return res.status(400).json({ ok: false, error: '验证码错误' });
  delete db.codes[phone];

  let user = db.users[phone];
  if (!user) {
    user = {
      phone,
      nickname: '',
      code: uniqueCode(),
      createdAt: Date.now(),
      friends: [],
      data: emptyData()
    };
    db.users[phone] = user;
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = phone;
  saveDB();

  res.json({
    ok: true,
    token,
    user: { phone: user.phone, nickname: user.nickname, code: user.code }
  });
}));

/* ---------- 当前用户 ---------- */
app.get('/api/me', auth, api((req, res) => {
  res.json({
    ok: true,
    user: {
      phone: req.user.phone,
      nickname: req.user.nickname,
      code: req.user.code,
      friends: req.user.friends || []
    }
  });
}));

app.patch('/api/me', auth, api((req, res) => {
  const { nickname } = req.body;
  if (typeof nickname === 'string' && nickname.trim()) req.user.nickname = nickname.trim().slice(0, 20);
  saveDB();
  res.json({ ok: true, user: { phone: req.user.phone, nickname: req.user.nickname, code: req.user.code } });
}));

/* ---------- 数据同步 ---------- */
app.get('/api/data', auth, api((req, res) => {
  res.json({ ok: true, data: req.user.data || emptyData() });
}));

function mergeNotes(oldData, newData) {
  ['cart', 'places', 'shares'].forEach(col => {
    const oldMap = {};
    ((oldData && oldData[col]) || []).forEach(it => { oldMap[it.id] = it.notes || []; });
    (newData[col] || []).forEach(it => {
      const merged = new Map();
      [...(oldMap[it.id] || []), ...(it.notes || [])].forEach(n => { if (n && n.id) merged.set(n.id, n); });
      it.notes = [...merged.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    });
  });
}

app.put('/api/data', auth, api((req, res) => {
  const incoming = req.body.data;
  if (!incoming || typeof incoming !== 'object') return res.status(400).json({ ok: false, error: '数据格式错误' });
  const next = { ...emptyData(), ...incoming };
  mergeNotes(req.user.data, next);
  req.user.data = next;
  saveDB();
  res.json({ ok: true });
}));

/* 给某个条目（购物车/地点/分享）添加备注 —— 好友也可对分享的条目留言 */
app.post('/api/item-note', api((req, res) => {
  const { code, collection, itemId, author, text } = req.body || {};
  if (!['cart', 'places', 'shares'].includes(collection)) return res.status(400).json({ ok: false, error: '类型错误' });
  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: '备注不能为空' });
  const user = Object.values(db.users).find(u => u.code === String(code || '').toUpperCase());
  if (!user) return res.status(404).json({ ok: false, error: '找不到该邀请码对应的用户' });
  const list = (user.data && user.data[collection]) || [];
  const item = list.find(x => x.id === itemId);
  if (!item) return res.status(404).json({ ok: false, error: '找不到该条目' });
  item.notes = item.notes || [];
  item.notes.push({ id: crypto.randomBytes(6).toString('hex'), author: String(author || '好友').slice(0, 20), text: String(text).trim().slice(0, 200), ts: Date.now() });
  saveDB();
  res.json({ ok: true, notes: item.notes });
}));

/* =========================================================
   链接预览：抓取标题 / 首图 / 价格（淘宝、大众点评、百度地图等）
   ========================================================= */
function metaOf(html, prop) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return b ? b[1] : null;
}
/* 反爬页/中转页的假标题，直接丢掉，宁可没有标题 */
const BAD_TITLE = /^(登录|注册|验证中心|身份核实|安全验证|访问验证|403 Forbidden|404|405|500|502|503|Just a moment|商品详情页|京东-欢迎登录|页面不存在|安全提示)/;
/* 判定"整页被反爬挡住"用的更严：只有明确的登录/验证/错误页才算，商品详情页这类中性标题不算 */
const BLOCK_TITLE = /^(登录|注册|验证中心|身份核实|安全验证|访问验证|403 Forbidden|404|405|500|502|503|Just a moment|页面不存在|安全提示)/;
function cleanTitle(t) {
  if (!t) return null;
  t = decodeEntities(t);
  t = String(t).replace(/^【[^】]{1,12}】\s*/g, '').trim(); // 剥掉「【淘宝】」这类平台前缀
  if (!t || BAD_TITLE.test(t)) return null;
  return t;
}
function parsePrice(html) {
  const range = html.match(/([\d]+(?:\.\d+)?)\s*[-~至]\s*([\d]+(?:\.\d+)?)\s*(?:元|rmb)/i);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const patterns = [
    /[?&](?:price|default_price|defaultPrice)=([\d]+(?:\.\d+)?)/i,
    /"(?:price|priceText|defaultPrice|lowPrice|salePrice|currentPrice)"\s*:\s*"?([\d]+(?:\.\d+)?)/i,
    /itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i,
    /(?:￥|¥)\s*([\d]+(?:\.\d+)?)/,
    /([\d]+(?:\.\d+)?)\s*元\s*起/
  ];
  for (const re of patterns) { const m = html.match(re); if (m) return { min: parseFloat(m[1]), max: parseFloat(m[1]) }; }
  return null;
}
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_WECHAT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003137) NetType/WIFI Language/zh_CN';
const UA_FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_BINGBOT = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';

/* 模拟人眼节奏：请求间加随机小延迟，避免同一秒内连续命中触发风控 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => Math.round(a + Math.random() * (b - a));

/* 反爬拦截页（登录墙 / 验证页 / 403）：这种页面里捞到的图全是登录墙素材，直接丢弃 */
function pageBlocked(url, title, html) {
  try {
    const u = new URL(url);
    if (/login|account|passport|verify|captcha/i.test(u.pathname)) return true;
    if (/(^|\.)account\.|(^|\.)passport\./i.test(u.hostname)) return true;
  } catch {}
  if (title && BLOCK_TITLE.test(decodeEntities(title))) return true;
  return /APP扫码，享七天免登录|请完成安全验证|账号登录\/注册/.test(String(html || '').slice(0, 80000));
}

async function grab(url, ua, timeoutMs = 8000) {
  // 每次抓取前先“眨一下眼”：随机 120~420ms，降低触发风控的概率
  await sleep(jitter(120, 420));
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(jitter(350, 900)); // 重试前再等一下，像人手动刷新
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,image/*,*/*',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      const finalUrl = resp.url || url;
      const ct = resp.headers.get('content-type') || '';
      if (/^image\//.test(ct)) return { url: finalUrl, image: finalUrl, title: null, price: null, candidates: [{ url: finalUrl, source: 'direct' }] };
      const html = (await resp.text()).slice(0, 500000);
      const rawTitle = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
      let candidates = collectCandidates(html, finalUrl);
      let title = cleanTitle(metaOf(html, 'og:title') || rawTitle);
      let price = parsePrice(html);
      if (pageBlocked(finalUrl, rawTitle, html)) {
        if (process.env.LINK_DEBUG) console.log('[link-debug] grab BLOCKED', ua.slice(0, 20), finalUrl.slice(0, 80), '| title:', rawTitle);
        return { blocked: true, url: finalUrl, candidates: [], title: null, price };
      }
      // 分享短链常是 JS 跳转页，抓页内真实目标再试一次
      if (!candidates.length) {
        const t = html.match(/https?:\/\/(?:item\.taobao\.com|detail\.tmall\.com|item\.jd\.com|www\.dianping\.com|m\.dianping\.com|map\.baidu\.com|www\.meituan\.com)[^\s"'<>\\]+/);
        if (t) {
          const target = t[0].replace(/&amp;/g, '&');
          if (!price) price = parsePrice(target);
          try {
            const h2 = await grab(target, UA_MOBILE, 6000);
            candidates = candidates.concat(h2.candidates || []);
            title = title || h2.title;
            price = price || h2.price;
          } catch {}
        }
      }
      return { url: finalUrl, image: (candidates[0] && candidates[0].url) || null, title, price, candidates };
    } catch (e) {
      lastErr = e;
    } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('grab failed');
}
async function microlink(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url) + '&meta=true', { signal: ctrl.signal });
    const j = await r.json();
    if (j.status === 'success' && j.data) {
      const img = (j.data.image && (j.data.image.url || j.data.image)) || null;
      const image = typeof img === 'string' ? img : null;
      return {
        image,
        title: cleanTitle(j.data.title),
        price: null,
        candidates: image ? [{ url: image, source: 'og' }] : []
      };
    }
  } catch {} finally { clearTimeout(timer); }
  return null;
}
// 反爬兜底：整页截图服务。任何链接都能返回一张"页面图"，保证用户看得到画面。
function thumShot(url) {
  return 'https://image.thum.io/get/width/600/crop/900/noanimate/' + url;
}

function detectKind(url = '') {
  if (/dianping\.com|dpurl\.cn|meituan\.com|sankuai\.com|map\.baidu\.com|baidu\.com\/map|amap\.com|dianping/.test(url)) return 'place';
  return 'product';
}

/* 从分享文字里抠出商品名 / 店铺名：既是更准的标题，也是搜图兜底的关键词 */
function hintFrom(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  let name = (t.match(/「([^」]+)」/) || [])[1] || '';
  if (!name) {
    const brackets = (t.match(/【([^】]+)】/g) || []).map(s => s.slice(1, -1))
      .filter(s => !/淘宝|天猫|京东|拼多多|小红书|会员|抢先|假一赔|旗舰店|复制|分享/.test(s));
    name = brackets[0] || '';
  }
  /* 新版淘宝分享：【淘宝】链接后面的文字就是商品名 */
  if (!name) {
    name = t.replace(/https?:\/\/[^\s"'<>）），,、]+/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[「」『』\[\]]/g, ' ')
      .replace(/点击链接|复制此条|打开链接|直接打开/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!name || /^https?:\/\//.test(name)) return '';
  return name.slice(0, 60);
}

const SOURCE_NOTE = {
  og: '已自动识别页面上的主图。',
  ld: '已自动识别结构化数据里的商品主图。',
  twitter: '已自动识别页面上的主图。',
  browser: '页面直接抓不到，已用本机 Chrome 真实渲染识别主图。',
  json: '已从页面脚本里识别到图片。',
  img: '已识别页面里的图片。',
  web: '店铺页有反爬，已用网页搜索到的相关图片兜底，点缩略图可切换。',
  search: '页面有反爬，已用图片搜索兜底，点缩略图可切换。',
  direct: '这个链接本身就是图片。',
  vision: ''
};

/* 商品名/店铺名 → 用于搜图的关键词和"命中加分" */
function nameTokens(name) {
  const s = String(name || '').toLowerCase();
  const words = (s.match(/[a-z0-9]{4,}/g) || []);
  const cjk = (s.match(/[一-龥]{2,}/g) || []).flatMap(w => w.length <= 3 ? [w] : [w.slice(0, 2), w.slice(2, 4)]);
  return [...new Set([...words, ...cjk])].filter(t => t.length >= 2);
}

/**
 * 链接 → 商品图 / 店铺图
 * 1) 多 UA 抓页面 + 本机 Chrome 渲染，同时收集候选图
 * 2) image-picker 探测尺寸打分，挑最像主图的一张
 * 3) 反爬抓不到（点评/百度地图）→ 用商品名/店铺名跑图片搜索兜底
 * 4) 配了视觉大模型 → 让 AI 从候选图里再确认一次
 * 5) 还不行 → 整页截图兜底
 */
async function fetchPreview(url, opts = {}) {
  const kind = opts.kind || detectKind(url);
  // 7 路并行：桌面 Chrome / Googlebot / 手机 Safari / 微信内置浏览器 / 社交爬虫 / microlink / 本机 Chrome 渲染
  const results = await Promise.allSettled([
    grab(url, UA_BROWSER, 6500),
    grab(url, UA_GOOGLEBOT, 6500),
    grab(url, UA_MOBILE, 6500),
    grab(url, UA_WECHAT, 6500),
    grab(url, UA_FACEBOOK, 6500),
    microlink(url),
    browserCandidates(url)
  ]);

  const cands = [];
  let title = null, price = null, anyLive = false, anySource = false;
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const v = r.value;
    anySource = true;
    if (v.blocked) continue;          // 登录墙/验证页：里面的图全是废话，丢掉
    anyLive = true;
    if (Array.isArray(v.candidates)) v.candidates.forEach(c => { if (c && c.url) cands.push({ ...c, kind }); });
    if (v.image && isUsableImage(v.image) && !cands.some(c => c.url === v.image)) cands.push({ url: v.image, source: 'og', kind });
    if (!title) title = cleanTitle(v.title);
    if (!price && v.price) price = v.price;
  }
  // 全部来源都被反爬挡住（大众点评 / 百度地图常见）→ 强制走搜图兜底
  const pageDead = anySource && !anyLive;
  if (process.env.LINK_DEBUG) {
    console.log('[link-debug] results:', results.map(r => r.status !== 'fulfilled' ? 'ERR:' + (r.reason && r.reason.message)
      : (!r.value ? 'empty' : r.value.blocked ? 'blocked' : 'live(cands=' + ((r.value.candidates || []).length) + ')')).join(' | '),
      '| pageDead:', pageDead, '| cands:', cands.length);
  }

  const hint = String(opts.hint || '').trim();
  const finalTitle = hint || title || null;

  let ranked = await rankCandidates(cands, { kind, limit: 8 });
  let source = ranked[0] ? ranked[0].source : null;
  let note = null;

  // 七路并行仍全被反爬挡住（或没图）→ 用「人眼节奏」串行重试：
  // 换桌面 Chrome / 微信 / 必应爬虫 UA 一个个来，每次间隔随机 0.4~0.9s，像人手动刷新
  if (pageDead || ranked.length < 2) {
    for (const ua of [UA_BROWSER, UA_WECHAT, UA_BINGBOT]) {
      await sleep(jitter(400, 900));
      try {
        const r2 = await grab(url, ua, 8000);
        if (r2 && !r2.blocked) {
          (r2.candidates || []).forEach((c) => { if (c && c.url) cands.push({ ...c, kind }); });
          if (r2.image && isUsableImage(r2.image) && !cands.some((c) => c.url === r2.image)) cands.push({ url: r2.image, source: 'og', kind });
          title = title || cleanTitle(r2.title);
          price = price || r2.price;
          if ((r2.candidates || []).length) {
            ranked = await rankCandidates(cands, { kind, limit: 8 });
            source = ranked[0] ? ranked[0].source : null;
            if (ranked.length >= 2) break;
          }
        }
      } catch {}
    }
  }

  // 页面里没捞到像样的图、候选太少、或整页被反爬挡住（大众点评 / 百度地图）→ 拿名字去搜图
  if ((pageDead || ranked.length < 2 || ranked[0].score < 45) && finalTitle) {
    const query = (finalTitle.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim() || finalTitle).slice(0, 60);
    const tokens = nameTokens(finalTitle);
    // 网页搜索（结果带上下文文字，更准）和图片搜索一起跑，谁先出可信结果用谁
    const [webHits, imgHits] = await Promise.all([
      searchWebImages(query).catch(() => []),
      searchImages(query).catch(() => [])
    ]);
    const found = [...webHits, ...imgHits];
    if (found.length) {
      found.forEach(c => {
        const label = String(c.label || '').toLowerCase();
        // 命中的名字片段越多越可信（店铺名全中 > 只中 "coffee" 这种通用词）
        const hits = tokens.filter(t => t.length >= 2 && label.includes(t)).length;
        if (hits) c.boost = Math.min(36, 10 + hits * 10);
        // 网页搜索的结果带卡片文字：文字里压根没提这家店的直接降权
        else if (c.source === 'web' && tokens.length) c.boost = -14;
        else c.boost = 0;
      });
      const merged = await rankCandidates([...ranked, ...found.map(c => ({ ...c, kind }))], { kind, limit: 8 });
      if (merged.length) { ranked = merged; source = ranked[0].source; }
      if (process.env.LINK_DEBUG) console.log('[link-debug] search fallback:', query, '| web:', webHits.length, '| imgs:', imgHits.length, '| top:', ranked[0] && ranked[0].source, ranked[0] && ranked[0].score);
    }
  }

  // 视觉大模型二次确认（需在 .env 配置 VISION_PROVIDER / VISION_API_KEY）
  if (ranked.length > 1) {
    const pickedUrl = await visionPick(ranked.slice(0, 6), kind, finalTitle);
    if (pickedUrl) {
      const idx = ranked.findIndex(c => c.url === pickedUrl);
      if (idx > 0) { const [c] = ranked.splice(idx, 1); ranked.unshift(c); }
      source = 'vision';
      note = `AI 从 ${Math.min(6, ranked.length)} 张候选图里选出的主图。`;
    }
  }

  let image = ranked[0] ? ranked[0].url : null;
  let shot = false;
  if (!image) { image = thumShot(url); shot = true; source = 'shot'; }

  if (!note) note = SOURCE_NOTE[source] || (shot ? '没抓到可用图片，这里先给整页截图；可以点「自动识别」重试，或粘贴图片链接。' : '');

  return {
    url,
    image,
    title: finalTitle,
    price,
    shot,
    source,
    note,
    candidates: ranked.slice(0, 6).map(c => ({
      url: c.url, label: c.label || '', source: c.source, score: c.score, w: c.w || 0, h: c.h || 0
    }))
  };
}

app.post('/api/link-preview', api(async (req, res) => {
  const body = req.body || {};
  if (body.warm) return res.json({ ok: true, warmed: true });

  const raw = String(body.text || body.hint || body.url || '').trim();
  const urlMatch = String(body.url || raw).match(/https?:\/\/[^\s"'<>）），,、]+/);
  const url = urlMatch ? urlMatch[0] : '';
  const kind = body.kind === 'place' ? 'place' : body.kind === 'product' ? 'product' : coreDetectKind(url);
  const hint = coreHintFrom(raw);
  /* 软截止必须短于 Vercel 函数上限，保证总能返回已经抓到的字段 */
  const budgetMs = Math.max(1200, Math.min(12000, Number(process.env.LINK_PREVIEW_BUDGET_MS) || 8000));
  const deadline = Date.now() + budgetMs;
  const textAvg = parseAvgPrice(raw);
  const quick = {
    url: url || null,
    image: null,
    title: hint || null,
    price: (kind === 'place' && textAvg) ? { min: textAvg.min, max: textAvg.max, kind: 'avg' } : coreParsePrice(raw),
    avgPrice: textAvg ? textAvg.min : null,
    avgPriceMax: textAvg ? textAvg.max : null,
    shot: false,
    source: null,
    candidates: [],
    softTimeout: true,
    note: hint || textAvg ? '已到软截止，返回目前识别到的标题、价格或人均。' : '已到软截止，没有抓到更多字段。'
  };
  if (!url && !hint) return res.status(400).json({ ok: false, error: '没有识别到链接或名称' });

  let info = null;
  try {
    info = await Promise.race([
      previewLink({ url, text: raw, kind, deadline }),
      new Promise((resolve) => setTimeout(() => resolve(null), budgetMs + 500))
    ]);
  } catch (e) {
    info = null;
  }
  if (!info) return res.json({ ok: true, ...quick });
  if (textAvg && info.avgPrice == null) {
    info.avgPrice = textAvg.min;
    info.avgPriceMax = textAvg.max;
    if (kind === 'place' && (!info.price || info.price.kind === 'avg')) {
      info.price = { min: textAvg.min, max: textAvg.max, kind: 'avg' };
    }
  }
  return res.json({ ok: true, ...info });
}));

/* 好友：仅互为好友可通过邀请码查看对方公开内容 */
app.get('/api/friend/:code', auth, api((req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!(req.user.friends || []).includes(code)) return res.status(403).json({ ok: false, error: '你们还不是好友' });
  const user = Object.values(db.users).find(u => u.code === code);
  if (!user) return res.status(404).json({ ok: false, error: '找不到该邀请码对应的用户' });
  if (!(user.friends || []).includes(req.user.code)) return res.status(403).json({ ok: false, error: '你们还不是好友' });
  const d = user.data || emptyData();
  res.json({
    ok: true,
    friend: {
      nickname: user.nickname || '好友',
      code: user.code,
      shares: d.shares || [],
      cart: d.cart || [],
      places: d.places || []
    }
  });
}));

/* 添加好友：双方互加，之后才能互相看到 With Friends 内容 */
app.post('/api/me/friends', auth, api((req, res) => {
  const code = String(req.body.code || '').toUpperCase();
  if (code === req.user.code) return res.status(400).json({ ok: false, error: '不能添加自己' });
  const other = Object.values(db.users).find(u => u.code === code);
  if (!other) return res.status(404).json({ ok: false, error: '邀请码不存在' });
  req.user.friends = req.user.friends || [];
  if (!req.user.friends.includes(code)) req.user.friends.push(code);
  other.friends = other.friends || [];
  if (!other.friends.includes(req.user.code)) other.friends.push(req.user.code);
  saveDB();
  res.json({ ok: true, friends: req.user.friends });
}));

app.delete('/api/me/friends/:code', auth, api((req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  req.user.friends = (req.user.friends || []).filter(c => c !== code);
  const other = Object.values(db.users).find(u => u.code === code);
  if (other) other.friends = (other.friends || []).filter(c => c !== req.user.code);
  saveDB();
  res.json({ ok: true, friends: req.user.friends });
}));

/* 拉取我所有【互为好友】的公开内容（With Friends） */
app.get('/api/friends/feed', auth, api((req, res) => {
  const myCode = req.user.code;
  const list = (req.user.friends || []).map(code => {
    const u = Object.values(db.users).find(x => x.code === code);
    if (!u) return null;
    if (!(u.friends || []).includes(myCode)) return null; // 仅互为好友才共享
    const d = u.data || emptyData();
    return {
      nickname: u.nickname || '好友',
      code: u.code,
      shares: d.shares || [],
      cart: d.cart || [],
      places: d.places || []
    };
  }).filter(Boolean);
  res.json({ ok: true, friends: list });
}));

/* =========================================================
   食物图片识别（大模型视觉 API）
   ========================================================= */
const VISION_PROMPT =
  '你是专业营养师。请识别图片里的食物或饮品，估算每种的中文名称、大致重量（克）、热量（kcal）、碳水（g）、蛋白质（g）、膳食纤维（g）。' +
  '如果是市售饮品（如瑞幸、喜茶、霸王茶姬等），请尽量写出品牌和单品名。数值是估算，可以有一位小数。' +
  '只返回严格的 JSON，不要任何多余文字，格式：' +
  '{"items":[{"name":"食物名","grams":100,"kcal":120,"carbs":20,"protein":8,"fiber":1.5}],"note":"简短说明"}';

const VISION_MISSING_MSG =
  '尚未配置 VISION_API_KEY。请在 Vercel（或本地 .env）设置 VISION_PROVIDER=deepseek、VISION_API_KEY（你的 DeepSeek Key），可选 VISION_MODEL=deepseek-flash、VISION_BASE_URL=https://api.deepseek.com。未配置时请用下方常见食物手动录入，热量、碳水、蛋白质和膳食纤维会按食物库估算。';

function visionSettings() {
  const requested = (process.env.VISION_PROVIDER || 'deepseek').toLowerCase();
  const defaults = {
    deepseek: { base: 'https://api.deepseek.com', model: 'deepseek-flash' },
    zhipu: { base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-flash' },
    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-plus' },
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  };
  const provider = defaults[requested] ? requested : 'deepseek';
  const preset = defaults[provider];
  const customBase = (process.env.VISION_BASE_URL || '').trim().replace(/\/+$/, '');
  const base = customBase || preset.base;
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  return {
    provider,
    url,
    model: (process.env.VISION_MODEL || '').trim() || preset.model,
    key: process.env.VISION_API_KEY || ''
  };
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function chatVision(imageUrls, prompt) {
  const cfg = visionSettings();
  if (!cfg.key) return null;

  const body = {
    model: cfg.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...imageUrls.slice(0, 6).map(u => ({ type: 'image_url', image_url: { url: u } }))
      ]
    }],
    temperature: 0.2,
    max_tokens: 1024
  };
  /* deepseek-flash 是图像理解模型；关掉思考过程，避免 JSON 被推理文本包住 */
  if (cfg.provider === 'deepseek') body.thinking = { type: 'disabled' };

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    const brief = txt.replace(/sk-[A-Za-z0-9_-]+/g, '[key]').slice(0, 180);
    throw new Error(`视觉 API 调用失败 (${resp.status})：${brief}`);
  }
  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content;
  return extractJson(typeof content === 'string' ? content : JSON.stringify(content));
}

async function callVision(dataUrl) {
  return chatVision([dataUrl], VISION_PROMPT);
}

/* 识别结果缓存：同一张图重复识别直接秒回 */
const visionCache = new Map();
const CACHE_MAX = 40;
function cacheKey(image) {
  return crypto.createHash('md5').update(String(image)).digest('hex');
}
function cacheGet(k) {
  if (!visionCache.has(k)) return null;
  const v = visionCache.get(k);
  visionCache.delete(k); visionCache.set(k, v); // LRU
  return v;
}
function cacheSet(k, v) {
  visionCache.set(k, v);
  if (visionCache.size > CACHE_MAX) visionCache.delete(visionCache.keys().next().value);
}

/* 1x1 透明图：用于预热本地视觉模型（ollama 第一次调用要把模型加载进内存，很慢） */
const WARMUP_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let warming = null;
function warmVision() {
  if (!visionSettings().key) return Promise.resolve();
  if (warming) return warming;
  warming = chatVision([WARMUP_IMAGE], '回复 ok').catch(() => {}).finally(() => { warming = null; });
  return warming;
}

/* 把底层网络错误翻译成人话 */
function visionErrHint(e) {
  const msg = String(e && e.message || e);
  const cfg = visionSettings();
  if (/ECONNREFUSED|fetch failed|连接被拒绝/i.test(msg)) {
    if (cfg.provider === 'deepseek') {
      return '连不上 DeepSeek。请确认 VISION_BASE_URL=https://api.deepseek.com（也兼容 /v1），以及 VISION_API_KEY 是否有效。';
    }
    return '视觉模型没连上。请检查 VISION_BASE_URL / VISION_API_KEY，或改用下方常见食物手动录入。';
  }
  if (/timeout|aborted|ETIMEDOUT/i.test(msg)) return '识别超时了，请再试一次。也可以先用常见食物手动录入。';
  if (cfg.provider === 'deepseek' && /model|image|vision|unsupported|invalid/i.test(msg)) {
    return 'DeepSeek 没有完成识图。请确认 VISION_MODEL=deepseek-flash、VISION_PROVIDER=deepseek、VISION_BASE_URL=https://api.deepseek.com。' + msg.slice(0, 140);
  }
  return msg.slice(0, 200);
}

/* ---------- 商品图 / 店铺图：让视觉模型从候选图里挑真正的主图 ---------- */
const PICK_PROMPT = {
  product: '下面是同一个商品页面里的几张候选图。请选出最能代表这个商品本身的主图：' +
    '完整清晰的商品实拍、无水印、不是 logo、不是店铺门头或无关配图。' +
    '只返回严格 JSON，不要多余文字：{"index":序号从1开始,"reason":"一句话理由"}',
  place: '下面是同一家店铺/地点的几张候选图。请选出最能展示这家店的主图：' +
    '优先门头或店内环境实拍，清晰、不是 logo、不是二维码、不是地图截图。' +
    '只返回严格 JSON，不要多余文字：{"index":序号从1开始,"reason":"一句话理由"}'
};

async function visionPick(candidates, kind, title) {
  if (!process.env.VISION_API_KEY || !process.env.VISION_PROVIDER) return null;
  // 本地视觉模型（ollama）较慢，选图默认走启发式；需要时在 .env 设 VISION_PICK=on
  if (/localhost|127\.0\.0\.1/.test(process.env.VISION_BASE_URL || '') && process.env.VISION_PICK !== 'on') return null;
  if (!candidates || candidates.length < 2) return null;
  const prompt = (PICK_PROMPT[kind] || PICK_PROMPT.product) + (title ? `\n参考名称：${title}` : '');
  try {
    const r = await chatVision(candidates.map(c => c.url), prompt);
    const idx = Number(r && r.index);
    if (idx >= 1 && idx <= candidates.length) return candidates[idx - 1].url;
    if (r && r.url && candidates.some(c => c.url === r.url)) return r.url;
    return null;
  } catch (e) {
    console.warn('[vision-pick] 选图失败，沿用启发式结果：', e.message);
    return null;
  }
}

app.post('/api/analyze-food', api(async (req, res) => {
  /* 预热：小程序选完照片就会悄悄调一次，让本地模型提前加载进内存 */
  const body = req.body || {};
  if (body.warm) {
    warmVision();
    return res.json({ ok: true, warmed: true });
  }

  const image = body.image;
  if (!image || !/^data:image\//.test(image)) return res.status(400).json({ ok: false, error: '请上传图片' });

  const cfg = visionSettings();
  if (!cfg.key) {
    return res.json({
      ok: true,
      configured: false,
      provider: cfg.provider,
      model: cfg.model,
      message: VISION_MISSING_MSG,
      items: []
    });
  }

  const key = cacheKey(image);
  const hit = cacheGet(key);
  if (hit) return res.json({ ok: true, configured: true, cached: true, provider: cfg.provider, model: cfg.model, ...hit });

  let result = null;
  try { result = await callVision(image); }
  catch (e) { return res.status(502).json({ ok: false, configured: true, error: visionErrHint(e) }); }

  if (!result || !Array.isArray(result.items)) {
    return res.status(502).json({
      ok: false,
      configured: true,
      error: '模型没有返回可识别的食物列表。请换一张更清晰的照片，或用下方常见食物手动录入。'
    });
  }

  const payload = {
    items: normalizeFoodItems(result.items),
    note: result.note || '识别结果可修改热量和营养素后再加入。'
  };
  cacheSet(key, payload);
  res.json({ ok: true, configured: true, provider: cfg.provider, model: cfg.model, ...payload });
}));

/* ---------- 健康检查 ---------- */
app.get('/api/health', (req, res) => {
  const cfg = visionSettings();
  res.json({
    ok: true,
    vision: !!cfg.key,
    provider: cfg.provider,
    model: cfg.model,
    time: Date.now()
  });
});

/* ---------- 静态前端 ---------- */
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', extensions: ['html'] }));

/* ---------- 稳定性：任何异常都不要让服务退出 ---------- */
process.on('uncaughtException', (e) => console.error('[未捕获异常]', e && e.stack || e));
process.on('unhandledRejection', (e) => console.error('[未处理的Promise]', e && e.stack || e));

module.exports = app;

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    const cfg = visionSettings();
    console.log('');
    console.log('  ☕ About Me 已启动');
    console.log(`  → 打开 http://localhost:${PORT}`);
    console.log(`  → 视觉识别：${cfg.key ? '已配置 (' + cfg.provider + ' / ' + cfg.model + ')' : '未配置（请设置 VISION_API_KEY）'}`);
    if (cfg.key) {
      setTimeout(() => {
        warmVision().then(() => console.log('  🔥 视觉模型已预热，拍照识别就绪'));
      }, 3000);
    }
    console.log('');
  });
}
