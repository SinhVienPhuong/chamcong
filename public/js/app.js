import { api, get, post, setAuthHandlers } from './api.js';
import { esc, $, icon, ROLE, toast } from './ui.js';

const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  my: () => import('./pages/my.js'),
  requests: () => import('./pages/requests.js'),
  timesheet: () => import('./pages/timesheet.js'),
  logs: () => import('./pages/logs.js'),
  employees: () => import('./pages/employees.js'),
  setup: () => import('./pages/setup.js'),
  devices: () => import('./pages/devices.js'),
  settings: () => import('./pages/settings.js'),
};

const NAV = [
  { group: null, items: [
    { id: 'dashboard', label: 'Tổng quan', icon: 'home' },
    { id: 'my', label: 'Công của tôi', icon: 'cal' },
    { id: 'requests', label: 'Đơn từ', icon: 'doc', badge: true },
  ] },
  { group: 'Quản lý', roles: ['admin', 'manager'], items: [
    { id: 'timesheet', label: 'Bảng công', icon: 'grid' },
    { id: 'logs', label: 'Nhật ký chấm công', icon: 'list' },
    { id: 'employees', label: 'Nhân viên', icon: 'users' },
  ] },
  { group: 'Hệ thống', roles: ['admin'], items: [
    { id: 'setup', label: 'Ca, phòng ban, ngày lễ', icon: 'layers' },
    { id: 'devices', label: 'Máy chấm công', icon: 'device' },
    { id: 'settings', label: 'Cài đặt & nhật ký', icon: 'gear' },
  ] },
];

const state = { me: null, company: '', cache: {} };
export const ctx = {
  get me() { return state.me; },
  get company() { return state.company; },
  isAdmin: () => state.me?.role === 'admin',
  isManager: () => ['admin', 'manager'].includes(state.me?.role),
  // Danh mục dùng chung, cache trong phiên; gọi invalidate sau khi sửa
  async ref(name) {
    if (!state.cache[name]) state.cache[name] = get('/' + name).catch((e) => { delete state.cache[name]; throw e; });
    return state.cache[name];
  },
  invalidate(name) { delete state.cache[name]; },
  refreshBadge,
  go: (hash) => { location.hash = hash; },
};

setAuthHandlers(() => { state.me = null; renderLogin(); }, () => renderChangePassword(true));

const BRAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2.2"/></svg>`;

