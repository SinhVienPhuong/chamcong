import { get, post, setAuthHandlers } from './api.js';
import { esc, $, icon, ROLE, toast, avatar, hue, initials, emptyState, getThemePref, setThemePref, applyTheme } from './ui.js';
import { dialSVG, updateDial } from './dial.js';

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
const WIDE = new Set(['timesheet']);

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

const state = { me: null, company: '', cache: {}, pending: 0 };
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
applyTheme();

const BRAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#1d1608" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2.2"/></svg>`;
const brand = () => `<div class="brand"><div class="brand-mark">${BRAND_SVG}</div><div><div class="brand-name">${esc(state.company || 'Chấm công')}</div><div class="brand-sub">Hệ thống chấm công</div></div></div>`;

let clockTimer = null;
function tickClock(svg) {
  clearInterval(clockTimer);
  const t = () => { if (!document.body.contains(svg)) { clearInterval(clockTimer); return; } updateDial(svg, { now: new Date() }); };
  t(); clockTimer = setInterval(t, 1000);
}

// ---------- Đăng nhập ----------
async function renderLogin() {
  if (!state.company) { try { state.company = (await get('/auth/branding')).company; } catch { /* ignore */ } }
  document.title = `Đăng nhập — ${state.company || 'Chấm công'}`;
  $('#app').innerHTML = `
  <div class="login">
    <div class="login-art">
      ${brand()}
      <div class="login-clock">${dialSVG({ withShift: false, label: 'Đồng hồ hiện tại' })}</div>
      <div><h2>Mỗi giờ làm việc đều được ghi nhận chính xác.</h2>
        <p>Chấm công vào ra, xem bảng công tháng, gửi đơn nghỉ phép và tăng ca ở cùng một nơi.</p></div>
    </div>
    <div class="login-form">
      <form id="lf" class="stack" novalidate>
        <div><h1>Đăng nhập</h1><p class="muted">Dùng tài khoản do bộ phận nhân sự hoặc IT cấp.</p></div>
        <div class="field"><label for="u">Tên đăng nhập</label><input class="input" id="u" name="username" autocomplete="username" required autofocus></div>
        <div class="field"><label for="p">Mật khẩu</label><input class="input" id="p" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary">${icon('login')} Đăng nhập</button>
        <div class="form-error" role="alert"></div>
        <div class="login-foot">Quên mật khẩu? Liên hệ quản trị viên để được đặt lại.</div>
      </form>
    </div>
  </div>`;
  tickClock($('.login-clock svg'));
  const f = $('#lf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector('.form-error');
    if (!f.username.value.trim() || !f.password.value) { err.textContent = 'Nhập tên đăng nhập và mật khẩu'; return; }
    const btn = f.querySelector('button'); btn.disabled = true; err.textContent = '';
    try {
      const r = await post('/auth/login', { username: f.username.value, password: f.password.value });
      clearInterval(clockTimer);
      if (r.mustChangePassword) renderChangePassword(true); else boot();
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; f.password.select(); }
  };
}

