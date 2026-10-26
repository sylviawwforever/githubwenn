'use strict';

/* =========================================================================
 * link-preview-core.js
 * 商品 / 店铺链接识别核心（本地 server.js 与 Netlify Function 共用）
 *
 * 设计要点：
 *  1) 拟人反爬：轮换真实 UA + 客户端提示头(sec-ch-ua)，Cookie 复用，
 *     请求前随机「思考/眼动」停顿，被拦后更长停顿再换 UA 重试。
 *  2) 多图源并行：页面 OG 主图 + 百度图片 + 必应(Bing)图片，谁先回用谁。
 *  3) 多路取价：分享文案 / 短链参数 / 页面 OG / JSON-LD / 页面内嵌 JSON。
 * ========================================================================= */

/* ---------- 拟人浏览器身份：轮换 UA + 客户端提示 ---------- */
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomUA = () => pick(UA_POOL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => Math.round(a + Math.random() * (b - a));
/* 单源超时保护：谁磨蹭就先放弃谁，绝不让一个慢源拖垮整体 */
const withTimeout = (p, ms, fallback = null) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

/* 人眼「扫读」节奏：被拦后像人一样停顿、换姿势重试
   —— 停顿不是越久越好，而是「短链解析几乎不停、搜索源之间错峰、被拦才长停」 */
const HUMAN = {
  thinkMin: 220, thinkMax: 620,     // 常规请求前的随机停顿（模拟眼动/扫读）
  thinkShortMin: 60, thinkShortMax: 180, // 短链跳转：几乎不犹豫（真人点链接也是秒跳）
  retryMin: 900, retryMax: 2200,    // 被反爬拦截后的再思考停顿（人看到验证码会愣一下）
  betweenSourceMin: 120, betweenSourceMax: 400
};

/* ---------- 反爬标题黑名单 ---------- */
const BAD_TITLE = /^(登录|注册|验证中心|身份核实|安全验证|访问验证|滑动验证|403 Forbidden|404|405|500|502|503|Just a moment|商品详情页|京东-欢迎登录|页面不存在|安全提示|大众点评|美团)/i;
const JUNK_IMAGE = /(logo|favicon|sprite|placeholder|loading|blank|pixel|beacon|track|qrcode|qr_|_qr|erweima|watermark|avatar|head_?img|icon_|_icon|btn|button|arrow|close|share_?pic|share_?code|1x1|spacer|static\/common|dppclogin|dpstatic)/i;

/* =========================================================================
 * 基础工具
 * ========================================================================= */
function decodeEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (a) return a[1];
  const b = String(html).match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return b ? b[1] : null;
}

function cleanTitle(value) {
  if (!value) return null;
  let title = decodeEntities(value);
  title = title.replace(/^【[^】]{1,16}】\s*/g, '').trim();
  title = title.replace(/\s*[-–·|_]\s*(淘宝网|淘宝|天猫|京东|京东商城|拼多多|pd\.com|大众点评|美团|百度地图|baidu|高德地图)\s*$/i, '').trim();
  if (!title || BAD_TITLE.test(title)) return null;
  return title.slice(0, 120);
}

function isUselessTitle(t) {
  if (!t) return true;
  const s = t.replace(/[\s\-_|–·]/g, '').toLowerCase();
  return /^(淘宝网|淘宝|天猫|京东|京东商城|拼多多|欢迎登录|安全验证|商品详情页|页面不存在|baidu|amap|高德地图)$/.test(s) || s.length < 3;
}

