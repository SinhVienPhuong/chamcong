// Tiện ích giao diện dùng chung
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const monthStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const fmtDT = (s) => (s ? `${s.slice(11, 16)} ${fmtDate(s.slice(0, 10))}` : '');
export const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const WD_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
export const wdOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
export const num = (x, d = 2) => (x === null || x === undefined || x === '' ? '' : (+(+x).toFixed(d)).toLocaleString('vi-VN'));
export const mins = (m) => (!m ? '' : m < 60 ? `${m} phút` : `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}`);

export const ROLE = { admin: 'Quản trị', manager: 'Quản lý', employee: 'Nhân viên' };
export const LEAVE = { annual: 'Phép năm', personal: 'Việc riêng có lương', sick: 'Ốm đau (BHXH)', unpaid: 'Không lương' };
export const KIND = { leave: 'Nghỉ phép', ot: 'Tăng ca', adjust: 'Giải trình' };
export const REQ_STATUS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã huỷ' };
export const SOURCE = { web: 'Web', device: 'Máy chấm', import: 'Nhập file', manual: 'Thủ công' };
export const DAY_STATUS = {
  ok: 'Đủ công', late: 'Đi muộn', early: 'Về sớm', late_early: 'Muộn & về sớm', partial: 'Thiếu giờ', missing: 'Thiếu chấm công',
  working: 'Đang làm', absent: 'Vắng', leave: 'Nghỉ phép', holiday: 'Ngày lễ', off: 'Ngày nghỉ', future: 'Chưa đến', not_joined: 'Chưa vào làm',
};
export const statusBadge = (st, label) => `<span class="badge st st-${esc(st)}">${esc(label ?? DAY_STATUS[st] ?? REQ_STATUS[st] ?? st)}</span>`;

// ---------- Icon (nét mảnh, đồng bộ) ----------
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 6h4"/><circle cx="12" cy="13" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  login: '<path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5"/>',
  logout: '<path d="M14 7l5 5-5 5M19 12H8M10 21H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- Toast ----------
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 6000 : 3200);
}

// ---------- Modal ----------
export function modal({ title, body, foot = '', size = '' }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="x" aria-label="Đóng" data-close>&times;</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(back);
  setTimeout(() => (back.querySelector('input:not([type=hidden]),select,textarea') || back.querySelector('.modal-foot .btn.primary') || back.querySelector('.x'))?.focus(), 30);
  return { el: back, close };
}

export function confirmDialog(message, { title = 'Xác nhận', ok = 'Đồng ý', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({ title, size: 'sm', body: `<p>${esc(message)}</p>`,
      foot: `<button class="btn" data-close>Huỷ</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>` });
    let done = false;
    m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

function fieldHtml(f, v) {
  const id = 'f_' + f.name;
  const req = f.required ? ' required' : '';
  const cls = f.full || f.type === 'textarea' || f.type === 'checks' ? ' full' : '';
  const help = f.help ? `<div class="help">${f.help}</div>` : '';
  let input;
  switch (f.type) {
    case 'select':
      input = `<select class="input" id="${id}" name="${f.name}"${req}>${(f.options || []).map((o) =>
        `<option value="${esc(o.value)}"${String(o.value) === String(v ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'textarea':
      input = `<textarea class="input" id="${id}" name="${f.name}"${req} placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea>`; break;
    case 'checkbox':
      return `<div class="field${cls}"><label class="check"><input type="checkbox" name="${f.name}"${v ? ' checked' : ''}> ${esc(f.label)}</label>${help}</div>`;
    case 'checks': {
      const set = new Set(String(v ?? '').split(',').filter((x) => x !== ''));
      input = `<div class="checks">${f.options.map((o) => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(o.value)}"${set.has(String(o.value)) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`;
      break;
    }
    case 'file':
      input = `<input class="input" type="file" id="${id}" name="${f.name}" accept="${esc(f.accept || '')}"${req}>`; break;
    default:
      input = `<input class="input" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(v ?? '')}"${req}
        ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}
        placeholder="${esc(f.placeholder || '')}" autocomplete="${f.autocomplete || 'off'}">`;
  }
  return `<div class="field${cls}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${help}</div>`;
}

/**
 * Form trong modal. onSubmit(values) trả về promise; lỗi ném ra sẽ hiện ngay trong form.
 */
export function openForm({ title, fields, values = {}, submit = 'Lưu', size = '', intro = '', onSubmit, onChange }) {
  return new Promise((resolve) => {
    const body = `${intro}<form class="form-grid" novalidate>${fields.map((f) => fieldHtml(f, values[f.name] ?? f.value)).join('')}</form><div class="form-error" role="alert"></div>`;
    const m = modal({ title, size, body, foot: `<button class="btn" data-close>Huỷ</button><button class="btn primary" data-submit>${esc(submit)}</button>` });
    const form = m.el.querySelector('form');
    const errEl = m.el.querySelector('.form-error');
    const read = () => {
      const out = {};
      for (const f of fields) {
        if (f.type === 'checkbox') out[f.name] = form.elements[f.name].checked;
        else if (f.type === 'checks') out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map((x) => x.value).join(',');
        else if (f.type === 'file') out[f.name] = form.elements[f.name].files[0] || null;
        else out[f.name] = form.elements[f.name].value.trim();
      }
      return out;
    };
    if (onChange) form.addEventListener('change', () => onChange(read(), form));
    const btn = m.el.querySelector('[data-submit]');
    const submitFn = async () => {
      errEl.textContent = '';
      const v = read();
      const missing = fields.find((f) => f.required && f.type !== 'checkbox' && (v[f.name] === '' || v[f.name] === null));
      if (missing) { errEl.textContent = `Vui lòng nhập “${missing.label}”`; form.elements[missing.name]?.focus?.(); return; }
      btn.disabled = true;
      try { const r = await onSubmit(v); m.close(); resolve(r ?? true); }
      catch (e) { errEl.textContent = e.message; }
      finally { btn.disabled = false; }
    };
    btn.onclick = submitFn;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitFn(); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submitFn(); } });
  });
}

export const opts = (arr, valueKey = 'id', labelFn = (x) => x.name, empty) =>
  [...(empty !== undefined ? [{ value: '', label: empty }] : []), ...arr.map((x) => ({ value: x[valueKey], label: labelFn(x) }))];

export const emptyState = (title, hint = '') => `<div class="empty"><strong>${esc(title)}</strong>${hint}</div>`;

export function showSecret(title, intro, secret) {
  modal({ title, size: 'sm', body: `<p>${intro}</p><div class="secret">${esc(secret)}</div><p class="muted small" style="margin-top:12px">Mật khẩu chỉ hiển thị một lần. Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>`,
    foot: '<button class="btn primary" data-close>Đã ghi lại</button>' });
}