// ---------- Đăng nhập ----------
async function renderLogin() {
  if (!state.company) { try { state.company = (await get('/auth/branding')).company; } catch { /* ignore */ } }
  document.title = `Đăng nhập — ${state.company || 'Chấm công'}`;
  const now = new Date();
  $('#app').innerHTML = `
  <div class="login">
    <div class="login-art">
      <div class="row">${`<div class="brand-mark">${BRAND_SVG}</div>`}<div><div class="brand-name">${esc(state.company || 'Chấm công')}</div><div class="brand-sub">Hệ thống chấm công</div></div></div>
      <div>
        <div class="big" id="lg-clock">${String(now.getHours()).padStart(2, '0')}<b>:</b>${String(now.getMinutes()).padStart(2, '0')}</div>
        <p>Đăng nhập để chấm công, xem bảng công và gửi đơn nghỉ phép, tăng ca.</p>
      </div>
      <svg class="ticks" viewBox="0 0 200 200">${Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180, r1 = i % 5 ? 88 : 78;
        return `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * 96}" y2="${100 - Math.cos(a) * 96}" stroke="#fff" stroke-width="${i % 5 ? 1 : 3}"/>`;
      }).join('')}</svg>
    </div>
    <div class="login-form">
      <form id="lf" class="stack">
        <div><h1>Đăng nhập</h1><p class="muted">Dùng tài khoản do bộ phận nhân sự hoặc IT cấp.</p></div>
        <div class="field"><label for="u">Tên đăng nhập</label><input class="input" id="u" name="username" autocomplete="username" required autofocus></div>
        <div class="field"><label for="p">Mật khẩu</label><input class="input" id="p" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" style="width:100%;min-height:42px">${icon('login')} Đăng nhập</button>
        <div class="form-error" role="alert"></div>
      </form>
    </div>
  </div>`;
  const f = $('#lf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true; f.querySelector('.form-error').textContent = '';
    try {
      const r = await post('/auth/login', { username: f.username.value, password: f.password.value });
      if (r.mustChangePassword) renderChangePassword(true); else boot();
    } catch (err) { f.querySelector('.form-error').textContent = err.message; btn.disabled = false; }
  };
}

// ---------- Đổi mật khẩu (bắt buộc hoặc tự nguyện) ----------
export function renderChangePassword(forced = false) {
  const html = `
    <form id="cpf" class="stack" style="width:min(380px,100%)">
      <div><h1>${forced ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}</h1>
      <p class="muted">${forced ? 'Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được đặt lại. Hãy đặt mật khẩu của riêng bạn để tiếp tục.' : 'Mật khẩu cần ít nhất 8 ký tự, gồm cả chữ và số.'}</p></div>
      <div class="field"><label for="c0">Mật khẩu hiện tại</label><input class="input" id="c0" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="c1">Mật khẩu mới</label><input class="input" id="c1" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="c2">Nhập lại mật khẩu mới</label><input class="input" id="c2" type="password" autocomplete="new-password" required></div>
      <div class="row"><button class="btn primary grow">Lưu mật khẩu</button>${forced ? '<button type="button" class="btn ghost" id="cp-out">Đăng xuất</button>' : '<a class="btn ghost" href="#/dashboard">Huỷ</a>'}</div>
      <div class="form-error" role="alert"></div>
    </form>`;
  if (forced) $('#app').innerHTML = `<div class="login-form" style="min-height:100vh">${html}</div>`;
  else $('#view').innerHTML = `<div style="display:grid;place-items:center;padding-top:30px">${html}</div>`;
  $('#cp-out')?.addEventListener('click', logout);
  const f = $('#cpf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector('.form-error'); err.textContent = '';
    if ($('#c1').value !== $('#c2').value) { err.textContent = 'Hai lần nhập mật khẩu mới không khớp'; return; }
    try {
      await post('/auth/change-password', { currentPassword: $('#c0').value, newPassword: $('#c1').value });
      toast('Đã đổi mật khẩu');
      if (forced) boot(); else location.hash = '#/dashboard';
    } catch (ex) { err.textContent = ex.message; }
  };
}

async function logout() { try { await post('/auth/logout'); } catch { /* ignore */ } state.me = null; state.cache = {}; location.hash = ''; renderLogin(); }

// ---------- Khung ứng dụng ----------
function renderShell() {
  const me = state.me;
  const navHtml = NAV.filter((g) => !g.roles || g.roles.includes(me.role)).map((g) => `
    ${g.group ? `<div class="nav-group">${esc(g.group)}</div>` : ''}
    ${g.items.map((it) => `<a href="#/${it.id}" data-nav="${it.id}">${icon(it.icon)}<span>${esc(it.label)}</span>${it.badge ? '<span class="badge count hidden" id="req-badge"></span>' : ''}</a>`).join('')}
  `).join('');
  $('#app').innerHTML = `
  <div class="shell" id="shell">
    <aside class="side" aria-label="Điều hướng">
      <div class="brand"><div class="brand-mark">${BRAND_SVG}</div><div><div class="brand-name">${esc(state.company)}</div><div class="brand-sub">Hệ thống chấm công</div></div></div>
      <nav class="nav">${navHtml}</nav>
      <div class="side-foot">
        <div class="who">${esc(me.full_name)}</div>
        <div class="role">${esc(ROLE[me.role])}${me.department_name ? ', ' + esc(me.department_name) : ''}</div>
        <div class="row" style="gap:14px"><button id="btn-pw">Đổi mật khẩu</button><button id="btn-out">Đăng xuất</button></div>
      </div>
    </aside>
    <div style="min-width:0">
      <div class="topbar"><button id="btn-menu" aria-label="Mở menu">${icon('menu')}</button><strong>${esc(state.company)}</strong></div>
      <main class="main" id="view"></main>
    </div>
  </div>`;
  $('#btn-out').onclick = logout;
  $('#btn-pw').onclick = () => { location.hash = '#/password'; };
  $('#btn-menu').onclick = () => toggleNav(true);
}
function toggleNav(open) {
  const sh = $('#shell'); if (!sh) return;
  sh.classList.toggle('nav-open', open);
  $('.scrim')?.remove();
  if (open) { const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => toggleNav(false); sh.appendChild(s); }
}

async function refreshBadge() {
  if (!ctx.isManager()) return;
  try {
    const { count } = await get('/requests/pending-count');
    const b = $('#req-badge'); if (!b) return;
    b.textContent = count; b.classList.toggle('hidden', !count);
    b.title = `${count} đơn chờ bạn duyệt`;
  } catch { /* ignore */ }
}

let renderSeq = 0;
async function route() {
  if (!state.me) return;
  toggleNav(false);
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const id = path || 'dashboard';
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('active', a.dataset.nav === id);
  const view = $('#view');
  if (id === 'password') { renderChangePassword(false); return; }
  const allowed = NAV.find((g) => g.items.some((i) => i.id === id));
  if (!PAGES[id] || (allowed?.roles && !allowed.roles.includes(state.me.role))) { location.hash = '#/dashboard'; return; }
  const seq = ++renderSeq;
  view.innerHTML = '<div class="loading">Đang tải…</div>';
  try {
    const mod = await PAGES[id]();
    if (seq !== renderSeq) return;
    view.innerHTML = '';
    await mod.render(view, ctx, new URLSearchParams(qs || ''));
    const h1 = view.querySelector('h1'); document.title = `${h1 ? h1.textContent + ' — ' : ''}${state.company}`;
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e.status === 401 || e.code === 'MUST_CHANGE_PASSWORD') return;
    view.innerHTML = `<div class="empty"><strong>Không tải được trang</strong>${esc(e.message)}</div>`;
    console.error(e);
  }
}

async function boot() {
  try {
    const r = await get('/auth/me');
    state.me = r.user; state.company = r.company;
    if (state.me.must_change_password) { renderChangePassword(true); return; }
    renderShell();
    refreshBadge();
    route();
  } catch (e) {
    if (e.status === 401) renderLogin();
    else $('#app').innerHTML = `<div class="empty"><strong>Không kết nối được máy chủ</strong>${esc(e.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);
setInterval(refreshBadge, 60000);
boot();
export { api };
