/* =========================================================
   About Me · app.js
   Myself（待办/饮食/运动/记账/睡眠/目标/收藏/观影）+ With Friends
   数据：登录后与后端同步；未登录或离线时仅存本机 localStorage
   ========================================================= */

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const monthOf = (d) => (d || '').slice(0, 7);
const nowMonth = () => today().slice(0, 7);
const fmtTime = (ts) => { const d = new Date(ts); const p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`; };
const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2400);
}

/* ---------------- local store ---------------- */
const store = {
  get(key, def) { try { const v = localStorage.getItem('am_' + key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(key, val) { try { localStorage.setItem('am_' + key, JSON.stringify(val)); } catch { toast('本机存储不足，图片/视频可能过大'); } },
  del(key) { localStorage.removeItem('am_' + key); }
};

/* ---------------- backend api ---------------- */
/* http(s) 打开走当前域名；双击 index.html（file://）时自动连本机后端 localhost:3000 */
const SERVED = /^https?:$/.test(location.protocol);
const API_ORIGIN = SERVED ? '' : 'http://localhost:3000';
let ONLINE = SERVED;
let token = store.get('token', '');
let currentUser = store.get('user', null);

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(API_ORIGIN + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    ONLINE = false;
    throw new Error('后端未连接：请在项目文件夹运行 npm start 后刷新本页');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('请求失败 ' + res.status));
  return data;
}

/* ---------------- data layer ---------------- */
const LIST_KEYS = ['todos', 'diet', 'exercise', 'ledger', 'sleep', 'goals', 'collection', 'watch', 'shares', 'cart', 'places'];
const emptyData = () => Object.fromEntries(LIST_KEYS.map(k => [k, []]));

const spaceId = () => (currentUser && currentUser.code) ? ('u_' + currentUser.code) : 'guest';
const get = (k) => store.get(spaceId() + '__' + k, []);
const setScoped = (k, v) => store.set(spaceId() + '__' + k, v);
const set = (k, v) => { setScoped(k, v); scheduleSync(); };
/* 兼容旧版本：把未分区的本地数据迁移到访客分区，避免数据“消失” */
(function migrateLegacyLocal() {
  try {
    LIST_KEYS.forEach(k => {
      const legacy = localStorage.getItem('am_' + k);
      if (legacy && localStorage.getItem('am_guest__' + k) == null) localStorage.setItem('am_guest__' + k, legacy);
    });
  } catch {}
})();

let syncTimer = null;
function scheduleSync() {
  if (!token || !ONLINE) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushData, 900);
}
function collectData() { return Object.fromEntries(LIST_KEYS.map(k => [k, get(k)])); }
async function pushData() {
  try { await api('/api/data', { method: 'PUT', body: { data: collectData() } }); }
  catch (e) { if (e.message !== 'OFFLINE') console.warn('同步失败：', e.message); }
}
function applyData(data) {
  LIST_KEYS.forEach(k => { if (Array.isArray(data[k])) setScoped(k, data[k]); });
  renderAll();
}
/* 登录时把访客分区的本地数据搬到该用户分区（该用户目录还为空时），避免“一登录数据就不见” */
function migrateGuestToUser() {
  if (!currentUser || !currentUser.code) return;
  try {
    LIST_KEYS.forEach(k => {
      const mine = store.get('u_' + currentUser.code + '__' + k, null);
      if (Array.isArray(mine) && mine.length) return;
      const guest = store.get('guest__' + k, null);
      if (Array.isArray(guest) && guest.length) setScoped(k, guest);
    });
  } catch {}
}

/* ---------------- navigation ---------------- */
function showView(name, scrollTo) {
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.nav__links a').forEach(a => a.classList.toggle('is-active', a.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (scrollTo) setTimeout(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth' }), 120);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view]');
  if (!t) return;
  e.preventDefault();
  if (t.dataset.ftab) activateFriendTab(t.dataset.ftab);
  showView(t.dataset.view, t.dataset.scroll);
});

/* ---------------- home modules ---------------- */
const MYSELF_MODULES = [
  { view: 'todo', icon: 'fa-list-check', title: '每日待办', desc: '记录今天要做的事', color: '#72a4f2' },
  { view: 'diet', icon: 'fa-bowl-food', title: '每日饮食', desc: '拍照识别 · 饮品热量', color: '#e0955b' },
  { view: 'exercise', icon: 'fa-person-running', title: '每日运动', desc: '自动计算消耗', color: '#5bb381' },
  { view: 'ledger', icon: 'fa-wallet', title: '我的记账', desc: '每日收支一目了然', color: '#e0b15b' },
  { view: 'sleep', icon: 'fa-moon', title: '我的睡眠', desc: '入睡起床与时长', color: '#8b7bd6' },
  { view: 'goals', icon: 'fa-bullseye', title: '我的目标', desc: '设定并跟踪进度', color: '#e0607b' },
  { view: 'collection', icon: 'fa-bookmark', title: '收藏 · 灵感', desc: '句子、链接与碎片', color: '#5bb3b3' },
  { view: 'watch', icon: 'fa-clapperboard', title: '观影追剧', desc: '片单评分与短评', color: '#a06bd6' }
];
const FRIENDS_MODULES = [
  { view: 'friends', ftab: 'share', icon: 'fa-share-nodes', title: '分享', desc: '文字 / 图片 / 视频', color: '#72a4f2' },
  { view: 'friends', ftab: 'cart', icon: 'fa-cart-shopping', title: '购物车', desc: '淘宝链接商品卡', color: '#e0955b' },
  { view: 'friends', ftab: 'data', icon: 'fa-location-dot', title: 'Data', desc: '想吃想去的收藏', color: '#5bb381' }
];
function moduleCard(m) {
  return `<button class="module-card" data-view="${m.view}"${m.ftab ? ` data-ftab="${m.ftab}"` : ''}>
    <span class="module-card__icon" style="background:${m.color}"><i class="fa-solid ${m.icon}"></i></span>
    <span class="module-card__title">${m.title}</span>
    <span class="module-card__desc">${m.desc}</span>
  </button>`;
}
function renderHomeModules() {
  $('#myselfGrid').innerHTML = MYSELF_MODULES.map(moduleCard).join('');
}

/* ---------------- identity / auth ---------------- */
function me() { return (currentUser && currentUser.nickname) || store.get('name', '') || '我'; }
function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function myCode() {
  if (currentUser && currentUser.code) { store.set('invite', currentUser.code); return currentUser.code; }
  let c = store.get('invite', '');
  if (!c) { c = genCode(); store.set('invite', c); }
  return c;
}
function renderIdentity() {
  const name = me();
  $('#loginLabel').textContent = currentUser ? name : '登录';
  const hn = $('#heroName'); if (hn) hn.textContent = currentUser ? name : (store.get('name', '') || '朋友');
  $('#myInviteCode').textContent = myCode();
  const hint = $('#codeHint');
  if (hint) hint.textContent = currentUser
    ? '朋友输入这个邀请码即可看到你分享的内容，看不到你的私人记录。'
    : '当前为离线模式：邀请码由本机生成。登录后可跨设备共享。';
}

const loginModal = $('#loginModal');
const profileModal = $('#profileModal');
$('#loginBtn').addEventListener('click', () => {
  if (currentUser) {
    $('#profilePhone').textContent = currentUser.phone;
    $('#profileCode').textContent = currentUser.code;
    $('#profileName').value = currentUser.nickname || '';
    profileModal.classList.add('is-open');
  } else {
    $('#loginHint').textContent = ONLINE ? '' : '当前为离线模式，请先启动后端（npm start）再登录。';
    loginModal.classList.add('is-open');
  }
});
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('is-open')));
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('is-open'); }));

let countdown = null;
$('#sendCodeBtn').addEventListener('click', async () => {
  const phone = $('#phoneInput').value.trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) { $('#loginHint').textContent = '请输入正确的 11 位手机号'; return; }
  if (!ONLINE) { $('#loginHint').textContent = '离线模式无法发送验证码，请启动后端。'; return; }
  try {
    const r = await api('/api/auth/send-code', { method: 'POST', auth: false, body: { phone } });
    $('#loginHint').innerHTML = r.devCode
      ? `开发模式验证码：<strong class="dev-code">${r.devCode}</strong>（同时已打印在终端）`
      : r.message;
    let s = 60;
    const btn = $('#sendCodeBtn');
    btn.disabled = true;
    clearInterval(countdown);
    countdown = setInterval(() => {
      btn.textContent = s + 's 后重发';
      if (--s < 0) { clearInterval(countdown); btn.disabled = false; btn.textContent = '获取验证码'; }
    }, 1000);
  } catch (e) { $('#loginHint').textContent = e.message; }
});
$('#verifyBtn').addEventListener('click', async () => {
  const phone = $('#phoneInput').value.trim();
  const code = $('#codeInput').value.trim();
  if (!phone || !code) { $('#loginHint').textContent = '请填写手机号和验证码'; return; }
  try {
    const r = await api('/api/auth/verify', { method: 'POST', auth: false, body: { phone, code } });
    token = r.token; currentUser = r.user;
    store.set('token', token); store.set('user', currentUser);
    migrateGuestToUser();
    loginModal.classList.remove('is-open');
    renderIdentity();
    await loadFromServer();
    toast('登录成功，欢迎 ' + (currentUser.nickname || '你'));
  } catch (e) { $('#loginHint').textContent = e.message; }
});
$('#saveProfile').addEventListener('click', async () => {
  const nickname = $('#profileName').value.trim();
  if (!nickname) { toast('请输入昵称'); return; }
  currentUser.nickname = nickname;
  store.set('user', currentUser); store.set('name', nickname);
  try { await api('/api/me', { method: 'PATCH', body: { nickname } }); } catch {}
  renderIdentity(); renderAll(); renderFriendFeed();
  profileModal.classList.remove('is-open');
  toast('已保存');
});
$('#logoutBtn').addEventListener('click', () => {
  token = ''; currentUser = null; store.del('token'); store.del('user');
  friendFeed = { shares: [], cart: [], places: [] };
  renderIdentity(); renderAll();
  profileModal.classList.remove('is-open');
  toast('已退出登录');
});

async function loadFromServer() {
  try {
    const r = await api('/api/data');
    const serverEmpty = LIST_KEYS.every(k => !(r.data[k] || []).length);
    const localHas = LIST_KEYS.some(k => get(k).length);
    if (serverEmpty && localHas) await pushData();
    else applyData(r.data);
    await loadFriendFeed();
  } catch (e) { if (e.message !== 'OFFLINE') toast('读取云端数据失败：' + e.message); }
}

/* =========================================================
   TODO
   ========================================================= */
const orderTodos = (l) => [...l.filter(t => !t.done), ...l.filter(t => t.done)];
/* 每天的待办按日期分区保存；旧数据（没有 date 字段）迁移到首次看到的那天 */
const todoDate = (t) => t.date || today();
function migrateTodoDates() {
  const all = get('todos');
  let changed = false;
  const fixed = all.map(t => (t.date ? t : (changed = true, { ...t, date: today() })));
  if (changed) set('todos', fixed);
}
const todosOn = (date) => get('todos').filter(t => todoDate(t) === date);
function renderTodos() {
  const list = orderTodos(todosOn(today()));
  $('#todoList').innerHTML = list.map(t => `
    <li class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}" title="双击可划线完成">
      <span class="todo-item__mark"><i class="fa-solid fa-check"></i></span>
      <span class="todo-item__text">${esc(t.text)}</span>
      <button class="icon-btn" data-act="del" title="删除"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
  $('#todoEmpty').hidden = list.length > 0;
  const done = list.filter(t => t.done).length;
  $('#todoProgress').textContent = `${done} / ${list.length} 已完成 · 双击待办可划线`;
  const hb = $('#todoHistoryBtn');
  if (hb) { const hist = get('todos').filter(t => todoDate(t) !== today()).length; hb.innerHTML = `<i class="fa-regular fa-calendar-days"></i> 历史待办${hist ? ` (${hist})` : ''}`; }
}
function toggleTodo(id) {
  set('todos', get('todos').map(t => t.id === id ? { ...t, done: !t.done } : t));
  renderTodos(); updateHome();
}
$('#todoForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#todoInput').value.trim(); if (!text) return;
  set('todos', [{ id: uid(), text, done: false, date: today() }, ...get('todos')]);
  $('#todoInput').value = ''; renderTodos(); updateHome();
});
$('#todoList').addEventListener('dblclick', e => {
  if (e.target.closest('[data-act="del"]')) return;
  const item = e.target.closest('.todo-item'); if (!item) return;
  toggleTodo(item.dataset.id);
});
$('#todoList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('todos', get('todos').filter(t => t.id !== b.closest('.todo-item').dataset.id));
  renderTodos(); updateHome();
});
/* 只清除“今天”的已完成项，历史记录保持不动 */
$('#todoClear').addEventListener('click', () => {
  const d = today();
  set('todos', get('todos').filter(t => !(t.done && todoDate(t) === d)));
  renderTodos(); updateHome(); toast('已清除今日完成项');
});

