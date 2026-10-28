const router = require('express').Router();
const multer = require('multer');
const { db, audit, getSettings } = require('../db');
const { requireRole, scopeUsersSql, canAccessUser } = require('../middleware/auth');
const { wrap, bad, notFound, forbidden, str, intOrNull } = require('../utils/http');
const { ipAllowed, distanceMeters, normIp } = require('../utils/net');
const T = require('../utils/time');
const calc = require('../services/calc');
const { importRecords, parseFile } = require('../services/importer');
const { buildLogsWorkbook } = require('../services/excel');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// ---------- Chấm công trên web / điện thoại ----------
function checkPolicy(req, user, settings) {
  if (!user.allow_web_checkin) return 'Tài khoản của bạn chỉ được chấm công bằng máy chấm công';
  const mode = settings.checkin_mode;
  if (mode === 'anywhere') return null;
  const ip = normIp(req.ip);
  const ipOk = ipAllowed(ip, settings.allowed_ips);
  let gpsOk = false, gpsMsg = 'Không lấy được vị trí GPS — hãy cho phép trình duyệt truy cập vị trí';
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (settings.office_lat === '' || settings.office_lng === '') gpsMsg = 'Quản trị viên chưa cấu hình toạ độ văn phòng';
    else {
      const dist = distanceMeters(lat, lng, +settings.office_lat, +settings.office_lng);
      const acc = Math.min(parseFloat(req.body.accuracy) || 0, 100); // bù sai số GPS tối đa 100m
      gpsOk = dist <= +settings.office_radius + acc;
      gpsMsg = `Bạn đang cách văn phòng khoảng ${Math.round(dist)} m (cho phép ${settings.office_radius} m)`;
    }
  }
  if (mode === 'ip') return ipOk ? null : `Bạn cần kết nối mạng nội bộ công ty để chấm công (IP hiện tại: ${ip})`;
  if (mode === 'gps') return gpsOk ? null : gpsMsg;
  return ipOk || gpsOk ? null : `Không ở mạng công ty (IP ${ip}) và ${gpsMsg.charAt(0).toLowerCase() + gpsMsg.slice(1)}`;
}

router.post('/checkin', (req, res) => {
  const settings = getSettings();
  const user = getUser(req.user.id);
  const err = checkPolicy(req, user, settings);
  if (err) { audit(req, 'checkin_denied', { reason: err }); return res.status(403).json({ error: err }); }
  const now = new Date();
  const last = db.prepare('SELECT ts FROM attendance_logs WHERE user_id = ? ORDER BY ts DESC LIMIT 1').get(user.id);
  const gap = +settings.min_punch_interval || 1;
  if (last && T.diffMin(now, T.parseDateTime(last.ts)) < gap) throw bad(`Bạn vừa chấm công lúc ${last.ts.slice(11, 16)}. Vui lòng đợi ${gap} phút.`);
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  db.prepare(`INSERT OR IGNORE INTO attendance_logs(user_id, ts, source, ip, lat, lng) VALUES (?,?,?,?,?,?)`)
    .run(user.id, T.toDateTimeStr(now), 'web', normIp(req.ip), Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null);
  res.json({ ok: true, time: T.toTimeStr(now), today: todayStatus(user) });
});

function todayStatus(user) {
  const d = T.today();
  const { result } = calc.computeRange([user], d, d);
  return result.get(user.id)[0];
}
router.get('/today', (req, res) => res.json(todayStatus(getUser(req.user.id))));

