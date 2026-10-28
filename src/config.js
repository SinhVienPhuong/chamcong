// Cấu hình ứng dụng — đọc từ biến môi trường (.env)
require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.accessSync(dataDir, fs.constants.W_OK);
} catch (e) {
  console.error(`Không ghi được vào thư mục dữ liệu ${dataDir}: ${e.message}. Kiểm tra DATA_DIR và quyền của volume.`);
  process.exit(1);
}

// JWT secret: lấy từ env, nếu không có thì sinh ngẫu nhiên và lưu lại để session không mất khi restart
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'chamcong.db'),
  jwtSecret: loadSecret(),
  sessionHours: parseInt(process.env.SESSION_HOURS, 10) || 12,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // 'loopback', '1', 'false'... — bật khi chạy sau Nginx/FortiGate reverse proxy để lấy đúng IP client
  trustProxy: process.env.TRUST_PROXY || 'loopback',
  deviceApiKey: process.env.DEVICE_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  tz: process.env.TZ,
};
