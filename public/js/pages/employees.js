import { get, post, put } from '../api.js';
import { esc, icon, toast, fmtDate, ROLE, emptyState, openForm, confirmDialog, opts, showSecret, todayStr } from '../ui.js';

export async function render(view, ctx) {
  const admin = ctx.isAdmin();
  const f = { q: '', department_id: '', active: '1' };
  const [deps, shifts] = await Promise.all([ctx.ref('departments'), ctx.ref('shifts')]);

  view.innerHTML = `
    <div class="page-head"><div><h1>Nhân viên</h1><div class="sub">${admin ? 'Hồ sơ, phân quyền, ca làm và mã trên máy chấm công.' : 'Nhân viên trong phòng ban bạn quản lý.'}</div></div>
      <div class="actions">${admin ? `<button class="btn primary" id="add">${icon('plus')} Thêm nhân viên</button>` : ''}</div></div>
    <div class="filters">
      <div class="field"><label for="q">Tìm kiếm</label><input class="input" id="q" placeholder="Tên, mã NV, tên đăng nhập"></div>
      ${admin ? `<div class="field"><label for="d">Phòng ban</label><select class="input" id="d">${opts(deps, 'id', (x) => x.name, 'Tất cả').map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="a">Trạng thái</label><select class="input" id="a"><option value="1">Đang làm việc</option><option value="0">Đã nghỉ việc</option><option value="all">Tất cả</option></select></div>
    </div>
    <section class="panel"><div class="panel-body flush table-wrap" id="list"></div></section>`;

  const list = view.querySelector('#list');
  let rows = [], t;
  const load = async () => {
    rows = await get('/employees', f);
    if (!rows.length) { list.innerHTML = emptyState('Không có nhân viên nào', admin ? 'Bấm “Thêm nhân viên” để tạo hồ sơ đầu tiên.' : ''); return; }
    list.innerHTML = `<table class="tbl"><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Chức danh</th><th>Quyền</th><th>Ca</th><th>ID máy chấm</th><th>Chấm web</th><th>Ngày vào</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map((u, i) => `<tr class="${u.active ? '' : 'inactive'}">
        <td><div class="person">${esc(u.full_name)}<span class="code">${esc(u.code)}, ${esc(u.username)}</span></div></td>
        <td>${esc(u.department_name || '—')}</td><td>${esc(u.position || '')}</td>
        <td>${u.role === 'employee' ? '<span class="muted">Nhân viên</span>' : `<span class="badge">${esc(ROLE[u.role])}</span>`}</td>
        <td class="nowrap">${esc(u.shift_name || 'Mặc định')}</td>
        <td>${esc(u.device_user_id || '')}</td>
        <td>${u.allow_web_checkin ? 'Có' : '<span class="muted">Không</span>'}</td>
        <td class="nowrap">${fmtDate(u.join_date)}</td>
        ${admin ? `<td class="right nowrap"><button class="btn sm" data-edit="${i}">Sửa</button> <button class="btn sm ghost" data-pw="${i}" title="Đặt lại mật khẩu">${icon('shield')}</button></td>` : ''}
      </tr>`).join('')}</tbody></table>
      <p class="muted small" style="padding:8px 12px">${rows.length} nhân viên</p>`;
  };

  view.querySelector('#q').oninput = (e) => { f.q = e.target.value; clearTimeout(t); t = setTimeout(load, 250); };
  view.querySelector('#d')?.addEventListener('change', (e) => { f.department_id = e.target.value; load(); });
  view.querySelector('#a').onchange = (e) => { f.active = e.target.value; load(); };

  const form = (u) => {
    const isNew = !u;
    return openForm({
      title: isNew ? 'Thêm nhân viên' : `Sửa: ${u.full_name}`, size: 'lg', submit: isNew ? 'Tạo nhân viên' : 'Lưu thay đổi',
      values: u ? { ...u, allow_web_checkin: !!u.allow_web_checkin, track_attendance: !!u.track_attendance, active: !!u.active }
        : { role: 'employee', annual_leave_quota: 12, allow_web_checkin: true, track_attendance: true, active: true, join_date: todayStr() },
      fields: [
        { name: 'code', label: 'Mã nhân viên', required: true, placeholder: 'NV017' },
        { name: 'full_name', label: 'Họ và tên', required: true },
        { name: 'username', label: 'Tên đăng nhập', required: true, help: 'Chữ thường, không dấu. VD: phuong.bh' },
        { name: 'role', label: 'Quyền', type: 'select', options: Object.entries(ROLE).map(([value, label]) => ({ value, label })), help: 'Quản lý xem bảng công và duyệt đơn của phòng ban mình.' },
        ...(isNew ? [{ name: 'password', label: 'Mật khẩu ban đầu', type: 'password', autocomplete: 'new-password', help: 'Để trống để hệ thống tự sinh. Người dùng phải đổi ở lần đăng nhập đầu.' }] : []),
        { name: 'department_id', label: 'Phòng ban', type: 'select', options: opts(deps, 'id', (x) => x.name, '— Chưa gán —') },
        { name: 'position', label: 'Chức danh' },
        { name: 'shift_id', label: 'Ca làm việc', type: 'select', options: opts(shifts, 'id', (s) => `${s.name} (${s.start_time}–${s.end_time})`, 'Ca mặc định') },
        { name: 'device_user_id', label: 'User ID trên máy chấm công', help: 'Số ID khi đăng ký vân tay/khuôn mặt trên máy.' },
        { name: 'join_date', label: 'Ngày vào làm', type: 'date' },
        { name: 'annual_leave_quota', label: 'Số ngày phép năm', type: 'number', step: '0.5', min: 0 },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Điện thoại', type: 'tel' },
        { name: 'allow_web_checkin', label: 'Cho phép chấm công trên web/điện thoại', type: 'checkbox' },
        { name: 'track_attendance', label: 'Tính vào bảng công', type: 'checkbox', help: 'Tắt cho tài khoản hệ thống hoặc người không chấm công.' },
        ...(isNew ? [] : [{ name: 'active', label: 'Đang làm việc', type: 'checkbox', help: 'Bỏ chọn khi nhân viên nghỉ việc. Lịch sử chấm công vẫn được giữ.' }]),
      ],
      onSubmit: async (v) => {
        if (isNew) {
          const r = await post('/employees', v);
          toast('Đã tạo nhân viên'); load();
          if (r.tempPassword) showSecret('Mật khẩu tạm thời', `Gửi cho <strong>${esc(v.full_name)}</strong> (đăng nhập: <strong>${esc(v.username)}</strong>):`, r.tempPassword);
        } else { await put('/employees/' + u.id, v); toast('Đã lưu'); load(); }
      },
    });
  };

  if (admin) {
    view.querySelector('#add').onclick = () => form(null);
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) form(rows[+b.dataset.edit]);
      if (b.dataset.pw) {
        const u = rows[+b.dataset.pw];
        if (!(await confirmDialog(`Đặt lại mật khẩu cho ${u.full_name}? Mật khẩu cũ sẽ không dùng được nữa.`, { ok: 'Đặt lại' }))) return;
        try { const r = await post(`/employees/${u.id}/reset-password`); showSecret('Mật khẩu mới', `Gửi cho <strong>${esc(u.full_name)}</strong> (đăng nhập: <strong>${esc(u.username)}</strong>):`, r.tempPassword); }
        catch (err) { toast(err.message, 'err'); }
      }
    });
  }
  await load();
}