function absoluteUrl(raw, base) {
  if (!raw) return null;
  let value = decodeEntities(String(raw)).replace(/^['"]|['"]$/g, '').trim();
  if (!value || /^(data:|javascript:|blob:)/i.test(value)) return null;
  if (value.startsWith('//')) value = 'https:' + value;
  try { value = new URL(value, base || 'https://www.taobao.com/').href; } catch { return null; }
  if (!/^https?:\/\//i.test(value)) return null;
  if (/^http:\/\//i.test(value) && /(baidu|alicdn|taobao|tmall|meituan|dianping|dpfile|pstatp|hdslb|sinaimg|360buyimg|bcebos|zhimg|qpic|gtimg)/i.test(value)) {
    value = value.replace(/^http:/i, 'https:');
  }
  return value;
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function detectKind(url = '') {
  if (/dianping\.com|dpurl\.cn|meituan\.com|sankuai\.com|map\.baidu\.com|baidu\.com\/map|amap\.com|dianping/.test(url)) return 'place';
  return 'product';
}

function isBlockedUrl(url = '') {
  try {
    const u = new URL(url);
    if (/login|passport|verify|captcha|account/i.test(u.pathname)) return true;
    if (/(^|\.)account\.|(^|\.)passport\.|verify\.meituan\.com/i.test(u.hostname)) return true;
  } catch {}
  return false;
}

function isHardBlock(res) {
  if (!res || !res.text) return true;
  const t = res.text.slice(0, 1600).toLowerCase();
  return /(请完成安全验证|身份核实|访问过于频繁|请输入验证码|slide to verify|just a moment|checking your browser|访问验证|安全验证|robot|verify you are human|异常请求|访问频率)/.test(t);
}

/* 从分享文案里抠商品名 / 店铺名 */
function hintFrom(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  let name = (raw.match(/[「『]([^」』]+)[」』]/) || [])[1] || '';
  if (!name) {
    const brackets = (raw.match(/【([^】]+)】/g) || [])
      .map((s) => s.slice(1, -1))
      .filter((s) => !/淘宝|天猫|京东|拼多多|小红书|抖音|会员|抢先|假一赔|旗舰店|复制|分享|好物|推荐/.test(s));
    name = brackets[0] || '';
  }
  if (!name) {
    name = raw
      .replace(/https?:\/\/[^\s"'<>）），,、]+/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[「」『』\[\]]/g, ' ')
      .replace(/点击链接|复制此条|复制打开|打开链接|直接打开|去淘宝|淘宝搜|长按复制|查看详情|长按复制此链接|打开淘宝搜索/g, ' ')
      .replace(/人均\s*\d+(?:\.\d+)?\s*[-~至]?\s*\d*(?:\.\d+)?\s*元/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!name || /^https?:/i.test(name)) return '';
  return name.slice(0, 80);
}

/* =========================================================================
 * 价格提取（多路）
 * ========================================================================= */
function parsePrice(text) {
  const s = String(text || '').replace(/\u00a0/g, ' ');
  if (!s) return null;
  const range = s.match(/(?:￥|¥|价格|售价|券后|到手价)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元)?\s*[-~至]\s*(\d+(?:\.\d{1,2})?)\s*元/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > 0 && max >= min && max < 10000000) return { min, max };
  }
  const money = s.match(/(?:券后|到手价|活动价|售价|价格|现价|一口价|券后价|到手)\s*[:：]?\s*[￥¥]?\s*(\d+(?:\.\d{1,2})?)/i);
  if (money) {
    const value = Number(money[1]);
    if (value > 0 && value < 10000000) return { min: value, max: value };
  }
  const yuanMark = s.match(/[￥¥]\s*(\d+(?:\.\d{1,2})?)/);
  if (yuanMark) {
    const value = Number(yuanMark[1]);
    if (value > 0 && value < 10000000) return { min: value, max: value };
  }
  const yuan = s.match(/(\d+(?:\.\d{1,2})?)\s*元(?!\s*(?:起|运费|优惠|券|红包|每人|人均))/);
  if (yuan) {
    const value = Number(yuan[1]);
    if (value > 0 && value < 10000000) return { min: value, max: value };
  }
  return null;
}

function priceFromUrl(url) {
  try {
    const u = new URL(url);
    const keys = ['price', 'default_price', 'defaultPrice', 'salePrice', 'currentPrice', 'finalPrice', 'skuPrice'];
    for (const key of keys) {
      const value = Number(u.searchParams.get(key));
      if (value > 0 && value < 10000000) return { min: value, max: value };
    }
  } catch {}
  return null;
}

function priceFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /(?:property|name)=["'](?:og:price:amount|product:price:amount|og:price)["'][^>]+content=["']([\d.]+)["']/i,
    /content=["']([\d.]+)["'][^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount|og:price)["']/i,
    /"price"\s*:\s*"?([\d]+(?:\.\d+)?)"?/i,
    /"priceText"\s*:\s*"[^"￥¥]*([\d]+(?:\.\d+)?)"/i,
    /"defaultPrice"\s*:\s*"?([\d]+(?:\.\d+)?)"?/i,
    /"salePrice"\s*:\s*"?([\d]+(?:\.\d+)?)"?/i,
    /"finalPrice"\s*:\s*"?([\d]+(?:\.\d+)?)"?/i,
    /"skuPrice"\s*:\s*"?([\d]+(?:\.\d+)?)"?/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const value = Number(m[1]);
      if (value > 0 && value < 10000000) return { min: value, max: value };
    }
  }
  return null;
}

function priceFromJsonLd(html) {
  if (!html) return null;
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) { for (const x of node) { const r = walk(x); if (r) return r; } return null; }
        if (node.offers && (node.offers.price != null || (node.offers.lowPrice != null))) {
          const p = node.offers.price != null ? Number(node.offers.price)
            : Math.min(Number(node.offers.lowPrice) || 0, Number(node.offers.highPrice) || 0);
          if (p > 0) return { min: p, max: p };
        }
        for (const k of Object.keys(node)) { const r = walk(node[k]); if (r) return r; }
        return null;
      };
      const r = walk(JSON.parse(body.trim()));
      if (r) return r;
    } catch {}
  }
  return null;
}

/* =========================================================================
 * 商品搜索词构造
 * 百度图片只有在「商品名 + 平台名」时才返回带真实售价的「商品卡片」，
 * 所以按平台补上限定词，能极大提高价格命中率。
 * ========================================================================= */
const PLATFORM_WORDS = {
  taobao: /taobao\.com|tmall\.com|e\.tb\.cn|m\.tb\.cn|\btb\.cn\b|tbcdn/i,
  jd: /jd\.com|360buyimg|\bjd\b/i,
  pdd: /pinduoduo|pdd\.com|yangkeduo/i,
  dianping: /dianping|dpurl\.cn|meituan/i
};

function platformWord(url = '', kind = 'product') {
  const u = String(url || '');
  if (PLATFORM_WORDS.taobao.test(u)) return '淘宝';
  if (PLATFORM_WORDS.jd.test(u)) return '京东';
  if (PLATFORM_WORDS.pdd.test(u)) return '拼多多';
  if (PLATFORM_WORDS.dianping.test(u)) return '大众点评';
  return kind === 'place' ? '大众点评' : '淘宝';
}

/* 去掉分享文案里的营销噪音，让搜索词更贴近真实商品名 */
function cleanSearchTerm(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.replace(/【[^】]{0,12}】/g, ' ');          // 【双十一】【天猫】等角标
  s = s.replace(/\[[^\]]{0,12}\]/g, ' ');
  s = s.replace(/[「」『』]/g, ' ');
  s = s.replace(/\b(?:CZ|cz)[0-9A-Za-z]{4,12}\b/g, ' '); // 淘口令编号
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 60);
}

async function baiduImagesLegacy(query, kind) {
  const r = await baiduImages(query, kind);
  return r.images || [];
}

