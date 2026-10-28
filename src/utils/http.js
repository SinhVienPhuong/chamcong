class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Không tìm thấy dữ liệu') => new HttpError(404, msg);
const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, msg);

// Bọc handler async để lỗi chuyển về middleware xử lý lỗi
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, max = 255) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const intOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(+v) ? Math.trunc(+v) : null);

module.exports = { HttpError, bad, notFound, forbidden, wrap, str, intOrNull };
