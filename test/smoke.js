'use strict';

const http = require('http');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.VISION_API_KEY = '';
process.env.VISION_PROVIDER = 'deepseek';
process.env.VISION_MODEL = '';
process.env.VISION_BASE_URL = '';
process.env.LINK_PREVIEW_BUDGET_MS = '1800';
process.env.ABOUTME_DB = path.join(os.tmpdir(), `aboutme-smoke-${process.pid}.json`);
delete process.env.VERCEL;

const { normalizeFoodItems, scaleNutrition, lookupNutrition } = require('../public/data');
const { shouldToastSyncError, isAuthExpiredError } = require('../public/sync-error');
const { parseAvgPrice, parsePrice, hintFrom, parseDianpingHtml, parseTaobaoHtml } = require('../netlify/functions/lib/link-preview-core');
const app = require('../server');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function request(port, method, urlPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  assert.strictEqual(shouldToastSyncError({ status: 401, message: '未登录或登录已过期' }), false);
  assert.strictEqual(shouldToastSyncError(new Error('未登录或登录已过期')), false);
  assert.strictEqual(shouldToastSyncError(new Error('后端未连接：请启动')), false);
  assert.strictEqual(isAuthExpiredError({ status: 401, message: 'nope' }), true);
  const serverErr = new Error('请求失败 500');
  serverErr.status = 500;
  assert.strictEqual(shouldToastSyncError(serverErr), true);

  const rice = normalizeFoodItems([{ name: '米饭', grams: 200 }])[0];
  assert.strictEqual(rice.kcal, 232);
  assert.strictEqual(rice.carbs, 51.8);
  assert.strictEqual(rice.protein, 5.2);
  assert.strictEqual(rice.fiber, 0.6);
  assert.ok(lookupNutrition('鸡胸肉沙拉'));
  assert.strictEqual(scaleNutrition(lookupNutrition('鸡蛋'), 50).protein, 6.5);

  const kept = normalizeFoodItems([{ name: '米饭', grams: 100, kcal: 90, carbs: 1, protein: 2, fiber: 3 }])[0];
  assert.strictEqual(kept.kcal, 90);
  assert.strictEqual(kept.carbs, 1);
  assert.strictEqual(kept.protein, 2);
  assert.strictEqual(kept.fiber, 3);

  assert.deepStrictEqual(parseAvgPrice('桂花小馆 人均128元'), { min: 128, max: 128 });
  assert.strictEqual(parsePrice('桂花小馆 人均128元'), null);
  assert.strictEqual(parsePrice('券后￥39 人均128元').min, 39);
  assert.strictEqual(hintFrom('【大众点评】桂花小馆 人均128元 http://dpurl.cn/abc'), '桂花小馆');
  const shop = parseDianpingHtml(
    '<title>大众点评</title><script>{"shopName":"桂花小馆","avgPrice":88}</script><img src="https://img.meituan.net/shop/photo.jpg">',
    'https://m.dianping.com/shop/abc'
  );
  assert.strictEqual(shop.title, '桂花小馆');
  assert.deepStrictEqual(shop.avg, { min: 88, max: 88 });
  assert.ok(shop.images.some((img) => /meituan\.net/.test(img.url)));
  const item = parseTaobaoHtml(
    '<title>淘宝网</title>"raw_title":"NARS腮红" "price":"199" <img src="https://img.alicdn.com/imgextra/i1/nars.jpg">',
    'https://item.taobao.com/item.htm?id=1234567890'
  );
  assert.strictEqual(item.title, 'NARS腮红');
  assert.strictEqual(item.price.min, 199);
  assert.ok(item.images.some((img) => /alicdn\.com/.test(img.url)));

  const slow = http.createServer(() => {});
  const slowPort = await listen(slow);
  const server = http.createServer(app);
  const port = await listen(server);

  const health = await request(port, 'GET', '/api/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.json.ok, true);
  assert.strictEqual(health.json.vision, false);
  assert.strictEqual(health.json.provider, 'deepseek');
  assert.strictEqual(health.json.model, 'deepseek-flash');

  const anon = await request(port, 'GET', '/api/data');
  assert.strictEqual(anon.status, 401);
  assert.match(anon.json.error, /未登录/);

  const expired = await request(port, 'GET', '/api/data', { token: 'not-a-real-token' });
  assert.strictEqual(expired.status, 401);
  assert.match(expired.json.error, /未登录|登录已过期/);

  const noImage = await request(port, 'POST', '/api/analyze-food', { body: {} });
  assert.strictEqual(noImage.status, 400);

  const analyze = await request(port, 'POST', '/api/analyze-food', {
    body: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
  });
  assert.strictEqual(analyze.status, 200);
  assert.strictEqual(analyze.json.ok, true);
  assert.strictEqual(analyze.json.configured, false);
  assert.deepStrictEqual(analyze.json.items, []);
  assert.match(analyze.json.message, /VISION_API_KEY/);
  assert.match(analyze.json.message, /deepseek/i);
  assert.strictEqual(analyze.json.model, 'deepseek-flash');

  const phone = '13800138000';
  const sent = await request(port, 'POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(sent.status, 200);
  assert.ok(sent.json.devCode);
  const verified = await request(port, 'POST', '/api/auth/verify', { body: { phone, code: sent.json.devCode } });
  assert.strictEqual(verified.status, 200);
  const token = verified.json.token;
  const payload = { todos: [{ id: 't1', text: '喝水', done: false, date: '2026-11-05' }] };
  const put = await request(port, 'PUT', '/api/data', { token, body: { data: payload } });
  assert.strictEqual(put.status, 200);
  const got = await request(port, 'GET', '/api/data', { token });
  assert.strictEqual(got.status, 200);
  assert.strictEqual(got.json.data.todos[0].text, '喝水');

  const started = Date.now();
  const preview = await request(port, 'POST', '/api/link-preview', {
    body: {
      kind: 'place',
      text: `【大众点评】桂花小馆 人均128元 http://127.0.0.1:${slowPort}/shop/abc`,
      url: `http://127.0.0.1:${slowPort}/shop/abc`
    }
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 8000, 'link-preview took ' + elapsed + 'ms');
  assert.strictEqual(preview.status, 200);
  assert.strictEqual(preview.json.ok, true);
  assert.match(preview.json.title || '', /桂花小馆/);
  assert.strictEqual(preview.json.avgPrice, 128);
  assert.strictEqual(preview.json.price.kind, 'avg');
  assert.strictEqual(preview.json.price.min, 128);

  slow.close();
  server.close();
  console.log('smoke ok in', elapsed, 'ms for link-preview');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