/* =========================================================================
 * 拟人抓取层
 * ========================================================================= */
function buildHeaders({ ua, referer, accept }) {
  const mobile = /\biPhone\b|Android|Mobile|iPad/i.test(ua);
  const platform = /Mac/i.test(ua) ? '"macOS"'
    : /Windows/i.test(ua) ? '"Windows"'
    : /Android/i.test(ua) ? '"Android"'
    : /iPhone|iPad/i.test(ua) ? '"iOS"'
    : '"Unknown"';
  const headers = {
    'User-Agent': ua,
    'Accept': accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not?A_Brand";v="24"',
    'sec-ch-ua-mobile': mobile ? '?1' : '?0',
    'sec-ch-ua-platform': platform,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  if (referer) headers.Referer = referer;
  return headers;
}

function makeJar() {
  const jar = new Map();
  return {
    header() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
    absorb(res) {
      let list = [];
      try {
        if (typeof res.headers.getSetCookie === 'function') list = res.headers.getSetCookie();
        else { const raw = res.headers.get('set-cookie'); if (raw) list = raw.split(/,(?=[^;,]+=)/); }
      } catch {}
      for (const item of list) {
        const pair = String(item).split(';')[0];
        const idx = pair.indexOf('=');
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    }
  };
}

async function requestText(url, opts = {}) {
  const { ua = randomUA(), referer = '', jar = null, timeout = 5000, accept, extra = {} } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = buildHeaders({ ua, referer, accept });
    Object.assign(headers, extra);
    if (jar) { const cookie = jar.header(); if (cookie) headers.Cookie = cookie; }
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers });
    if (jar) jar.absorb(res);
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, contentType: res.headers.get('content-type') || '', text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* 拟人节奏抓取：请求前随机停顿，被反爬拦截后换 UA、更长停顿重试
   fast=true 用于短链跳转 —— 真人点链接不会犹豫，但被拦后一样会停顿 */
async function scrape(url, { retries = 2, referer = '', jar = null, timeout = 5000, accept, extra, fast = false } = {}) {
  await sleep(fast
    ? jitter(HUMAN.thinkShortMin, HUMAN.thinkShortMax)
    : jitter(HUMAN.thinkMin, HUMAN.thinkMax));
  let last = null;
  for (let i = 0; i <= retries; i++) {
    const res = await requestText(url, { ua: randomUA(), referer, jar, timeout, accept, extra });
    if (res && res.text && !isHardBlock(res)) return res;
    last = res;
    if (i < retries) await sleep(jitter(HUMAN.retryMin, HUMAN.retryMax));
  }
  return last;
}

/* =========================================================================
 * 短链解析（淘宝/天猫/京东/拼多多/抖音/小红书等）
 * ========================================================================= */
async function resolveShortLink(url) {
  if (!url) return null;
  let host = hostOf(url);
  const shortHost = /(^|\.)(e\.tb\.cn|m\.tb\.cn|s\.tb\.cn|tb\.cn|dpurl\.cn|url\.cn|t\.cn|dwz\.cn|uee\.me|tb\.am|s\.click\.taobao\.com|uland\.taobao\.com|item\.jd\.com|haohuo\.jd\.com|jd\.com|v\.dianping\.com|meishi\.cn)$/i.test(host);
  if (!shortHost) {
    /* 非短链：直接从 URL 里抠 item id */
    return { target: url, price: priceFromUrl(url), itemId: itemIdFromUrl(url) };
  }
  /* 短链：真人点链接是秒跳，所以用 fast 节奏 */
  const result = await scrape(url, { ua: UA_POOL[3], referer: 'https://m.taobao.com/', timeout: 5000, retries: 1, fast: true });
  if (!result) return { target: url, price: priceFromUrl(url), itemId: itemIdFromUrl(url) };
  const html = result.text || '';
  let target = '';
  const varMatch = html.match(/(?:var\s+url|var\s+target|window\.location(?:\.href)?)\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
  if (varMatch) target = varMatch[1];
  if (!target) {
    const meta = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'\s]+)["']/i);
    if (meta) target = meta[1];
  }
  if (!target) {
    const direct = html.match(/https?:\/\/(?:item\.taobao\.com|detail\.tmall\.com|item\.jd\.com|pages-fast\.m\.taobao\.com|www\.dianping\.com|m\.dianping\.com|map\.baidu\.com|detail\.youzan\.com|item\.yunji\.com)[^\s"'<>\\]+/i);
    if (direct) target = direct[0].replace(/&amp;/g, '&');
  }
  if (!target) target = result.url || url;
  target = decodeEntities(target);
  const fromTarget = priceFromUrl(target);
  const fromHtml = parsePrice(html);
  const priceParam = html.match(/[?&]price=([\d.]+)/i);
  const price = fromTarget
    || (priceParam ? { min: Number(priceParam[1]), max: Number(priceParam[1]) } : null)
    || fromHtml;
  /* 淘宝短链里的 trid / itemId / id 参数都能定位到商品 */
  const itemId = itemIdFromUrl(target)
    || (html.match(/[?&](?:trid|itemId|item_id|num_iid|nid)=([A-Za-z0-9_-]{6,40})/i) || [])[1]
    || null;
  return { target, price, itemId };
}

/* 从 URL 里提取商品 ID（淘宝 id / 京东 sku / 点评 poi） */
function itemIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[?&](?:id|itemId|item_id|num_iid|skuId|sku|spu|poiid|deal_id)=([A-Za-z0-9_-]{4,60})/i);
  return m ? m[1] : null;
}

/* =========================================================================
 * 页面主图 / 标题 / 价格
 * ========================================================================= */
