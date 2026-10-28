// Nhập log chấm công từ máy (ZKTeco), file export (CSV/TXT/attlog.dat/XLSX) hoặc agent đẩy lên
const ExcelJS = require('exceljs');
const { db } = require('../db');
const T = require('../utils/time');

/**
 * records: [{ id: '<device user id hoặc mã NV>', ts: Date | 'YYYY-MM-DD HH:mm:ss' }]
 * Trả về thống kê: số bản ghi mới, trùng, ID không khớp nhân viên nào
 */
function importRecords(records, { source = 'import', deviceId = null, createdBy = null } = {}) {
  const byDevice = new Map(), byCode = new Map();
  for (const u of db.prepare('SELECT id, code, device_user_id FROM users').all()) {
    if (u.device_user_id) byDevice.set(String(u.device_user_id).trim(), u.id);
    byCode.set(String(u.code).trim().toUpperCase(), u.id);
  }
  const ins = db.prepare(`INSERT OR IGNORE INTO attendance_logs(user_id, ts, source, device_id, created_by) VALUES (?,?,?,?,?)`);
  const stats = { total: records.length, inserted: 0, duplicate: 0, invalid: 0, unknownIds: [] };
  const unknown = new Set();
  const tx = db.transaction(() => {
    for (const r of records) {
      const key = String(r.id ?? '').trim();
      const uid = byDevice.get(key) ?? byCode.get(key.toUpperCase());
      const d = r.ts instanceof Date ? r.ts : T.parseDateTime(r.ts);
      if (!d || isNaN(d)) { stats.invalid++; continue; }
      if (!uid) { unknown.add(key); continue; }
      const info = ins.run(uid, T.toDateTimeStr(d), source, deviceId, createdBy);
      if (info.changes) stats.inserted++; else stats.duplicate++;
    }
  });
  tx();
  stats.unknownIds = [...unknown].slice(0, 50);
  stats.unknownCount = unknown.size;
  return stats;
}

// Nhận diện ngày giờ trong một dòng: YYYY-MM-DD HH:mm[:ss] hoặc DD/MM/YYYY HH:mm[:ss]
const RE_ISO = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT,;]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const RE_VN = /(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,;]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;

function parseLine(line) {
  line = String(line).trim();
  if (!line) return null;
  let m = RE_ISO.exec(line), d = null;
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  else if ((m = RE_VN.exec(line))) d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  if (!d) return null;
  const before = line.slice(0, m.index).split(/[\t,;]+|\s{1,}/).map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
  if (!before.length) return null;
  return { id: before[0], ts: d };
}

async function parseFile(buffer, filename) {
  const name = String(filename || '').toLowerCase();
  const records = [];
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    ws.eachRow((row) => {
      const cells = row.values.slice(1).map((v) => {
        if (v instanceof Date) { // ExcelJS trả Date theo UTC
          return `${v.getUTCFullYear()}-${T.pad(v.getUTCMonth() + 1)}-${T.pad(v.getUTCDate())} ${T.pad(v.getUTCHours())}:${T.pad(v.getUTCMinutes())}:${T.pad(v.getUTCSeconds())}`;
        }
        return v && typeof v === 'object' && 'text' in v ? v.text : v;
      });
      const r = parseLine(cells.map((c) => (c ?? '')).join('\t'));
      if (r) records.push(r);
    });
  } else {
    for (const line of buffer.toString('utf8').split(/\r?\n/)) {
      const r = parseLine(line);
      if (r) records.push(r);
    }
  }
  return records;
}

// ---------- Máy chấm công ZKTeco (giao thức UDP/TCP 4370) ----------
async function pullFromZk(device) {
  let ZKLib;
  try { ZKLib = require('node-zklib'); } catch {
    throw new Error('Chưa cài thư viện node-zklib (npm install node-zklib)');
  }
  const zk = new ZKLib(device.ip, device.port || 4370, 15000, 5000);
  try {
    await zk.createSocket();
    const res = await zk.getAttendances();
    const data = (res && res.data) || [];
    return data.map((r) => ({ id: String(r.deviceUserId), ts: new Date(r.recordTime) }));
  } finally {
    try { await zk.disconnect(); } catch { /* ignore */ }
  }
}

async function syncDevice(device, createdBy = null) {
  try {
    const recs = await pullFromZk(device);
    const stats = importRecords(recs, { source: 'device', deviceId: device.id, createdBy });
    db.prepare('UPDATE devices SET last_sync = ?, last_status = ? WHERE id = ?')
      .run(T.toDateTimeStr(new Date()), `OK: ${stats.inserted} mới / ${stats.total} bản ghi`, device.id);
    return stats;
  } catch (e) {
    db.prepare('UPDATE devices SET last_sync = ?, last_status = ? WHERE id = ?')
      .run(T.toDateTimeStr(new Date()), 'Lỗi: ' + e.message, device.id);
    throw e;
  }
}

module.exports = { importRecords, parseFile, parseLine, syncDevice };