// ---------- Công theo tháng của 1 người (mặc định: chính mình) ----------
router.get('/month', (req, res) => {
  const range = T.monthRange(req.query.month || T.currentMonth());
  if (!range) throw bad('Tháng không hợp lệ');
  const target = getUser(intOrNull(req.query.user_id) || req.user.id);
  if (!canAccessUser(req.user, target)) throw forbidden();
  const { result } = calc.computeRange([target], range.from, range.to);
  const days = result.get(target.id);
  const used = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM requests WHERE user_id = ? AND kind='leave' AND leave_type='annual'
    AND status='approved' AND substr(date_from,1,4) = ?`).get(target.id, String(range.year)).s;
  res.json({ user: { id: target.id, code: target.code, full_name: target.full_name }, days, summary: calc.summarize(days),
    leave: { quota: target.annual_leave_quota, used, remaining: target.annual_leave_quota - used } });
});

// ---------- Nhật ký chấm công thô ----------
function logsQuery(req) {
  const sc = scopeUsersSql(req.user);
  const where = [sc.where], params = [...sc.params];
  const from = T.parseDate(req.query.from) ? req.query.from : T.addDays(T.today(), -6);
  const to = T.parseDate(req.query.to) ? req.query.to : T.today();
  where.push('l.ts >= ? AND l.ts < ?'); params.push(from + ' 00:00:00', T.addDays(to, 1) + ' 00:00:00');
  if (req.query.user_id) { where.push('l.user_id = ?'); params.push(+req.query.user_id); }
  if (req.query.department_id) { where.push('u.department_id = ?'); params.push(+req.query.department_id); }
  if (['web', 'device', 'import', 'manual'].includes(req.query.source)) { where.push('l.source = ?'); params.push(req.query.source); }
  if (req.query.q) { where.push('(u.full_name LIKE ? OR u.code LIKE ?)'); const q = `%${str(req.query.q, 64)}%`; params.push(q, q); }
  return { sql: `SELECT l.id, l.user_id, u.code, u.full_name, d.name AS department_name, l.ts, l.source, l.ip, l.lat, l.lng,
      dv.name AS device_name, l.note, cb.full_name AS created_by_name
    FROM attendance_logs l JOIN users u ON u.id = l.user_id LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN devices dv ON dv.id = l.device_id LEFT JOIN users cb ON cb.id = l.created_by
    WHERE ${where.join(' AND ')} ORDER BY l.ts DESC`, params, from, to };
}
router.get('/logs', (req, res) => {
  const q = logsQuery(req);
  const rows = db.prepare(q.sql + ' LIMIT 2000').all(...q.params);
  res.json({ from: q.from, to: q.to, rows, truncated: rows.length === 2000 });
});
router.get('/logs/export', wrap(async (req, res) => {
  const q = logsQuery(req);
  const wb = await buildLogsWorkbook(db.prepare(q.sql).all(...q.params));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="nhat-ky-cham-cong_${q.from}_${q.to}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

// Thêm log thủ công (admin)
router.post('/logs', requireRole('admin'), (req, res) => {
  const user = getUser(+req.body.user_id);
  if (!user) throw bad('Chọn nhân viên');
  const date = str(req.body.date, 10), time = str(req.body.time, 5);
  if (!T.parseDate(date) || !T.isTime(time)) throw bad('Ngày/giờ không hợp lệ');
  const note = str(req.body.note, 255);
  if (!note) throw bad('Nhập lý do thêm công thủ công');
  const info = db.prepare(`INSERT OR IGNORE INTO attendance_logs(user_id, ts, source, note, created_by) VALUES (?,?,?,?,?)`)
    .run(user.id, `${date} ${time}:00`, 'manual', note, req.user.id);
  if (!info.changes) throw bad('Đã có bản ghi trùng thời điểm này');
  audit(req, 'log_manual_add', { user: user.code, ts: `${date} ${time}`, note });
  res.json({ ok: true });
});
router.delete('/logs/:id', requireRole('admin'), (req, res) => {
  const l = db.prepare('SELECT l.*, u.code FROM attendance_logs l JOIN users u ON u.id = l.user_id WHERE l.id = ?').get(+req.params.id);
  if (!l) throw notFound();
  db.prepare('DELETE FROM attendance_logs WHERE id = ?').run(l.id);
  audit(req, 'log_delete', { user: l.code, ts: l.ts, source: l.source });
  res.json({ ok: true });
});

// Nhập file từ máy chấm công (USB attlog.dat / CSV / TXT / XLSX)
router.post('/import', requireRole('admin'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('Chọn file cần nhập');
  const recs = await parseFile(req.file.buffer, req.file.originalname);
  if (!recs.length) throw bad('Không đọc được dòng chấm công nào. File cần có cột mã chấm công và ngày giờ (YYYY-MM-DD HH:mm hoặc DD/MM/YYYY HH:mm).');
  const stats = importRecords(recs, { source: 'import', createdBy: req.user.id });
  audit(req, 'log_import', { file: req.file.originalname, ...stats, unknownIds: undefined });
  res.json(stats);
}));

module.exports = router;