function collectPageImages(html, base) {
  const out = [];
  const seen = new Set();
  const add = (raw, source, label = '', role = '') => {
    const url = absoluteUrl(raw, base);
    if (!url || seen.has(url) || JUNK_IMAGE.test(url)) return;
    seen.add(url);
    out.push({ url, source, label, role });
  };
  if (!html) return out;
  [['og:image', 'og'], ['og:image:url', 'og'], ['og:image:secure_url', 'og'], ['twitter:image', 'twitter'], ['twitter:image:src', 'twitter'], ['image', 'og']]
    .forEach(([name, source]) => { const value = metaContent(html, name); if (value) add(value, source); });
  (html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []).forEach((block) => {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') return;
        Object.keys(node).forEach((key) => {
          const value = node[key];
          if (/^(image|photo|thumbnail|contentUrl)$/i.test(key) && typeof value === 'string') add(value, 'ld', node.name || '');
          else if (/^(image|images)\b/i.test(key) && Array.isArray(value) && value[0] && typeof value[0] === 'string') add(value[0], 'ld', '');
          else walk(value);
        });
      };
      walk(JSON.parse(body.trim()));
    } catch {}
  });
  (html.match(/<img\b[^>]*>/gi) || []).forEach((tag) => {
    const label = (tag.match(/(?:alt|title)=["']([^"']{0,80})["']/i) || [])[1] || '';
    const cls = ((tag.match(/\sclass=["']([^"']*)["']/i) || [])[1] || '') + ' ' + ((tag.match(/\sid=["']([^"']*)["']/i) || [])[1] || '');
    const role = /thumbnail|gallery|swiper|slider|carousel|mainPic|main-?pic|item-?pic|product-?pic/i.test(cls) ? 'gallery'
      : /desc|detail|richImg|content-?desc/i.test(cls) ? 'desc' : '';
    const src = (tag.match(/(?:\ssrc|data-src|data-original|data-lazy-src|data-echo|data-url)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src) add(src, 'img', label, role);
    const srcset = (tag.match(/srcset\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (srcset) {
      const parts = srcset.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
      if (parts.length) add(parts[parts.length - 1], 'img', label, role);
    }
  });
  const keyRe = /"(?:picUrl|mainPic|mainPicUrl|imgUrl|imageUrl|imageurl|searchImg|itemPic|itemPicUrl|pic|photo|cover|headImage|shopImg|shopImage|poiImage|envImg|listPic)"\s*:\s*"((?:https?:)?\\?\/[^"]{6,800}?)"/gi;
  let m;
  while ((m = keyRe.exec(html)) !== null) add(m[1], 'json');
  const cdnRe = /https?:\\?\/\\?\/(?:img\d?\.alicdn\.com|img\.meituan\.net|img\.dianping\.com|[a-z0-9-]+\.dpfile\.com|p\d+\.pstatp\.com|bdimg\.com|bcebos\.com|360buyimg\.com)[^\s"'<>\\]{10,500}?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>\\]*)?/gi;
  while ((m = cdnRe.exec(html)) !== null) add(m[0], 'json');
  return out;
}

async function fetchPageInfo(url, kind) {
  if (!url) return null;
  if (isBlockedUrl(url)) return { blocked: true };
  const result = await scrape(url, { referer: '', timeout: 4500, retries: 1 });
  if (!result || !result.text) return null;
  const html = result.text;
  const rawTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const title = cleanTitle(metaContent(html, 'og:title') || rawTitle);
  const textSample = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200);
  const blocked = isHardBlock(result)
    || /请完成安全验证|身份核实|访问过于频繁|账号登录\/注册|APP扫码|继续滑动|拼多多风控|拼多多安全验证/.test(textSample)
    || (rawTitle && BAD_TITLE.test(decodeEntities(rawTitle)));
  if (blocked) {
    const price = priceFromHtml(html) || priceFromJsonLd(html);
    return { blocked: true, title: isUselessTitle(title) ? null : title, price };
  }
  return {
    url: result.url,
    title,
    price: priceFromHtml(html) || priceFromJsonLd(html),
    candidates: collectPageImages(html, result.url).map((c) => ({ ...c, kind }))
  };
}

/* =========================================================================
 * 百度图片搜索（按名称匹配，拟人 UA + Cookie 复用）
 * ========================================================================= */
function parseBaiduJson(text) {
  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')); } catch {}
  return null;
}

