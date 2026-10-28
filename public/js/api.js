// Gọi API: tự xử lý phiên hết hạn và bắt buộc đổi mật khẩu
export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

let onAuthLost = () => {};
let onMustChange = () => {};
export function setAuthHandlers(lost, mustChange) { onAuthLost = lost; onMustChange = mustChange; }

export async function api(path, { method = 'GET', body, query, raw } = {}) {
  let url = '/api' + path;
  if (query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
    const s = q.toString(); if (s) url += '?' + s;
  }
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'); }
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  if (!res.ok) {
    const msg = data?.error || `Lỗi ${res.status}`;
    if (res.status === 401 && !path.startsWith('/auth/login')) onAuthLost();
    if (res.status === 403 && data?.code === 'MUST_CHANGE_PASSWORD') onMustChange();
    throw new ApiError(res.status, msg, data?.code);
  }
  return data;
}

export const get = (p, query) => api(p, { query });
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

// Tải file (Excel) qua fetch để giữ cookie và báo lỗi rõ ràng
export async function download(path, query, fallbackName) {
  const res = await api(path, { query, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) || /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
