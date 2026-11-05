'use strict';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      ok: true,
      configured: false,
      items: [],
      message: '这个入口未配置视觉模型。请改用 Express 后端，并设置 VISION_PROVIDER=deepseek 与 VISION_API_KEY。未配置时请用常见食物手动录入。'
    })
  };
};