function parseOriginUrl(replaceUrl) {
  if (!replaceUrl) return null;
  const m = String(replaceUrl).match(/ObjURL['"]?\s*:\s*['"]([^'"]+)['"]/i);
  if (!m) return null;
  const url = decodeEntities(m[1]);
  if (!/^https?:\/\//i.test(url)) return null;
  if (!/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url) && !/(alicdn\.com|360buyimg\.com|meituan\.net|dpfile\.com|xhscdn|pstatp)/i.test(url)) return null;
  return url;
}

function imageScore(candidate, hint, kind) {
  const url = String(candidate.url || '');
  const lower = url.toLowerCase();
  /* source 基准分：origin=官方原图直链（最权威）> commodity=商品卡片图 > og/ld > 搜索图 */
  let score = { og: 50, ld: 48, twitter: 45, json: 34, img: 26, bing: 33, search: 32, origin: 78, commodity: 62, shot: -999 }[candidate.source] ?? 20;
  /* 官方商品图 CDN（alicdn / 360buyimg）说明是真实商品图 */
  if (/alicdn\.com|taobao\.com|tmall\.com|tbcdn\.cn|360buyimg\.com|jdcdn/.test(lower)) {
    score += candidate.source === 'origin' ? 18 : 26;
  }
  if (/meituan\.net|dianping\.com|dpfile\.com|dpmobile|sankuai\.com/.test(lower)) score += kind === 'place' ? 34 : 8;
  if (/bcebos\.com|bdimg\.com|baidu\.com/.test(lower)) score += kind === 'place' ? 26 : 10;
  if (/bing\.com|bing\.net/.test(lower)) score += 6;
  if (/xhscdn|xiaohongshu|xhsurl/.test(lower)) score += 24;
  if (/pstatp|douyin|kuaishou/.test(lower)) score += 20;
  /* 百度代理图（imgX.baidu.com/it/u=...）是二手中转，能显示但不如原图直链 */
  if (/baidu\.com\/it\/u\/|\bt\d+\.baidu\.com\b/.test(lower)) score -= 12;
  if (JUNK_IMAGE.test(lower)) score -= 60;
  if (/\.svg(\?|$)/.test(lower)) score -= 50;
  if (/@\d+[xX]\d+|[_-]\d{2,3}[xX]\d{2,3}[_-]/.test(lower)) score -= 18;
  if (candidate.role === 'gallery') score += 32;
  if (candidate.role === 'desc') score -= 38;
  const w = Number(candidate.w) || 0;
  const h = Number(candidate.h) || 0;
  if (w && h) {
    const area = w * h;
    const ratio = w / h;
    if (w < 120 || h < 120) score -= 55;
    else if (area >= 600 * 600) score += 34;
    else if (area >= 300 * 300) score += 20;
    if (ratio >= 0.6 && ratio <= 1.7) score += 14;
    else if (ratio > 2.6 || ratio < 0.34) score -= 24;
  }
  const label = String(candidate.label || '').toLowerCase();
  if (label && hint) {
    const tokens = tokenize(hint);
    const hits = tokens.filter((t) => label.includes(t)).length;
    if (hits) score += Math.min(34, 8 + hits * 8);
    else if (candidate.source === 'search' || candidate.source === 'bing') score -= 8;
  }
  return Math.round(score);
}

function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const latin = s.match(/[a-z0-9]{3,}/g) || [];
  const cjk = (s.match(/[一-龥]{2,}/g) || []).flatMap((w) => {
    if (w.length <= 3) return [w];
    const out = [];
    for (let i = 0; i < w.length - 1; i += 2) out.push(w.slice(i, i + 2));
    return out;
  });
  return [...new Set([...latin, ...cjk])].filter((t) => t.length >= 2);
}

let baiduJar = makeJar();
let baiduWarmedAt = 0;
let baiduWarmPromise = null;

async function warmBaidu(query, force = false) {
  if (!force && Date.now() - baiduWarmedAt < 4 * 60 * 1000) return baiduJar;
  if (!force && baiduWarmPromise) return baiduWarmPromise;
  if (force) baiduJar = makeJar();
  baiduWarmPromise = (async () => {
    const res = await requestText('https://image.baidu.com/', { ua: randomUA(), timeout: 5000, jar: baiduJar });
    if (res) baiduWarmedAt = Date.now();
    return baiduJar;
  })();
  try { return await baiduWarmPromise; } finally { baiduWarmPromise = null; }
}

async function baiduImages(query, kind) {
  const q = String(query || '').trim();
  if (q.length < 2) return { images: [], products: [] };
  const params = new URLSearchParams({
    tn: 'resultjson_com', logid: '1', ipn: 'rj', ct: '201326592', fp: 'result', fr: '',
    word: q, queryWord: q, cl: '2', lm: '-1', ie: 'utf-8', oe: 'utf-8', st: '-1',
    pn: '0', rn: '30', gsm: '1e'
  });
  const searchUrl = 'https://image.baidu.com/search/acjson?' + params.toString();
  const jar = (Date.now() - baiduWarmedAt < 4 * 60 * 1000) ? baiduJar : await warmBaidu(q);
  const res = await scrape(searchUrl, {
    referer: 'https://image.baidu.com/',
    accept: 'application/json, text/javascript, */*; q=0.01',
    jar, timeout: 6000, retries: 2
  });
  if (!res || !res.text) return { images: [], products: [] };
  const parsed = parseBaiduJson(res.text);
  if (!parsed || parsed.antiFlag || !Array.isArray(parsed.data)) return { images: [], products: [] };
  const out = [];
  const products = [];
  const seen = new Set();
  for (const item of parsed.data || []) {
    if (!item) continue;
    const label = decodeEntities(item.fromPageTitleEnc || item.fromPageTitle || '');
    const candidates = [item.thumbURL, item.middleURL, item.hoverURL].filter(Boolean);
    const origin = parseOriginUrl(item.replaceUrl);
    if (origin) candidates.unshift(origin);
    for (const raw of candidates) {
      const url = absoluteUrl(raw, 'https://image.baidu.com/');
      if (!url || seen.has(url) || JUNK_IMAGE.test(url)) continue;
      seen.add(url);
      const source = raw === origin ? 'origin' : 'search';
      const w = Number(item.width) || Number((url.match(/[?&]w=(\d+)/) || [])[1]) || 0;
      const h = Number(item.height) || Number((url.match(/[?&]h=(\d+)/) || [])[1]) || 0;
      out.push({ url, source, label, w, h, kind });
    }
    /* ★ 百度图片的「商品卡片」：带真实售价 + 官方标题 + 落地页
       这是淘宝/京东商品价格最可靠的公开来源（普通图片结果里没有价格） */
    const ci = item.commodityInfo;
    if (ci && typeof ci === 'object') {
      const p = Number(ci.price);
      if (p > 0 && p < 10000000) {
        const land = absoluteUrl(ci.landpage_url || ci.cps_url || '', 'https://image.baidu.com/');
        const img = absoluteUrl(
          item.thumbURL || item.middleURL || item.hoverURL || (origin || ''),
          'https://image.baidu.com/'
        );
        if (img) {
          products.push({
            url: img, source: 'commodity', label,
            title: decodeEntities(item.fromPageTitleEnc || item.fromPageTitle || ''),
            price: p, shop: ci.source || '', landpage: land,
            w: Number(item.width) || 0, h: Number(item.height) || 0, kind
          });
        }
      }
    }
  }
  out.sort((a, b) => imageScore(b, q, kind) - imageScore(a, q, kind));
  const best = [];
  const byLabel = new Set();
  for (const item of out) {
    const key = item.label.slice(0, 50) || item.url;
    if (byLabel.has(key)) continue;
    byLabel.add(key);
    best.push(item);
    if (best.length >= 12) break;
  }
  return { images: best, products };
}

