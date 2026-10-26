/* =========================================================
   browser-preview.js
   用本机已安装的 Chrome（复用你已登录的淘宝/天猫 Cookie）真实渲染页面，
   提取商品主图 / 店铺图，绕过淘宝、大众点评等的反爬限制。

   仅在本机（macOS）生效；找不到 Chrome 或读取不到 Cookie 时返回 null，
   由 server.js 回退到截图方案。
   ========================================================= */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const IS_MAC = process.platform === 'darwin';
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
];
const USER_DATA_DIR = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

function findChrome() {
  for (const p of CHROME_PATHS) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}

/* ---------- 读取并解密 Chrome Cookie（macOS） ---------- */
function chromeSafeStorage() {
  try {
    return execFileSync('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome'], { encoding: 'utf8' }).trim();
  } catch { return null; }
}

function decryptChromeValue(key, buf) {
  if (buf.slice(0, 3).toString() !== 'v10') return buf.toString('utf8');
  const iv = Buffer.from(new Array(17).join(' '), 'binary');
  const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
  d.setAutoPadding(false);
  let out = d.update(buf.slice(3));
  const fin = d.final();
  fin.copy(out, out.length - 1);
  const pad = out[out.length - 1];
  if (pad) out = out.slice(32, out.length - pad);
  const v = out.toString('utf8');
  return /^[\x20-\x7e]*$/.test(v) ? v : '';
}

function readChromeCookies(domains) {
  if (!IS_MAC) return [];
  const pw = chromeSafeStorage();
  if (!pw) return [];
  const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
  const dbPath = path.join(USER_DATA_DIR, 'Default', 'Cookies');
  if (!fs.existsSync(dbPath)) return [];
  const tmp = path.join(os.tmpdir(), `am-cookies-${process.pid}.db`);
  try { fs.copyFileSync(dbPath, tmp); } catch { return []; }
  let rows;
  try {
    const where = domains.map(d => `host_key LIKE '%${d}'`).join(' OR ');
    const out = execFileSync('sqlite3', [tmp, `SELECT host_key||'|'||name||'|'||hex(encrypted_value) FROM cookies WHERE ${where};`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    rows = out.trim().split('\n').filter(Boolean);
  } catch { rows = []; } finally { try { fs.unlinkSync(tmp); } catch {} }
  const cookies = [];
  for (const row of rows) {
    const [host, name, hex] = row.split('|');
    if (!hex) continue;
    let value = '';
    try { value = decryptChromeValue(key, Buffer.from(hex, 'hex')); } catch { continue; }
    if (!value) continue;
    cookies.push({ domain: host, name, value, path: '/' });
  }
  return cookies;
}

/* ---------- 浏览器实例（单例复用 + 崩溃自愈） ---------- */
let browserPromise = null;
let chromeMissing = false;
let launching = null;

function browserAlive(b) {
  try { return !!(b && (b.connected === true || (typeof b.isConnected === 'function' && b.isConnected()))); } catch { return false; }
}
function resetBrowser() {
  const old = browserPromise;
  browserPromise = null; launching = null;
  try { if (old && typeof old.then === 'function') old.then(b => { try { b && b.close && b.close(); } catch {} }).catch(() => {}); } catch {}
}
async function getBrowser() {
  if (chromeMissing) return null;
  const exe = findChrome();
  if (!exe) { chromeMissing = true; return null; }
  // 复用：只要实例还活着就直接用
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (browserAlive(b)) return b;
    } catch {}
    browserPromise = null; // 已死 → 重建
  }
  if (!launching) {
    launching = (async () => {
      try {
        const b = await require('puppeteer-core').launch({
          executablePath: exe,
          headless: 'new',
          args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage',
                 '--disable-features=IsolateOrigins,site-per-process', '--lang=zh-CN']
        });
        // 一旦浏览器异常退出（被杀/崩溃），清空缓存，下次请求自动重启
        b.on && b.on('disconnected', () => { if (browserPromise === launching) resetBrowser(); });
        return b;
      } catch {
        return null;
      } finally {
        launching = null;
      }
    })();
    browserPromise = launching;
  }
  const b = await (browserPromise || launching);
  if (!browserAlive(b)) { browserPromise = null; return null; }
  return b;
}
/* 页面操作失败时调用：只有确认浏览器已死才重建，避免误杀健康实例 */
async function browserFailed(b) {
  if (!browserAlive(b)) resetBrowser();
}

