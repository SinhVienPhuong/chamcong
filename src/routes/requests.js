// Đơn từ: nghỉ phép, tăng ca (OT), giải trình chấm công — tạo, duyệt, từ chối, huỷ
const router = require('express').Router();
const { db, audit } = require('../db');
const { bad, notFound, forbidden, str } = require('../utils/http');
const T = require('../utils/time');
const { LEAVE_TYPES, countLeaveDays } = require('../services/calc');

const SELECT = `SELECT r.*, u.code, u.full_name, u.department_id, d.name AS department_name, a.full_name AS approver_name
  FROM requests r JOIN users u ON u.id = r.user_id LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN users a ON a.id = r.approver_id`;

// Ai được duyệt đơn của ai: admin duyệt tất cả; manager duyệt nhân viên trong phòng (không tự duyệt đơn mình)
function canApprove(viewer, owner) {
  if (viewer.id === owner.id) return viewer.role === 'admin' && !db.prepare("SELECT 1 FROM users WHERE role='admin' AND active=1 AND id<>?").get(viewer.id);
  if (viewer.role === 'admin') return true;
  return viewer.role === 'manager' && owner.role !== 'admin' && viewer.department_id != null && viewer.department_id === owner.department_id;
}

router.get('/', (req, res) => {
  const where = [], params = [];
  const scope = req.query.scope === 'approve' ? 'approve' : 'mine';
  if (scope === 'mine') { where.push('r.user_id = ?'); params.push(req.user.id); }
  else if (req.user.role === 'manager') { where.push('u.department_id = ? AND r.user_id <> ? AND u.role <> \'admin\''); params.push(req.user.department_id ?? -1, req.user.id); }
  else if (req.user.role !== 'admin') return res.json([]);
  if (['leave', 'ot', 'adjust'].includes(req.query.kind)) { where.push('r.kind = ?'); params.push(req.query.kind); }
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status); }
  res.json(db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (r.status='pending') DESC, r.created_at DESC LIMIT 500`).all(...params));
});

router.get('/pending-count', (req, res) => {
  if (req.user.role === 'employee') return res.json({ count: 0 });
  const row = req.user.role === 'admin'
    ? db.prepare("SELECT COUNT(*) n FROM requests WHERE status='pending'").get()
    : db.prepare("SELECT COUNT(*) n FROM requests r JOIN users u ON u.id=r.user_id WHERE r.status='pending' AND u.department_id=? AND r.user_id<>? AND u.role<>'admin'").get(req.user.department_id ?? -1, req.user.id);
  res.json({ count: row.n });
});

router.get('/leave-balance', (req, res) => {
  const u = db.prepare('SELECT annual_leave_quota FROM users WHERE id = ?').get(req.user.id);
  const y = String(new Date().getFullYear());
  const sum = (st) => db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM requests WHERE user_id=? AND kind='leave' AND leave_type='annual' AND status=? AND substr(date_from,1,4)=?`).get(req.user.id, st, y).s;
  const used = sum('approved'), pending = sum('pending');
  res.json({ year: +y, quota: u.annual_leave_quota, used, pending, remaining: u.annual_leave_quota - used - pending, types: LEAVE_TYPES });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const kind = b.kind;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const reason = str(b.reason, 500);
  if (!reason) throw bad('Nhập lý do');
  const r = { user_id: user.id, kind, leave_type: null, date_from: str(b.date_from, 10), date_to: str(b.date_to, 10) || str(b.date_from, 10),
    half: null, time_from: null, time_to: null, amount: 0, reason };
  if (!T.parseDate(r.date_from) || !T.parseDate(r.date_to) || r.date_to < r.date_from) throw bad('Ngày không hợp lệ');

  const overlapPending = (k) => db.prepare(`SELECT 1 FROM requests WHERE user_id=? AND kind=? AND status IN ('pending','approved') AND date_from<=? AND date_to>=?`)
    .get(user.id, k, r.date_to, r.date_from);

  if (kind === 'leave') {
    if (!LEAVE_TYPES[b.leave_type]) throw bad('Chọn loại nghỉ');
    r.leave_type = b.leave_type;
    if (['am', 'pm'].includes(b.half)) { if (r.date_from !== r.date_to) throw bad('Nghỉ nửa ngày chỉ áp dụng cho 1 ngày'); r.half = b.half; }
    if (T.eachDate(r.date_from, r.date_to).length > 60) throw bad('Một đơn nghỉ tối đa 60 ngày');
    r.amount = countLeaveDays(user, r.date_from, r.date_to, r.half);
    if (r.amount <= 0) throw bad('Khoảng thời gian chọn không có ngày làm việc nào');
    if (overlapPending('leave')) throw bad('Đã có đơn nghỉ trùng thời gian này');
    if (LEAVE_TYPES[r.leave_type].useQuota) {
      const y = r.date_from.slice(0, 4);
      if (r.date_to.slice(0, 4) !== y) throw bad('Đơn phép năm không được kéo dài sang năm sau — tách thành 2 đơn');
      const used = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM requests WHERE user_id=? AND kind='leave' AND leave_type='annual' AND status IN ('approved','pending') AND substr(date_from,1,4)=?`).get(user.id, y).s;
      if (used + r.amount > user.annual_leave_quota) throw bad(`Không đủ phép năm: còn ${user.annual_leave_quota - used} ngày, đơn này cần ${r.amount} ngày`);
    }
  } else if (kind === 'ot') {
    r.date_to = r.date_from;
    r.time_from = str(b.time_from, 5); r.time_to = str(b.time_to, 5);
    if (!T.isTime(r.time_from) || !T.isTime(r.time_to)) throw bad('Giờ tăng ca phải dạng HH:mm');
    let mins = T.timeToMin(r.time_to) - T.timeToMin(r.time_from);
    if (mins <= 0) mins += 1440;
    if (mins > 12 * 60) throw bad('Một lần tăng ca tối đa 12 giờ');
    r.amount = Math.round(mins / 6) / 10;
    // Luật Lao động 2019: OT không quá 40h/tháng — cảnh báo cứng ở mức này
    const month = r.date_from.slice(0, 7);
    const mSum = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM requests WHERE user_id=? AND kind='ot' AND status IN ('approved','pending') AND substr(date_from,1,7)=?`).get(user.id, month).s;
    if (mSum + r.amount > 40) throw bad(`Vượt giới hạn 40 giờ tăng ca/tháng (đã đăng ký ${mSum}h)`);
  } else if (kind === 'adjust') {
    r.date_to = r.date_from;
    r.time_from = str(b.time_from, 5);
    if (!T.isTime(r.time_from)) throw bad('Nhập giờ cần bổ sung (HH:mm)');
    if (r.date_from > T.today()) throw bad('Không thể giải trình cho ngày trong tương lai');
    r.half = ['in', 'out'].includes(b.punch_type) ? b.punch_type : null; // dùng cột half lưu loại giờ vào/ra
    r.amount = 0;
  } else throw bad('Loại đơn không hợp lệ');

  const info = db.prepare(`INSERT INTO requests(user_id,kind,leave_type,date_from,date_to,half,time_from,time_to,amount,reason)
    VALUES (@user_id,@kind,@leave_type,@date_from,@date_to,@half,@time_from,@time_to,@amount,@reason)`).run(r);
  audit(req, 'request_create', { id: info.lastInsertRowid, kind });
  res.json({ id: info.lastInsertRowid, amount: r.amount });
});