/* =========================================================================
 * 必应(Bing)图片搜索（云函数环境更稳，作为并行图源）
 * ========================================================================= */
async function bingImages(query, kind) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(q) + '&form=HDRSC2&first=1&count=35';
  const res = await scrape(url, {
    referer: 'https://www.bing.com/',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    timeout: 6000, retries: 2
  });
  if (!res || !res.text) return [];
  const html = res.text
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const urls = [];
  const seen = new Set();
  const push = (u) => {
    const abs = absoluteUrl(u);
    if (!abs || seen.has(abs) || JUNK_IMAGE.test(abs)) return;
    seen.add(abs); urls.push(abs);
  };
  let m;
  const mre = /"murl"\s*:\s*"(https?:\/\/[^"]+)"/g;
  while ((m = mre.exec(html))) push(m[1]);
  const ire = /"imgurl"\s*:\s*"(https?:\/\/[^"]+)"/g;
  while ((m = ire.exec(html))) push(m[1]);
  const tre = /"turl"\s*:\s*"(https?:\/\/[^"]+)"/g;
  while ((m = tre.exec(html))) push(m[1]);
  const cands = urls.slice(0, 28).map((u) => ({ url: u, source: 'bing', label: '', w: 0, h: 0, kind }));
  cands.sort((a, b) => imageScore(b, q, kind) - imageScore(a, q, kind));
  return cands.slice(0, 14);
}

/* =========================================================================
 * 商品落地页精读
 * 百度商品卡片只给「代理图 + 价格」，落地页里才有「官方主图直链 + 官方标题」。
 * 京东移动版(item.m.jd.com)是静态渲染的，能直接抠出主图路径与标题；
 * 淘宝落地页则回落到 alicdn 图源。
 * ========================================================================= */
const JD_IMAGE_HOSTS = ['img14.360buyimg.com', 'img10.360buyimg.com', 'img11.360buyimg.com', 'img12.360buyimg.com', 'img13.360buyimg.com'];

/* 标题与商品名的匹配度（0~1），用来挑最准的那件商品 */
function titleMatch(title, hint) {
  const t = String(title || '').toLowerCase();
  const h = String(hint || '').toLowerCase();
  if (!t || !h) return 0;
  const tokens = tokenize(h);
  if (!tokens.length) return 0;
  const hits = tokens.filter((x) => t.includes(x)).length;
  return hits / tokens.length;
}

/* 京东移动页：抠官方主图直链 + 官方标题 */
async function readJdMobile(sku, withPrice = true) {
  const url = `https://item.m.jd.com/product/${sku}.html`;
  const res = await scrape(url, {
    ua: UA_POOL[3], referer: 'https://item.m.jd.com/', timeout: 4500, retries: 1, fast: true
  });
  if (!res || !res.text) return null;
  const html = res.text;
  const title = decodeEntities((html.match(/"skuName"\s*:\s*"([^"]{4,120})"/) || [])[1] || '')
    || decodeEntities((html.match(/<title>([^<]{4,140})<\/title>/i) || [])[1] || '').replace(/\s*[-–_]\s*京东.*$/, '');
  const imgPath = (html.match(/"imageurl"\s*:\s*"(jfs\/[^"]+?\.(?:jpg|png|webp))"/i) || [])[1]
    || (html.match(/"(?:mainImage|imageList\[0\])"\s*:\s*"(jfs\/[^"]+?\.(?:jpg|png|webp))"/i) || [])[1]
    || null;
  const image = imgPath ? `https://${JD_IMAGE_HOSTS[0]}/n0/${imgPath}` : null;
  /* 京东价在页面里是脱敏的（1??9），真实价用 p.3.cn 接口补 */
  let price = null;
  if (withPrice) {
    const pj = await requestText(`https://p.3.cn/prices/mgets?skuIds=J_${sku}&type=1`, {
      ua: UA_POOL[3], referer: 'https://item.m.jd.com/', timeout: 3000
    });
    if (pj && pj.text) {
      const m = pj.text.match(/"p"\s*:\s*"?([\d.]+)"?/);
      if (m && Number(m[1]) > 0) price = { min: Number(m[1]), max: Number(m[1]) };
    }
  }
  return { title: title || null, image, price, url };
}

/* 从商品卡片里挑出候选落地页（京东 SKU 最多） */
function pickDeepLinks(products, limit = 3) {
  const out = [];
  const seen = new Set();
  for (const p of products) {
    const land = String(p.landpage || '');
    const m = land.match(/item\.(?:m\.)?jd\.com\/(?:product\/)?(\d+)\.html/i);
    if (!m) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ sku: m[1], land, product: p });
    if (out.length >= limit) break;
  }
  return out;
}

/* =========================================================================
 * 合并排序 / 截图兜底
 * ========================================================================= */
