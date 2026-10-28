import { get, download } from '../api.js';
import { esc, icon, toast, WD, wdOf, monthStr, num, emptyState, opts } from '../ui.js';
import { showDayDetail } from './shared.js';

const SUMS = [
  ['Công chuẩn', (s) => num(s.stdUnits)],
  ['Công thực tế', (s) => num(s.workUnits)],
  ['Phép có lương', (s) => num(s.paidLeaveUnits) || ''],
  ['Lễ', (s) => num(s.holidayUnits) || ''],
  ['Ốm, không lương', (s) => num(s.sickUnits + s.unpaidUnits) || ''],
  ['Vắng', (s) => s.absentDays || ''],
  ['Thiếu chấm', (s) => s.missingDays || ''],
  ['Muộn (lần/phút)', (s) => (s.lateCount ? `${s.lateCount}/${s.lateMin}` : '')],
  ['Về sớm (lần/phút)', (s) => (s.earlyCount ? `${s.earlyCount}/${s.earlyMin}` : '')],
  ['OT 150% (h)', (s) => num(s.ot.weekday, 1) || ''],
  ['OT 200% (h)', (s) => num(s.ot.weekend, 1) || ''],
  ['OT 300% (h)', (s) => num(s.ot.holiday, 1) || ''],
];

export async function render(view, ctx, params) {
  let month = params.get('month') || monthStr();
  let dep = params.get('department_id') || '';
  let q = '';
  const deps = ctx.isAdmin() ? await ctx.ref('departments') : [];

  view.innerHTML = `
    <div class="page-head"><div><h1>Bảng công</h1><div class="sub">Tổng hợp công theo ca, nghỉ phép, ngày lễ và tăng ca đã duyệt. Chọn ô để xem giờ chấm.</div></div>
      <div class="actions"><button class="btn primary" id="xl">${icon('download')} Xuất Excel</button></div></div>
    <div class="filters">
      <div class="field"><label for="m">Tháng</label><input type="month" class="input" id="m" value="${month}"></div>
      ${ctx.isAdmin() ? `<div class="field"><label for="d">Phòng ban</label><select class="input" id="d">${opts(deps, 'id', (x) => x.name, 'Tất cả phòng ban').map((o) => `<option value="${o.value}"${String(o.value) === dep ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>` : ''}
      <div class="field grow" style="max-width:280px"><label for="q">Tìm nhân viên</label><input class="input" id="q" placeholder="Tên hoặc mã NV"></div>
    </div>
    <div id="sheet"><div class="loading">Đang tính công…</div></div>
    <div class="legend">
      <span><i class="st-ok">X</i>Đủ công</span><span><i class="st-late">0.9</i>Muộn, sớm, thiếu giờ</span><span><i class="st-leave">P</i>Phép năm</span>
      <span><i class="st-leave">R</i>Việc riêng có lương</span><span><i class="st-leave">Ô</i>Ốm BHXH</span><span><i class="st-leave">KL</i>Không lương</span>
      <span><i class="st-holiday">L</i>Lễ</span><span><i class="st-absent">V</i>Vắng</span><span><i class="st-missing">?</i>Thiếu chấm công</span><span><i class="st-off">&nbsp;</i>Ngày nghỉ</span>
    </div>`;

  let data;
  const sheet = view.querySelector('#sheet');
  const draw = () => {
    const rows = data.rows.filter((r) => !q || (r.user.full_name + ' ' + r.user.code).toLowerCase().includes(q));
    if (!rows.length) { sheet.innerHTML = `<section class="panel">${emptyState('Không có nhân viên nào', 'Kiểm tra bộ lọc hoặc thêm nhân viên ở mục Nhân viên.')}</section>`; return; }
    const dates = data.rows[0].days.map((d) => d.date);
    sheet.innerHTML = `<div class="ts-wrap"><table class="ts"><thead><tr>
      <th class="sticky">Nhân viên</th>
      ${dates.map((d) => { const w = wdOf(d); const h = data.holidays[d]; return `<th class="${w === 0 ? 'sun' : ''} ${h ? 'hol' : ''}" title="${esc(h || '')}">${+d.slice(8)}<span class="wd">${WD[w]}</span></th>`; }).join('')}
      ${SUMS.map(([t]) => `<th class="sum">${t}</th>`).join('')}<th class="sum">Tổng công lương</th></tr></thead>
      <tbody>${rows.map((r, ri) => `<tr>
        <td class="sticky"><a href="#/my?user_id=${r.user.id}&month=${data.month}" class="person" style="text-decoration:none;color:inherit">${esc(r.user.full_name)}<span class="code">${esc(r.user.code)}${r.user.department_name ? ', ' + esc(r.user.department_name) : ''}</span></a></td>
        ${r.days.map((d, di) => `<td class="c s-${d.status}${d.leaveType ? ' lv' : ''}" data-r="${ri}" data-d="${di}" title="${esc(d.checkIn ? `${d.checkIn} – ${d.checkOut || '?'}` : (d.holiday || ''))}">${esc(d.code)}</td>`).join('')}
        ${SUMS.map(([, f]) => `<td class="sum">${f(r.summary)}</td>`).join('')}<td class="sum total">${num(r.summary.totalPaidUnits)}</td>
      </tr>`).join('')}</tbody></table></div>
      <p class="muted small" style="margin-top:8px">${rows.length} nhân viên. Tổng công lương = công thực tế + phép có lương + lễ.</p>`;
    sheet.querySelector('tbody').onclick = (e) => {
      const c = e.target.closest('td.c'); if (!c) return;
      const r = rows[+c.dataset.r]; showDayDetail(r.days[+c.dataset.d], r.user);
    };
  };
  const load = async () => {
    sheet.innerHTML = '<div class="loading">Đang tính công…</div>';
    data = await get('/reports/timesheet', { month, department_id: dep });
    draw();
  };

  view.querySelector('#m').onchange = (e) => { if (e.target.value) { month = e.target.value; load(); } };
  view.querySelector('#d')?.addEventListener('change', (e) => { dep = e.target.value; load(); });
  view.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  view.querySelector('#xl').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await download('/reports/timesheet/export', { month, department_id: dep }, `bang-cong-${month}.xlsx`); }
    catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; }
  };
  await load();
}
