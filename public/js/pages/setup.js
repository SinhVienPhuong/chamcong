import { get, post, put, del } from '../api.js';
import { esc, icon, toast, fmtDate, WD, wdOf, emptyState, openForm, confirmDialog } from '../ui.js';

const DAYS = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ value: i, label: WD[i] }));
const dayList = (s) => String(s || '').split(',').filter((x) => x !== '').map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((i) => WD[i]).join(', ');

export async function render(view, ctx, params) {
  let tab = params.get('tab') || 'shifts';
  view.innerHTML = `
    <div class="page-head"><div><h1>Ca, phòng ban, ngày lễ</h1><div class="sub">Thiết lập nền tảng để hệ thống tính công đúng.</div></div>
      <div class="actions"><button class="btn primary" id="add">${icon('plus')} <span></span></button></div></div>
    <div class="tabs"><button data-tab="shifts">Ca làm việc</button><button data-tab="departments">Phòng ban</button><button data-tab="holidays">Ngày lễ</button></div>
    <div id="body"></div>`;
  const body = view.querySelector('#body');
  let year = new Date().getFullYear();
  let rows = [];

  const LOAD = {
    async shifts() {
      rows = await get('/shifts');
      body.innerHTML = `<section class="panel"><div class="panel-body flush table-wrap"><table class="tbl"><thead><tr>
        <th>Ca</th><th>Giờ làm</th><th>Nghỉ giữa ca</th><th class="num">Giờ chuẩn</th><th>Ân hạn muộn/sớm</th><th>Ngày làm</th><th>Nửa ngày</th><th class="num">Nhân viên</th><th></th></tr></thead>
        <tbody>${rows.map((s, i) => `<tr>
          <td><div class="person">${esc(s.name)}${s.is_default ? ' <span class="badge">Mặc định</span>' : ''}<span class="code">${esc(s.code)}</span></div></td>
          <td class="nowrap"><strong>${s.start_time} – ${s.end_time}</strong>${s.end_time <= s.start_time ? ' <span class="badge">Qua đêm</span>' : ''}</td>
          <td class="nowrap">${s.break_start ? `${s.break_start} – ${s.break_end}` : '—'}</td>
          <td class="num">${s.std_hours}h</td>
          <td>${s.late_grace} / ${s.early_grace} phút</td>
          <td>${dayList(s.work_days)}</td><td>${dayList(s.half_days) || '—'}</td>
          <td class="num">${s.headcount}</td>
          <td class="right nowrap"><button class="btn sm" data-edit="${i}">Sửa</button> ${s.is_default ? '' : `<button class="btn sm ghost danger" data-del="${i}" aria-label="Xoá">${icon('x')}</button>`}</td>
        </tr>`).join('')}</tbody></table></div></section>
        <p class="muted small" style="margin-top:10px">Ca qua đêm (giờ ra nhỏ hơn giờ vào) được tính trọn vào ngày bắt đầu ca. Nhân viên không gán ca sẽ dùng ca mặc định.</p>`;
    },
    async departments() {
      ctx.invalidate('departments');
      rows = await ctx.ref('departments');
      body.innerHTML = rows.length ? `<section class="panel"><div class="panel-body flush table-wrap"><table class="tbl"><thead><tr><th>Mã</th><th>Tên phòng ban</th><th>Quản lý</th><th class="num">Nhân viên</th><th></th></tr></thead>
        <tbody>${rows.map((d, i) => `<tr><td>${esc(d.code)}</td><td><strong>${esc(d.name)}</strong></td><td>${esc(d.managers || '—')}</td><td class="num">${d.headcount}</td>
          <td class="right nowrap"><button class="btn sm" data-edit="${i}">Sửa</button> <button class="btn sm ghost danger" data-del="${i}" aria-label="Xoá">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div></section>
        <p class="muted small" style="margin-top:10px">Quản lý phòng ban là nhân viên thuộc phòng có quyền “Quản lý”. Gán ở mục Nhân viên.</p>`
        : `<section class="panel">${emptyState('Chưa có phòng ban')}</section>`;
    },
    async holidays() {
      rows = await get('/holidays', { year });
      body.innerHTML = `<div class="filters"><div class="field"><label for="yy">Năm</label><select class="input" id="yy">${[year - 1, year, year + 1, new Date().getFullYear() + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('')}</select></div></div>
        <section class="panel"><div class="panel-body flush">${rows.length ? `<table class="tbl"><thead><tr><th>Ngày</th><th>Thứ</th><th>Tên</th><th></th></tr></thead>
          <tbody>${rows.map((h, i) => `<tr><td class="nowrap">${fmtDate(h.date)}</td><td>${WD[wdOf(h.date)]}</td><td>${esc(h.name)}</td>
          <td class="right"><button class="btn sm ghost danger" data-del="${i}" aria-label="Xoá">${icon('x')}</button></td></tr>`).join('')}</tbody></table>`
          : emptyState(`Chưa khai báo ngày lễ năm ${year}`, 'Ngày lễ được tính đủ công hưởng lương; đi làm ngày lễ tính tăng ca 300%.')}</div></section>
        <p class="muted small" style="margin-top:10px">Lịch nghỉ Tết âm lịch và nghỉ bù thay đổi theo năm. Hãy cập nhật theo thông báo của Bộ LĐ-TB&XH.</p>`;
      body.querySelector('#yy').onchange = (e) => { year = +e.target.value; LOAD.holidays(); };
    },
  };
  const ADD_LABEL = { shifts: 'Thêm ca', departments: 'Thêm phòng ban', holidays: 'Thêm ngày lễ' };

  const shiftForm = (s) => openForm({
    title: s ? `Sửa ca: ${s.name}` : 'Thêm ca làm việc', size: 'lg',
    values: s ? { ...s, is_default: !!s.is_default } : { start_time: '08:00', end_time: '17:00', break_start: '12:00', break_end: '13:00', late_grace: 5, early_grace: 5, work_days: '1,2,3,4,5', half_days: '' },
    fields: [
      { name: 'code', label: 'Mã ca', required: true, placeholder: 'CA1' }, { name: 'name', label: 'Tên ca', required: true, placeholder: 'Ca sáng' },
      { name: 'start_time', label: 'Giờ vào', type: 'time', required: true }, { name: 'end_time', label: 'Giờ ra', type: 'time', required: true },
      { name: 'break_start', label: 'Bắt đầu nghỉ giữa ca', type: 'time' }, { name: 'break_end', label: 'Kết thúc nghỉ giữa ca', type: 'time' },
      { name: 'late_grace', label: 'Cho phép đi muộn (phút)', type: 'number', min: 0, help: 'Vào trong khoảng này vẫn tính đúng giờ.' },
      { name: 'early_grace', label: 'Cho phép về sớm (phút)', type: 'number', min: 0 },
      { name: 'work_days', label: 'Ngày làm việc', type: 'checks', options: DAYS },
      { name: 'half_days', label: 'Ngày chỉ làm buổi sáng (tính ½ công)', type: 'checks', options: DAYS, help: 'VD: làm sáng thứ 7. Ngày này phải nằm trong ngày làm việc.' },
      { name: 'is_default', label: 'Đặt làm ca mặc định', type: 'checkbox' },
    ],
    onSubmit: async (v) => { if (s) await put('/shifts/' + s.id, v); else await post('/shifts', v); ctx.invalidate('shifts'); toast('Đã lưu ca'); LOAD.shifts(); },
  });
  const depForm = (d) => openForm({
    title: d ? 'Sửa phòng ban' : 'Thêm phòng ban', size: 'sm', values: d || {},
    fields: [{ name: 'code', label: 'Mã', required: true, full: true }, { name: 'name', label: 'Tên phòng ban', required: true, full: true }],
    onSubmit: async (v) => { if (d) await put('/departments/' + d.id, v); else await post('/departments', v); toast('Đã lưu'); LOAD.departments(); },
  });
  const holForm = () => openForm({
    title: 'Thêm ngày lễ', size: 'sm',
    fields: [{ name: 'name', label: 'Tên', required: true, full: true, placeholder: 'Tết Nguyên đán' },
      { name: 'date', label: 'Từ ngày', type: 'date', required: true }, { name: 'date_to', label: 'Đến ngày', type: 'date', help: 'Để trống nếu nghỉ 1 ngày.' }],
    onSubmit: async (v) => { const r = await post('/holidays', v); toast(`Đã thêm ${r.count} ngày`); year = +v.date.slice(0, 4); LOAD.holidays(); },
  });

  view.querySelector('#add').onclick = () => ({ shifts: () => shiftForm(), departments: () => depForm(), holidays: holForm })[tab]();
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const item = rows[+(b.dataset.edit ?? b.dataset.del)];
    if (b.dataset.edit) { if (tab === 'shifts') shiftForm(item); else depForm(item); return; }
    if (b.dataset.del) {
      const label = tab === 'holidays' ? `${item.name} (${fmtDate(item.date)})` : item.name;
      if (!(await confirmDialog(`Xoá ${label}?`, { ok: 'Xoá', danger: true }))) return;
      try {
        await del(tab === 'holidays' ? '/holidays/' + item.date : `/${tab}/${item.id}`);
        if (tab === 'shifts') ctx.invalidate('shifts');
        toast('Đã xoá'); LOAD[tab]();
      } catch (err) { toast(err.message, 'err'); }
    }
  });
  const show = async () => {
    view.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    view.querySelector('#add span').textContent = ADD_LABEL[tab];
    body.innerHTML = '<div class="loading">Đang tải…</div>';
    await LOAD[tab]();
  };
  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; show(); });
  await show();
}