/* 商品卡片评分：标题越贴合商品名，价格越可信 */
function productScore(product, hint, kind) {
  let score = 60;
  const title = String(product.title || product.label || '').toLowerCase();
  const tokens = tokenize(hint);
  if (tokens.length && title) {
    const hits = tokens.filter((t) => title.includes(t)).length;
    score += Math.min(40, hits * 9);
  }
  const shop = String(product.shop || '').toLowerCase();
  if (kind === 'place' && /点评|美团/.test(shop)) score += 22;
  if (kind === 'product' && /淘宝|天猫/.test(shop)) score += 22;
  if (kind === 'product' && /京东/.test(shop)) score += 16;
  if (/alicdn|taobao|tmall|360buyimg/.test(String(product.url || '').toLowerCase())) score += 14;
  return score;
}

function dedupeAndRank(candidates, hint, kind, limit = 8) {
  const out = [];
  const seen = new Set();
  for (const candidate of candidates || []) {
    if (!candidate || !candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    out.push(candidate);
  }
  out.forEach((c) => { c.score = imageScore(c, hint, kind); });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function screenshotUrl(url) {
  return 'https://image.thum.io/get/width/600/crop/900/noanimate/' + url;
}

/* =========================================================================
 * 主入口
 * ========================================================================= */
const cache = new Map();
const inflight = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 200;
const IMG_EXT = /\.(?:jpg|jpeg|png|webp|gif|bmp)(?:\?|$)/i;

function cacheKey({ url, text, kind }) {
  return `${kind || ''}|${url || ''}|${String(text || '').slice(0, 120)}`;
}

/* 并行图源搜索：返回 { images, products }
   - 图源用「干净商品名」→ 命中原店铺主图，最准
   - 价格查询用「商品名 + 平台名」→ 命中带真实售价的「商品卡片」 */
async function searchByHint(hint, kind, url, withProducts) {
  if (!hint || hint.length < 2) return { images: [], products: [] };
  const term = cleanSearchTerm(hint);
  const platform = platformWord(url, kind);

  const tasks = [
    withTimeout(baiduImages(term, kind), 3800, { images: [], products: [] }),
    withTimeout(bingImages(term, kind), 3800, [])
  ];
  if (withProducts !== false) {
    /* 带平台词的查询：既能命中商品卡片，图也基本不偏 */
    tasks.push(withTimeout(baiduImages(`${term} ${platform}`, kind), 4200, { images: [], products: [] }));
  }
  const settled = await Promise.allSettled(tasks);

  const images = [];
  const products = [];
  settled.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    const v = r.value;
    if (Array.isArray(v)) { images.push(...v); return; }
    if (v && typeof v === 'object') {
      images.push(...(v.images || []));
      products.push(...(v.products || []));
    }
  });
  return { images, products };
}