// ---------- Đổi mật khẩu (bắt buộc hoặc tự nguyện) ----------
export function renderChangePassword(forced = false) {
  const html = `
    <form id="cpf" class="stack" style="width:min(390px,100%)" novalidate>
      <div><h1>${forced ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}</h1>
      <p class="muted">${forced ? 'Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được đặt lại. Hãy đặt mật khẩu của riêng bạn để tiếp tục.' : 'Mật khẩu cần ít nhất 8 ký tự, gồm cả chữ và số. Các thiết bị khác sẽ phải đăng nhập lại.'}</p></div>
      <div class="field"><label for="c0">Mật khẩu hiện tại</label><input class="input" id="c0" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="c1">Mật khẩu mới</label><input class="input" id="c1" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="c2">Nhập lại mật khẩu mới</label><input class="input" id="c2" type="password" autocomplete="new-password" required></div>
      <div class="row"><button class="btn primary grow">Lưu mật khẩu</button>${forced ? '<button type="button" class="btn ghost" id="cp-out">Đăng xuất</button>' : '<a class="btn ghost" href="#/dashboard">Huỷ</a>'}</div>
      <div class="form-error" role="alert"></div>
    </form>`;
  if (forced) $('#app').innerHTML = `<div class="login-form" style="min-height:100vh">${html}</div>`;
  else $('#view').innerHTML = `<div class="view-enter" style="display:grid;place-items:center;padding-top:30px">${html}</div>`;
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
const THEMES = [['system', 'monitor', 'Theo hệ thống'], ['light', 'sun', 'Sáng'], ['dark', 'moon', 'Tối']];
function themeButton() {
  const cur = THEMES.find((t) => t[0] === getThemePref()) || THEMES[0];
  return `<button id="btn-theme" title="Giao diện: ${cur[2]}">${icon(cur[1])}<span>${cur[2] === 'Theo hệ thống' ? 'Tự động' : cur[2]}</span></button>`;
}

function renderShell() {
  const me = state.me;
  const navHtml = NAV.filter((g) => !g.roles || g.roles.includes(me.role)).map((g) => `
    ${g.group ? `<div class="nav-group">${esc(g.group)}</div>` : ''}
    ${g.items.map((it) => `<a href="#/${it.id}" data-nav="${it.id}">${icon(it.icon)}<span>${esc(it.label)}</span>${it.badge ? '<span class="badge count hidden" data-badge></span>' : ''}</a>`).join('')}
  `).join('');
  const tabs = [['dashboard', 'home', 'Tổng quan'], ['my', 'cal', 'Công'], ['requests', 'doc', 'Đơn từ']];
  $('#app').innerHTML = `
  <div class="shell" id="shell">
    <aside class="side" aria-label="Điều hướng">
      ${brand()}
      <nav class="nav">${navHtml}</nav>
      <div class="side-foot">
        <div class="me">${avatar(me.full_name)}<div style="min-width:0"><div class="who">${esc(me.full_name)}</div>
          <div class="role">${esc(ROLE[me.role])}${me.department_name ? ', ' + esc(me.department_name) : ''}</div></div></div>
        <div class="side-actions">
          ${themeButton()}
          <button id="btn-pw" title="Đổi mật khẩu">${icon('shield')}<span>Mật khẩu</span></button>
          <button id="btn-out" title="Đăng xuất">${icon('logout')}<span>Thoát</span></button>
        </div>
      </div>
    </aside>
    <div style="min-width:0">
      <div class="topbar"><button id="btn-menu" aria-label="Mở menu">${icon('menu')}</button><div class="brand-mark">${BRAND_SVG}</div><strong>${esc(state.company)}</strong></div>
      <main class="main" id="view"></main>
      <nav class="tabbar" aria-label="Điều hướng nhanh">
        ${tabs.map(([id, ic, l]) => `<a href="#/${id}" data-tab-nav="${id}">${icon(ic)}<span>${l}</span>${id === 'requests' ? '<i class="dot hidden" data-badge-dot></i>' : ''}</a>`).join('')}
        <button id="tab-more">${icon('more')}<span>Thêm</span></button>
      </nav>
    </div>
  </div>`;
  $('#btn-out').onclick = logout;
  $('#btn-pw').onclick = () => { location.hash = '#/password'; };
  $('#btn-menu').onclick = () => toggleNav(true);
  $('#tab-more').onclick = () => toggleNav(true);
  $('.side').addEventListener('click', (e) => {
    const b = e.target.closest('#btn-theme'); if (!b) return;
    const i = THEMES.findIndex((t) => t[0] === getThemePref());
    setThemePref(THEMES[(i + 1) % THEMES.length][0]);
    b.outerHTML = themeButton();
  });
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
    state.pending = count;
    document.querySelectorAll('[data-badge]').forEach((b) => { b.textContent = count; b.classList.toggle('hidden', !count); b.title = `${count} đơn chờ bạn duyệt`; });
    document.querySelectorAll('[data-badge-dot]').forEach((d) => d.classList.toggle('hidden', !count));
  } catch { /* ignore */ }
}

// Gắn avatar chữ cái cho mọi khối .person (tên + mã) mà các trang render ra
function enhancePeople(root) {
  root.querySelectorAll('.person:not([data-av])').forEach((el) => {
    el.dataset.av = '1';
    const first = el.firstChild;
    const name = (first && first.nodeType === 3 ? first.textContent : el.textContent).trim();
    if (!name) return;
    const pt = document.createElement('span'); pt.className = 'pt';
    while (el.firstChild) pt.appendChild(el.firstChild);
    if (pt.firstChild && pt.firstChild.nodeType === 3) {
      const s = document.createElement('span'); s.textContent = pt.firstChild.textContent.trim(); pt.replaceChild(s, pt.firstChild);
    }
    const av = document.createElement('span'); av.className = 'av'; av.style.setProperty('--h', hue(name)); av.setAttribute('aria-hidden', 'true'); av.textContent = initials(name);
    el.append(av, pt);
  });
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhancePeople(n.matches?.('.person') ? n.parentNode : n);
}).observe(document.body, { childList: true, subtree: true });

let renderSeq = 0;
async function route() {
  if (!state.me) return;
  toggleNav(false);
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const id = path || 'dashboard';
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('active', a.dataset.nav === id);
  for (const a of document.querySelectorAll('[data-tab-nav]')) a.classList.toggle('active', a.dataset.tabNav === id);
  const view = $('#view');
  view.classList.toggle('wide', WIDE.has(id));
  if (id === 'password') { renderChangePassword(false); return; }
  const allowed = NAV.find((g) => g.items.some((i) => i.id === id));
  if (!PAGES[id] || (allowed?.roles && !allowed.roles.includes(state.me.role))) { location.hash = '#/dashboard'; return; }
  const seq = ++renderSeq;
  view.innerHTML = '<div class="loading">Đang tải…</div>';
  try {
    const mod = await PAGES[id]();
    if (seq !== renderSeq) return;
    const host = document.createElement('div'); host.className = 'view-enter';
    view.innerHTML = ''; view.appendChild(host);
    await mod.render(host, ctx, new URLSearchParams(qs || ''));
    const h1 = host.querySelector('h1'); document.title = `${h1 ? h1.textContent + ' — ' : ''}${state.company}`;
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e.status === 401 || e.code === 'MUST_CHANGE_PASSWORD') return;
    view.innerHTML = emptyState('Không tải được trang', esc(e.message), 'alert');
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
    else $('#app').innerHTML = emptyState('Không kết nối được máy chủ', esc(e.message), 'alert');
  }
}

window.addEventListener('hashchange', route);
setInterval(refreshBadge, 60000);
boot();
