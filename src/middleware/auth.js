// Xác thực JWT (cookie httpOnly) + phân quyền
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');

const COOKIE = 'cc_session';
const userStmt = db.prepare(`SELECT id, code, full_name, username, role, department_id, shift_id, active, must_change_password, allow_web_checkin,
                             password_hash FROM users WHERE id = ?`);
// Dấu phiên gắn với mật khẩu: đổi/đặt lại mật khẩu => mọi phiên cũ mất hiệu lực
const pwStamp = (hash) => require('crypto').createHash('sha256').update(String(hash)).digest('base64url').slice(0, 12);

function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id, pv: pwStamp(user.password_hash) }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: config.cookieSecure,
    maxAge: config.sessionHours * 3600 * 1000, path: '/',
  });
}
function clearSession(res) { res.clearCookie(COOKIE, { path: '/' }); }

function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch {
    clearSession(res);
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
  }
  const user = userStmt.get(payload.uid);
  if (!user || !user.active) return res.status(401).json({ error: 'Tài khoản không còn hiệu lực' });
  if (payload.pv !== pwStamp(user.password_hash)) { clearSession(res); return res.status(401).json({ error: 'Mật khẩu đã thay đổi, vui lòng đăng nhập lại' }); }
  delete user.password_hash;
  req.user = user;
  // Bắt buộc đổi mật khẩu trước khi dùng các chức năng khác
  if (user.must_change_password && !req.originalUrl.startsWith('/api/auth/')) {
    return res.status(403).json({ error: 'Bạn cần đổi mật khẩu trước khi tiếp tục', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });

/** Danh sách user mà người đang đăng nhập được xem (admin: tất cả, manager: phòng mình, NV: chính mình) */
function scopeUsersSql(user, alias = 'u') {
  if (user.role === 'admin') return { where: '1=1', params: [] };
  if (user.role === 'manager') return { where: `(${alias}.department_id = ? OR ${alias}.id = ?)`, params: [user.department_id ?? -1, user.id] };
  return { where: `${alias}.id = ?`, params: [user.id] };
}

function canAccessUser(viewer, target) {
  if (!target) return false;
  if (viewer.role === 'admin' || viewer.id === target.id) return true;
  return viewer.role === 'manager' && viewer.department_id != null && viewer.department_id === target.department_id;
}

// Rate-limit đăng nhập đơn giản trong bộ nhớ: 5 lần sai / 15 phút theo IP+username
const attempts = new Map();
function loginGuard(key) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now) return Math.ceil((a.until - now) / 60000);
  return 0;
}
function loginFail(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, first: now, until: 0 };
  if (now - a.first > 15 * 60000) { a.n = 0; a.first = now; }
  a.n++;
  if (a.n >= 5) { a.until = now + 15 * 60000; a.n = 0; a.first = now; }
  attempts.set(key, a);
}
function loginOk(key) { attempts.delete(key); }

module.exports = { issueSession, clearSession, authenticate, requireRole, scopeUsersSql, canAccessUser, loginGuard, loginFail, loginOk };