async function previewLink(input = {}) {
  const urlMatch = String(input.url || '').match(/https?:\/\/[^\s"'<>）），,、]+/);
  const url = urlMatch ? urlMatch[0] : '';
  const rawText = String(input.text || input.hint || url || '');
  const kind = input.kind === 'place' ? 'place' : input.kind === 'product' ? 'product' : detectKind(url);
  const hint = hintFrom(rawText) || hintFrom(input.hint || '');
  const key = cacheKey({ url, text: rawText, kind });

  /* ★ 软截止：调用方给一个绝对时间戳，到了就「收手」返回已有最好结果，
       绝不空手超时 —— 慢网络下也能拿到标题+价格+图，而不是只剩一张截图 */
  const deadline = Number(input.deadline) || 0;
  const left = () => (deadline ? deadline - Date.now() : 86400000);
  const budget = (ms, floor = 0) => Math.max(floor, Math.min(ms, left() - 150));

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    /* 直接就是图片链接：秒回 */
    if (url && IMG_EXT.test(url)) {
      return {
        url: url || null, image: url, title: hint || null,
        price: parsePrice(rawText), shot: false, source: 'direct',
        note: '这个链接本身就是图片。', candidates: []
      };
    }

    const textPrice = parsePrice(rawText);

    /* ★ 全链路并行：三路同时启动，谁先回用谁 —— 这是速度的关键
       A) 短链解析      → 拿最终 URL / item id
       B) 百度图源(净名) → 商品主图
       C) 百度图源(带平台词) → 商品卡片（真实售价）+ 落地页
       D) 必应图源      → 备用图源 */
    const term = cleanSearchTerm(hint);
    const platform = platformWord(url, kind);
    const emptyImgs = { images: [], products: [] };
    const shortTask = url
      ? withTimeout(resolveShortLink(url).catch(() => null), budget(3000, 600), null)
      : Promise.resolve(null);
    const baiduPlainTask = term
      ? withTimeout(baiduImages(term, kind), budget(3600, 800), emptyImgs)
      : Promise.resolve(emptyImgs);
    const baiduShopTask = term
      ? withTimeout(baiduImages(`${term} ${platform}`, kind), budget(4000, 900), emptyImgs)
      : Promise.resolve(emptyImgs);
    const bingTask = term
      ? withTimeout(bingImages(term, kind), budget(3600, 800), [])
      : Promise.resolve([]);

    const [short, baiduPlain, baiduShop, bing] = await Promise.all([
      shortTask, baiduPlainTask, baiduShopTask, bingTask
    ]);

    const finalUrl = (short && short.target) || url;

    /* 页面抓取：短链已解析出来才需要（省时间） */
    const pageInfo = (finalUrl && left() > 700)
      ? await withTimeout(fetchPageInfo(finalUrl, kind).catch(() => null), budget(2600, 500), null)
      : null;

    const extraTitle = pageInfo && pageInfo.title ? pageInfo.title : null;

    /* 只有链接、没有名字时，用页面标题再搜一轮 */
    let titleCands = { images: [], products: [] };
    if (!hint && extraTitle && !isUselessTitle(extraTitle) && left() > 1400) {
      titleCands = await searchByHint(extraTitle, kind, finalUrl, true);
    }

    const title = hint || extraTitle || null;

    /* ---------- 价格：合并多路，优先级从高到低 ---------- */
    /* 1) 商品卡片（真实售价，最优先） */
    const products = [...(baiduShop.products || []), ...(baiduPlain.products || []), ...(titleCands.products || [])];
    products.forEach((p) => { p.score = productScore(p, hint || title || '', kind); });
    products.sort((a, b) => b.score - a.score);
    const bestProduct = products[0] || null;
    const productPrice = bestProduct && bestProduct.price > 0
      ? { min: bestProduct.price, max: bestProduct.price }
      : null;

    /* 2) 精读商品落地页：官方主图直链 + 官方标题
       并行精读多个候选 SKU，用「标题与商品名匹配度」挑最准的那一个 */
    const deepLinks = pickDeepLinks(products, 3);
    const deepResults = (deepLinks.length && left() > 1300)
      ? await withTimeout(Promise.all(
          deepLinks.map((d) => readJdMobile(d.sku, false).catch(() => null))
        ), budget(3800, 900), [])
      : [];
    /* 按标题匹配度排序 */
    const deepScored = deepResults.filter(Boolean).map((info) => ({
      info, hits: titleMatch(info.title, hint || title || '')
    }));
    deepScored.sort((a, b) => b.hits - a.hits);
    const deepInfo = deepScored.length ? deepScored[0].info : null;

    /* 价格优先级：文案 > 短链 > 页面 > 商品卡片 > 精读页
       精读页的价格需要单独查（p.3.cn），只查匹配度最高的那一个 SKU */
    let price = textPrice
      || (short && short.price)
      || (pageInfo && pageInfo.price)
      || productPrice
      || null;
    if (!price && deepInfo && left() > 600) {
      const sku = (deepInfo.url || '').match(/\/(\d+)\.html/);
      if (sku) {
        const pj = await withTimeout(requestText(`https://p.3.cn/prices/mgets?skuIds=J_${sku[1]}&type=1`, {
          ua: UA_POOL[3], referer: 'https://item.m.jd.com/', timeout: 3000
        }), budget(3000, 500), null);
        if (pj && pj.text) {
          const m = pj.text.match(/"p"\s*:\s*"?([\d.]+)"?/);
          if (m && Number(m[1]) > 0) price = { min: Number(m[1]), max: Number(m[1]) };
        }
      }
    }

    /* ---------- 图片：精读原图 > 商品卡片图 > 搜索图 > 页面图 ---------- */
    const pageCands = (pageInfo && pageInfo.candidates) || [];
    const imgPool = [
      ...(baiduPlain.images || []),
      ...(baiduShop.images || []),
      ...(Array.isArray(bing) ? bing : []),
      ...(titleCands.images || []),
      ...pageCands
    ];
    /* 精读到的官方主图：最权威，排最前 */
    if (deepInfo && deepInfo.image) {
      imgPool.unshift({ url: deepInfo.image, source: 'origin', label: deepInfo.title || '', w: 800, h: 800, kind });
    }
    /* 商品卡片的图（就是那个正在卖的商品） */
    if (bestProduct) {
      imgPool.unshift({
        url: bestProduct.url, source: 'commodity', label: bestProduct.label,
        w: bestProduct.w, h: bestProduct.h, kind
      });
    }
    const ranked = dedupeAndRank(imgPool, title || hint, kind, 8);
    let image = ranked.length ? ranked[0].url : null;
    let shot = false;
    let source = ranked.length ? ranked[0].source : null;

    if (!image && finalUrl) {
      image = screenshotUrl(finalUrl);
      shot = true;
      source = 'shot';
    }

    /* ---------- 标题：官方标题 > 文案名 ---------- */
    const officialTitle = (deepInfo && deepInfo.title && !isUselessTitle(deepInfo.title))
      ? deepInfo.title
      : (bestProduct && bestProduct.title && !isUselessTitle(bestProduct.title)
        ? bestProduct.title
        : null);

    let note;
    if (shot) {
      note = '平台页面有反爬，已展示整页预览；可点缩略图切换，或粘贴图片直链。';
    } else if (source === 'origin' && deepInfo) {
      note = '已定位到官方商品页，直接取到原图与售价。';
    } else if (source === 'commodity') {
      note = bestProduct && bestProduct.shop
        ? `已匹配到${bestProduct.shop}在售商品，图片与价格来自该商品。`
        : '已匹配到在售商品，图片与价格均来自商品卡片。';
    } else if (source === 'search' || source === 'bing') {
      note = '已按名称匹配到商品/店铺图片，点缩略图可切换。';
    } else {
      note = '已自动识别页面主图。';
    }
    if (price == null && kind === 'product') note += ' 价格未识别到，可在加入前手动填写。';
    if (deadline && left() < 0) note += ' 网络较慢，已优先返回识别到的结果。';

    return {
      url: url || null, image, title: title || officialTitle, price, shot, source, note,
      candidates: ranked.map((c) => ({
        url: c.url, label: c.label || '', source: c.source, score: c.score, w: c.w || 0, h: c.h || 0
      }))
    };
  })();

  inflight.set(key, task);
  try {
    const value = await task;
    cache.set(key, { value, expires: Date.now() + CACHE_TTL });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return value;
  } finally {
    inflight.delete(key);
  }
}

module.exports = {
  previewLink,
  parsePrice,
  hintFrom,
  detectKind,
  baiduImages,
  baiduImagesLegacy,
  bingImages,
  warmBaidu,
  screenshotUrl,
  cleanSearchTerm,
  platformWord
};
