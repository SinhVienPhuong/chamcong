// Bảng công tháng, xuất Excel, dashboard
const router = require('express').Router();
const { db, getSetting } = require('../db');
const { scopeUsersSql, requireRole } = require('../middleware/auth');
const { wrap, bad } = require('../utils/http');
const T = require('../utils/time');
const calc = require('../services/calc');
const { buildTimesheetWorkbook } = require('../services/excel');

function loadTimesheet(req) {
  const range = T.monthRange(req.query.month || T.currentMonth());
  if (!range) throw bad('Tháng không hợp lệ');
  const sc = scopeUsersSql(req.user);
  const where = [sc.where], params = [...sc.params];
  // Người đã nghỉ việc vẫn hiện nếu có ngày vào làm trước cuối tháng và có log trong tháng
  where.push(`(u.active = 1 OR EXISTS (SELECT 1 FROM attendance_logs l WHERE l.user_id = u.id AND l.ts BETWEEN ? AND ?))`);
  params.push(range.from, range.to + ' 23:59:59');
  where.push('(u.join_date IS NULL OR u.join_date <= ?)', 'u.track_attendance = 1'); params.push(range.to);
  if (req.query.department_id) { where.push('u.department_id = ?'); params.push(+req.query.department_id); }
  const users = db.prepare(`SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${where.join(' AND ')} ORDER BY d.name, u.code`).all(...params);
  const { result, holidays } = calc.computeRange(users, range.from, range.to);
  const rows = users.map((u) => {
    const days = result.get(u.id);
    return { user: { id: u.id, code: u.code, full_name: u.full_name, department_name: u.department_name, active: u.active }, days, summary: calc.summarize(days) };
  });
  return { range, rows, holidays: Object.fromEntries(holidays) };
}

router.get('/timesheet', (req, res) => {
  const { range, rows, holidays } = loadTimesheet(req);
  res.json({ month: `${range.year}-${T.pad(range.month)}`, from: range.from, to: range.to, holidays, rows });
});

router.get('/timesheet/export', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const { range, rows } = loadTimesheet(req);
  const dep = req.query.department_id ? db.prepare('SELECT name FROM departments WHERE id = ?').get(+req.query.department_id) : null;
  const wb = await buildTimesheetWorkbook({ companyName: getSetting('company_name'), month: req.query.month, range, rows, departmentName: dep?.name });
  const fname = `bang-cong-${range.year}-${T.pad(range.month)}${dep ? '-' + dep.name : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bang-cong.xlsx"; filename*=UTF-8''${encodeURIComponent(fname)}`);
  await wb.xlsx.write(res); res.end();
}));

// Dashboard hôm nay cho quản lý
router.get('/dashboard', requireRole('admin', 'manager'), (req, res) => {
  const d = T.today();
  const sc = scopeUsersSql(req.user);
  const users = db.prepare(`SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${sc.where} AND u.active = 1 AND u.track_attendance = 1 AND (u.join_date IS NULL OR u.join_date <= ?) ORDER BY d.name, u.code`).all(...sc.params, d);
  const { result, holidays } = calc.computeRange(users, d, d);
  const stats = { total: users.length, scheduled: 0, present: 0, late: 0, leave: 0, absent: 0, notYet: 0 };
  const late = [], absentees = [], onLeave = [];
  const depMap = new Map();
  for (const u of users) {
    const day = result.get(u.id)[0];
    const dk = u.department_name || 'Chưa phân phòng';
    if (!depMap.has(dk)) depMap.set(dk, { name: dk, scheduled: 0, present: 0, late: 0, leave: 0 });
    const dp = depMap.get(dk);
    if (day.isWorkday) dp.scheduled++;
    if (day.checkIn) dp.present++;
    if (day.lateMin) dp.late++;
    if (day.status === 'leave') dp.leave++;
    const info = { id: u.id, code: u.code, full_name: u.full_name, department_name: u.department_name, checkIn: day.checkIn, plannedIn: day.plannedIn, lateMin: day.lateMin, leaveType: day.leaveType };
    if (day.isWorkday) stats.scheduled++;
    if (day.checkIn) stats.present++;
    if (day.lateMin) { stats.late++; late.push(info); }
    if (day.status === 'leave') { stats.leave++; onLeave.push(info); }
    else if (day.isWorkday && !day.checkIn) {
      if (day.status === 'absent') { stats.absent++; absentees.push(info); } else { stats.notYet++; absentees.push(info); }
    }
  }
  // Xu hướng 14 ngày: tỷ lệ đi làm & đi muộn
  const from = T.addDays(d, -13);
  const trendRange = calc.computeRange(users, from, d);
  const trend = T.eachDate(from, d).map((date, i) => {
    let sched = 0, pres = 0, lt = 0;
    for (const u of users) { const x = trendRange.result.get(u.id)[i]; if (x.isWorkday) { sched++; if (x.checkIn) pres++; if (x.lateMin) lt++; } }
    return { date, scheduled: sched, present: pres, late: lt };
  });
  const recent = db.prepare(`SELECT l.ts, l.source, u.code, u.full_name FROM attendance_logs l JOIN users u ON u.id = l.user_id
    WHERE ${sc.where} AND l.ts >= ? ORDER BY l.ts DESC LIMIT 12`).all(...sc.params, d + ' 00:00:00');
  res.json({ date: d, holiday: holidays.get(d) || null, stats, late, absentees, onLeave, trend, recent, departments: [...depMap.values()] });
});

module.exports = router;
