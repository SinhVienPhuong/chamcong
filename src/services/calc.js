// Engine tính công: từ log chấm công thô + ca làm + đơn từ + ngày lễ => kết quả từng ngày / bảng công tháng
const { db, getSettings } = require('../db');
const T = require('../utils/time');

const LEAVE_TYPES = {
  annual:   { name: 'Phép năm',             code: 'P',  paid: true,  useQuota: true },
  personal: { name: 'Việc riêng có lương',  code: 'R',  paid: true,  useQuota: false },
  sick:     { name: 'Ốm đau (BHXH)',        code: 'Ô',  paid: false, useQuota: false },
  unpaid:   { name: 'Không lương',          code: 'KL', paid: false, useQuota: false },
};

const STATUS_LABEL = {
  ok: 'Đủ công', late: 'Đi muộn', early: 'Về sớm', late_early: 'Muộn & về sớm', partial: 'Thiếu giờ',
  missing: 'Thiếu chấm công', working: 'Đang làm', absent: 'Vắng không phép', leave: 'Nghỉ phép',
  holiday: 'Ngày lễ', off: 'Ngày nghỉ', future: '', not_joined: '',
};

const listNums = (s) => String(s || '').split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);

function getDefaultShift() {
  return db.prepare('SELECT * FROM shifts WHERE is_default = 1 LIMIT 1').get() || db.prepare('SELECT * FROM shifts ORDER BY id LIMIT 1').get();
}

// Chuẩn hoá ca thành phút tính từ 0h ngày làm việc
function shiftMinutes(shift) {
  const s = T.timeToMin(shift.start_time);
  let e = T.timeToMin(shift.end_time);
  if (e <= s) e += 1440; // ca qua đêm
  let bs = null, be = null;
  if (shift.break_start && shift.break_end) {
    bs = T.timeToMin(shift.break_start); be = T.timeToMin(shift.break_end);
    if (bs < s) { bs += 1440; be += 1440; }
    if (be <= bs) be += 1440;
    if (bs < s || be > e) { bs = be = null; } // nghỉ nằm ngoài ca => bỏ qua
  }
  const fullStd = (e - s) - (bs !== null ? be - bs : 0);
  return { s, e, bs, be, fullStd };
}

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Kế hoạch làm việc của 1 ngày theo ca: có phải ngày làm không, giờ vào/ra dự kiến (phút) */
function dayPlan(shift, dateStr, holiday) {
  const wd = T.weekday(dateStr);
  const m = shiftMinutes(shift);
  const isWorkday = listNums(shift.work_days).includes(wd);
  const isHalf = isWorkday && listNums(shift.half_days).includes(wd);
  let end = m.e;
  if (isHalf) end = m.bs !== null ? m.bs : Math.min(m.e, m.s + Math.round(m.fullStd / 2));
  const std = (end - m.s) - (m.bs !== null && end > m.bs ? overlap(m.s, end, m.bs, m.be) : 0);
  return {
    wd, isWorkday: isWorkday && !holiday, isScheduled: isWorkday, isHalf, holiday,
    start: m.s, end, bs: m.bs, be: m.be, std, fullStd: m.fullStd,
    // cửa sổ nhận log của ngày: từ 4 giờ trước giờ vào ca, kéo dài 24h
    windowStart: T.atMinute(dateStr, m.s - 240), windowEnd: T.atMinute(dateStr, m.s - 240 + 1440),
  };
}

// Phút (tính từ 0h ngày dateStr) của một Date
const minOf = (dateStr, d) => Math.round((d.getTime() - T.parseDate(dateStr).getTime()) / 60000);
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Tính công 1 ngày.
 * @param ctx { shift, punches: Date[] (đã sort), leave (request|null), otHours, holidayName, joinDate, now }
 */
