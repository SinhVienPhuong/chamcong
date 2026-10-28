// Tiện ích ngày giờ theo giờ địa phương (TZ đặt trong config)
const pad = (n) => String(n).padStart(2, '0');

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDateTimeStr = (d) => `${toDateStr(d)} ${toTimeStr(d)}:${pad(d.getSeconds())}`;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

function parseDateTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const timeToMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const minToTime = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function addDays(dateStr, n) {
  const d = parseDate(dateStr); d.setDate(d.getDate() + n); return toDateStr(d);
}
function addMinutes(date, min) { return new Date(date.getTime() + min * 60000); }

// Date object tại dateStr + số phút tính từ 0h (có thể > 1440 với ca qua đêm)
function atMinute(dateStr, minutes) {
  const d = parseDate(dateStr); d.setMinutes(minutes); return d;
}

function eachDate(from, to) {
  const out = []; let cur = from;
  while (cur <= to) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}

function monthRange(month) { // 'YYYY-MM'
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  const last = new Date(y, mo, 0).getDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${pad(last)}`, days: last, year: y, month: mo };
}

const weekday = (dateStr) => parseDate(dateStr).getDay(); // 0 = CN
const diffMin = (a, b) => Math.round((a.getTime() - b.getTime()) / 60000);
const today = () => toDateStr(new Date());
const currentMonth = () => toDateStr(new Date()).slice(0, 7);
const WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

module.exports = {
  pad, toDateStr, toTimeStr, toDateTimeStr, parseDate, parseDateTime, isTime, timeToMin, minToTime,
  addDays, addMinutes, atMinute, eachDate, monthRange, weekday, diffMin, today, currentMonth, WD_SHORT,
};
