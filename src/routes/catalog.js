// Danh mục: phòng ban, ca làm việc, ngày lễ, cài đặt, nhật ký hệ thống
const router = require('express').Router();
const { db, audit, getSettings, setSettings, DEFAULT_SETTINGS } = require('../db');
const { requireRole } = require('../middleware/auth');
const { bad, notFound, str } = require('../utils/http');
const { isValidCidr, parseCidrList, normIp } = require('../utils/net');
const T = require('../utils/time');
const { shiftMinutes } = require('../services/calc');

const admin = requireRole('admin');

// ---------- Phòng ban ----------
router.get('/departments', (req, res) => {
  res.json(db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.active = 1) AS headcount,
    (SELECT group_concat(full_name, ', ') FROM users u WHERE u.department_id = d.id AND u.role = 'manager' AND u.active = 1) AS managers
    FROM departments d ORDER BY d.name`).all());
});
router.post('/departments', admin, (req, res) => {
  const code = str(req.body.code, 20).toUpperCase(), name = str(req.body.name, 120);
  if (!code || !name) throw bad('Nhập mã và tên phòng ban');
  try {
    const info = db.prepare('INSERT INTO departments(code,name) VALUES (?,?)').run(code, name);
    audit(req, 'department_create', { code }); res.json({ id: info.lastInsertRowid });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('Mã phòng ban đã tồn tại'); throw e; }
});
router.put('/departments/:id', admin, (req, res) => {
  const code = str(req.body.code, 20).toUpperCase(), name = str(req.body.name, 120);
  if (!code || !name) throw bad('Nhập mã và tên phòng ban');
  try { db.prepare('UPDATE departments SET code=?, name=? WHERE id=?').run(code, name, +req.params.id); }
  catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('Mã phòng ban đã tồn tại'); throw e; }
  audit(req, 'department_update', { id: +req.params.id }); res.json({ ok: true });
});
router.delete('/departments/:id', admin, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM users WHERE department_id = ? AND active = 1').get(+req.params.id).n;
  if (n) throw bad(`Phòng ban còn ${n} nhân viên đang làm, chuyển họ sang phòng khác trước`);
  db.prepare('DELETE FROM departments WHERE id = ?').run(+req.params.id);
  audit(req, 'department_delete', { id: +req.params.id }); res.json({ ok: true });
});

// ---------- Ca làm việc ----------
router.get('/shifts', (req, res) => {
  res.json(db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM users u WHERE u.shift_id = s.id AND u.active = 1) AS headcount FROM shifts s ORDER BY s.is_default DESC, s.start_time`).all()
    .map((s) => ({ ...s, std_hours: Math.round(shiftMinutes(s).fullStd / 6) / 10 })));
});
function readShift(b) {
  const s = {
    code: str(b.code, 20).toUpperCase(), name: str(b.name, 80), start_time: str(b.start_time, 5), end_time: str(b.end_time, 5),
    break_start: str(b.break_start, 5) || null, break_end: str(b.break_end, 5) || null,
    late_grace: Math.max(0, Math.min(120, parseInt(b.late_grace, 10) || 0)), early_grace: Math.max(0, Math.min(120, parseInt(b.early_grace, 10) || 0)),
    work_days: (Array.isArray(b.work_days) ? b.work_days : String(b.work_days || '').split(',')).map(Number).filter((x) => x >= 0 && x <= 6).join(','),
    half_days: (Array.isArray(b.half_days) ? b.half_days : String(b.half_days || '').split(',')).filter((x) => x !== '').map(Number).filter((x) => x >= 0 && x <= 6).join(','),
    is_default: b.is_default ? 1 : 0,
  };
  if (!s.code || !s.name) throw bad('Nhập mã và tên ca');
  if (!T.isTime(s.start_time) || !T.isTime(s.end_time)) throw bad('Giờ vào/ra ca phải dạng HH:mm');
  if ((s.break_start && !T.isTime(s.break_start)) || (s.break_end && !T.isTime(s.break_end)) || (!!s.break_start !== !!s.break_end)) throw bad('Giờ nghỉ giữa ca phải nhập đủ bắt đầu và kết thúc (HH:mm)');
  if (!s.work_days) throw bad('Chọn ít nhất một ngày làm việc');
  if (shiftMinutes(s).fullStd < 60) throw bad('Thời lượng ca quá ngắn');
  return s;
}
const saveDefault = db.transaction((id) => { db.prepare('UPDATE shifts SET is_default = 0').run(); db.prepare('UPDATE shifts SET is_default = 1 WHERE id = ?').run(id); });
router.post('/shifts', admin, (req, res) => {
  const s = readShift(req.body);
  try {
    const info = db.prepare(`INSERT INTO shifts(code,name,start_time,end_time,break_start,break_end,late_grace,early_grace,work_days,half_days,is_default)
      VALUES (@code,@name,@start_time,@end_time,@break_start,@break_end,@late_grace,@early_grace,@work_days,@half_days,0)`).run(s);
    if (s.is_default) saveDefault(info.lastInsertRowid);
    audit(req, 'shift_create', { code: s.code }); res.json({ id: info.lastInsertRowid });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('Mã ca đã tồn tại'); throw e; }
});
router.put('/shifts/:id', admin, (req, res) => {
  const s = readShift(req.body), id = +req.params.id;
  try {
    db.prepare(`UPDATE shifts SET code=@code,name=@name,start_time=@start_time,end_time=@end_time,break_start=@break_start,break_end=@break_end,
      late_grace=@late_grace,early_grace=@early_grace,work_days=@work_days,half_days=@half_days WHERE id=@id`).run({ ...s, id });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('Mã ca đã tồn tại'); throw e; }
  if (s.is_default) saveDefault(id);
  audit(req, 'shift_update', { id }); res.json({ ok: true });
});
router.delete('/shifts/:id', admin, (req, res) => {
  const id = +req.params.id;
  const s = db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
  if (!s) throw notFound();
  if (s.is_default) throw bad('Không thể xoá ca mặc định');
  const n = db.prepare('SELECT COUNT(*) n FROM users WHERE shift_id = ?').get(id).n;
  if (n) throw bad(`Ca đang được gán cho ${n} nhân viên`);
  db.prepare('DELETE FROM shifts WHERE id = ?').run(id);
  audit(req, 'shift_delete', { id }); res.json({ ok: true });
});

