// Agent đồng bộ máy chấm công đặt trong LAN chi nhánh: kéo log từ máy ZKTeco rồi đẩy lên server qua HTTPS.
// Chạy định kỳ bằng Task Scheduler (Windows) hoặc cron (Linux):
//   SERVER_URL=https://chamcong.congty.vn DEVICE_API_KEY=xxx DEVICE_IP=192.168.1.201 DEVICE_ID=1 node scripts/zk-agent.js
// Tuỳ chọn: DEVICE_PORT (mặc định 4370), SINCE_DAYS (chỉ gửi log trong N ngày gần nhất, mặc định 7)
require('dotenv').config();
const ZKLib = require('node-zklib');

const { SERVER_URL, DEVICE_API_KEY, DEVICE_IP } = process.env;
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT, 10) || 4370;
const DEVICE_ID = parseInt(process.env.DEVICE_ID, 10) || null;
const SINCE_DAYS = parseInt(process.env.SINCE_DAYS, 10) || 7;

if (!SERVER_URL || !DEVICE_API_KEY || !DEVICE_IP) {
  console.error('Thiếu biến môi trường: SERVER_URL, DEVICE_API_KEY, DEVICE_IP');
  process.exit(2);
}
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

(async () => {
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 15000, 5000);
  let records = [];
  try {
    await zk.createSocket();
    const { data } = await zk.getAttendances();
    const since = Date.now() - SINCE_DAYS * 86400000;
    records = (data || []).filter((r) => new Date(r.recordTime).getTime() >= since)
      .map((r) => ({ device_user_id: String(r.deviceUserId), ts: fmt(new Date(r.recordTime)) }));
  } catch (e) {
    console.error(`Không đọc được máy ${DEVICE_IP}:${DEVICE_PORT}:`, e.message || e);
    process.exit(1);
  } finally { try { await zk.disconnect(); } catch { /* ignore */ } }

  console.log(`Đọc ${records.length} lượt chấm trong ${SINCE_DAYS} ngày, đang gửi lên server…`);
  const res = await fetch(SERVER_URL.replace(/\/$/, '') + '/api/devices/push', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': DEVICE_API_KEY },
    body: JSON.stringify({ device_id: DEVICE_ID, records }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('Server từ chối:', res.status, out.error || ''); process.exit(1); }
  console.log(`Xong: ${out.inserted} mới, ${out.duplicate} đã có${out.unknownCount ? `, ${out.unknownCount} User ID chưa gán nhân viên (${out.unknownIds.join(', ')})` : ''}.`);
})();