/* ---------- 模拟人眼节奏：随机延迟 + 分段滚动 ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (base, spread) => Math.round(base + Math.random() * spread);
async function humanPace(page, { scroll = true } = {}) {
  await sleep(jitter(1200, 1400));                 // 像人一样"看一眼"
  if (!scroll) return;
  try { await page.mouse.move(jitter(120, 700), jitter(80, 500), { steps: jitter(3, 5) }); } catch {}
  const steps = jitter(5, 5);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), jitter(420, 520)).catch(() => {});
    await sleep(jitter(260, 420));                 // 滚动之间停顿，触发懒加载又不触发风控
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await sleep(jitter(700, 900));
}

const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function pickBestImage(cands) {
  const usable = cands.filter(c => c.src && /^https?:\/\//.test(c.src) && c.w >= 120 && c.h >= 120);
  if (!usable.length) return null;
  usable.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return usable[0].src;
}

const BAD_TITLE = /^(登录|验证|身份核实|安全验证|403 Forbidden|404|405|500|Just a moment|访问验证|商品详情页|京东-欢迎登录|拼多多|页面不存在)/;

/**
 * 用真实浏览器渲染页面，返回全部候选图（含 og:image 与页面 <img>）
 * @param {string} url
 * @returns {Promise<{title:string|null, candidates:Array<{url:string,source:string,label:string,w:number,h:number}>}|null>}
 */
async function browserCandidates(url) {
  let browser;
  try { browser = await getBrowser(); } catch { return null; }
  if (!browser) return null;
  let page;
  try {
    const cookies = readChromeCookies(['taobao.com', 'tmall.com', 'dianping.com', 'meituan.com', 'baidu.com']);
    page = await browser.newPage();
    await page.setUserAgent(UA_MAC);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'font' || t === 'media') return req.abort();
      req.continue().catch(() => {});
    });
    if (cookies.length) { try { await page.setCookie(...cookies); } catch {} }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    // 等网络基本安静（淘宝这类长连接页面等不到 networkidle，超时就继续）
    try { await page.waitForNetworkIdle({ idleTime: 700, timeout: 9000 }); } catch {}
    await humanPace(page);                    // 以接近人眼的节奏浏览，触发懒加载
    const info = await page.evaluate(() => {
      const roleOf = (el) => {
        const c = ((el && el.className) || '') + ' ' + ((el && el.id) || '');
        if (/thumbnailPic|picItem|gallery|swiper|slider|carousel|J_UlThumb|mainPic|main-?pic|item-?pic|product-?pic|main-?img|sku-?img|thumb-?list/i.test(c)) return 'gallery';
        if (/descV8|desc-|detail-?desc|richImg|content-?desc|description|detail-?pic|apic|detailContent/i.test(c)) return 'desc';
        return '';
      };
      const meta = (n) => (document.querySelector(`meta[property="${n}"]`) || document.querySelector(`meta[name="${n}"]`) || {}).content || null;
      const og = meta('og:image') || meta('twitter:image');
      // 过滤掉 UI 图标 / logo / 横幅 / 雪碧图，只留下真正的内容图
      const junk = /\/static\/|sprite|logo|icon|avatar|transparent\.gif|weather\/|pc_banner|favicon|qrcode|placeholder|loading_/i;
      const junkCls = /banner|logo|icon|avatar|tip|qrcode|guide|message-center|weather|sprite|loading/i;
      const imgs = [...document.querySelectorAll('img')]
        .filter(i => !junkCls.test((i.className || '') + ' ' + (i.id || '')))
        .map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, role: roleOf(i), label: (i.alt || i.title || '').slice(0, 60) }))
        .filter(x => x.src && /^https?:\/\//.test(x.src) && !junk.test(x.src));
      const bg = [...document.querySelectorAll('[style*="background-image"]')]
        .filter(el => !junkCls.test((el.className || '') + ' ' + (el.id || '')))
        .map(el => { const m = /url\(["']?(https?:\/\/[^"')]+)["']?\)/.exec(el.style.backgroundImage || ''); return m ? { src: m[1], w: 0, h: 0, role: roleOf(el), label: (el.textContent || '').trim().slice(0, 60) } : null; })
        .filter(x => x && !junk.test(x.src));
      const txt = ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 600);
      const href = location.href;
      // 登录墙 / 验证页：整页内容都不是目标，交回上层去走搜图兜底
      let reason = '';
      let path = '';
      try { path = new URL(href).pathname; } catch {}
      if (/(^|\/\/|\.)account\.|passport\.|\/verify|captcha/i.test(href) || /login/i.test(path)) reason = 'url:' + href.slice(0, 90);
      else if (/APP扫码|扫码登录|账号登录\/注册|403 Forbidden|页面不存在/.test(txt)) reason = 'text:' + (txt.match(/APP扫码|扫码登录|账号登录\/注册|403 Forbidden|页面不存在/) || [''])[0];
      else if (/^(登录|验证中心|身份核实|安全验证|访问验证|403 Forbidden|404|405|500|Just a moment|页面不存在)/.test(document.title || '')) reason = 'title:' + document.title;
      else if (!og && txt.replace(/\s/g, '').length < 60) reason = 'thin-page';
      else if (!txt && !og) reason = 'empty-page';
      return { title: document.title || null, og, imgs: [...imgs, ...bg], blocked: !!reason, reason, txt: txt.slice(0, 220), href };
    });

    if (process.env.LINK_DEBUG) {
      console.log('[link-debug] browser:', info.blocked ? 'BLOCKED(' + info.reason + ')' : 'LIVE', '| title:', info.title, '| href:', String(info.href).slice(0, 90), '| imgs:', info.imgs.length, '| txt:', String(info.txt || '').slice(0, 120));
    }
    if (info.blocked) { return { blocked: true, title: null, candidates: [] }; }

    const candidates = [];
    const push = (raw, source, label, w, h, role) => {
      if (!raw) return;
      let abs = raw;
      try { abs = new URL(raw, url).href; } catch { return; }
      if (!/^https?:\/\//.test(abs)) return;
      if (candidates.some(c => c.url === abs)) return;
      candidates.push({ url: abs, source, label: label || '', w: w || 0, h: h || 0, role: role || '' });
    };
    push(info.og, 'og', '');
    info.imgs
      .sort((a, b) => (b.w * b.h) - (a.w * a.h))
      .forEach(i => push(i.src, 'browser', i.label, i.w, i.h, i.role));

    const title = info.title && !BAD_TITLE.test(info.title) ? info.title : null;
    if (!candidates.length && !title) return null;
    return { title, candidates: candidates.slice(0, 24) };
  } catch { await browserFailed(browser); return null; } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/** 兼容旧接口：渲染页面并返回一张最可能的主图 */