// ---------- Ngày lễ ----------
router.get('/holidays', (req, res) => {
  const y = /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear());
  res.json(db.prepare("SELECT * FROM holidays WHERE date LIKE ? ORDER BY date").all(y + '-%'));
});
router.post('/holidays', admin, (req, res) => {
  const from = str(req.body.date, 10), to = str(req.body.date_to, 10) || from, name = str(req.body.name, 120);
  if (!T.parseDate(from) || !T.parseDate(to) || to < from) throw bad('Ngày không hợp lệ');
  if (!name) throw bad('Nhập tên ngày lễ');
  const dates = T.eachDate(from, to);
  if (dates.length > 31) throw bad('Tối đa 31 ngày mỗi lần');
  const st = db.prepare('INSERT INTO holidays(date,name) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET name = excluded.name');
  db.transaction(() => dates.forEach((d) => st.run(d, name)))();
  audit(req, 'holiday_upsert', { from, to, name }); res.json({ ok: true, count: dates.length });
});
router.delete('/holidays/:date', admin, (req, res) => {
  db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
  audit(req, 'holiday_delete', { date: req.params.date }); res.json({ ok: true });
});

// ---------- Cài đặt ----------
router.get('/settings', admin, (req, res) => res.json({ ...getSettings(), _client_ip: normIp(req.ip) }));
router.put('/settings', admin, (req, res) => {
  const b = req.body || {}, o = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in b) o[k] = str(b[k], 2000);
  if ('checkin_mode' in o && !['anywhere', 'ip', 'gps', 'ip_or_gps'].includes(o.checkin_mode)) throw bad('Chế độ chấm công không hợp lệ');
  if ('allowed_ips' in o) {
    const bads = parseCidrList(o.allowed_ips).filter((c) => !isValidCidr(c));
    if (bads.length) throw bad('Dải IP không hợp lệ: ' + bads.join(', '));
  }
  for (const k of ['office_lat', 'office_lng']) if (o[k] && !Number.isFinite(+o[k])) throw bad('Toạ độ văn phòng không hợp lệ');
  for (const k of ['office_radius', 'ot_rate_weekday', 'ot_rate_weekend', 'ot_rate_holiday', 'min_punch_interval']) {
    if (k in o && !(+o[k] >= 0)) throw bad(`Giá trị ${k} không hợp lệ`);
  }
  if ('company_name' in o && !o.company_name) throw bad('Nhập tên công ty');
  setSettings(o);
  audit(req, 'settings_update', Object.keys(o));
  res.json({ ok: true });
});

router.get('/audit', admin, (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 200);
  res.json(db.prepare(`SELECT a.*, u.full_name, u.code FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`).all(limit));
});

module.exports = router;
