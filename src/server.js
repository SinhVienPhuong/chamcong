const config = require('./config');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { db } = require('./db');
const { authenticate } = require('./middleware/auth');
const { HttpError } = require('./utils/http');
const { syncDevice } = require('./services/importer');
const devices = require('./routes/devices');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy === 'false' ? false : /^\d+$/.test(config.trustProxy) ? +config.trustProxy : config.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:'],
      'upgrade-insecure-requests': config.cookieSecure ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.cookieSecure,
}));
app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()'); next(); });
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toString() }));

// ---------- API ----------
const api = express.Router();
api.use('/auth', require('./routes/auth'));
api.use('/devices', devices.push);            // agent đẩy log (API key)
api.use(authenticate);
api.use('/employees', require('./routes/employees'));
api.use('/attendance', require('./routes/attendance'));
api.use('/requests', require('./routes/requests'));
api.use('/reports', require('./routes/reports'));
api.use('/devices', devices.router);
api.use('/', require('./routes/catalog'));
api.use((req, res) => res.status(404).json({ error: 'API không tồn tại' }));
app.use('/api', api);

// ---------- Giao diện ----------
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---------- Xử lý lỗi ----------
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File quá lớn (tối đa 20MB)' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại hoặc liên hệ quản trị viên' });
});

// ---------- Tự đồng bộ máy chấm công ----------
const autoMin = parseInt(process.env.AUTO_SYNC_MINUTES, 10);
if (autoMin > 0) {
  setInterval(async () => {
    for (const dev of db.prepare('SELECT * FROM devices').all()) {
      try { const s = await syncDevice(dev); console.log(`[sync] ${dev.name}: +${s.inserted}`); }
      catch (e) { console.warn(`[sync] ${dev.name} lỗi: ${e.message}`); }
    }
  }, autoMin * 60000).unref();
}

function start() {
  // Trên cPanel (Passenger), PORT do Passenger cấp; listen() được Passenger tiếp quản
  return app.listen(config.port, config.host, () => {
    console.log(`Hệ thống chấm công chạy tại http://${config.host}:${config.port}  (TZ=${config.tz})`);
  });
}

if (require.main === module) start();
module.exports = app;
module.exports.start = start;
