// Thành phần dùng chung giữa các trang: chi tiết ngày công, form tạo đơn
import { get, post } from '../api.js';
import { esc, modal, openForm, toast, statusBadge, fmtDate, WD_LONG, wdOf, mins, num, LEAVE, todayStr } from '../ui.js';

export function showDayDetail(d, user, { canAdjust = false, onAdjust } = {}) {
  const rows = [
    ['Ca làm', d.isWorkday || d.status === 'leave' ? `${esc(d.shift)}: ${d.plannedIn} – ${d.plannedOut}${d.isHalfDay ? ' (nửa ngày)' : ''}` : 'Không có lịch làm'],
    ['Trạng thái', d.holiday ? statusBadge('holiday', 'Lễ: ' + d.holiday) : statusBadge(d.status)],
    ['Giờ vào', d.checkIn ? `${d.checkIn}${d.lateMin ? ` <span class="badge st st-late">muộn ${mins(d.lateMin)}</span>` : ''}` : '—'],
    ['Giờ ra', d.checkOut ? `${d.checkOut}${d.earlyMin ? ` <span class="badge st st-late">sớm ${mins(d.earlyMin)}</span>` : ''}` : '—'],
    ['Các lần chấm', d.punches.length ? d.punches.join(', ') : '—'],
    ['Giờ làm tính công', d.workMin ? mins(d.workMin) : '—'],
    ['Công', d.workUnits ? num(d.workUnits) : '0'],
  ];
  if (d.leaveType) rows.push(['Nghỉ phép', `${esc(LEAVE[d.leaveType])} (${num(d.leaveUnits)} ngày)`]);
  if (d.otApprovedH || d.otActualMin >= 30) rows.push(['Tăng ca', `Duyệt ${num(d.otApprovedH, 1)}h, thực tế ${mins(d.otActualMin) || '0'}, tính ${num(d.otPayH, 1)}h × ${d.otRate}%`]);
  if (d.note) rows.push(['Ghi chú', esc(d.note)]);
  const needAdjust = canAdjust && ['missing', 'absent', 'late', 'early', 'late_early', 'partial'].includes(d.status);
  const m = modal({
    title: `${WD_LONG[wdOf(d.date)]}, ${fmtDate(d.date)}${user ? ' — ' + user.full_name : ''}`, size: 'sm',
    body: `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`,
    foot: `${needAdjust ? '<button class="btn" data-adj>Gửi giải trình</button>' : ''}<button class="btn primary" data-close>Đóng</button>`,
  });
  m.el.querySelector('[data-adj]')?.addEventListener('click', () => { m.close(); onAdjust?.(d); });
}

export async function newRequest(kind, prefill = {}) {
  if (kind === 'leave') {
    const bal = await get('/requests/leave-balance');
    return openForm({
      title: 'Đơn xin nghỉ', submit: 'Gửi đơn',
      intro: `<div class="callout" style="margin-bottom:14px">Phép năm ${bal.year}: còn <strong>${num(bal.remaining, 1)}</strong> / ${num(bal.quota, 1)} ngày${bal.pending ? ` (${num(bal.pending, 1)} ngày đang chờ duyệt)` : ''}.</div>`,
      values: { leave_type: 'annual', date_from: prefill.date || todayStr(), date_to: prefill.date || todayStr(), half: '' },
      fields: [
        { name: 'leave_type', label: 'Loại nghỉ', type: 'select', required: true, options: Object.entries(LEAVE).map(([value, label]) => ({ value, label })) },
        { name: 'half', label: 'Thời lượng', type: 'select', options: [{ value: '', label: 'Cả ngày' }, { value: 'am', label: 'Nửa ngày: buổi sáng' }, { value: 'pm', label: 'Nửa ngày: buổi chiều' }], help: 'Nghỉ nửa ngày chỉ áp dụng khi từ ngày = đến ngày.' },
        { name: 'date_from', label: 'Từ ngày', type: 'date', required: true },
        { name: 'date_to', label: 'Đến ngày', type: 'date', required: true },
        { name: 'reason', label: 'Lý do', type: 'textarea', required: true },
      ],
      onChange: (v, form) => { if (v.half) form.elements.date_to.value = v.date_from; if (v.date_to < v.date_from) form.elements.date_to.value = v.date_from; },
      onSubmit: async (v) => { const r = await post('/requests', { kind: 'leave', ...v }); toast(`Đã gửi đơn nghỉ ${num(r.amount, 1)} ngày`); return r; },
    });
  }
  if (kind === 'ot') {
    return openForm({
      title: 'Đăng ký tăng ca', submit: 'Gửi đơn',
      intro: '<p class="muted small">Giờ tăng ca chỉ được tính khi đơn được duyệt và có giờ chấm công ra tương ứng. Giới hạn 40 giờ/tháng.</p>',
      values: { date_from: prefill.date || todayStr(), time_from: '17:30', time_to: '19:30' },
      fields: [
        { name: 'date_from', label: 'Ngày', type: 'date', required: true, full: true },
        { name: 'time_from', label: 'Từ giờ', type: 'time', required: true },
        { name: 'time_to', label: 'Đến giờ', type: 'time', required: true },
        { name: 'reason', label: 'Nội dung công việc', type: 'textarea', required: true },
      ],
      onSubmit: async (v) => { const r = await post('/requests', { kind: 'ot', ...v }); toast(`Đã gửi đăng ký tăng ca ${num(r.amount, 1)} giờ`); return r; },
    });
  }
  return openForm({
    title: 'Giải trình chấm công', submit: 'Gửi giải trình',
    intro: '<p class="muted small">Dùng khi quên chấm công, máy lỗi hoặc đi công tác. Sau khi được duyệt, giờ bạn khai sẽ được bổ sung vào nhật ký chấm công.</p>',
    values: { date_from: prefill.date || todayStr(), punch_type: prefill.punch_type || 'out', time_from: prefill.time || '' },
    fields: [
      { name: 'date_from', label: 'Ngày', type: 'date', required: true },
      { name: 'punch_type', label: 'Bổ sung', type: 'select', options: [{ value: 'in', label: 'Giờ vào' }, { value: 'out', label: 'Giờ ra' }] },
      { name: 'time_from', label: 'Giờ thực tế', type: 'time', required: true },
      { name: 'reason', label: 'Lý do', type: 'textarea', required: true, placeholder: 'VD: Đi gặp khách hàng tại KCN Thăng Long, không về kịp chấm công' },
    ],
    onSubmit: async (v) => { const r = await post('/requests', { kind: 'adjust', ...v }); toast('Đã gửi giải trình'); return r; },
  });
}

export function adjustPrefill(d) {
  const punch_type = !d.checkIn ? 'in' : 'out';
  return { date: d.date, punch_type, time: punch_type === 'in' ? d.plannedIn : d.plannedOut };
}
