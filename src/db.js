// Kết nối SQLite + schema + dữ liệu khởi tạo
const Database = require('./sqlite');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('./config');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id           INTEGER PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  start_time   TEXT NOT NULL,              -- HH:mm
  end_time     TEXT NOT NULL,              -- HH:mm (nhỏ hơn start => ca qua đêm)
  break_start  TEXT,                       -- nghỉ trưa / nghỉ giữa ca
  break_end    TEXT,
  late_grace   INTEGER NOT NULL DEFAULT 5, -- phút cho phép đi muộn
  early_grace  INTEGER NOT NULL DEFAULT 5, -- phút cho phép về sớm
  work_days    TEXT NOT NULL DEFAULT '1,2,3,4,5',  -- 0=CN..6=T7
  half_days    TEXT NOT NULL DEFAULT '',            -- các thứ chỉ làm buổi sáng (VD: '6' = sáng T7)
  is_default   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,         -- mã nhân viên
  full_name            TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  username             TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
  department_id        INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  position             TEXT,
  shift_id             INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  device_user_id       TEXT UNIQUE,                  -- User ID trên máy chấm công
  join_date            TEXT,
  annual_leave_quota   REAL NOT NULL DEFAULT 12,
  allow_web_checkin    INTEGER NOT NULL DEFAULT 1,
  track_attendance     INTEGER NOT NULL DEFAULT 1,   -- 0: không đưa vào bảng công (tài khoản hệ thống, giám đốc...)
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active               INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts          TEXT NOT NULL,                 -- YYYY-MM-DD HH:mm:ss (giờ địa phương)
  source      TEXT NOT NULL CHECK (source IN ('web','device','import','manual')),
  ip          TEXT,
  lat         REAL,
  lng         REAL,
  device_id   INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  note        TEXT,
  created_by  INTEGER,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON attendance_logs(ts);

CREATE TABLE IF NOT EXISTS requests (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('leave','ot','adjust')),
  leave_type     TEXT,                 -- annual | sick | personal | unpaid
  date_from      TEXT NOT NULL,
  date_to        TEXT NOT NULL,
  half           TEXT,                 -- am | pm (nghỉ nửa ngày)
  time_from      TEXT,                 -- OT: giờ bắt đầu; giải trình: giờ chấm bổ sung
  time_to        TEXT,
  amount         REAL NOT NULL DEFAULT 0, -- số ngày nghỉ / số giờ OT
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at     TEXT,
  decision_note  TEXT,
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_req_user ON requests(user_id, kind, status);

CREATE TABLE IF NOT EXISTS holidays (
  date  TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  ip           TEXT NOT NULL,
  port         INTEGER NOT NULL DEFAULT 4370,
  location     TEXT,
  last_sync    TEXT,
  last_status  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER,
  action    TEXT NOT NULL,
  detail    TEXT,
  ip        TEXT,
  ts        TEXT DEFAULT (datetime('now','localtime'))
);
`);

// Migration nhẹ cho CSDL tạo từ phiên bản cũ
const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!cols.includes('track_attendance')) db.exec('ALTER TABLE users ADD COLUMN track_attendance INTEGER NOT NULL DEFAULT 1');

// ---------- Settings ----------
const DEFAULT_SETTINGS = {
  company_name: 'Công ty của bạn',
  checkin_mode: 'ip_or_gps',          // anywhere | ip | gps | ip_or_gps
  allowed_ips: '192.168.0.0/16\n10.0.0.0/8\n127.0.0.1/32',
  office_lat: '',
  office_lng: '',
  office_radius: '200',               // mét
  ot_rate_weekday: '150',
  ot_rate_weekend: '200',
  ot_rate_holiday: '300',
  min_punch_interval: '1',            // phút giữa hai lần chấm web
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function getSetting(key) {
  const r = getSettingStmt.get(key);
  return r ? r.value : DEFAULT_SETTINGS[key];
}
function setSettings(obj) {
  const tx = db.transaction((o) => {
    for (const [k, v] of Object.entries(o)) if (k in DEFAULT_SETTINGS) setSettingStmt.run(k, String(v ?? ''));
  });
  tx(obj);
}

// ---------- Audit ----------
const auditStmt = db.prepare('INSERT INTO audit_logs(user_id, action, detail, ip) VALUES (?,?,?,?)');
function audit(req, action, detail) {
  try {
    auditStmt.run(req?.user?.id ?? null, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null), req?.ip ?? null);
  } catch (e) { console.error('audit error', e.message); }
}

// ---------- Khởi tạo lần đầu ----------
function bootstrap() {
  if (!db.prepare('SELECT 1 FROM shifts LIMIT 1').get()) {
    db.prepare(`INSERT INTO shifts(code,name,start_time,end_time,break_start,break_end,late_grace,early_grace,work_days,half_days,is_default)
                VALUES ('HC','Hành chính','08:00','17:00','12:00','13:00',5,5,'1,2,3,4,5,6','6',1)`).run();
  }
  if (!db.prepare('SELECT 1 FROM departments LIMIT 1').get()) {
    db.prepare(`INSERT INTO departments(code,name) VALUES ('BGD','Ban Giám đốc')`).run();
  }
  if (!db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get()) {
    const pwd = config.adminPassword || crypto.randomBytes(9).toString('base64url');
    db.prepare(`INSERT INTO users(code,full_name,username,password_hash,role,department_id,shift_id,must_change_password,track_attendance,allow_web_checkin)
                VALUES ('ADMIN','Quản trị hệ thống','admin',?,'admin',1,1,?,0,0)`)
      .run(bcrypt.hashSync(pwd, 10), config.adminPassword ? 0 : 1);
    console.log('==================================================');
    console.log(' Tài khoản quản trị đã được tạo');
    console.log('   Username: admin');
    if (!config.adminPassword) console.log('   Password: ' + pwd + '   (bắt buộc đổi khi đăng nhập lần đầu)');
    else console.log('   Password: lấy từ biến ADMIN_PASSWORD');
    console.log('==================================================');
  }
}
bootstrap();

module.exports = { db, getSettings, getSetting, setSettings, audit, DEFAULT_SETTINGS };
