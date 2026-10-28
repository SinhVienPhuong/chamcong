// Tạo dữ liệu mẫu để chạy thử: phòng ban, ca, ~16 nhân viên, log chấm công 45 ngày, đơn từ, ngày lễ.
// Chạy: npm run seed:demo   (KHÔNG chạy trên hệ thống thật đang có dữ liệu)
const bcrypt = require('bcryptjs');
const { db, setSettings } = require('../src/db');
const T = require('../src/utils/time');
const calc = require('../src/services/calc');

if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 1 && !process.argv.includes('--force')) {
  console.log('CSDL đã có dữ liệu. Thêm --force nếu vẫn muốn tạo dữ liệu mẫu.');
  process.exit(1);
}

let seed = 20261028;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const between = (a, b) => Math.round(a + rnd() * (b - a));

const hash = bcrypt.hashSync('Demo@123', 10);
const tx = db.transaction(() => {
  setSettings({ company_name: 'Công ty TNHH Minh Phát', checkin_mode: 'anywhere', office_lat: '21.0285', office_lng: '105.8048', office_radius: '200' });
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = 'admin'").run(bcrypt.hashSync('Admin@123', 10));

  const dep = {};
  for (const [code, name] of [['KT', 'Kế toán'], ['KTH', 'Kỹ thuật'], ['KD', 'Kinh doanh'], ['SX', 'Sản xuất']]) {
    db.prepare('INSERT OR IGNORE INTO departments(code,name) VALUES (?,?)').run(code, name);
    dep[code] = db.prepare('SELECT id FROM departments WHERE code = ?').get(code).id;
  }
  const sh = {};
  for (const s of [
    ['CA1', 'Ca 1 (sáng)', '06:00', '14:00', '10:00', '10:30', '1,2,3,4,5,6', ''],
    ['CA2', 'Ca 2 (chiều)', '14:00', '22:00', '18:00', '18:30', '1,2,3,4,5,6', ''],
    ['CA3', 'Ca 3 (đêm)', '22:00', '06:00', '02:00', '02:30', '1,2,3,4,5', ''],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO shifts(code,name,start_time,end_time,break_start,break_end,late_grace,early_grace,work_days,half_days)
      VALUES (?,?,?,?,?,?,5,5,?,?)`).run(...s);
    sh[s[0]] = db.prepare('SELECT id FROM shifts WHERE code = ?').get(s[0]).id;
  }
  sh.HC = db.prepare("SELECT id FROM shifts WHERE code='HC'").get().id;

  const people = [
    ['NV001', 'Nguyễn Thị Lan', 'KT', 'manager', 'Kế toán trưởng', 'HC'], ['NV002', 'Trần Minh Đức', 'KT', 'employee', 'Kế toán viên', 'HC'],
    ['NV003', 'Lê Thu Hà', 'KT', 'employee', 'Thủ quỹ', 'HC'], ['NV004', 'Phạm Quốc Huy', 'KTH', 'manager', 'Trưởng phòng IT', 'HC'],
    ['NV005', 'Đỗ Văn Nam', 'KTH', 'employee', 'System Admin', 'HC'], ['NV006', 'Vũ Hải Yến', 'KTH', 'employee', 'IT Helpdesk', 'HC'],
    ['NV007', 'Hoàng Anh Tuấn', 'KD', 'manager', 'Trưởng phòng KD', 'HC'], ['NV008', 'Bùi Ngọc Mai', 'KD', 'employee', 'Nhân viên KD', 'HC'],
    ['NV009', 'Đặng Tiến Dũng', 'KD', 'employee', 'Nhân viên KD', 'HC'], ['NV010', 'Ngô Thị Hương', 'SX', 'manager', 'Quản đốc', 'CA1'],
    ['NV011', 'Phan Văn Long', 'SX', 'employee', 'Công nhân', 'CA1'], ['NV012', 'Trịnh Thị Nga', 'SX', 'employee', 'Công nhân', 'CA1'],
    ['NV013', 'Lý Văn Thắng', 'SX', 'employee', 'Công nhân', 'CA2'], ['NV014', 'Mai Thị Thảo', 'SX', 'employee', 'Công nhân', 'CA2'],
    ['NV015', 'Cao Minh Khôi', 'SX', 'employee', 'Bảo vệ', 'CA3'], ['NV016', 'Tô Thị Diệu', 'SX', 'employee', 'Công nhân', 'CA2'],
  ];
  const ins = db.prepare(`INSERT INTO users(code,full_name,username,password_hash,role,department_id,position,shift_id,device_user_id,join_date,must_change_password,allow_web_checkin)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`);
  const ids = [];
  people.forEach(([code, name, d, role, pos, s], i) => {
    const info = ins.run(code, name, code.toLowerCase(), hash, role, dep[d], pos, sh[s], String(i + 1), '2025-01-02', d === 'SX' ? 0 : 1);
    ids.push({ id: info.lastInsertRowid, code, shift: s, role, dep: d });
  });

  // Ngày lễ năm 2026 (theo lịch nghỉ phổ biến)
  for (const [d, n] of [['2026-01-01', 'Tết Dương lịch'], ['2026-04-26', 'Giỗ Tổ Hùng Vương'], ['2026-04-30', 'Ngày Giải phóng miền Nam'],
    ['2026-05-01', 'Quốc tế Lao động'], ['2026-09-01', 'Quốc khánh'], ['2026-09-02', 'Quốc khánh']]) {
    db.prepare('INSERT OR IGNORE INTO holidays(date,name) VALUES (?,?)').run(d, n);
  }
  for (const d of T.eachDate('2026-02-16', '2026-02-20')) db.prepare('INSERT OR IGNORE INTO holidays(date,name) VALUES (?,?)').run(d, 'Tết Nguyên đán');

  // Đơn từ
  const now = new Date();
  const todayStr = T.today();
  const reqIns = db.prepare(`INSERT INTO requests(user_id,kind,leave_type,date_from,date_to,half,time_from,time_to,amount,reason,status,approver_id,decided_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
  const leaves = [];
  const pickWorkday = (offset) => { let d = T.addDays(todayStr, offset); while ([0].includes(T.weekday(d))) d = T.addDays(d, -1); return d; };
  [[1, 'annual', -12, -11], [7, 'sick', -20, -20], [12, 'annual', -5, -5], [2, 'personal', -30, -30]].forEach(([i, t, a, b]) => {
    const u = ids[i];
    const from = pickWorkday(a), to = pickWorkday(b) < from ? from : pickWorkday(b);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
    reqIns.run(u.id, 'leave', t, from, to, null, null, null, calc.countLeaveDays(user, from, to, null), 'Việc gia đình', 'approved', admin, T.toDateTimeStr(now));
    leaves.push({ id: u.id, from, to });
  });
  reqIns.run(ids[5].id, 'leave', 'annual', pickWorkday(-8), pickWorkday(-8), 'pm', null, null, 0.5, 'Đi khám sức khoẻ', 'approved', admin, T.toDateTimeStr(now));
  leaves.push({ id: ids[5].id, from: pickWorkday(-8), to: pickWorkday(-8), half: 'pm' });
  reqIns.run(ids[8].id, 'leave', 'annual', T.addDays(todayStr, 3), T.addDays(todayStr, 4), null, null, null, 2, 'Về quê', 'pending', null, null);
  reqIns.run(ids[13].id, 'leave', 'unpaid', T.addDays(todayStr, 6), T.addDays(todayStr, 6), null, null, null, 1, 'Việc cá nhân', 'pending', null, null);
  const otDays = [];
  for (const k of [-3, -6, -10, -15]) {
    const d = pickWorkday(k);
    for (const i of [4, 5]) { reqIns.run(ids[i].id, 'ot', null, d, d, null, '17:30', '20:00', 2.5, 'Bảo trì hệ thống sau giờ làm', 'approved', admin, T.toDateTimeStr(now)); otDays.push(ids[i].id + '|' + d); }
  }
  reqIns.run(ids[10].id, 'ot', null, todayStr, todayStr, null, '14:00', '16:00', 2, 'Hoàn thành đơn hàng gấp', 'pending', null, null);

  // Log chấm công 45 ngày
  const shifts = new Map(db.prepare('SELECT * FROM shifts').all().map((s) => [s.code, s]));
  const holidays = new Set(db.prepare('SELECT date FROM holidays').all().map((h) => h.date));
  const logIns = db.prepare("INSERT OR IGNORE INTO attendance_logs(user_id, ts, source, device_id, ip) VALUES (?,?,?,?,?)");
  db.prepare("INSERT INTO devices(name, ip, port, location) VALUES ('Máy cổng chính','192.168.1.201',4370,'Sảnh tầng 1')").run();
  const devId = db.prepare('SELECT id FROM devices ORDER BY id DESC LIMIT 1').get().id;
  for (const d of T.eachDate(T.addDays(todayStr, -45), todayStr)) {
    if (holidays.has(d)) continue;
    for (const u of ids) {
      const s = shifts.get(u.shift);
      const plan = calc.dayPlan(s, d, null);
      if (!plan.isWorkday) continue;
      const lv = leaves.find((l) => l.id === u.id && l.from <= d && l.to >= d);
      if (lv && !lv.half) continue;
      const r = rnd();
      if (r < 0.025) continue; // vắng
      const lazy = u.code === 'NV009' ? 18 : u.code === 'NV013' ? 12 : 0;
      const inMin = plan.start + between(-20, 4) + (rnd() < 0.12 ? between(6, 35) + lazy : 0);
      let outMin = (lv && lv.half === 'pm' ? plan.bs : plan.end) + between(0, 25) - (rnd() < 0.05 ? between(10, 45) : 0);
      if (otDays.includes(u.id + '|' + d)) outMin = plan.end + 180 + between(0, 15);
      const inAt = T.atMinute(d, inMin), outAt = T.atMinute(d, outMin);
      if (inAt > now) continue;
      const web = u.dep !== 'SX';
      logIns.run(u.id, T.toDateTimeStr(T.addMinutes(inAt, 0)).slice(0, 17) + T.pad(between(0, 59)), web && rnd() < 0.5 ? 'web' : 'device', web ? null : devId, web ? '192.168.10.' + between(20, 200) : null);
      if (outAt > now || rnd() < 0.015) continue; // quên chấm ra
      logIns.run(u.id, T.toDateTimeStr(outAt).slice(0, 17) + T.pad(between(0, 59)), web && rnd() < 0.5 ? 'web' : 'device', web ? null : devId, web ? '192.168.10.' + between(20, 200) : null);
    }
  }
  // Một đơn giải trình đang chờ
  reqIns.run(ids[6].id, 'adjust', null, pickWorkday(-2), pickWorkday(-2), 'out', '17:05', null, 0, 'Quên chấm công ra do họp với khách hàng', 'pending', null, null);
});
tx();
console.log('Đã tạo dữ liệu mẫu.');
console.log('  admin / Admin@123  (quản trị)');
console.log('  nv004 / Demo@123   (trưởng phòng Kỹ thuật)');
console.log('  nv005 / Demo@123   (nhân viên)');