function decide(req, res, status) {
  const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(+req.params.id);
  if (!r) throw notFound();
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
  if (!canApprove(req.user, owner)) throw forbidden('Bạn không có quyền duyệt đơn này');
  if (r.status !== 'pending') throw bad('Đơn đã được xử lý trước đó');
  const note = str(req.body?.note, 500) || null;
  if (status === 'rejected' && !note) throw bad('Nhập lý do từ chối');
  db.transaction(() => {
    db.prepare('UPDATE requests SET status=?, approver_id=?, decided_at=?, decision_note=? WHERE id=?')
      .run(status, req.user.id, T.toDateTimeStr(new Date()), note, r.id);
    if (status === 'approved' && r.kind === 'adjust') {
      db.prepare(`INSERT OR IGNORE INTO attendance_logs(user_id, ts, source, note, created_by) VALUES (?,?,?,?,?)`)
        .run(r.user_id, `${r.date_from} ${r.time_from}:00`, 'manual', `Giải trình #${r.id}: ${r.reason}`.slice(0, 255), req.user.id);
    }
  })();
  audit(req, `request_${status}`, { id: r.id, kind: r.kind, user: r.code });
  res.json({ ok: true });
}
router.post('/:id/approve', (req, res) => decide(req, res, 'approved'));
router.post('/:id/reject', (req, res) => decide(req, res, 'rejected'));

router.post('/:id/cancel', (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(+req.params.id);
  if (!r) throw notFound();
  if (r.user_id !== req.user.id) throw forbidden();
  if (r.status !== 'pending') throw bad('Chỉ huỷ được đơn đang chờ duyệt');
  db.prepare("UPDATE requests SET status='cancelled' WHERE id=?").run(r.id);
  audit(req, 'request_cancel', { id: r.id });
  res.json({ ok: true });
});

module.exports = router;