function computeDay(dateStr, ctx) {
  const plan = dayPlan(ctx.shift, dateStr, ctx.holidayName || null);
  const settings = ctx.settings;
  const now = ctx.now || new Date();
  const punches = ctx.punches || [];
  const r = {
    date: dateStr, weekday: T.WD_SHORT[plan.wd], isWorkday: plan.isWorkday, isHalfDay: plan.isHalf,
    holiday: plan.holiday, shift: ctx.shift.code,
    plannedIn: T.minToTime(plan.start), plannedOut: T.minToTime(((plan.end % 1440) + 1440) % 1440),
    checkIn: null, checkOut: null, punches: punches.map(T.toTimeStr),
    lateMin: 0, earlyMin: 0, workMin: 0, stdUnits: 0, workUnits: 0,
    leaveType: null, leaveUnits: 0, leavePaid: false, holidayUnits: 0,
    otApprovedH: ctx.otHours || 0, otActualMin: 0, otPayH: 0, otRate: null,
    status: 'off', code: '', note: '',
  };

  if (ctx.joinDate && dateStr < ctx.joinDate) { r.status = 'not_joined'; return r; }

  // Công chuẩn (để đối chiếu): theo ngày làm việc, không tính ngày lễ
  r.stdUnits = plan.isWorkday ? r2(plan.std / plan.fullStd) : 0;

  const dayStart = T.parseDate(dateStr);
  const first = punches[0], last = punches[punches.length - 1];
  const hasPair = punches.length >= 2 && T.diffMin(last, first) >= 1;
  if (first) r.checkIn = T.toTimeStr(first);
  if (hasPair) r.checkOut = T.toTimeStr(last);

  // Tỷ lệ OT theo loại ngày
  r.otRate = plan.holiday ? +settings.ot_rate_holiday : (plan.isScheduled ? +settings.ot_rate_weekday : +settings.ot_rate_weekend);

  // ----- Ngày lễ -----
  if (plan.holiday) {
    r.status = 'holiday'; r.code = 'L';
    r.holidayUnits = plan.isScheduled ? r2(plan.std / plan.fullStd) : 0;
    if (hasPair) r.otActualMin = T.diffMin(last, first);
    r.otPayH = r2(Math.min(r.otApprovedH, r.otActualMin / 60));
    return r;
  }

  // ----- Ngày nghỉ (CN / T7 không làm) -----
  if (!plan.isWorkday) {
    r.status = 'off'; r.code = '';
    if (hasPair) r.otActualMin = T.diffMin(last, first);
    r.otPayH = r2(Math.min(r.otApprovedH, r.otActualMin / 60));
    return r;
  }

  // ----- Ngày làm việc -----
  let expStart = plan.start, expEnd = plan.end;
  const leave = ctx.leave;
  if (leave) {
    const lt = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.unpaid;
    r.leaveType = leave.leave_type; r.leavePaid = lt.paid;
    if (leave.half && !plan.isHalf) {
      r.leaveUnits = 0.5;
      if (leave.half === 'am') expStart = plan.be ?? (plan.start + Math.round(plan.fullStd / 2));
      else expEnd = plan.bs ?? (plan.start + Math.round(plan.fullStd / 2));
    } else {
      r.leaveUnits = r.stdUnits;
      r.status = 'leave'; r.code = lt.code;
      return r;
    }
  }

  const expStd = (expEnd - expStart) - (plan.bs !== null ? overlap(expStart, expEnd, plan.bs, plan.be) : 0);
  const shiftEndAt = T.atMinute(dateStr, expEnd);

  if (!first) {
    if (dayStart > now || (T.toDateStr(now) === dateStr && now < shiftEndAt)) {
      r.status = 'future';
      if (leave) r.code = LEAVE_TYPES[leave.leave_type].code + '/2';
      return r;
    }
    r.status = leave ? 'partial' : 'absent';
    r.code = leave ? LEAVE_TYPES[leave.leave_type].code + '/2' : 'V';
    return r;
  }

  const inMin = minOf(dateStr, first);
  if (inMin > expStart + ctx.shift.late_grace) r.lateMin = inMin - expStart;

  if (!hasPair) {
    // Mới chấm vào, chưa chấm ra
    if (T.toDateStr(now) === dateStr && now < T.addMinutes(shiftEndAt, 240)) {
      r.status = 'working'; r.code = '…';
    } else {
      r.status = 'missing'; r.code = '?'; r.note = 'Thiếu giờ ra — cần giải trình';
    }
    return r;
  }

  const outMin = minOf(dateStr, last);
  if (outMin < expEnd - ctx.shift.early_grace) r.earlyMin = expEnd - outMin;

  // Giờ hiệu dụng: trong ân hạn thì làm tròn về giờ ca
  const effInClamped = inMin <= expStart + ctx.shift.late_grace ? expStart : inMin;
  const effOut = outMin >= expEnd - ctx.shift.early_grace ? expEnd : outMin;
  let work = overlap(effInClamped, effOut, expStart, expEnd);
  if (plan.bs !== null) work -= overlap(effInClamped, effOut, Math.max(plan.bs, expStart), Math.min(plan.be, expEnd));
  work = Math.max(0, Math.min(work, expStd));
  r.workMin = work;
  r.workUnits = r2(work / plan.fullStd);
  if (work >= expStd) r.workUnits = r2(expStd / plan.fullStd);

  // OT thực tế: thời gian ở lại sau giờ ra ca (chỉ trả khi có đơn OT được duyệt)
  r.otActualMin = Math.max(0, outMin - plan.end);
  r.otPayH = r2(Math.min(r.otApprovedH, r.otActualMin / 60));

  if (r.lateMin && r.earlyMin) r.status = 'late_early';
  else if (r.lateMin) r.status = 'late';
  else if (r.earlyMin) r.status = 'early';
  else if (work < expStd) r.status = 'partial';
  else r.status = 'ok';

  const full = r.workUnits >= r2(expStd / plan.fullStd);
  if (leave) r.code = LEAVE_TYPES[leave.leave_type].code + '/2';
  else r.code = full ? 'X' : String(r.workUnits);
  return r;
}

