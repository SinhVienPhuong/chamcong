// Xuất bảng công tháng ra Excel (3 sheet: Bảng công, Chi tiết, Ký hiệu)
const ExcelJS = require('exceljs');
const T = require('../utils/time');
const { LEAVE_TYPES, STATUS_LABEL } = require('./calc');

const FILL = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BORDER = { top: { style: 'thin', color: { argb: 'FFB8C2CC' } }, left: { style: 'thin', color: { argb: 'FFB8C2CC' } },
  bottom: { style: 'thin', color: { argb: 'FFB8C2CC' } }, right: { style: 'thin', color: { argb: 'FFB8C2CC' } } };
const COLORS = {
  header: 'FF0F4C5C', headerText: 'FFFFFFFF', weekend: 'FFE9EDF1', holiday: 'FFFDE8C8',
  late: 'FFFFF1C2', absent: 'FFFAD4CF', missing: 'FFF6D7F0', leave: 'FFD9E8FB', ok: 'FFFFFFFF',
};

function cellStyleFor(d) {
  if (d.status === 'holiday') return COLORS.holiday;
  if (d.status === 'off' || d.status === 'not_joined') return COLORS.weekend;
  if (d.status === 'absent') return COLORS.absent;
  if (d.status === 'missing') return COLORS.missing;
  if (d.status === 'leave' || d.leaveType) return COLORS.leave;
  if (['late', 'early', 'late_early', 'partial'].includes(d.status)) return COLORS.late;
  return COLORS.ok;
}

