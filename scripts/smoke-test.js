// Kiểm thử nhanh toàn bộ luồng chính trên CSDL tạm: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chamcong-test-'));
process.env.DATA_DIR = dir;
process.env.DEVICE_API_KEY = 'test-key-123456';
execFileSync(process.execPath, [path.join(__dirname, 'seed-demo.js')], { env: process.env, stdio: 'ignore' });

const app = require('../src/server');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name, extra); } };

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const opts = { method, headers: { ...headers } };
    if (cookie) opts.headers.cookie = cookie;
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['content-type'] = 'application/json'; }
    const r = await fetch(base + url, opts);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
  };
}

(async () => {
  try {
    const admin = client(), emp = client(), mgr = client();
    console.log('Đăng nhập & phân quyền');
    ok((await admin('POST', '/auth/login', { username: 'admin', password: 'sai' })).status === 401, 'sai mật khẩu bị từ chối');
    ok((await admin('POST', '/auth/login', { username: 'admin', password: 'Admin@123' })).status === 200, 'admin đăng nhập');
    ok((await emp('POST', '/auth/login', { username: 'nv005', password: 'Demo@123' })).status === 200, 'nhân viên đăng nhập');
    ok((await mgr('POST', '/auth/login', { username: 'nv004', password: 'Demo@123' })).status === 200, 'trưởng phòng đăng nhập');
    ok((await emp('GET', '/employees')).data.length === 1, 'nhân viên chỉ thấy chính mình');
    ok((await mgr('GET', '/employees')).data.every((u) => u.department_name === 'Kỹ thuật'), 'trưởng phòng chỉ thấy phòng mình');
    ok((await emp('GET', '/settings')).status === 403, 'nhân viên không vào được cài đặt');
    ok((await client()('GET', '/attendance/today')).status === 401, 'chưa đăng nhập bị chặn');

    console.log('Chấm công web');
    await admin('PUT', '/settings', { checkin_mode: 'ip', allowed_ips: '10.99.0.0/16' });
    const deny = await emp('POST', '/attendance/checkin', {});
    ok(deny.status === 403, 'ngoài dải IP bị từ chối', deny.data.error);
    await admin('PUT', '/settings', { checkin_mode: 'ip', allowed_ips: '127.0.0.0/8' });
    const ci = await emp('POST', '/attendance/checkin', {});
    ok(ci.status === 200 && ci.data.today.punches.length >= 1, 'trong dải IP chấm được', JSON.stringify(ci.data));
    ok((await emp('POST', '/attendance/checkin', {})).status === 400, 'chặn chấm liên tiếp trong 1 phút');
    await admin('PUT', '/settings', { checkin_mode: 'gps', office_lat: '21.0285', office_lng: '105.8048', office_radius: '200' });
    const far = await mgr('POST', '/attendance/checkin', { lat: 21.05, lng: 105.80 });
    ok(far.status === 403 && /cách văn phòng/.test(far.data.error), 'GPS ngoài bán kính bị từ chối');
    ok((await mgr('POST', '/attendance/checkin', { lat: 21.0287, lng: 105.8049, accuracy: 15 })).status === 200, 'GPS trong bán kính chấm được');

    console.log('Bảng công');
    const month = new Date().toISOString().slice(0, 7);
    const ts = await admin('GET', `/reports/timesheet?month=${month}`);
    ok(ts.status === 200 && ts.data.rows.length === 16, 'bảng công đủ 16 nhân viên (bỏ tài khoản hệ thống)', ts.data.rows?.length);
    ok(ts.data.rows.every((r) => r.summary.workUnits <= r.summary.stdUnits + 0.01), 'công thực tế không vượt công chuẩn');
    const mts = await mgr('GET', `/reports/timesheet?month=${month}`);
    ok(mts.data.rows.length === 3, 'trưởng phòng chỉ thấy bảng công phòng mình');
    const xl = await admin('GET', `/reports/timesheet/export?month=${month}`);
    ok(xl.status === 200 && Buffer.from(xl.data).subarray(0, 2).toString() === 'PK', 'xuất Excel bảng công');
    ok((await emp('GET', `/reports/timesheet/export?month=${month}`)).status === 403, 'nhân viên không xuất được Excel');
    ok((await admin('GET', '/reports/dashboard')).data.stats.total === 16, 'dashboard');
    const my = await emp('GET', `/attendance/month?month=${month}`);
    ok(my.status === 200 && my.data.days.length >= 28, 'xem công tháng của mình');
    ok((await emp('GET', `/attendance/month?month=${month}&user_id=1`)).status === 403, 'không xem được công người khác');

    console.log('Đơn từ');
    const nextMon = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 7); return d.toISOString().slice(0, 10); })();
    const lv = await emp('POST', '/requests', { kind: 'leave', leave_type: 'annual', date_from: nextMon, date_to: nextMon, half: 'am', reason: 'Khám bệnh' });
    ok(lv.status === 200 && lv.data.amount === 0.5, 'tạo đơn nghỉ nửa ngày = 0.5', JSON.stringify(lv.data));
    ok((await emp('POST', '/requests', { kind: 'leave', leave_type: 'annual', date_from: nextMon, date_to: nextMon, reason: 'x' })).status === 400, 'chặn đơn nghỉ trùng ngày');
    ok((await emp('POST', '/requests', { kind: 'leave', leave_type: 'annual', date_from: `${nextMon.slice(0, 4)}-01-01`, date_to: `${nextMon.slice(0, 4)}-12-31`, reason: 'x' })).status === 400, 'chặn vượt quỹ phép/60 ngày');
    ok((await emp('POST', `/requests/${lv.data.id}/approve`)).status === 403, 'nhân viên không tự duyệt');
    const appr = await mgr('GET', '/requests?scope=approve&status=pending');
    ok(appr.data.some((r) => r.id === lv.data.id), 'trưởng phòng thấy đơn chờ duyệt');
    ok((await mgr('POST', `/requests/${lv.data.id}/reject`, {})).status === 400, 'từ chối phải có lý do');
    ok((await mgr('POST', `/requests/${lv.data.id}/approve`)).status === 200, 'trưởng phòng duyệt đơn');
    ok((await mgr('POST', `/requests/${lv.data.id}/approve`)).status === 400, 'không duyệt lại đơn đã xử lý');
    const ot = await emp('POST', '/requests', { kind: 'ot', date_from: nextMon, time_from: '17:30', time_to: '20:00', reason: 'Bảo trì' });
    ok(ot.status === 200 && ot.data.amount === 2.5, 'đăng ký OT 2.5 giờ');
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const adj = await emp('POST', '/requests', { kind: 'adjust', date_from: yesterday, punch_type: 'out', time_from: '17:45', reason: 'Quên chấm' });
    ok(adj.status === 200, 'gửi giải trình');
    await admin('POST', `/requests/${adj.data.id}/approve`);
    const logs = await admin('GET', `/attendance/logs?from=${yesterday}&to=${yesterday}&source=manual`);
    ok(logs.data.rows.some((l) => l.ts.endsWith('17:45:00')), 'duyệt giải trình tự bổ sung lượt chấm');

    console.log('Nhập dữ liệu máy chấm công');
    const fd = new FormData();
    fd.append('file', new Blob(['        5\t2026-10-02 07:55:01\t1\t0\t1\t0\n        5\t2026-10-02 17:05:44\t1\t0\t1\t0\n      999\t2026-10-02 08:00:00\t1\t0\t1\t0\nNV006,03/10/2026 07:59\n']), 'attlog.dat');
    const imp = await admin('POST', '/attendance/import', fd);
    ok(imp.status === 200 && imp.data.total === 4 && imp.data.unknownCount === 1, 'đọc file attlog/CSV', JSON.stringify(imp.data));
    const push = await fetch(base + '/devices/push', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-key-123456' },
      body: JSON.stringify({ device_id: 1, records: [{ device_user_id: '6', ts: '2026-10-05 07:50:00' }] }) });
    ok(push.status === 200, 'agent đẩy log bằng API key');
    ok((await fetch(base + '/devices/push', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'sai' }, body: '{}' })).status === 401, 'API key sai bị từ chối');
    const lx = await admin('GET', `/attendance/logs/export?from=2026-10-01&to=2026-10-31`);
    ok(lx.status === 200, 'xuất Excel nhật ký');

    console.log('Quản trị');
    const ne = await admin('POST', '/employees', { code: 'NV100', full_name: 'Người Mới', username: 'nguoimoi', role: 'employee' });
    ok(ne.status === 200 && ne.data.tempPassword, 'tạo nhân viên + mật khẩu tạm');
    const newbie = client();
    await newbie('POST', '/auth/login', { username: 'nguoimoi', password: ne.data.tempPassword });
    ok((await newbie('GET', '/attendance/today')).status === 403, 'buộc đổi mật khẩu lần đầu');
    ok((await newbie('POST', '/auth/change-password', { currentPassword: ne.data.tempPassword, newPassword: 'MatKhau123' })).status === 200, 'đổi mật khẩu');
    ok((await newbie('GET', '/attendance/today')).status === 200, 'dùng bình thường sau khi đổi');
    ok((await admin('POST', '/employees', { code: 'NV100', full_name: 'Trùng', username: 'trung' })).status === 400, 'chặn trùng mã NV');
    ok((await admin('POST', '/shifts', { code: 'X', name: 'Lỗi', start_time: '25:00', end_time: '17:00', work_days: '1' })).status === 400, 'kiểm tra giờ ca');
    ok((await admin('PUT', '/settings', { allowed_ips: '300.1.1.1/24' })).status === 400, 'kiểm tra CIDR');
    ok((await admin('GET', '/audit')).data.length > 5, 'nhật ký hệ thống ghi nhận thao tác');
  } catch (e) { failed++; console.error(e); }
  server.close();
  console.log(`\n${passed} đạt, ${failed} lỗi`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