/* ---------- 历史待办：日历视图 ---------- */
let calMonth = today().slice(0, 7);
function openTodoHistory(date) {
  calMonth = (date || today()).slice(0, 7);
  if (date) calSelected = date;
  $('#todoHistoryModal').classList.add('is-open');
  renderTodoHistory();
}
let calSelected = today();
function renderTodoHistory() {
  const [y, m] = calMonth.split('-').map(Number);
  $('#calMonth').textContent = `${y}年${m}月`;
  const first = new Date(y, m - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const all = get('todos');
  const byDay = {};
  all.forEach(t => { const d = todoDate(t); if (d.slice(0, 7) === calMonth) (byDay[d] = byDay[d] || []).push(t); });
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<span class="cal__cell cal__cell--pad"></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const items = byDay[ds] || [];
    const total = items.length, done = items.filter(t => t.done).length;
    const cls = ['cal__cell'];
    if (items.length) cls.push('has');
    if (total && done === total) cls.push('all-done');
    if (ds === today()) cls.push('is-today');
    if (ds === calSelected) cls.push('is-sel');
    const badge = total ? `<span class="cal__badge">${done}/${total}</span>` : '';
    cells.push(`<button type="button" class="${cls.join(' ')}" data-day="${ds}"><span class="cal__num">${d}</span>${badge}</button>`);
  }
  $('#calGrid').innerHTML = cells.join('');
  renderCalDetail(calSelected);
}
function renderCalDetail(date) {
  const items = orderTodos(todosOn(date));
  const el = $('#calDetail');
  if (!date) { el.innerHTML = '<p class="cal__hint">点击日历里的某一天，查看当天的待办记录。</p>'; return; }
  const [y, m, d] = date.split('-');
  if (!items.length) { el.innerHTML = `<p class="cal__hint">${y}年${Number(m)}月${Number(d)}日 没有待办记录。</p>`; return; }
  const done = items.filter(t => t.done).length;
  el.innerHTML = `<div class="cal__detail-head">${y}年${Number(m)}月${Number(d)}日 · ${done}/${items.length} 已完成</div>
    <ul class="cal__list">${items.map(t => `
      <li class="cal__item ${t.done ? 'done' : ''}">
        <span class="cal__item-mark"><i class="fa-solid fa-check"></i></span>
        <span class="cal__item-text">${esc(t.text)}</span>
      </li>`).join('')}</ul>`;
}
$('#todoHistoryBtn').addEventListener('click', () => openTodoHistory());
$('#calPrev').addEventListener('click', () => { const [y, m] = calMonth.split('-').map(Number); calMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; renderTodoHistory(); });
$('#calNext').addEventListener('click', () => { const [y, m] = calMonth.split('-').map(Number); calMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; renderTodoHistory(); });
$('#calGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  calSelected = b.dataset.day;
  renderTodoHistory();
});

/* =========================================================
   DIET
   ========================================================= */
$('#foodList').innerHTML = Object.keys(FOOD_DB).map(k => `<option value="${k}">`).join('');
$$('.tab[data-dmode]').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab[data-dmode]').forEach(t => t.classList.toggle('is-active', t === tab));
  $$('.dmode').forEach(p => p.classList.toggle('is-active', p.id === 'dmode-' + tab.dataset.dmode));
}));

/* --- food --- */
const dietUnit = () => ($('#dietUnit') ? $('#dietUnit').value : '克');
function updateDietPerLabel() {
  const u = dietUnit();
  $('#dietPerLabel').textContent = `每${u}热量 kcal`;
  $('#dietGrams').value = (u === '克') ? 100 : 1;
}
function dietAutoFill() {
  const n = $('#dietName').value.trim();
  const u = dietUnit();
  if (n in FOOD_DB) {
    const per100 = FOOD_DB[n];
    const perUnit = (u === '克') ? Math.round(per100 / 100 * 10) / 10 : per100;
    $('#dietKcalPer100').value = perUnit;
    $('#dietHint').textContent = (u === '克')
      ? `已识别「${n}」：每 100g 约 ${per100} kcal，已换算为每克 ${perUnit} kcal。`
      : `已识别「${n}」：1${u} 暂按 100g 估算约 ${perUnit} kcal（可手动修改）。`;
  }
}
$('#dietName').addEventListener('input', dietAutoFill);
$('#dietUnit').addEventListener('change', () => { updateDietPerLabel(); dietAutoFill(); });
if ($('#dietUnit')) updateDietPerLabel();
$('#dietForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#dietName').value.trim();
  const amount = Number($('#dietGrams').value), unit = dietUnit(), perUnit = Number($('#dietKcalPer100').value);
  if (!name || amount <= 0 || perUnit < 0) { toast('请填写完整信息'); return; }
  addDiet({ type: 'food', name, amount, unit, perUnit, kcal: Math.round(perUnit * amount), date: today() });
  $('#dietName').value = ''; updateDietPerLabel(); $('#dietKcalPer100').value = 0;
  $('#dietHint').textContent = '选择常见食物会自动填充热量，也可手动修改。';
});
function addDiet(rec) { set('diet', [{ id: uid(), ...rec }, ...get('diet')]); renderDiet(); updateHome(); }

