/* =========================================================
   image-picker.js
   链接图片自动识别：候选图抽取 → 探测真实尺寸 → 打分排序
   - 从页面 HTML 里尽量多捞图（og:image / JSON-LD / <img> / 内嵌 JSON）
   - 探测每张图的真实宽高，过滤 1x1 像素图、坏链、logo、二维码
   - 按平台 CDN、尺寸、比例、文件名等维度打分，选出最可能是
     “商品主图 / 店铺实拍图”的那张
   ========================================================= */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------- 基础工具 ---------- */
function decodeEntities(s = '') {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/').replace(/\s+/g, ' ').trim();
}

function absolutize(raw, base) {
  if (!raw) return null;
  let u = decodeEntities(String(raw)).trim().replace(/^['"]|['"]$/g, '');
  if (!u || u.startsWith('data:') || u.startsWith('javascript:')) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:/i.test(u)) {
    try { u = new URL(u, base).href; } catch { return null; }
  }
  return /^https?:\/\//i.test(u) ? u : null;
}

function isUsableImage(u) {
  if (!u || typeof u !== 'string') return false;
  if (!/^(https?:)?\/\//i.test(u)) return false;
  if (u.length < 12 || u.length > 1200) return false;
  if (/^data:/i.test(u)) return false;
  return true;
}

function pickMeta(html, prop) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return b ? b[1] : null;
}

/* ---------- 1. 候选图抽取：把页面里可能的图全捞出来 ---------- */
function collectCandidates(html, base) {
  const out = [];
  const seen = new Set();
  const add = (raw, source, label, role) => {
    const u = absolutize(raw, base);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, source, label: label || '', role: role || '' });
  };
  if (!html) return out;

  // 1) meta 标签（最权威）
  [['og:image', 'og'], ['og:image:url', 'og'], ['og:image:secure_url', 'og'],
   ['twitter:image', 'twitter'], ['twitter:image:src', 'twitter'],
   ['image', 'og'], ['itemprop:image', 'og']].forEach(([p, s]) => {
    const m = pickMeta(html, p);
    if (m) add(m, s);
  });

  // 2) <link rel="image_src">
  (html.match(/<link[^>]+rel=["'](?:image_src|preload)["'][^>]*>/gi) || []).forEach(t => {
    const h = t.match(/href=["']([^"']+)["']/i);
    if (h) add(h[1], 'og');
  });

  // 3) JSON-LD（商品结构化数据，常见于电商 / 门店页）
  (html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []).forEach(block => {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const json = JSON.parse(body.trim());
      (function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') return;
        Object.keys(node).forEach(k => {
          const v = node[k];
          if (/^(image|logo|thumbnail|photo|url|icon)$/i.test(k) && typeof v === 'string') {
            add(v, 'ld', String(node.name || node.alt || '').slice(0, 60));
          } else walk(v);
        });
      })(json);
    } catch {}
  });

  // 4) <img> 标签（含懒加载属性）
  (html.match(/<img\b[^>]*>/gi) || []).forEach(tag => {
    const label = (tag.match(/(?:alt|title)=["']([^"']{0,60})["']/i) || [])[1] || '';
    const cls = ((tag.match(/\sclass=["']([^"']*)["']/i) || [])[1] || '') + ' ' + ((tag.match(/\sid=["']([^"']*)["']/i) || [])[1] || '');
    const role = /thumbnailPic|picItem|gallery|swiper|slider|carousel|J_UlThumb|mainPic|main-?pic|item-?pic|product-?pic/i.test(cls) ? 'gallery'
      : /descV8|desc-|detail-?desc|richImg|content-?desc|description|detail-?pic/i.test(cls) ? 'desc' : '';
    const src = (tag.match(/(?:\ssrc|data-src|data-original|data-lazy-src|data-echo|data-url)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src) add(src, 'img', label, role);
    const ss = (tag.match(/srcset\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (ss) {
      const parts = ss.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      if (parts.length) add(parts[parts.length - 1], 'img', label, role); // srcset 取最大的一张
    }
  });

  // 5) 页面内嵌 JSON（淘宝/点评/百度地图等把图片地址写在 JS 里）
  const keyRe = /"(?:picUrl|mainPic|mainPicUrl|imgUrl|imageUrl|imageurl|searchImg|itemPic|itemPicUrl|pic|photo|cover|headImage|shopImg|shopImage|avatarUrl|poiImage|envImg|listPic)"\s*:\s*"((?:https?:)?\\?\/[^"]{6,600}?)"/gi;
  let m;
  while ((m = keyRe.exec(html)) !== null) add(m[1], 'json');

  // 6) 裸图片地址（alicdn / meituan 等 CDN 直接写在脚本里）
  const cdnRe = /https?:\\?\/\\?\/(?:img\d?\.alicdn\.com|img\.meituan\.net|img\.dianping\.com|.dpfile\.com|p\d+\.pstatp\.com|bdimg\.com|bcebos\.com)[^\s"'<>\\]{10,400}?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>\\]*)?/gi;
  while ((m = cdnRe.exec(html)) !== null) add(m[0], 'json');

  return out;
}

/* ---------- 2. 探测图片真实尺寸（只读前 256KB） ---------- */
function readDims(buf) {
  if (!buf || buf.length < 16) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf.slice(0, 3).toString('ascii') === 'GIF') {
    return { type: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  // WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    const four = buf.slice(12, 16).toString('ascii');
    if (four === 'VP8X' && buf.length >= 30) {
      return { type: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    }
    if (four === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      return { type: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (four === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return { type: 'webp', w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { type: 'webp', w: 0, h: 0 };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { type: 'jpg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const segLen = buf.readUInt16BE(i + 2);
      if (!segLen || segLen < 2) break;
      i += 2 + segLen;
    }
    return { type: 'jpg', w: 0, h: 0 };
  }
  return null;
}

async function probeImage(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Range': 'bytes=0-262143',
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return ''; } })()
      }
    });
    if (!resp.ok && resp.status !== 206) return null;
    const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !/^image\//.test(ct) && !/octet-stream/.test(ct)) return null;  // 拒绝把 css/js/html 当图
    if (/^(text\/html|application\/json|text\/plain|text\/css|application\/javascript)/i.test(ct)) return null;
    const reader = resp.body && typeof resp.body.getReader === 'function' ? resp.body.getReader() : null;
    if (!reader) return null;
    const chunks = [];
    let got = 0;
    while (got < 262144) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(Buffer.from(value));
      got += value.length;
    }
    try { reader.cancel().catch(() => {}); } catch {}
    const buf = Buffer.concat(chunks);
    if (buf.length < 16) return null;
    const dims = readDims(buf);
    if (!dims) return { type: ct.replace('image/', '') || 'img', w: 0, h: 0, bytes: buf.length };
    if (dims.w === 1 && dims.h === 1) return null;
    return { ...dims, bytes: buf.length };
  } catch { return null; } finally { clearTimeout(timer); }
}