async function browserPreview(url) {
  const r = await browserCandidates(url);
  if (!r) return null;
  const image = (r.candidates[0] && r.candidates[0].url) || pickBestImage(r.candidates) || null;
  if (!image && !r.title) return null;
  return { image, title: r.title };
}

/**
 * 图片搜索兜底：大众点评 / 百度地图这类反爬严重的页面抓不到图时，
 * 用本机 Chrome 打开百度图片搜索店铺/商品名，拿真实搜索结果图。
 * @param {string} query 搜索词（店铺名或商品名）
 * @returns {Promise<Array<{url:string,source:string,label:string,w:number,h:number}>>}
 */
async function searchImages(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  let browser;
  try { browser = await getBrowser(); } catch { return []; }
  if (!browser) return [];
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(UA_MAC);
    await page.setViewport({ width: 1280, height: 1600 });
    await page.goto('https://image.baidu.com/search/index?tn=baiduimage&word=' + encodeURIComponent(q), {
      waitUntil: 'domcontentloaded', timeout: 30000
    }).catch(() => {});
    try { await page.waitForNetworkIdle({ idleTime: 600, timeout: 6000 }); } catch {}
    await humanPace(page);
    const imgs = await page.evaluate(() => [...document.querySelectorAll('img')]
      .map(i => ({ url: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, label: (i.alt || '').slice(0, 60) }))
      .filter(x => x.url && /^https?:\/\//.test(x.url) && x.w >= 150 && x.h >= 150));
    const seen = new Set();
    return imgs.filter(x => { if (seen.has(x.url)) return false; seen.add(x.url); return true; })
      .slice(0, 24)
      .map(x => ({ url: x.url, source: 'search', label: x.label, w: x.w, h: x.h }));
  } catch { await browserFailed(browser); return []; } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * 网页搜索兜底：用本机 Chrome 打开百度网页搜索店铺/商品名，
 * 取结果卡片里的配图（会带上卡片文字，方便上层用"文字里有没有店名"来判定可信度）。
 * 比纯图片搜索更准，因为结果和这家店有明确关联。
 * @param {string} query
 * @returns {Promise<Array<{url:string,source:string,label:string,w:number,h:number}>>}
 */
async function searchWebImages(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  let browser;
  try { browser = await getBrowser(); } catch { return []; }
  if (!browser) return [];
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(UA_MAC);
    await page.setViewport({ width: 1280, height: 1400 });
    await page.goto('https://www.baidu.com/s?wd=' + encodeURIComponent(q) + '&rn=20', {
      waitUntil: 'domcontentloaded', timeout: 30000
    }).catch(() => {});
    try { await page.waitForNetworkIdle({ idleTime: 600, timeout: 6000 }); } catch {}
    await humanPace(page);
    const info = await page.evaluate(() => ({
      title: document.title || '',
      imgs: [...document.querySelectorAll('img')]
        .map(i => {
          const card = i.closest('.c-container, [class*="result"], [class*="template"]') || i.parentElement;
          return {
            url: i.currentSrc || i.src,
            w: i.naturalWidth, h: i.naturalHeight,
            label: ((card && card.innerText) || '').replace(/\s+/g, ' ').slice(0, 160)
          };
        })
        .filter(x => x.url && /^https?:\/\//.test(x.url) && x.w >= 150 && x.h >= 150)
    }));
    if (/安全验证|验证中心|完成验证/.test(info.title)) return [];
    const seen = new Set();
    return info.imgs
      .filter(x => !/baidu\.com\/img\/|flexible\/logo|psstatic\.cdn\.bcebos\.com|gimg\d+\.baidu\.com\/search\/src=/.test(x.url))
      .filter(x => { if (seen.has(x.url)) return false; seen.add(x.url); return true; })
      .slice(0, 20)
      .map(x => ({ url: x.url, source: 'web', label: x.label, w: x.w, h: x.h }));
  } catch { await browserFailed(browser); return []; } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

module.exports = { browserPreview, browserCandidates, searchImages, searchWebImages, findChrome, readChromeCookies };
