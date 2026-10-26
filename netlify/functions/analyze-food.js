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
      message: '线上版暂未配置视觉大模型，请使用「快速选择常见食物」，或在本地 npm start 后使用拍照识别。'
    })
  };
};
