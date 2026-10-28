const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, audit } = require('../db');
const { requireRole, scopeUsersSql, canAccessUser } = require('../middleware/auth');
const { wrap, bad, notFound, str, intOrNull } = require('../utils/http');
const T = require('../utils/time');

const SELECT = `SELECT u.id, u.code, u.full_name, u.email, u.phone, u.username, u.role, u.department_id, d.name AS department_name,
  u.position, u.shift_id, s.name AS shift_name, u.device_user_id, u.join_date, u.annual_leave_quota, u.allow_web_checkin, u.track_attendance, u.active
  FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN shifts s ON s.id = u.shift_id`;

router.get('/', (req, res) => {
  const sc = scopeUsersSql(req.user);
  const where = [sc.where], params = [...sc.params];
  if (req.query.department_id) { where.push('u.department_id = ?'); params.push(+req.query.department_id); }
  if (req.query.active !== 'all') { where.push('u.active = ?'); params.push(req.query.active === '0' ? 0 : 1); }
  if (req.query.q) { where.push('(u.full_name LIKE ? OR u.code LIKE ? OR u.username LIKE ?)'); const q = `%${str(req.query.q, 64)}%`; params.push(q, q, q); }
  res.json(db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY u.active DESC, d.name, u.code`).all(...params));
});

router.get('/:id', (req, res) => {
  const u = db.prepare(`${SELECT} WHERE u.id = ?`).get(+req.params.id);
  if (!u || !canAccessUser(req.user, u)) throw notFound();
  res.json(u);
});

function readBody(b, isNew) {
  const o = {
    code: str(b.code, 32).toUpperCase(), full_name: str(b.full_name, 120), email: str(b.email, 120) || null, phone: str(b.phone, 32) || null,
    username: str(b.username, 64).toLowerCase(), role: ['admin', 'manager', 'employee'].includes(b.role) ? b.role : 'employee',
    department_id: intOrNull(b.department_id), position: str(b.position, 120) || null, shift_id: intOrNull(b.shift_id),
    device_user_id: str(b.device_user_id, 32) || null, join_date: str(b.join_date, 10) || null,
    annual_leave_quota: Number.isFinite(+b.annual_leave_quota) && b.annual_leave_quota !== '' ? +b.annual_leave_quota : 12,
    allow_web_checkin: b.allow_web_checkin === false || b.allow_web_checkin === 0 || b.allow_web_checkin === '0' ? 0 : 1,
    track_attendance: b.track_attendance === false || b.track_attendance === 0 || b.track_attendance === '0' ? 0 : 1,
    active: b.active === false || b.active === 0 || b.active === '0' ? 0 : 1,
  };
  if (!o.code || !/^[A-Z0-9._-]+$/.test(o.code)) throw bad('Mã nhân viên chỉ gồm chữ, số, dấu . _ -');
  if (!o.full_name) throw bad('Nhập họ tên');
  if (!o.username || !/^[a-z0-9._-]{3,}$/.test(o.username)) throw bad('Tên đăng nhập tối thiểu 3 ký tự: chữ thường, số, . _ -');
  if (o.join_date && !T.parseDate(o.join_date)) throw bad('Ngày vào làm không hợp lệ');
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw bad('Email không hợp lệ');
  if (isNew && b.password && String(b.password).length < 8) throw bad('Mật khẩu tối thiểu 8 ký tự');
  return o;
}

function uniqueError(e) {
  if (String(e.message).includes('UNIQUE')) {
    if (e.message.includes('users.code')) return bad('Mã nhân viên đã tồn tại');
    if (e.message.includes('users.username')) return bad('Tên đăng nhập đã tồn tại');
    if (e.message.includes('device_user_id')) return bad('User ID máy chấm công đã gán cho người khác');
  }
  return e;
}

router.post('/', requireRole('admin'), wrap(async (req, res) => {
  const o = readBody(req.body, true);
  const tempPwd = req.body.password ? String(req.body.password) : crypto.randomBytes(6).toString('base64url') + '9a';
  try {
    const info = db.prepare(`INSERT INTO users(code,full_name,email,phone,username,password_hash,role,department_id,position,shift_id,device_user_id,
      join_date,annual_leave_quota,allow_web_checkin,track_attendance,active,must_change_password) VALUES (@code,@full_name,@email,@phone,@username,@hash,@role,
      @department_id,@position,@shift_id,@device_user_id,@join_date,@annual_leave_quota,@allow_web_checkin,@track_attendance,@active,1)`)
      .run({ ...o, hash: await bcrypt.hash(tempPwd, 10) });
    audit(req, 'employee_create', { id: info.lastInsertRowid, code: o.code });
    res.json({ id: info.lastInsertRowid, tempPassword: req.body.password ? undefined : tempPwd });
  } catch (e) { throw uniqueError(e); }
}));

router.put('/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = +req.params.id;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw notFound();
  const o = readBody(req.body, false);
  if (id === req.user.id && (o.role !== 'admin' || !o.active)) throw bad('Không thể tự hạ quyền hoặc khoá tài khoản của chính mình');
  try {
    db.prepare(`UPDATE users SET code=@code, full_name=@full_name, email=@email, phone=@phone, username=@username, role=@role,
      department_id=@department_id, position=@position, shift_id=@shift_id, device_user_id=@device_user_id, join_date=@join_date,
      annual_leave_quota=@annual_leave_quota, allow_web_checkin=@allow_web_checkin, track_attendance=@track_attendance, active=@active WHERE id=@id`).run({ ...o, id });
  } catch (e) { throw uniqueError(e); }
  audit(req, 'employee_update', { id, code: o.code });
  res.json({ ok: true });
}));

router.post('/:id/reset-password', requireRole('admin'), wrap(async (req, res) => {
  const id = +req.params.id;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw notFound();
  const pwd = crypto.randomBytes(6).toString('base64url') + '7k';
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await bcrypt.hash(pwd, 10), id);
  audit(req, 'employee_reset_password', { id });
  res.json({ tempPassword: pwd });
}));

// Không xoá cứng để giữ lịch sử chấm công — chỉ cho nghỉ việc (khoá)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) throw bad('Không thể khoá chính mình');
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  audit(req, 'employee_deactivate', { id });
  res.json({ ok: true });
});

module.exports = router;
