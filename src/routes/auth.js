const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, audit, getSetting } = require('../db');
const A = require('../middleware/auth');
const { wrap, bad, str } = require('../utils/http');

router.post('/login', wrap(async (req, res) => {
  const username = str(req.body.username, 64).toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) throw bad('Nhập tên đăng nhập và mật khẩu');
  const key = req.ip + '|' + username;
  const wait = A.loginGuard(key);
  if (wait) return res.status(429).json({ error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${wait} phút.` });

  const u = db.prepare('SELECT * FROM users WHERE lower(username) = ?').get(username);
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
    A.loginFail(key);
    audit({ ip: req.ip }, 'login_failed', { username });
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  A.loginOk(key);
  A.issueSession(res, u);
  audit({ user: u, ip: req.ip }, 'login', null);
  res.json({ ok: true, mustChangePassword: !!u.must_change_password });
}));

// Tên công ty cho trang đăng nhập (công khai)
router.get('/branding', (req, res) => res.json({ company: getSetting('company_name') }));

router.post('/logout', (req, res) => { A.clearSession(res); res.json({ ok: true }); });

router.get('/me', A.authenticate, (req, res) => {
  const u = db.prepare(`SELECT u.id, u.code, u.full_name, u.username, u.role, u.email, u.phone, u.position, u.department_id,
      d.name AS department_name, s.name AS shift_name, s.start_time, s.end_time, u.allow_web_checkin, u.track_attendance, u.must_change_password, u.annual_leave_quota
    FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN shifts s ON s.id = u.shift_id WHERE u.id = ?`).get(req.user.id);
  res.json({ user: u, company: getSetting('company_name') });
});

router.post('/change-password', A.authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(String(currentPassword || ''), u.password_hash))) throw bad('Mật khẩu hiện tại không đúng');
  const p = String(newPassword || '');
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) throw bad('Mật khẩu mới cần ít nhất 8 ký tự, gồm cả chữ và số');
  if (p === currentPassword) throw bad('Mật khẩu mới phải khác mật khẩu hiện tại');
  const hash = await bcrypt.hash(p, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, req.user.id);
  A.issueSession(res, { id: req.user.id, password_hash: hash }); // cấp phiên mới, phiên ở thiết bị khác bị đăng xuất
  audit(req, 'change_password', null);
  res.json({ ok: true });
}));

module.exports = router;
