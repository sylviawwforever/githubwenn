/* =========================================================
   sms.js —— 真实短信验证码发送
   通过 .env 配置 SMS_PROVIDER 选择服务商：
     - aliyun  阿里云短信（国内推荐）
     - twilio  Twilio（国际）
     - webhook 自建转发服务
   未配置时返回 { provider: 'console' }，由 server.js 进入开发模式。
   ========================================================= */
const crypto = require('crypto');

function percentEncode(s) {
  return encodeURIComponent(String(s)).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~');
}

/* ---------- 阿里云短信 ---------- */
async function sendAliyun(phone, code) {
  const AccessKeyId = process.env.SMS_ACCESS_KEY_ID;
  const AccessKeySecret = process.env.SMS_ACCESS_KEY_SECRET;
  const SignName = process.env.SMS_SIGN_NAME;
  const TemplateCode = process.env.SMS_TEMPLATE_CODE;
  if (!AccessKeyId || !AccessKeySecret || !SignName || !TemplateCode) {
    throw new Error('阿里云短信配置不完整（需 SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME / SMS_TEMPLATE_CODE）');
  }
  const params = {
    AccessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: process.env.SMS_REGION_ID || 'cn-hangzhou',
    SignName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25'
  };
  const sorted = Object.keys(params).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const stringToSign = `GET&%2F&${percentEncode(sorted)}`;
  const signature = crypto.createHmac('sha1', AccessKeySecret + '&').update(stringToSign).digest('base64');
  const url = `https://dysmsapi.aliyuncs.com/?${sorted}&Signature=${percentEncode(signature)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (j.Code !== 'OK') throw new Error(`阿里云短信返回 ${j.Code || r.status} ${j.Message || ''}`.trim());
}

/* ---------- Twilio ---------- */
async function sendTwilio(phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error('Twilio 配置不完整（需 TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM）');
  const to = phone.startsWith('+') ? phone : '+86' + phone;
  const body = new URLSearchParams({ To: to, From: from, Body: `【验证码】你的验证码是 ${code}，5 分钟内有效，请勿泄露。` });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Twilio 返回 ${r.status} ${t.slice(0, 120)}`); }
}

/* ---------- 自建 webhook ---------- */
async function sendWebhook(phone, code) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) throw new Error('未配置 SMS_WEBHOOK_URL');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, signName: process.env.SMS_SIGN_NAME || '', templateCode: process.env.SMS_TEMPLATE_CODE || '' })
  });
  if (!r.ok) throw new Error(`webhook 返回 ${r.status}`);
}

/**
 * @returns {Promise<{provider:string}>}
 */
async function sendSms(phone, code) {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (!provider || provider === 'console') return { provider: 'console' };
  if (provider === 'aliyun') { await sendAliyun(phone, code); return { provider: 'aliyun' }; }
  if (provider === 'twilio') { await sendTwilio(phone, code); return { provider: 'twilio' }; }
  if (provider === 'webhook') { await sendWebhook(phone, code); return { provider: 'webhook' }; }
  throw new Error(`未知的 SMS_PROVIDER：${provider}`);
}

module.exports = { sendSms };