/** Nạp toàn bộ dữ liệu cần thiết cho tập user trong khoảng ngày rồi tính */
function computeRange(users, from, to, opts = {}) {
  const settings = getSettings();
  const defShift = getDefaultShift();
  const shifts = new Map(db.prepare('SELECT * FROM shifts').all().map((s) => [s.id, s]));
  const holidays = new Map(db.prepare('SELECT date, name FROM holidays WHERE date BETWEEN ? AND ?').all(from, to).map((h) => [h.date, h.name]));
  const ids = users.map((u) => u.id);
  const result = new Map();
  if (!ids.length) return { result, holidays, settings };

  const ph = ids.map(() => '?').join(',');
  const logFrom = T.addDays(from, -1) + ' 00:00:00', logTo = T.addDays(to, 2) + ' 00:00:00';
  const logs = db.prepare(`SELECT user_id, ts FROM attendance_logs WHERE user_id IN (${ph}) AND ts >= ? AND ts < ? ORDER BY ts`).all(...ids, logFrom, logTo);
  const reqs = db.prepare(`SELECT * FROM requests WHERE user_id IN (${ph}) AND status='approved' AND kind IN ('leave','ot')
                           AND date_from <= ? AND date_to >= ?`).all(...ids, to, from);

  const logsBy = new Map(), leavesBy = new Map(), otBy = new Map();
  for (const l of logs) { if (!logsBy.has(l.user_id)) logsBy.set(l.user_id, []); logsBy.get(l.user_id).push(T.parseDateTime(l.ts)); }
  for (const q of reqs) {
    if (q.kind === 'leave') { if (!leavesBy.has(q.user_id)) leavesBy.set(q.user_id, []); leavesBy.get(q.user_id).push(q); }
    else { const k = q.user_id + '|' + q.date_from; otBy.set(k, (otBy.get(k) || 0) + q.amount); }
  }

  const dates = T.eachDate(from, to);
  const now = opts.now || new Date();
  for (const u of users) {
    const shift = shifts.get(u.shift_id) || defShift;
    const ulogs = logsBy.get(u.id) || [];
    const uleaves = leavesBy.get(u.id) || [];
    const days = [];
    let p = 0;
    for (const d of dates) {
      const plan = dayPlan(shift, d, null);
      while (p < ulogs.length && ulogs[p] < plan.windowStart) p++;
      const punches = [];
      for (let i = p; i < ulogs.length && ulogs[i] < plan.windowEnd; i++) punches.push(ulogs[i]);
      p += punches.length;
      const leave = uleaves.find((l) => l.date_from <= d && l.date_to >= d) || null;
      days.push(computeDay(d, {
        shift, punches, leave, otHours: otBy.get(u.id + '|' + d) || 0,
        holidayName: holidays.get(d), joinDate: u.join_date, settings, now,
      }));
    }
    result.set(u.id, days);
  }
  return { result, holidays, settings };
}