async function buildTimesheetWorkbook({ companyName, month, range, rows, departmentName }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống chấm công';
  wb.created = new Date();

  // ================= Sheet 1: Bảng công =================
  const ws = wb.addWorksheet('Bảng công', { views: [{ state: 'frozen', xSplit: 4, ySplit: 6 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const dates = T.eachDate(range.from, range.to);
  const SUM_COLS = [
    ['Công chuẩn', (s) => s.stdUnits], ['Công thực tế', (s) => s.workUnits], ['Phép có lương', (s) => s.paidLeaveUnits],
    ['Lễ', (s) => s.holidayUnits], ['Ốm (BHXH)', (s) => s.sickUnits], ['Không lương', (s) => s.unpaidUnits],
    ['Vắng', (s) => s.absentDays], ['Thiếu chấm', (s) => s.missingDays],
    ['Số lần muộn', (s) => s.lateCount], ['Phút muộn', (s) => s.lateMin], ['Số lần về sớm', (s) => s.earlyCount], ['Phút về sớm', (s) => s.earlyMin],
    ['OT ngày thường (h)', (s) => s.ot.weekday], ['OT ngày nghỉ (h)', (s) => s.ot.weekend], ['OT ngày lễ (h)', (s) => s.ot.holiday],
    ['Tổng công hưởng lương', (s) => s.totalPaidUnits],
  ];
  const totalCols = 4 + dates.length + SUM_COLS.length;

  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell(1, 1).value = companyName;
  ws.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FF0F4C5C' } };
  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell(2, 1).value = `BẢNG CHẤM CÔNG THÁNG ${T.pad(range.month)}/${range.year}`;
  ws.getCell(2, 1).font = { bold: true, size: 16 };
  ws.getCell(2, 1).alignment = { horizontal: 'center' };
  ws.mergeCells(3, 1, 3, totalCols);
  ws.getCell(3, 1).value = `Phòng ban: ${departmentName || 'Tất cả'}   |   Xuất lúc: ${T.toDateTimeStr(new Date()).slice(0, 16)}`;
  ws.getCell(3, 1).alignment = { horizontal: 'center' };
  ws.getCell(3, 1).font = { italic: true, color: { argb: 'FF5B6770' } };

  // Header 2 dòng: (5) số ngày, (6) thứ
  const h5 = ws.getRow(5), h6 = ws.getRow(6);
  ['STT', 'Mã NV', 'Họ và tên', 'Phòng ban'].forEach((t, i) => { ws.mergeCells(5, i + 1, 6, i + 1); h5.getCell(i + 1).value = t; });
  dates.forEach((d, i) => { h5.getCell(5 + i).value = +d.slice(8); h6.getCell(5 + i).value = T.WD_SHORT[T.weekday(d)]; });
  SUM_COLS.forEach(([t], i) => { const c = 5 + dates.length + i; ws.mergeCells(5, c, 6, c); h5.getCell(c).value = t; });
  for (const r of [h5, h6]) {
    r.height = r === h5 ? 30 : 18;
    for (let c = 1; c <= totalCols; c++) {
      const cell = r.getCell(c);
      cell.fill = FILL(COLORS.header); cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = BORDER;
    }
  }
  dates.forEach((d, i) => {
    const wd = T.weekday(d);
    if (wd === 0) { h5.getCell(5 + i).fill = FILL('FFB03A2E'); h6.getCell(5 + i).fill = FILL('FFB03A2E'); }
  });

  let rowIdx = 7;
  rows.forEach((row, n) => {
    const r = ws.getRow(rowIdx++);
    r.getCell(1).value = n + 1; r.getCell(2).value = row.user.code; r.getCell(3).value = row.user.full_name; r.getCell(4).value = row.user.department_name || '';
    row.days.forEach((d, i) => {
      const c = r.getCell(5 + i);
      c.value = d.code === '' ? null : (isNaN(+d.code) ? d.code : +d.code);
      c.fill = FILL(cellStyleFor(d));
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.font = { size: 9, bold: d.status === 'absent', color: { argb: d.status === 'absent' ? 'FFB03A2E' : 'FF1B2733' } };
      if (d.lateMin || d.earlyMin) c.note = `Vào ${d.checkIn || '-'} / Ra ${d.checkOut || '-'}${d.lateMin ? `\nMuộn ${d.lateMin}'` : ''}${d.earlyMin ? `\nVề sớm ${d.earlyMin}'` : ''}`;
    });
    SUM_COLS.forEach(([, f], i) => {
      const c = r.getCell(5 + dates.length + i);
      c.value = f(row.summary); c.alignment = { horizontal: 'center' }; c.numFmt = '0.##';
      if (i === SUM_COLS.length - 1) { c.font = { bold: true }; c.fill = FILL('FFE3F1EE'); }
    });
    for (let c = 1; c <= totalCols; c++) { r.getCell(c).border = BORDER; if (c <= 4) r.getCell(c).font = { size: 10 }; }
  });

  ws.getColumn(1).width = 5; ws.getColumn(2).width = 10; ws.getColumn(3).width = 24; ws.getColumn(4).width = 16;
  dates.forEach((_, i) => { ws.getColumn(5 + i).width = 4.6; });
  SUM_COLS.forEach((_, i) => { ws.getColumn(5 + dates.length + i).width = 9.5; });

  // Chữ ký
  rowIdx += 2;
  const sign = ['Người lập biểu', 'Trưởng phòng Nhân sự', 'Giám đốc'];
  const span = Math.floor(totalCols / 3);
  sign.forEach((t, i) => {
    const c1 = 1 + i * span, c2 = i === 2 ? totalCols : c1 + span - 1;
    ws.mergeCells(rowIdx, c1, rowIdx, c2); ws.mergeCells(rowIdx + 1, c1, rowIdx + 1, c2);
    ws.getCell(rowIdx, c1).value = t; ws.getCell(rowIdx, c1).font = { bold: true }; ws.getCell(rowIdx, c1).alignment = { horizontal: 'center' };
    ws.getCell(rowIdx + 1, c1).value = '(Ký, ghi rõ họ tên)'; ws.getCell(rowIdx + 1, c1).font = { italic: true, size: 9 };
    ws.getCell(rowIdx + 1, c1).alignment = { horizontal: 'center' };
  });

  // ================= Sheet 2: Chi tiết =================
  const wd2 = wb.addWorksheet('Chi tiết', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd2.columns = [
    { header: 'Mã NV', key: 'code', width: 10 }, { header: 'Họ và tên', key: 'name', width: 24 }, { header: 'Phòng ban', key: 'dept', width: 16 },
    { header: 'Ngày', key: 'date', width: 12 }, { header: 'Thứ', key: 'wd', width: 6 }, { header: 'Ca', key: 'shift', width: 7 },
    { header: 'Giờ vào', key: 'in', width: 9 }, { header: 'Giờ ra', key: 'out', width: 9 }, { header: 'Các lần chấm', key: 'punches', width: 26 },
    { header: 'Muộn (phút)', key: 'late', width: 10 }, { header: 'Về sớm (phút)', key: 'early', width: 12 },
    { header: 'Giờ làm', key: 'hours', width: 9 }, { header: 'Công', key: 'units', width: 7 }, { header: 'Nghỉ phép', key: 'leave', width: 18 },
    { header: 'OT duyệt (h)', key: 'otA', width: 11 }, { header: 'OT thực tế (h)', key: 'otR', width: 12 }, { header: 'OT tính (h)', key: 'otP', width: 10 },
    { header: 'Hệ số OT', key: 'otRate', width: 9 }, { header: 'Trạng thái', key: 'status', width: 18 }, { header: 'Ghi chú', key: 'note', width: 28 },
  ];
  wd2.getRow(1).eachCell((c) => { c.fill = FILL(COLORS.header); c.font = { bold: true, color: { argb: COLORS.headerText } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  for (const row of rows) {
    for (const d of row.days) {
      if (d.status === 'future' || d.status === 'not_joined') continue;
      if (d.status === 'off' && !d.punches.length) continue;
      const r = wd2.addRow({
        code: row.user.code, name: row.user.full_name, dept: row.user.department_name || '', date: d.date, wd: d.weekday, shift: d.shift,
        in: d.checkIn, out: d.checkOut, punches: d.punches.join(', '), late: d.lateMin || null, early: d.earlyMin || null,
        hours: d.workMin ? Math.round(d.workMin / 6) / 10 : null, units: d.workUnits || null,
        leave: d.leaveType ? `${LEAVE_TYPES[d.leaveType].name} (${d.leaveUnits})` : '', otA: d.otApprovedH || null,
        otR: d.otActualMin ? Math.round(d.otActualMin / 6) / 10 : null, otP: d.otPayH || null, otRate: d.otPayH ? d.otRate + '%' : '',
        status: d.holiday ? `Lễ: ${d.holiday}` : STATUS_LABEL[d.status], note: d.note,
      });
      r.getCell('status').fill = FILL(cellStyleFor(d));
    }
  }
  wd2.autoFilter = { from: 'A1', to: 'T1' };

  // ================= Sheet 3: Ký hiệu =================
  const wl = wb.addWorksheet('Ký hiệu');
  wl.columns = [{ header: 'Ký hiệu', width: 10 }, { header: 'Ý nghĩa', width: 50 }];
  wl.getRow(1).eachCell((c) => { c.fill = FILL(COLORS.header); c.font = { bold: true, color: { argb: COLORS.headerText } }; });
  [
    ['X', 'Đủ công theo ca', COLORS.ok], ['0.xx', 'Công thực tế (thiếu giờ, đi muộn/về sớm quá ân hạn)', COLORS.late],
    ['P', 'Nghỉ phép năm', COLORS.leave], ['R', 'Nghỉ việc riêng có lương (hiếu, hỉ...)', COLORS.leave],
    ['Ô', 'Nghỉ ốm hưởng BHXH', COLORS.leave], ['KL', 'Nghỉ không lương', COLORS.leave], ['P/2, Ô/2…', 'Nghỉ nửa ngày + làm nửa ngày', COLORS.leave],
    ['L', 'Nghỉ lễ, Tết (hưởng lương)', COLORS.holiday], ['V', 'Vắng không phép', COLORS.absent],
    ['?', 'Thiếu chấm công vào/ra — cần giải trình', COLORS.missing], ['(trống)', 'Ngày nghỉ theo lịch ca', COLORS.weekend],
  ].forEach(([k, v, color]) => { const r = wl.addRow([k, v]); r.getCell(1).fill = FILL(color); r.getCell(1).alignment = { horizontal: 'center' }; r.getCell(1).font = { bold: true }; });

  return wb;
}

async function buildLogsWorkbook(logs) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Nhật ký chấm công', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Mã NV', key: 'code', width: 10 }, { header: 'Họ và tên', key: 'full_name', width: 24 }, { header: 'Phòng ban', key: 'department_name', width: 18 },
    { header: 'Thời gian', key: 'ts', width: 20 }, { header: 'Nguồn', key: 'source', width: 10 }, { header: 'IP', key: 'ip', width: 16 },
    { header: 'Vĩ độ', key: 'lat', width: 11 }, { header: 'Kinh độ', key: 'lng', width: 11 }, { header: 'Thiết bị', key: 'device_name', width: 16 }, { header: 'Ghi chú', key: 'note', width: 30 },
  ];
  ws.getRow(1).eachCell((c) => { c.fill = FILL(COLORS.header); c.font = { bold: true, color: { argb: COLORS.headerText } }; });
  logs.forEach((l) => ws.addRow(l));
  ws.autoFilter = { from: 'A1', to: 'J1' };
  return wb;
}

module.exports = { buildTimesheetWorkbook, buildLogsWorkbook };
