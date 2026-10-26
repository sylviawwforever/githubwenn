'use strict';

const { previewLink, parsePrice, hintFrom, detectKind, warmBaidu, screenshotUrl } = require('./lib/link-preview-core');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300'
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  let payload = {};
  try {
    if (event.body) payload = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return reply(400, { ok: false, error: '请求格式错误' });
  }
  if (event.httpMethod === 'GET') payload = { ...event.queryStringParameters, ...payload };

  if (payload.warm) {
    await Promise.race([warmBaidu('图片'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    return reply(200, { ok: true, warmed: true });
  }

  const rawUrl = String(payload.url || '').trim();
  const text = String(payload.text || payload.hint || rawUrl || '').trim();
  if (!rawUrl && !text) return reply(400, { ok: false, error: '没有识别到链接或名称' });
  const kind = payload.kind === 'place' ? 'place' : payload.kind === 'product' ? 'product' : detectKind(rawUrl);

  /* Netlify 免费版函数上限 10s：留 1.2s 给响应；
     同时把 deadline 传给核心，让它在这个时间点前主动收敛、返回已有结果 */
  const HARD_LIMIT = 8800;
  const deadline = Date.now() + HARD_LIMIT - 400;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), HARD_LIMIT));
  let info = null;
  try {
    info = await Promise.race([previewLink({ url: rawUrl, text, kind, deadline }), timeout]);
  } catch (e) {
    info = null;
  }

  if (!info) {
    const hint = hintFrom(text);
    info = {
      url: rawUrl || null,
      image: rawUrl ? screenshotUrl(rawUrl) : null,
      title: hint || null,
      price: parsePrice(text),
      shot: !!rawUrl,
      source: rawUrl ? 'shot' : null,
      note: rawUrl ? '识别超时，先展示整页截图；可以点「自动识别」重试。' : '识别超时，请稍后重试。',
      candidates: []
    };
  }

  return reply(200, { ok: true, ...info });
};