function summarize(days) {
  const s = {
    stdUnits: 0, workUnits: 0, paidLeaveUnits: 0, sickUnits: 0, unpaidUnits: 0, holidayUnits: 0,
    absentDays: 0, missingDays: 0, lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0,
    ot: { weekday: 0, weekend: 0, holiday: 0 }, otActualH: 0, totalPaidUnits: 0,
  };
  for (const d of days) {
    s.stdUnits += d.stdUnits; s.workUnits += d.workUnits; s.holidayUnits += d.holidayUnits;
    if (d.leaveType) {
      if (LEAVE_TYPES[d.leaveType]?.paid) s.paidLeaveUnits += d.leaveUnits;
      else if (d.leaveType === 'sick') s.sickUnits += d.leaveUnits;
      else s.unpaidUnits += d.leaveUnits;
    }
    if (d.status === 'absent') s.absentDays++;
    if (d.status === 'missing') s.missingDays++;
    if (d.lateMin) { s.lateCount++; s.lateMin += d.lateMin; }
    if (d.earlyMin) { s.earlyCount++; s.earlyMin += d.earlyMin; }
    if (d.otPayH) {
      const k = d.holiday ? 'holiday' : (d.isWorkday ? 'weekday' : 'weekend');
      s.ot[k] += d.otPayH;
    }
    s.otActualH += d.otActualMin / 60;
  }
  for (const k of ['stdUnits', 'workUnits', 'paidLeaveUnits', 'sickUnits', 'unpaidUnits', 'holidayUnits', 'otActualH']) s[k] = r2(s[k]);
  for (const k of Object.keys(s.ot)) s.ot[k] = r2(s.ot[k]);
  s.totalPaidUnits = r2(s.workUnits + s.paidLeaveUnits + s.holidayUnits);
  return s;
}

/** Số ngày công của một khoảng nghỉ phép (bỏ ngày nghỉ, ngày lễ) */
function countLeaveDays(user, from, to, half) {
  const shift = (user.shift_id && db.prepare('SELECT * FROM shifts WHERE id = ?').get(user.shift_id)) || getDefaultShift();
  const holidays = new Set(db.prepare('SELECT date FROM holidays WHERE date BETWEEN ? AND ?').all(from, to).map((h) => h.date));
  let total = 0;
  for (const d of T.eachDate(from, to)) {
    const plan = dayPlan(shift, d, holidays.has(d) ? 'x' : null);
    if (!plan.isWorkday) continue;
    total += r2(plan.std / plan.fullStd);
  }
  if (half && from === to) total = Math.min(total, 0.5);
  return r2(total);
}

module.exports = { LEAVE_TYPES, STATUS_LABEL, computeDay, computeRange, summarize, countLeaveDays, dayPlan, shiftMinutes, getDefaultShift };