/* ---------- 3. 打分：越像“商品主图 / 店铺实拍”分越高 ---------- */
const BAD_NAME = /(^|[^a-z])(logo|favicon|sprite|placeholder|loading|blank|pixel|beacon|track|qrcode|qr_|_qr|ewm|erweima|watermark|water_?mark|avatar|head_?img|user_?head|nav_?icon|btn|button|arrow|close|spread|share_?pic|share_?code|icon_|_icon|1x1|spacer)([^a-z]|$)/i;
const BAD_PATH = /smartvenus|travelcube|dppclogin|dpstatic|dpfile\.com\/static|poipicadd\/cat|\/static\/common|\/img\/nav|\/icon/i;

function hostScore(url, kind) {
  const u = url.toLowerCase();
  const has = (re) => re.test(u);
  let s = 0;
  if (has(/alicdn\.com|taobao\.com|tmall\.com|tbcdn\.cn/)) s += kind === 'product' ? 30 : 10;
  if (has(/360buyimg\.com|jdcdn|jd\.com/)) s += kind === 'product' ? 30 : 10;
  if (has(/pinduoduo|yx01\.pdd|ddimg/)) s += kind === 'product' ? 28 : 10;
  if (has(/meituan\.net|dianping\.com|dpfile\.com|dpmobile|meituan\.com|sankuai\.com/)) s += kind === 'place' ? 34 : 8;
  if (has(/bcebos\.com|bdimg\.com|baidustatic|mapss\.bdimg|baidu\.com/)) s += kind === 'place' ? 30 : 8;
  if (has(/xhscdn|xiaohongshu|xhsurl/)) s += 26;
  if (has(/kuaishou|douyin|snssdk|pstatp/)) s += 22;
  if (has(/sinaimg|weibo|qq\.com|qpic\.cn|gtimg/)) s += 14;
  if (has(/img\d?\.baidu\.com\/it\//)) s += kind === 'place' ? 20 : 8;
  return s;
}

function scoreCandidate(c) {
  const url = String(c.url || '');
  const u = url.toLowerCase();
  const src = { og: 48, ld: 46, twitter: 44, direct: 60, json: 34, browser: 45, img: 24, web: 30, search: 26, shot: -999 }[c.source] ?? 18;
  let s = src + hostScore(url, c.kind || 'product');

  const w = c.w || 0, h = c.h || 0;
  if (w > 0 && h > 0) {
    const area = w * h;
    const ratio = w / h;
    if (w < 100 || h < 100) s -= 55;            // 缩略图 / 图标
    else if (area >= 400 * 400) s += 40;
    else if (area >= 200 * 200) s += 25;
    else s += 8;
    if (ratio >= 0.6 && ratio <= 1.7) s += 16;   // 商品图 / 门头图多为方图或竖图
    else if (ratio > 2.6 || ratio < 0.34) s -= 26; // 横幅、通栏广告
    if (area >= 1500 * 1500) s += 8;
  } else {
    s += 6; // 没探到尺寸，给一点基础分（仅当直链来源可信时够用）
  }

  if (BAD_NAME.test(u)) s -= 45;
  if (BAD_PATH.test(u)) s -= 80;
  // 页面结构线索：主图/galley 区加分，详情长地区降权（淘宝/天猫等）
  if (c.role === 'gallery') s += 34;
  else if (c.role === 'desc') s -= 40;
  if (/mapsnap|newsnap|qt=newsnap|api\.map\.baidu\.com|amap\.com\/.*\?.*center=/.test(u)) s -= 60; // 地图瓦片/截图，不是店铺照片
  if (/wolfman\/static|webmap\d*\.bdimg\.com\/image\/|map-mobile-lbsapp|\/static\/common\/images\//.test(u)) s -= 60; // 地图/站点 UI 资源
  if (/\.svg(\?|$)/.test(u)) s -= 45;
  if (/\.gif(\?|$)/.test(u)) s -= 14;
  if (/@\d+[xX]\d+|[_-]\d{2,3}[xX]\d{2,3}[_-]/.test(u)) s -= 22; // _80x80 之类缩略图后缀
  if (c.bytes && c.bytes > 0 && c.bytes < 7000) s -= 18;
  if (url.length > 420) s -= 6;
  if (c.boost) s += c.boost;   // 搜索兜底时：alt/标题命中商品名或店铺名的结果更可信
  if (c.dead) s -= 1000;
  return Math.round(s);
}

const SOURCE_ORDER = { og: 0, ld: 1, twitter: 2, direct: 3, browser: 4, json: 5, img: 6, web: 7, search: 8, shot: 9 };

async function mapLimit(list, limit, fn) {
  const ret = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
    while (i < list.length) {
      const idx = i++;
      ret[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

/**
 * 排序候选图：去重 → 初排 → 探测尺寸 → 终排
 * @param {Array<{url:string,source:string,label?:string}>} list
 * @param {{kind?:'product'|'place', limit?:number, probe?:boolean}} opts
 */
async function rankCandidates(list, opts = {}) {
  const { kind = 'product', limit = 8, probe = true } = opts;
  const dedup = [];
  const seen = new Set();
  for (const c of list || []) {
    if (!c || !isUsableImage(c.url) || seen.has(c.url)) continue;
    seen.add(c.url);
    dedup.push({ url: c.url, source: c.source || 'img', label: c.label || '', kind, boost: c.boost || 0, role: c.role || '' });
  }
  if (!dedup.length) return [];

  dedup.forEach(c => { c.score = scoreCandidate(c); });
  dedup.sort((a, b) => b.score - a.score || (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9));

  if (probe) {
    const head = dedup.slice(0, 12);
    await mapLimit(head, 6, async (c) => {
      const p = await probeImage(c.url);
      if (p) { c.w = p.w; c.h = p.h; c.bytes = p.bytes; c.type = p.type; }
      else c.dead = true;
    });
    const alive = dedup.filter(c => !c.dead);
    const pool = alive.length ? alive : dedup.filter(c => !c.dead); // 全挂时退回原列表，交给上层兜底
    pool.forEach(c => { c.score = scoreCandidate(c); });
    pool.sort((a, b) => b.score - a.score || (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9));
    return pool.slice(0, limit);
  }
  return dedup.slice(0, limit);
}

module.exports = { collectCandidates, probeImage, scoreCandidate, rankCandidates, isUsableImage, decodeEntities };
