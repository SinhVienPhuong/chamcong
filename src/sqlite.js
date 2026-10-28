// Lớp bọc mỏng quanh SQLite có sẵn trong Node.js (node:sqlite, Node >= 22.13).
// Không cần thư viện native => không phải cài Visual Studio/Python để build trên Windows.
// Giữ API quen thuộc: prepare().run/get/all, pragma(), transaction(fn).

// Ẩn cảnh báo "SQLite is an experimental feature" để log gọn
const origEmit = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const msg = typeof warning === 'string' ? warning : warning?.message;
  if (msg && msg.includes('SQLite is an experimental feature')) return;
  return origEmit.call(process, warning, ...args);
};

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error('Phiên bản Node.js hiện tại không có module node:sqlite. Hãy cài Node.js 22.13 trở lên (khuyến nghị bản LTS mới nhất).');
  process.exit(1);
}

const fixInfo = (info) => ({ changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) });
// node:sqlite trả object không có prototype; chuyển về object thường cho chắc chắn
const plain = (row) => (row ? { ...row } : row);

class Statement {
  constructor(stmt) { this.stmt = stmt; }
  run(...p) { return fixInfo(this.stmt.run(...p)); }
  get(...p) { return plain(this.stmt.get(...p)); }
  all(...p) { return this.stmt.all(...p).map(plain); }
}

class Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.depth = 0;
  }
  exec(sql) { this.db.exec(sql); return this; }
  prepare(sql) { return new Statement(this.db.prepare(sql)); }
  pragma(s) { this.db.exec(`PRAGMA ${s}`); }
  close() { this.db.close(); }

  // Trả về hàm chạy fn trong transaction (hỗ trợ lồng nhau bằng SAVEPOINT)
  transaction(fn) {
    return (...args) => {
      const sp = `sp${this.depth}`;
      this.db.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const r = fn(...args);
        this.depth--;
        this.db.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.depth--;
        this.db.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
}

module.exports = Database;
