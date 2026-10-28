// Máy chấm công: quản lý thiết bị, kéo log trực tiếp (ZKTeco), nhận log từ agent đặt trong LAN
const router = require('express').Router();
const crypto = require('crypto');
const config = require('../config');
const { db, audit } = require('../db');
const { requireRole } = require('../middleware/auth');
const { wrap, bad, notFound, str } = require('../utils/http');
const { syncDevice, importRecords } = require('../services/importer');

const isIPv4 = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every((x) => +x <= 255);

// Endpoint cho agent (không dùng cookie, xác thực bằng DEVICE_API_KEY) — được mount riêng trước authenticate
const push = require('express').Router();
push.post('/push', (req, res) => {
  const key = String(req.get('x-api-key') || '');
  const expected = config.deviceApiKey;
  if (!expected || key.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return res.status(401).json({ error: 'API key không hợp lệ' });
  }
  const records = Array.isArray(req.body?.records) ? req.body.records.slice(0, 50000) : [];
  const deviceId = parseInt(req.body?.device_id, 10) || null;
  const dev = deviceId ? db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId) : null;
  const stats = importRecords(records.map((r) => ({ id: r.device_user_id ?? r.id, ts: r.ts })), { source: 'device', deviceId: dev?.id ?? null });
  if (dev) db.prepare('UPDATE devices SET last_sync = datetime(\'now\',\'localtime\'), last_status = ? WHERE id = ?').run(`Agent: ${stats.inserted} mới / ${stats.total}`, dev.id);
  audit({ ip: req.ip }, 'device_push', { device_id: dev?.id, inserted: stats.inserted, total: stats.total });
  res.json(stats);
});

router.use(requireRole('admin'));
router.get('/', (req, res) => res.json(db.prepare('SELECT * FROM devices ORDER BY name').all()));
function readDevice(b) {
  const d = { name: str(b.name, 80), ip: str(b.ip, 64), port: parseInt(b.port, 10) || 4370, location: str(b.location, 120) || null };
  if (!d.name) throw bad('Nhập tên thiết bị');
  if (!isIPv4(d.ip)) throw bad('Địa chỉ IP không hợp lệ');
  if (d.port < 1 || d.port > 65535) throw bad('Port không hợp lệ');
  return d;
}
router.post('/', (req, res) => {
  const d = readDevice(req.body);
  const info = db.prepare('INSERT INTO devices(name,ip,port,location) VALUES (@name,@ip,@port,@location)').run(d);
  audit(req, 'device_create', d); res.json({ id: info.lastInsertRowid });
});
router.put('/:id', (req, res) => {
  const d = readDevice(req.body);
  db.prepare('UPDATE devices SET name=@name, ip=@ip, port=@port, location=@location WHERE id=@id').run({ ...d, id: +req.params.id });
  audit(req, 'device_update', { id: +req.params.id }); res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id = ?').run(+req.params.id);
  audit(req, 'device_delete', { id: +req.params.id }); res.json({ ok: true });
});
router.post('/:id/sync', wrap(async (req, res) => {
  const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(+req.params.id);
  if (!dev) throw notFound();
  try {
    const stats = await syncDevice(dev, req.user.id);
    audit(req, 'device_sync', { id: dev.id, ...stats, unknownIds: undefined });
    res.json(stats);
  } catch (e) { throw bad(`Không kết nối được ${dev.ip}:${dev.port} — ${e.message}`); }
}));

module.exports = { router, push };