/* --- food image analyze --- */
let foodImageData = null;
function setFoodFile(f) {
  if (!f) return;
  if (f.type && !f.type.startsWith('image/')) { toast('请拖入图片文件'); return; }
  try { const dt = new DataTransfer(); dt.items.add(f); $('#foodImage').files = dt.files; } catch (_) {}
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    const MAX = 768;
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    try { foodImageData = canvas.toDataURL('image/jpeg', 0.85); }
    catch (_) { foodImageData = null; }
    URL.revokeObjectURL(url);
    if (!foodImageData) { toast('图片读取失败'); return; }
    $('#foodPreview').src = foodImageData;
    $('#photoPreviewWrap').hidden = false;
    $('#photoDrop').hidden = true;
    $('#analyzeBtn').disabled = false;
    $('#analyzeResult').innerHTML = '';
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('图片读取失败'); };
  img.src = url;
}
$('#foodImage').addEventListener('change', e => setFoodFile(e.target.files[0]));
function bindPhotoDrop(el) {
  if (!el) return;
  ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('is-dragover');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }));
  ['dragleave', 'dragend'].forEach(t => el.addEventListener(t, e => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('is-dragover');
  }));
  el.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    el.classList.remove('is-dragover');
    setFoodFile(e.dataTransfer?.files?.[0]);
  });
}
bindPhotoDrop($('#photoDrop'));
bindPhotoDrop($('#photoPreviewWrap'));
api('/api/health', { auth: false }).then(h => {
  if (h && !h.vision) $('#analyzeHint').textContent = '视觉模型未配置：请在后端 .env 设置 VISION_PROVIDER / VISION_API_KEY 后重启服务。';
}).catch(() => {});
['dragover', 'drop'].forEach(t => window.addEventListener(t, e => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  if (document.querySelector('#view-diet.is-active')) e.preventDefault();
}));
$('#photoClear').addEventListener('click', () => {
  foodImageData = null;
  $('#photoPreviewWrap').hidden = true; $('#photoDrop').hidden = false;
  $('#analyzeBtn').disabled = true; $('#foodImage').value = '';
});
$('#analyzeBtn').addEventListener('click', async () => {
  if (!foodImageData) return;
  if (!ONLINE) { $('#analyzeHint').textContent = '后端未启动：请在项目文件夹运行 npm start，再刷新本页重试。'; return; }
  const btn = $('#analyzeBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 识别中…';
  try {
    const r = await api('/api/analyze-food', { method: 'POST', auth: false, body: { image: foodImageData } });
    if (!r.configured) {
      $('#analyzeResult').innerHTML = `<p class="analyze-note">${esc(r.message)}</p>`;
    } else if (!r.items.length) {
      $('#analyzeResult').innerHTML = `<p class="analyze-note">未识别出食物，请换一张更清晰的图片。</p>`;
    } else {
      $('#analyzeResult').innerHTML = `
        <p class="analyze-note">${esc(r.note || '识别结果（可手动修正后加入）：')}</p>
        ${r.items.map((it, i) => `
          <div class="analyze-item" data-i="${i}">
            <input class="pill-input" data-f="name" value="${esc(it.name)}">
            <input class="pill-input" data-f="grams" type="number" value="${it.grams}" title="克">
            <input class="pill-input" data-f="kcal" type="number" value="${it.kcal}" title="kcal">
            <button class="btn btn--blue" data-add-analyzed="${i}">加入</button>
          </div>`).join('')}
        <button class="btn btn--outline" id="addAllAnalyzed" style="width:100%;margin-top:10px">全部加入今日饮食</button>`;
      window.__analyzed = r.items;
    }
  } catch (e) {
    $('#analyzeResult').innerHTML = `<p class="analyze-note">识别失败：${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 识别热量';
  }
});
$('#analyzeResult').addEventListener('click', e => {
  const rowOf = (i) => document.querySelector(`.analyze-item[data-i="${i}"]`);
  const readRow = (i) => {
    const row = rowOf(i);
    return {
      name: row.querySelector('[data-f="name"]').value.trim(),
      grams: Number(row.querySelector('[data-f="grams"]').value) || 0,
      kcal: Number(row.querySelector('[data-f="kcal"]').value) || 0
    };
  };
  const one = e.target.closest('[data-add-analyzed]');
  if (one) {
    const i = one.dataset.addAnalyzed, it = readRow(i);
    if (!it.name) return;
    addDiet({ type: 'food', name: it.name, amount: it.grams, unit: '克', perUnit: it.grams ? Math.round(it.kcal / it.grams * 10) / 10 : it.kcal, kcal: it.kcal, date: today(), ai: true });
    toast('已加入：' + it.name);
    return;
  }
  if (e.target.closest('#addAllAnalyzed')) {
    (window.__analyzed || []).forEach((_, i) => {
      const it = readRow(i);
      if (it.name) addDiet({ type: 'food', name: it.name, amount: it.grams, unit: '克', perUnit: it.grams ? Math.round(it.kcal / it.grams * 10) / 10 : it.kcal, kcal: it.kcal, date: today(), ai: true });
    });
    $('#analyzeResult').innerHTML = '';
    $('#photoClear').click();
    toast('已全部加入今日饮食');
  }
});

/* --- drink --- */
function brandBadge(brand, cls = '') {
  const m = (typeof BRAND_META !== 'undefined' && BRAND_META[brand]) || { color: '#333', short: String(brand).slice(0, 1) };
  const logo = ((typeof BRAND_LOGO !== 'undefined') && BRAND_LOGO[brand]) || m.img || '';
  return `<span class="brand-badge ${cls}" style="background:${m.color}">`
    + `<span class="brand-badge__fb">${esc(m.short)}</span>`
    + (logo ? `<img class="brand-badge__img" src="${esc(logo)}" alt="" onerror="this.style.display='none'">` : '')
    + `</span>`;
}
function syncBrandUI() {
  const b = $('#drinkBrand').value;
  if ($('#brandCur')) $('#brandCur').innerHTML = brandBadge(b) + `<span class="brand-select__name">${esc(b)}</span>`;
  $$('#brandMenu .brand-option').forEach(o => o.classList.toggle('is-active', o.dataset.brand === b));
}
function buildBrandMenu() {
  const brands = Object.keys(DRINK_DB);
  $('#drinkBrand').innerHTML = brands.map(b => `<option value="${b}">${b}</option>`).join('');
  if ($('#brandMenu')) {
    $('#brandMenu').innerHTML = brands.map(b =>
      `<button type="button" class="brand-option" data-brand="${esc(b)}">${brandBadge(b)}<span>${esc(b)}</span></button>`).join('');
  }
  syncBrandUI();
}
buildBrandMenu();
if ($('#brandBtn')) {
  $('#brandBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#brandSelect').classList.toggle('is-open'); });
  $('#brandMenu').addEventListener('click', (e) => {
    const o = e.target.closest('.brand-option'); if (!o) return;
    $('#drinkBrand').value = o.dataset.brand;
    $('#drinkBrand').dispatchEvent(new Event('change'));
    syncBrandUI();
    $('#brandSelect').classList.remove('is-open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#brandSelect')) $('#brandSelect')?.classList.remove('is-open');
  });
}
$('#drinkIce').innerHTML = Object.keys(DRINK_ICE).map(k => `<option value="${k}">${k}</option>`).join('');
$('#drinkSugar').innerHTML = Object.keys(DRINK_SUGAR).map(k => `<option value="${k}">${k}</option>`).join('');
$('#drinkIce').value = '标准冰'; $('#drinkSugar').value = '标准糖';
function fillDrinkItems() {
  const brand = $('#drinkBrand').value;
  $('#drinkItem').innerHTML = Object.keys(DRINK_DB[brand] || {}).map(i => `<option value="${i}">${i}</option>`).join('');
  updateDrinkKcal();
}
function updateDrinkKcal() {
  const base = drinkCalories($('#drinkBrand').value, $('#drinkItem').value, $('#drinkIce').value, $('#drinkSugar').value);
  const adj = Number($('#drinkAdjust') ? $('#drinkAdjust').value : 0) || 0;
  const total = Math.max(0, base + adj);
  $('#drinkKcal').textContent = total;
  return total;
}
$('#drinkBrand').addEventListener('change', fillDrinkItems);
fillDrinkItems();
['#drinkItem', '#drinkIce', '#drinkSugar', '#drinkAdjust'].forEach(s => { const el = $(s); if (el) el.addEventListener('input', updateDrinkKcal); });
if ($('#toppingChips')) {
  $('#toppingChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const adj = $('#drinkAdjust');
    if (b.dataset.adj === 'reset') { adj.value = 0; }
    else { adj.value = (Number(adj.value) || 0) + (Number(b.dataset.adj) || 0); }
    const note = $('#drinkNote');
    const label = b.textContent.replace(/^[+−-]\s*/, '').replace(/[+−-]?\s*\d+\s*$/, '').trim();
    if (note && b.dataset.adj !== 'reset' && label && !note.value.includes(label)) {
      note.value = note.value ? note.value + '、' + label : label;
    }
    updateDrinkKcal();
  });
}
$('#drinkForm').addEventListener('submit', e => {
  e.preventDefault();
  const brand = $('#drinkBrand').value, item = $('#drinkItem').value;
  const ice = $('#drinkIce').value, sugar = $('#drinkSugar').value;
  if (!item) return;
  const kcal = updateDrinkKcal();
  const adj = Number($('#drinkAdjust').value) || 0;
  const note = ($('#drinkNote').value || '').trim();
  const parts = [`${ice} · ${sugar}`];
  if (adj) parts.push(`调整 ${adj > 0 ? '+' : ''}${adj} kcal`);
  if (note) parts.push(note);
  addDiet({ type: 'drink', name: `${brand} · ${item}`, detail: parts.join(' · '), kcal, date: today() });
  $('#drinkNote').value = ''; $('#drinkAdjust').value = 0; updateDrinkKcal();
  toast('已加入：' + item);
});

/* --- custom drink（非连锁 / 自制） --- */
function updateCustomDrinkTotal() {
  const qty = Number($('#customDrinkQty').value) || 0;
  const per = Number($('#customDrinkKcal').value) || 0;
  const total = Math.max(0, Math.round(per * qty));
  $('#customDrinkTotal').textContent = total;
  return total;
}
['#customDrinkQty', '#customDrinkKcal'].forEach(s => { const el = $(s); if (el) el.addEventListener('input', updateCustomDrinkTotal); });
$('#customDrinkForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#customDrinkName').value.trim();
  const qty = Number($('#customDrinkQty').value) || 1;
  const per = Number($('#customDrinkKcal').value);
  const note = ($('#customDrinkNote').value || '').trim();
  if (!name || isNaN(per) || per < 0) { toast('请填写饮品名称和每杯热量'); return; }
  const detail = [`${qty} 杯`, note].filter(Boolean).join(' · ') || '自定义饮品';
  addDiet({ type: 'drink', name, detail, kcal: Math.max(0, Math.round(per * qty)), date: today() });
  $('#customDrinkForm').reset(); $('#customDrinkQty').value = 1; updateCustomDrinkTotal();
  toast('已加入：' + name);
});

/* --- diet list --- */
function dietFoodMeta(d) {
  if (d.amount != null) { const u = d.unit || '克'; return `${d.amount} ${u} · ${d.perUnit} kcal/${u}`; }
  if (d.grams != null) return `${d.grams} g · ${d.per100} kcal/100g`;
  return '';
}
function renderDiet() {
  const list = get('diet').filter(d => d.date === today());
  $('#dietList').innerHTML = list.map(d => `
    <li class="record-item" data-id="${d.id}">
      <span class="record-item__tag ${d.type === 'drink' ? 'drink' : 'food'}"><i class="fa-solid ${d.type === 'drink' ? 'fa-mug-saucer' : 'fa-utensils'}"></i></span>
      <div class="record-item__main">
        <div class="record-item__name">${esc(d.name)}${d.ai ? ' <span class="ai-badge">AI</span>' : ''}</div>
        <div class="record-item__meta">${d.type === 'drink' ? esc(d.detail || '饮品') : dietFoodMeta(d)}</div>
      </div>
      <div class="record-item__val plus">+${d.kcal}</div>
      <button class="icon-btn" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
  $('#dietEmpty').hidden = list.length > 0;
  $('#dietTotal').textContent = list.reduce((s, d) => s + d.kcal, 0);
  $('#dietCount').textContent = `共 ${list.length} 条`;
}
$('#dietList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  const id = b.closest('.record-item').dataset.id;
  set('diet', get('diet').filter(d => d.id !== id)); renderDiet(); updateHome();
});
$('#dietClearAll').addEventListener('click', () => { set('diet', get('diet').filter(d => d.date !== today())); renderDiet(); updateHome(); toast('已清空今日饮食'); });

/* =========================================================
   EXERCISE
   ========================================================= */
$('#exerciseType').innerHTML = Object.keys(EXERCISE_MET).map(k => `<option value="${k}">${k}（MET ${EXERCISE_MET[k]}）</option>`).join('') + '<option value="__custom__">自定义…</option>';
const DEFAULT_WEIGHT = 60; // 固定按 60kg 估算，界面不再要求填写体重
const CUSTOM_MET = 5.0;
function isCustomExercise() { return $('#exerciseType').value === '__custom__'; }
function updateExerciseKcal() {
  const custom = isCustomExercise();
  $('#customExerciseField').hidden = !custom;
  const type = $('#exerciseType').value;
  const met = custom ? CUSTOM_MET : (EXERCISE_MET[type] || 0);
  const min = Number($('#exerciseMinutes').value) || 0;
  const kcal = Math.round(met * DEFAULT_WEIGHT * (min / 60));
  $('#exerciseKcal').value = kcal;
  $('#exerciseHint').textContent = custom
    ? `自定义运动按 MET ${CUSTOM_MET} × ${DEFAULT_WEIGHT}kg × ${(min / 60).toFixed(2)}h ≈ ${kcal} kcal（可手动微调）`
    : `消耗 = MET ${met} × ${DEFAULT_WEIGHT}kg × ${(min / 60).toFixed(2)}h ≈ ${kcal} kcal`;
}
['#exerciseType', '#exerciseMinutes'].forEach(s => $(s).addEventListener('input', updateExerciseKcal));
$('#exerciseForm').addEventListener('submit', e => {
  e.preventDefault();
  const custom = isCustomExercise();
  let type = custom ? $('#exerciseCustom').value.trim() : $('#exerciseType').value;
  const minutes = Number($('#exerciseMinutes').value), kcal = Number($('#exerciseKcal').value);
  if (custom && !type) { toast('请填写自定义运动名称'); return; }
  if (!type || minutes <= 0) { toast('请填写完整信息'); return; }
  set('exercise', [{ id: uid(), type, minutes, kcal, date: today() }, ...get('exercise')]);
  renderExercise(); updateHome(); toast('已记录，消耗 ' + kcal + ' kcal');
});
function renderExercise() {
  const list = get('exercise').filter(d => d.date === today());
  $('#exerciseList').innerHTML = list.map(d => `
    <li class="record-item" data-id="${d.id}">
      <span class="record-item__tag burn"><i class="fa-solid fa-person-running"></i></span>
      <div class="record-item__main">
        <div class="record-item__name">${esc(d.type)}</div>
        <div class="record-item__meta">${d.minutes} 分钟</div>
      </div>
      <div class="record-item__val burn">-${d.kcal}</div>
      <button class="icon-btn" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
  $('#exerciseEmpty').hidden = list.length > 0;
  $('#exerciseTotal').textContent = list.reduce((s, d) => s + d.kcal, 0);
  $('#exerciseCount').textContent = `共 ${list.length} 条`;
}
$('#exerciseList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  const id = b.closest('.record-item').dataset.id;
  set('exercise', get('exercise').filter(d => d.id !== id)); renderExercise(); updateHome();
});
$('#exerciseClearAll').addEventListener('click', () => { set('exercise', get('exercise').filter(d => d.date !== today())); renderExercise(); updateHome(); toast('已清空今日运动'); });

/* =========================================================
   LEDGER
   ========================================================= */
let ledgerType = 'expense';
function fillLedgerCategories() {
  $('#ledgerCategory').innerHTML = LEDGER_CATEGORIES[ledgerType].map(c => `<option value="${c}">${c}</option>`).join('');
}
$$('.seg[data-ltype]').forEach(s => s.addEventListener('click', () => {
  ledgerType = s.dataset.ltype;
  $$('.seg[data-ltype]').forEach(x => x.classList.toggle('is-active', x === s));
  fillLedgerCategories();
}));
$('#ledgerDate').value = today();
$('#ledgerForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = Number($('#ledgerAmount').value);
  if (!(amount > 0)) { toast('请输入金额'); return; }
  set('ledger', [{ id: uid(), type: ledgerType, amount, category: $('#ledgerCategory').value, note: $('#ledgerNote').value.trim(), date: $('#ledgerDate').value || today() }, ...get('ledger')]);
  $('#ledgerAmount').value = ''; $('#ledgerNote').value = '';
  renderLedger(); toast('已记录');
});
function renderLedger() {
  const list = get('ledger');
  const m = nowMonth();
  const inMonth = list.filter(x => monthOf(x.date) === m);
  const expense = inMonth.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
  const income = inMonth.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0);
  $('#ledgerExpense').textContent = expense.toFixed(2);
  $('#ledgerIncome').textContent = income.toFixed(2);
  $('#ledgerBalance').textContent = (income - expense).toFixed(2);
  $('#ledgerList').innerHTML = inMonth.sort((a, b) => (b.date > a.date ? 1 : -1)).map(x => `
    <li class="record-item" data-id="${x.id}">
      <div class="record-item__main">
        <div class="record-item__name">${esc(x.category)}${x.note ? ' · ' + esc(x.note) : ''}</div>
        <div class="record-item__meta">${x.date}</div>
      </div>
      <div class="record-item__val ${x.type === 'income' ? 'burn' : 'plus'}">${x.type === 'income' ? '+' : '-'}${x.amount.toFixed(2)}</div>
      <button class="icon-btn" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
  $('#ledgerEmpty').hidden = inMonth.length > 0;
}
$('#ledgerList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('ledger', get('ledger').filter(x => x.id !== b.closest('.record-item').dataset.id)); renderLedger();
});

/* =========================================================
   SLEEP
   ========================================================= */
$('#sleepDate').value = today();
function calcSleepHours(bed, wake) {
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round(mins / 6) / 10; // 1 decimal
}
function updateSleepHours() {
  $('#sleepHours').textContent = calcSleepHours($('#sleepBed').value || '23:30', $('#sleepWake').value || '07:30');
}
['#sleepBed', '#sleepWake'].forEach(s => $(s).addEventListener('input', updateSleepHours));
$('#sleepForm').addEventListener('submit', e => {
  e.preventDefault();
  const date = $('#sleepDate').value || today();
  const bed = $('#sleepBed').value, wake = $('#sleepWake').value;
  const hours = calcSleepHours(bed, wake);
  set('sleep', [{ id: uid(), date, bed, wake, hours, quality: Number($('#sleepQuality').value) }, ...get('sleep')]);
  renderSleep(); toast('已记录睡眠 ' + hours + ' 小时');
});
function renderSleep() {
  const list = get('sleep').slice().sort((a, b) => (b.date > a.date ? 1 : -1));
  $('#sleepList').innerHTML = list.map(x => `
    <li class="record-item" data-id="${x.id}">
      <div class="record-item__main">
        <div class="record-item__name">${x.date} · ${x.hours} 小时${x.source === 'health' ? ' <span class="ai-badge">健康</span>' : ''}</div>
        <div class="record-item__meta">${x.bed} → ${x.wake} · ${stars(x.quality)}</div>
      </div>
      <button class="icon-btn" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
  $('#sleepEmpty').hidden = list.length > 0;
  const avg = list.length ? (list.reduce((s, x) => s + x.hours, 0) / list.length) : 0;
  $('#sleepAvg').textContent = avg.toFixed(1);
  $('#sleepCount').textContent = list.length;
}
$('#sleepList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('sleep', get('sleep').filter(x => x.id !== b.closest('.record-item').dataset.id)); renderSleep();
});

/* =========================================================
   GOALS
   ========================================================= */
$('#goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#goalTitle').value.trim(); if (!title) return;
  set('goals', [{ id: uid(), title, desc: $('#goalDesc').value.trim(), due: $('#goalDue').value, progress: Math.min(100, Math.max(0, Number($('#goalProgress').value) || 0)) }, ...get('goals')]);
  $('#goalForm').reset(); $('#goalProgress').value = 0;
  renderGoals(); toast('目标已添加');
});
function renderGoals() {
  const list = get('goals');
  $('#goalGrid').innerHTML = list.map(g => `
    <article class="goal-card" data-id="${g.id}">
      <button class="icon-btn goal-card__del" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
      <h3 class="goal-card__title">${esc(g.title)}</h3>
      ${g.desc ? `<p class="goal-card__desc">${esc(g.desc)}</p>` : ''}
      ${g.due ? `<p class="goal-card__due"><i class="fa-regular fa-calendar"></i> ${g.due}</p>` : ''}
      <div class="progress"><div class="progress__bar" style="width:${g.progress}%"></div></div>
      <div class="goal-card__row">
        <span>${g.progress}%</span>
        <input type="range" min="0" max="100" value="${g.progress}" data-range>
      </div>
    </article>`).join('');
  $('#goalEmpty').hidden = list.length > 0;
}
$('#goalGrid').addEventListener('input', e => {
  if (!e.target.dataset.range) return;
  const card = e.target.closest('.goal-card');
  const list = get('goals').map(g => g.id === card.dataset.id ? { ...g, progress: Number(e.target.value) } : g);
  set('goals', list);
  card.querySelector('.progress__bar').style.width = e.target.value + '%';
  card.querySelector('.goal-card__row span').textContent = e.target.value + '%';
});
$('#goalGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('goals', get('goals').filter(g => g.id !== b.closest('.goal-card').dataset.id)); renderGoals();
});

/* =========================================================
   COLLECTION
   ========================================================= */
$('#collectionForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#collectionText').value.trim();
  if (!text && !$('#collectionLink').value.trim()) { toast('写点什么吧'); return; }
  set('collection', [{ id: uid(), text, link: $('#collectionLink').value.trim(), tag: $('#collectionTag').value.trim(), ts: Date.now() }, ...get('collection')]);
  $('#collectionForm').reset(); renderCollection(); toast('已收藏');
});
function renderCollection() {
  const list = get('collection');
  $('#collectionGrid').innerHTML = list.map(c => `
    <article class="note-card" data-id="${c.id}">
      <button class="icon-btn note-card__del" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
      ${c.tag ? `<span class="badge">${esc(c.tag)}</span>` : ''}
      <p class="note-card__text">${esc(c.text)}</p>
      ${c.link ? `<a class="note-card__link" href="${esc(c.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-link"></i> 打开链接</a>` : ''}
      <span class="note-card__time">${fmtTime(c.ts)}</span>
    </article>`).join('');
  $('#collectionEmpty').hidden = list.length > 0;
}
$('#collectionGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('collection', get('collection').filter(c => c.id !== b.closest('.note-card').dataset.id)); renderCollection();
});

/* =========================================================
   WATCH
   ========================================================= */
$('#watchType').innerHTML = WATCH_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
$('#watchForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#watchTitle').value.trim(); if (!title) return;
  set('watch', [{ id: uid(), title, type: $('#watchType').value, status: $('#watchStatus').value, rating: Number($('#watchRating').value), review: $('#watchReview').value.trim() }, ...get('watch')]);
  $('#watchForm').reset(); renderWatch(); toast('已加入片单');
});
function renderWatch() {
  const list = get('watch');
  $('#watchGrid').innerHTML = list.map(w => `
    <article class="watch-card" data-id="${w.id}">
      <button class="icon-btn watch-card__del" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
      <div class="watch-card__poster"><i class="fa-solid fa-film"></i></div>
      <div class="watch-card__body">
        <span class="badge">${esc(w.type)}</span>
        <h3 class="watch-card__title">${esc(w.title)}</h3>
        <p class="watch-card__stars">${stars(w.rating)} <span class="watch-status">${esc(w.status)}</span></p>
        ${w.review ? `<p class="watch-card__review">${esc(w.review)}</p>` : ''}
      </div>
    </article>`).join('');
  $('#watchEmpty').hidden = list.length > 0;
}
$('#watchGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  set('watch', get('watch').filter(w => w.id !== b.closest('.watch-card').dataset.id)); renderWatch();
});

/* =========================================================
   FRIENDS
   ========================================================= */
let friendFeed = { shares: [], cart: [], places: [] };
function activateFriendTab(name) {
  $$('.tab[data-ftab]').forEach(t => t.classList.toggle('is-active', t.dataset.ftab === name));
  $$('.ftab').forEach(f => f.classList.toggle('is-active', f.id === 'ftab-' + name));
}
$$('.tab[data-ftab]').forEach(tab => tab.addEventListener('click', () => activateFriendTab(tab.dataset.ftab)));

/* my content + friend content */
function allShares() {
  const mine = get('shares').map(s => ({ ...s, mine: true, author: me() }));
  return [...mine, ...friendFeed.shares].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function allCart() { return [...get('cart').map(p => ({ ...p, mine: true, owner: me(), ownerCode: myCode() })), ...friendFeed.cart]; }
function allPlaces() { return [...get('places').map(p => ({ ...p, mine: true, owner: me(), ownerCode: myCode() })), ...friendFeed.places]; }

/* --- share --- */
let pendingMedia = null;
function compressImage(file, maxW = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, maxW / img.width); const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', quality)); }; img.onerror = reject; img.src = rd.result; };
    rd.onerror = reject; rd.readAsDataURL(file);
  });
}
const readAsDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
$('#shareImage').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { pendingMedia = { type: 'image', data: await compressImage(f) }; $('#shareFileName').textContent = '已选择图片：' + f.name; } catch { toast('图片读取失败'); } });
$('#shareVideo').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 8 * 1024 * 1024) toast('视频建议小于 8MB'); try { pendingMedia = { type: 'video', data: await readAsDataURL(f) }; $('#shareFileName').textContent = '已选择视频：' + f.name; } catch { toast('视频读取失败'); } });
$('#shareForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#shareText').value.trim();
  if (!text && !pendingMedia) { toast('写点什么或选个文件吧'); return; }
  set('shares', [{ id: uid(), author: me(), text, mediaType: pendingMedia?.type || null, media: pendingMedia?.data || null, ts: Date.now() }, ...get('shares')]);
  $('#shareText').value = ''; $('#shareFileName').textContent = '未选择文件'; $('#shareImage').value = ''; $('#shareVideo').value = '';
  pendingMedia = null; renderShares(); toast('分享成功 🎉');
});
function shareMedia(s) {
  if (s.mediaType === 'image' && s.media) return `<div class="post__media"><img src="${s.media}" alt="分享图片" loading="lazy"></div>`;
  if (s.mediaType === 'video' && s.media) return `<div class="post__media"><video src="${s.media}" controls></video></div>`;
  return '';
}
function renderShares() {
  const list = allShares();
  $('#shareFeed').innerHTML = list.map(s => `
    <article class="post">
      <div class="post__head">
        <div class="avatar">${esc((s.author || '友').trim().charAt(0).toUpperCase())}</div>
        <div><div class="post__name">${esc(s.author)}${s.mine ? ' · 我' : ''}</div><div class="post__time">${fmtTime(s.ts || Date.now())}</div></div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          ${s.mine ? '' : '<span class="badge">好友</span>'}
          ${s.mine ? '<button class="icon-btn" data-del-share="' + s.id + '"><i class="fa-regular fa-trash-can"></i></button>' : ''}
        </div>
      </div>
      ${s.text ? `<div class="post__body">${esc(s.text)}</div>` : ''}
      ${shareMedia(s)}
    </article>`).join('');
  $('#shareEmpty').hidden = list.length > 0;
}
$('#shareFeed').addEventListener('click', e => { const b = e.target.closest('[data-del-share]'); if (!b) return; set('shares', get('shares').filter(s => s.id !== b.dataset.delShare)); renderShares(); });

/* --- link auto-recognition helpers --- */
function parseShareText(raw) {
  const text = String(raw || '');
  const url = (text.match(/https?:\/\/[^\s"'<>）)，,、]+/) || [])[0] || '';
  let name = (text.match(/「([^」]+)」/) || [])[1] || '';
  if (!name) {
    const brackets = (text.match(/【([^】]+)】/g) || []).map(s => s.slice(1, -1))
      .filter(s => !/淘宝|天猫|京东|拼多多|小红书|会员|抢先|假一赔|旗舰店|复制|分享/.test(s));
    name = brackets[0] || '';
  }
  /* 兜底：链接前后的正文就是商品名/店铺名（淘宝新版分享格式：【淘宝】链接 商品名） */
  if (!name) {
    const rest = text
      .replace(/https?:\/\/[^\s"'<>），,、]+/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[「」『』\[\]]/g, ' ')
      .replace(/点击链接|复制此条|打开链接|直接打开/g, ' ')
      .replace(/人均\s*\d+(?:\.\d+)?\s*[-~至]?\s*\d*(?:\.\d+)?\s*元/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest && !/^https?:/i.test(rest)) name = rest.slice(0, 60);
  }
  let priceMin = null, priceMax = null;
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:元)?\s*[-~至]\s*(\d+(?:\.\d+)?)\s*元/);
  if (range) { priceMin = +range[1]; priceMax = +range[2]; }
  else {
    const m = text.match(/(?:券后|到手价|活动价|售价|现价|价格|一口价)\s*[:：]?\s*[￥¥]?\s*(\d+(?:\.\d+)?)/)
      || text.match(/(?:￥|¥)\s*(\d+(?:\.\d+)?)/)
      || text.match(/(\d+(?:\.\d+)?)\s*元/);
    if (m) { priceMin = priceMax = +m[1]; }
  }
  return { url, name, priceMin, priceMax };
}
function detectPlatform(url) {
  if (/dianping\.com|dpurl\.cn/.test(url)) return 'dianping';
  if (/map\.baidu\.com|baidu\.com|bmap/.test(url)) return 'baidu';
  return 'other';
}
function formatPrice(min, max) {
  if ((min == null) && (max == null)) return '价格未知';
  if (min != null && max != null && max > min) return `${min}元～${max}元`;
  return `${min != null ? min : max}元`;
}
const PREVIEW_TTL = 10 * 60 * 1000;
function previewCacheGet(key) {
  try {
    const raw = localStorage.getItem('am_preview_' + key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || !item.expires || item.expires < Date.now()) return null;
    return item.value;
  } catch { return null; }
}
function previewCacheSet(key, value) {
  try {
    const ttl = value && value.shot ? 2 * 60 * 1000 : PREVIEW_TTL;
    localStorage.setItem('am_preview_' + key, JSON.stringify({ value, expires: Date.now() + ttl }));
  } catch {}
}
async function fetchPreview(url, rawText = '', kind = 'product') {
  if (!url && !(rawText || '').trim()) return null;
  const key = kind + '|' + url + '|' + String(rawText || '').slice(0, 100);
  const cached = previewCacheGet(key);
  if (cached) return cached;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(API_ORIGIN + '/api/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, text: rawText, kind }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok) { previewCacheSet(key, data); return data; }
    }
  } catch {}
  return clientPreviewFallback(url, rawText, kind);
}
async function clientPreviewFallback(url, rawText, kind) {
  const parsed = parseShareText(rawText);
  const isHttp = /^https?:\/\//.test(url || '');
  if (isHttp && /\.(?:jpg|jpeg|png|webp|gif)(?:\?|$)/i.test(url)) {
    return { ok: true, url, image: url, title: parsed.name || null, price: parsed.priceMin != null ? { min: parsed.priceMin, max: parsed.priceMax } : null, source: 'direct', note: '这个链接本身就是图片。', candidates: [] };
  }
  if (!isHttp) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url) + '&meta=true', { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    const data = json && json.status === 'success' ? json.data : null;
    const img = data && data.image && (data.image.url || data.image);
    const image = typeof img === 'string' ? img : null;
    if (image || (data && data.title)) {
      const out = {
        ok: true, url, image,
        title: parsed.name || (data && data.title) || null,
        price: parsed.priceMin != null ? { min: parsed.priceMin, max: parsed.priceMax } : null,
        source: 'og', note: image ? '已识别页面主图。' : '未识别到主图，可粘贴图片链接。',
        candidates: image ? [{ url: image, source: 'og', label: '', score: 50, w: 0, h: 0 }] : []
      };
      previewCacheSet(kind + '|' + url + '|' + String(rawText || '').slice(0, 100), out);
      return out;
    }
  } catch {}
  const shot = 'https://image.thum.io/get/width/600/crop/900/noanimate/' + url;
  const out = {
    ok: true, url, image: shot,
    title: parsed.name || null,
    price: parsed.priceMin != null ? { min: parsed.priceMin, max: parsed.priceMax } : null,
    shot: true, source: 'shot',
    note: '平台有反爬，先展示整页截图；可以点「自动识别」重试，或粘贴图片链接。',
    candidates: []
  };
  previewCacheSet(kind + '|' + url + '|' + String(rawText || '').slice(0, 100), out);
  return out;
}
/* 候选图条：识别出多张候选时展示，点缩略图可手动换成想要的那张 */
function renderCands(stripEl, cands, current, onPick) {
  if (!stripEl) return;
  const list = (cands || []).filter(c => c && c.url);
  if (list.length < 2) { stripEl.hidden = true; stripEl.innerHTML = ''; return; }
  stripEl.hidden = false;
  stripEl.innerHTML = '<span class="cand-strip__label">候选图</span>' + list.map((c, i) => `
    <button type="button" class="cand${c.url === current ? ' is-on' : ''}" data-cand="${i}" title="${esc(c.label || c.source || '候选图')}">
      <img src="${esc(c.url)}" alt="" loading="lazy" onerror="this.remove()">
    </button>`).join('');
  stripEl.onclick = (e) => {
    const b = e.target.closest('[data-cand]');
    if (!b) return;
    const pick = list[+b.dataset.cand];
    $$('.cand', stripEl).forEach(x => x.classList.remove('is-on'));
    b.classList.add('is-on');
    onPick && onPick(pick);
  };
}
function setPreviewImg(boxEl, url) {
  boxEl.innerHTML = url ? `<img src="${esc(url)}" alt="" onerror="imgFail(this)">` : '<i class="fa-solid fa-image"></i>';
}
function notesBlock(item, collection) {
  const notes = item.notes || [];
  const list = notes.map(n => `<div class="note-item"><span class="note-item__head"><b>${esc(n.author || '好友')}</b><span class="note-item__time">${fmtTime(n.ts)}</span></span><span class="note-item__text">${esc(n.text)}</span></div>`).join('');
  return `<div class="notes">
    ${list ? `<div class="notes__list">${list}</div>` : ''}
    <div class="notes__add">
      <input class="notes__input" placeholder="添加备注…">
      <button class="notes__btn" data-add-note="${collection}" data-note-id="${item.id}" data-owner="${esc(item.ownerCode || '')}" title="添加备注"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  </div>`;
}
function handleAddNote(btn) {
  const collection = btn.dataset.addNote, id = btn.dataset.noteId, ownerCode = btn.dataset.owner;
  const input = btn.closest('.notes').querySelector('.notes__input');
  const text = input.value.trim(); if (!text) return;
  const isMine = !ownerCode || ownerCode === myCode();
  if (isMine) {
    const list = get(collection).map(it => it.id === id ? { ...it, notes: [...(it.notes || []), { id: uid(), author: me(), text, ts: Date.now() }] } : it);
    set(collection, list);
    (collection === 'cart' ? renderCart : renderPlaces)();
  } else {
    input.value = '';
    api('/api/item-note', { method: 'POST', auth: false, body: { code: ownerCode, collection, itemId: id, author: me(), text } })
      .then(() => { toast('备注已发送'); loadFriendFeed(); })
      .catch(err => toast('备注失败：' + err.message));
  }
}
function priceOf(p) {
  if (p.priceMin != null || p.priceMax != null) return formatPrice(p.priceMin, p.priceMax);
  if (p.price != null) return `${p.price}元`;
  return '价格未知';
}

/* --- cart --- */
window.imgFail = function (el) { el.style.display = 'none'; if (el.parentNode) el.parentNode.innerHTML = '<i class="fa-solid fa-image"></i>'; };
let cartParsed = null;
const cartRaw = $('#cartRaw');
function updateCartPreview() {
  const parsed = parseShareText(cartRaw.value);
  const el = $('#cartPreview');
  if (!parsed.url && !parsed.name) { el.hidden = true; cartParsed = null; return; }
  el.hidden = false;
  $('#cartPreviewName').textContent = parsed.name || '（未识别到名称，可点识别抓取）';
  $('#cartPreviewPrice').textContent = formatPrice(parsed.priceMin, parsed.priceMax);
  $('#cartPreviewLink').textContent = parsed.url || '（未识别到链接）';
  $('#cartPreviewImg').innerHTML = '<i class="fa-solid fa-image"></i>';
  $('#cartCandStrip').hidden = true; $('#cartCandStrip').innerHTML = '';
  cartParsed = { ...parsed, image: null, cands: [] };
}
async function enrichCart() {
  const parsed = parseShareText(cartRaw.value);
  const isHttp = /^https?:\/\//.test(parsed.url || '');
  if (!isHttp && !cartRaw.value.trim()) { toast('请粘贴淘宝分享内容或商品链接'); return; }
  updateCartPreview();
  $('#cartHint').textContent = '正在抓取商品图与价格…（遇到反爬会自动模拟浏览节奏重试）';
  const info = await fetchPreview(isHttp ? parsed.url : '', cartRaw.value, 'product');
  let name = parsed.name, priceMin = parsed.priceMin, priceMax = parsed.priceMax, image = null;
  let cands = [];
  if (info) {
    if (!name && info.title) name = info.title;
    if (info.price) { if (info.price.min != null) priceMin = info.price.min; if (info.price.max != null) priceMax = info.price.max; }
    image = info.image || null;
    cands = info.candidates || [];
  }
  cartParsed = { url: parsed.url, name, priceMin, priceMax, image, cands };
  $('#cartPreviewName').textContent = name || '（未识别到名称）';
  $('#cartPreviewPrice').textContent = formatPrice(priceMin, priceMax);
  setPreviewImg($('#cartPreviewImg'), image);
  renderCands($('#cartCandStrip'), cands, image, (pick) => {
    cartParsed.image = pick.url;
    setPreviewImg($('#cartPreviewImg'), pick.url);
    $('#cartHint').textContent = '已换成你选中的候选图，可直接加入购物车。';
  });
  $('#cartImgFallback').hidden = !!image;
  $('#cartHint').textContent = (info && info.note) ? info.note : (image ? '已自动识别，可直接加入购物车。' : '未识别到首图（平台可能限制抓取），可粘贴图片链接或先加入。');
}
/* 粘贴/输入链接后自动识别，不必手动点按钮（拟人节流，避免边打字边请求） */
let cartAutoTimer = null, cartAutoUrl = '';
function scheduleCartAutoEnrich() {
  const parsed = parseShareText(cartRaw.value);
  clearTimeout(cartAutoTimer);
  if (!/^https?:/i.test(parsed.url || '')) { cartAutoUrl = ''; return; }
  if (parsed.url === cartAutoUrl) return;
  cartAutoTimer = setTimeout(() => { cartAutoUrl = parsed.url; enrichCart(); }, 700);
}
cartRaw.addEventListener('input', () => { clearTimeout(cartRaw._t); cartRaw._t = setTimeout(updateCartPreview, 300); scheduleCartAutoEnrich(); });
$('#cartParse').addEventListener('click', enrichCart);
$('#cartForm').addEventListener('submit', e => {
  e.preventDefault();
  const parsed = parseShareText(cartRaw.value);
  if (!parsed.url && !parsed.name) { toast('请粘贴淘宝分享内容或链接'); return; }
  const data = (cartParsed && cartParsed.url === parsed.url) ? cartParsed : parsed;
  const note = $('#cartNote').value.trim();
  const notes = note ? [{ id: uid(), author: me(), text: note, ts: Date.now() }] : [];
  set('cart', [{
    id: uid(), owner: me(), title: data.name || '未命名商品', link: data.url || '',
    priceMin: data.priceMin != null ? data.priceMin : null,
    priceMax: data.priceMax != null ? data.priceMax : null,
    image: data.image || $('#cartImgUrl').value.trim() || null, notes
  }, ...get('cart')]);
  $('#cartForm').reset(); $('#cartPreview').hidden = true; cartParsed = null; cartAutoUrl = '';
  $('#cartHint').textContent = '直接点「加入购物车」也可：会自动识别名称、价格与首图。';
  renderCart(); toast('已加入购物车 🛒');
});
function renderCart() {
  const list = allCart();
  $('#cartGrid').innerHTML = list.map(p => `
    <article class="product-card" data-id="${p.id}">
      <div class="product-card__img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" onerror="imgFail(this)">` : '<i class="fa-solid fa-image"></i>'}</div>
      <div class="product-card__title">${esc(p.title)}</div>
      <div class="product-card__row"><span class="product-card__price">${priceOf(p)}</span>${p.mine ? '' : '<span class="badge">好友</span>'}</div>
      <div class="product-card__owner">来自：${esc(p.owner)}</div>
      <div class="product-card__row">
        ${p.link ? `<a class="product-card__link" href="${esc(p.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> 去淘宝看</a>` : ''}
        ${p.mine ? '<button class="icon-btn" data-del-cart="' + p.id + '"><i class="fa-regular fa-trash-can"></i></button>' : ''}
      </div>
      ${notesBlock(p, 'cart')}
    </article>`).join('');
  $('#cartEmpty').hidden = list.length > 0;
}
$('#cartGrid').addEventListener('click', e => {
  const del = e.target.closest('[data-del-cart]');
  if (del) { set('cart', get('cart').filter(p => p.id !== del.dataset.delCart)); renderCart(); return; }
  const add = e.target.closest('[data-add-note]');
  if (add) handleAddNote(add);
});

/* --- places --- */
const PLATFORM = { dianping: { label: '大众点评', icon: 'fa-solid fa-utensils', cls: 'dianping' }, baidu: { label: '百度地图', icon: 'fa-solid fa-map-location-dot', cls: 'baidu' }, other: { label: '其他', icon: 'fa-solid fa-link', cls: 'other' } };
let placeParsed = null;
const placeRaw = $('#placeRaw');
function updatePlacePreview() {
  const parsed = parseShareText(placeRaw.value);
  const el = $('#placePreview');
  if (!parsed.url && !parsed.name) { el.hidden = true; placeParsed = null; return; }
  el.hidden = false;
  $('#placePreviewName').textContent = parsed.name || '（未识别到名称，可点识别抓取）';
  $('#placePreviewPlatform').textContent = parsed.url ? PLATFORM[detectPlatform(parsed.url)].label : '—';
  $('#placePreviewLink').textContent = parsed.url || '（未识别到链接）';
  $('#placePreviewImg').innerHTML = '<i class="fa-solid fa-image"></i>';
  $('#placeCandStrip').hidden = true; $('#placeCandStrip').innerHTML = '';
  placeParsed = { ...parsed, image: null, cands: [] };
}
async function enrichPlace() {
  const parsed = parseShareText(placeRaw.value);
  const isHttp = /^https?:\/\//.test(parsed.url || '');
  if (!isHttp && !placeRaw.value.trim()) { toast('请粘贴地点链接或店铺名'); return; }
  updatePlacePreview();
  $('#placeHint').textContent = '正在抓取店铺名称与图片…（大众点评等有反爬会自动换节奏重试）';
  const info = await fetchPreview(isHttp ? parsed.url : '', placeRaw.value, 'place');
  let name = parsed.name, image = null, cands = [];
  if (info) {
    // 分享文字里往往带着店铺全名（点评/地图都会给），比网页标题更准
    if (!name && info.title) name = info.title;
    image = info.image || null;
    cands = info.candidates || [];
  }
  placeParsed = { url: parsed.url, name, image, cands, platform: detectPlatform(parsed.url) };
  $('#placePreviewName').textContent = name || '（未识别到名称）';
  setPreviewImg($('#placePreviewImg'), image);
  renderCands($('#placeCandStrip'), cands, image, (pick) => {
    placeParsed.image = pick.url;
    setPreviewImg($('#placePreviewImg'), pick.url);
    $('#placeHint').textContent = '已换成你选中的候选图，可直接加入清单。';
  });
  $('#placeImgFallback').hidden = !!image;
  $('#placeHint').textContent = (info && info.note) ? info.note : (image ? '已自动识别，可直接加入清单。' : '未识别到图片（平台可能限制抓取），可粘贴图片链接或先加入。');
}
let placeAutoTimer = null, placeAutoUrl = '';
function schedulePlaceAutoEnrich() {
  const parsed = parseShareText(placeRaw.value);
  clearTimeout(placeAutoTimer);
  if (!/^https?:/i.test(parsed.url || '')) { placeAutoUrl = ''; return; }
  if (parsed.url === placeAutoUrl) return;
  placeAutoTimer = setTimeout(() => { placeAutoUrl = parsed.url; enrichPlace(); }, 700);
}
placeRaw.addEventListener('input', () => { clearTimeout(placeRaw._t); placeRaw._t = setTimeout(updatePlacePreview, 300); schedulePlaceAutoEnrich(); });
$('#placeParse').addEventListener('click', enrichPlace);
$('#placeForm').addEventListener('submit', e => {
  e.preventDefault();
  const parsed = parseShareText(placeRaw.value);
  const url = parsed.url || (/^https?:\/\//.test(placeRaw.value.trim()) ? placeRaw.value.trim() : '');
  const data = (placeParsed && placeParsed.url === parsed.url) ? placeParsed : parsed;
  if (!url && !(data.name || '').trim()) { toast('请粘贴地点链接或店铺名'); return; }
  const note = $('#placeNote').value.trim();
  const notes = note ? [{ id: uid(), author: me(), text: note, ts: Date.now() }] : [];
  set('places', [{
    id: uid(), owner: me(), title: data.name || '未命名地点', link: url,
    platform: data.platform || detectPlatform(url), image: data.image || $('#placeImgUrl').value.trim() || null, notes
  }, ...get('places')]);
  $('#placeForm').reset(); $('#placePreview').hidden = true; placeParsed = null; placeAutoUrl = '';
  $('#placeHint').textContent = '支持大众点评、百度地图等链接，会自动识别名称与图片。';
  renderPlaces(); toast('已加入清单 📍');
});
function renderPlaces() {
  const list = allPlaces();
  $('#placeGrid').innerHTML = list.map(p => {
    const pf = PLATFORM[p.platform] || PLATFORM.other;
    return `<article class="place-card" data-id="${p.id}">
      <div class="place-card__top">
        <span class="platform-chip ${pf.cls}"><i class="${pf.icon}"></i> ${pf.label}</span>
        ${p.mine ? '<button class="icon-btn" data-del-place="' + p.id + '"><i class="fa-regular fa-trash-can"></i></button>' : '<span class="badge">好友</span>'}
      </div>
      ${p.image ? `<div class="place-card__img"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" onerror="imgFail(this)"></div>` : ''}
      <div class="place-card__title">${esc(p.title)}</div>
      ${p.note ? `<div class="place-card__note">${esc(p.note)}</div>` : ''}
      <div class="product-card__owner">来自：${esc(p.owner)}</div>
      <a class="place-card__link" href="${esc(p.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> 打开${pf.label}</a>
      ${notesBlock(p, 'places')}
    </article>`;
  }).join('');
  $('#placeEmpty').hidden = list.length > 0;
}
$('#placeGrid').addEventListener('click', e => {
  const del = e.target.closest('[data-del-place]');
  if (del) { set('places', get('places').filter(p => p.id !== del.dataset.delPlace)); renderPlaces(); return; }
  const add = e.target.closest('[data-add-note]');
  if (add) handleAddNote(add);
});

/* --- invite / join --- */
$('#inviteBtn').addEventListener('click', () => {
  $('#inviteCodeShow').value = myCode();
  const base = SERVED ? location.origin + location.pathname : API_ORIGIN + '/';
  $('#inviteLink').value = base + '#join=' + myCode();
  $('#inviteModal').classList.add('is-open');
});
$('#copyInvite').addEventListener('click', () => copyText($('#inviteLink').value));
$('#copyCode').addEventListener('click', () => copyText(myCode()));
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast('已复制')).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}
function fallbackCopy(text) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已复制'); } catch {} document.body.removeChild(ta); }

$('#joinBtn').addEventListener('click', () => { $('#joinInput').value = ''; $('#joinHint').textContent = ONLINE ? '' : '离线模式无法加好友，请启动后端。'; $('#joinModal').classList.add('is-open'); });
$('#confirmJoin').addEventListener('click', async () => {
  const code = $('#joinInput').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { $('#joinHint').textContent = '请输入正确的 6 位邀请码'; return; }
  if (!token) { $('#joinHint').textContent = '请先登录后再添加好友'; return; }
  try {
    await api('/api/me/friends', { method: 'POST', body: { code } });
    $('#joinModal').classList.remove('is-open');
    toast('已添加好友');
    await loadFriendFeed();
  } catch (e) { $('#joinHint').textContent = e.message; }
});
async function loadFriendFeed() {
  if (!token || !ONLINE) return;
  try {
    const r = await api('/api/friends/feed');
    const shares = [], cart = [], places = [];
    r.friends.forEach(f => {
      (f.shares || []).forEach(s => shares.push({ ...s, mine: false, author: f.nickname }));
      (f.cart || []).forEach(p => cart.push({ ...p, mine: false, owner: f.nickname, ownerCode: f.code }));
      (f.places || []).forEach(p => places.push({ ...p, mine: false, owner: f.nickname, ownerCode: f.code }));
    });
    friendFeed = { shares, cart, places };
    renderShares(); renderCart(); renderPlaces(); updateHome();
  } catch (e) { if (e.message !== 'OFFLINE') console.warn(e.message); }
}

/* =========================================================
   HOME stats + renderAll
   ========================================================= */
function updateHome() {
  const intake = get('diet').filter(d => d.date === today()).reduce((s, d) => s + d.kcal, 0);
  const burn = get('exercise').filter(d => d.date === today()).reduce((s, d) => s + d.kcal, 0);
  const todoLeft = todosOn(today()).filter(t => !t.done).length;
  const si = $('#statIntake'); if (si) si.textContent = intake;
  const sb = $('#statBurn'); if (sb) sb.textContent = burn;
  const st = $('#statTodo'); if (st) st.textContent = todoLeft;
}
function renderAll() {
  migrateTodoDates();
  renderTodos(); renderDiet(); renderExercise(); renderLedger(); renderSleep();
  renderGoals(); renderCollection(); renderWatch(); renderShares(); renderCart(); renderPlaces();
  updateHome();
}

/* ---------- 每天零点自动刷新“今日待办”与“今日摄入/消耗” ---------- */
let midnightTimer = null;
let curDay = today();
function msUntilMidnight() {
  const n = new Date();
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
  return next - n;
}
function dayTick() {
  if (today() === curDay) return;
  curDay = today();
  renderAll();
  if ($('#todoHistoryModal') && $('#todoHistoryModal').classList.contains('is-open')) renderTodoHistory();
}
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => { dayTick(); scheduleMidnight(); }, msUntilMidnight());
}
scheduleMidnight();
setInterval(dayTick, 30000);                                  // 兜底：每 30 秒检查一次
window.addEventListener('focus', dayTick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) dayTick(); });

/* =========================================================
   boot
   ========================================================= */
function handleUrlJoin() {
  const m = location.hash.match(/#join=([A-Za-z0-9]{6})/);
  if (!m) return;
  if (token && ONLINE) {
    api('/api/me/friends', { method: 'POST', body: { code: m[1].toUpperCase() } })
      .then(() => { toast('已通过链接添加好友'); loadFriendFeed(); })
      .catch(() => {});
    history.replaceState(null, '', location.pathname);
  }
}
async function checkHealth() {
  const dot = $('#connDot');
  try {
    const r = await api('/api/health', { auth: false });
    ONLINE = true;
    dot.className = 'conn-dot on';
    dot.title = '后端已连接' + (r.vision ? '（视觉识别已配置）' : '（视觉识别未配置）') + (SERVED ? '' : ' · localhost:3000');
    const h = $('#analyzeHint');
    if (h && /启动后端|离线|未配置/.test(h.textContent)) h.textContent = '上传或拖入照片后点识别，会自动估算食物与热量。';
  } catch (e) {
    ONLINE = false;
    dot.className = 'conn-dot off';
    dot.title = SERVED ? '后端未连接' : '后端未启动：在项目文件夹运行 npm start 后刷新';
    const h = $('#analyzeHint');
    if (h) h.textContent = '后端未启动：请在项目文件夹运行 npm start，再刷新本页。';
  }
}

function initHeroMotion() {
  const stage = $('#heroIllu');
  if (!stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const setFrom = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width - 0.5) * 2;
    const y = ((clientY - r.top) / r.height - 0.5) * 2;
    stage.style.setProperty('--mx', String(Math.max(-1, Math.min(1, x))));
    stage.style.setProperty('--my', String(Math.max(-1, Math.min(1, y))));
  };
  stage.addEventListener('pointermove', (e) => setFrom(e.clientX, e.clientY));
  stage.addEventListener('pointerleave', () => {
    stage.style.setProperty('--mx', '0');
    stage.style.setProperty('--my', '0');
  });
}

let previewWarmed = false;
function prewarmPreview() {
  if (previewWarmed) return;
  previewWarmed = true;
  try {
    fetch(API_ORIGIN + '/api/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warm: true })
    }).catch(() => {});
  } catch {}
}

(async function boot() {
  fillLedgerCategories();
  fillDrinkItems();
  updateExerciseKcal();
  updateSleepHours();
  renderHomeModules();
  renderIdentity();
  renderAll();
  initHeroMotion();
  await checkHealth();
  setTimeout(prewarmPreview, 1200);
  if (currentUser) { renderIdentity(); loadFromServer(); }
  handleUrlJoin();
})();
