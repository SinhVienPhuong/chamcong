import { get, post, del, api, download } from '../api.js';
import { esc, icon, toast, fmtDate, todayStr, addDays, SOURCE, WD, wdOf, emptyState, openForm, confirmDialog, modal, opts } from '../ui.js';

export async function render(view, ctx) {
  const admin = ctx.isAdmin();
  const f = { from: addDays(todayStr(), -6), to: todayStr(), department_id: '', source: '', q: '' };
  const deps = admin ? await ctx.ref('departments') : [];

  view.innerHTML = `
    <div class="page-head"><div><h1>Nhật ký chấm công</h1><div class="sub">Mọi lượt chấm gốc từ web, máy chấm công, file nhập và bổ sung thủ công.</div></div>
      <div class="actions">
        ${admin ? `<button class="btn" id="imp">${icon('upload')} Nhập file</button><button class="btn" id="add">${icon('plus')} Thêm thủ công</button>` : ''}
        <button class="btn primary" id="xl">${icon('download')} Xuất Excel</button>
      </div></div>
    <div class="filters">
      <div class="field"><label for="ff">Từ ngày</label><input type="date" class="input" id="ff" value="${f.from}"></div>
      <div class="field"><label for="ft">Đến ngày</label><input type="date" class="input" id="ft" value="${f.to}"></div>
      ${admin ? `<div class="field"><label for="fd">Phòng ban</label><select class="input" id="fd">${opts(deps, 'id', (x) => x.name, 'Tất cả').map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="fs">Nguồn</label><select class="input" id="fs"><option value="">Tất cả</option>${Object.entries(SOURCE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="fq">Nhân viên</label><input class="input" id="fq" placeholder="Tên hoặc mã"></div>
    </div>
    <section class="panel"><div class="panel-body flush table-wrap" id="list"></div></section>`;

  const list = view.querySelector('#list');
  let qTimer;
  const load = async () => {
    list.innerHTML = '<div class="loading">Đang tải…</div>';
    const r = await get('/attendance/logs', f);
    if (!r.rows.length) { list.innerHTML = emptyState('Không có lượt chấm nào trong khoảng này'); return; }
    list.innerHTML = `<table class="tbl"><thead><tr><th>Nhân viên</th><th>Ngày</th><th>Giờ</th><th>Nguồn</th><th>Chi tiết</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${r.rows.map((l) => `<tr>
        <td><div class="person">${esc(l.full_name)}<span class="code">${esc(l.code)}${l.department_name ? ', ' + esc(l.department_name) : ''}</span></div></td>
        <td class="nowrap">${WD[wdOf(l.ts.slice(0, 10))]}, ${fmtDate(l.ts.slice(0, 10))}</td>
        <td class="nowrap"><strong>${l.ts.slice(11, 19)}</strong></td>
        <td><span class="badge">${esc(SOURCE[l.source])}</span></td>
        <td class="small muted">${[l.device_name, l.ip && 'IP ' + l.ip, l.lat != null && `GPS ${(+l.lat).toFixed(5)}, ${(+l.lng).toFixed(5)}`, l.note, l.created_by_name && 'Bởi ' + l.created_by_name].filter(Boolean).map(esc).join('<br>')}</td>
        ${admin ? `<td class="right"><button class="btn sm ghost danger" data-del="${l.id}" aria-label="Xoá">${icon('x')}</button></td>` : ''}
      </tr>`).join('')}</tbody></table>
      ${r.truncated ? '<p class="muted small" style="padding:8px 12px">Chỉ hiển thị 2.000 dòng mới nhất. Thu hẹp khoảng ngày hoặc xuất Excel để xem đủ.</p>' : ''}`;
  };

  const bind = (id, key, ev = 'change') => view.querySelector(id)?.addEventListener(ev, (e) => {
    f[key] = e.target.value;
    if (ev === 'input') { clearTimeout(qTimer); qTimer = setTimeout(load, 300); } else load();
  });
  bind('#ff', 'from'); bind('#ft', 'to'); bind('#fd', 'department_id'); bind('#fs', 'source'); bind('#fq', 'q', 'input');

  view.querySelector('#xl').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await download('/attendance/logs/export', f, 'nhat-ky-cham-cong.xlsx'); } catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; }
  };

  if (admin) {
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      if (!(await confirmDialog('Xoá lượt chấm này? Thao tác được ghi vào nhật ký hệ thống.', { ok: 'Xoá', danger: true }))) return;
      try { await del('/attendance/logs/' + b.dataset.del); toast('Đã xoá'); load(); } catch (err) { toast(err.message, 'err'); }
    });
    view.querySelector('#add').onclick = async () => {
      const emps = await get('/employees');
      openForm({
        title: 'Thêm lượt chấm thủ công', submit: 'Thêm',
        values: { date: todayStr(), time: '08:00' },
        fields: [
          { name: 'user_id', label: 'Nhân viên', type: 'select', required: true, full: true, options: opts(emps, 'id', (x) => `${x.code} - ${x.full_name}`, '— Chọn nhân viên —') },
          { name: 'date', label: 'Ngày', type: 'date', required: true },
          { name: 'time', label: 'Giờ', type: 'time', required: true },
          { name: 'note', label: 'Lý do', type: 'textarea', required: true, placeholder: 'VD: Máy chấm công lỗi sáng 15/10, xác nhận bởi trưởng phòng' },
        ],
        onSubmit: async (v) => { await post('/attendance/logs', v); toast('Đã thêm lượt chấm'); load(); },
      });
    };
    view.querySelector('#imp').onclick = () => {
      openForm({
        title: 'Nhập dữ liệu chấm công từ file', submit: 'Nhập',
        intro: `<div class="callout" style="margin-bottom:14px">
          Hỗ trợ file <strong>attlog.dat / .txt</strong> tải từ USB máy ZKTeco, file <strong>.csv</strong> hoặc <strong>.xlsx</strong> xuất từ phần mềm chấm công.
          Mỗi dòng cần có mã chấm công (User ID trên máy hoặc mã nhân viên) và ngày giờ, ví dụ:<br>
          <code>15&nbsp;&nbsp;2026-10-01 07:58:12</code> hoặc <code>NV005,01/10/2026 17:31</code>.<br>Lượt chấm trùng sẽ tự bỏ qua.</div>`,
        fields: [{ name: 'file', label: 'File', type: 'file', required: true, full: true, accept: '.dat,.txt,.csv,.xlsx' }],
        onSubmit: async (v) => {
          const fd = new FormData(); fd.append('file', v.file);
          const s = await api('/attendance/import', { method: 'POST', body: fd });
          modal({ title: 'Kết quả nhập', size: 'sm', body: `<dl class="kv">
              <dt>Dòng đọc được</dt><dd>${s.total}</dd><dt>Thêm mới</dt><dd><strong>${s.inserted}</strong></dd><dt>Trùng (bỏ qua)</dt><dd>${s.duplicate}</dd>
              ${s.invalid ? `<dt>Ngày giờ lỗi</dt><dd>${s.invalid}</dd>` : ''}
              ${s.unknownCount ? `<dt>Mã không khớp</dt><dd>${s.unknownCount} mã: ${esc(s.unknownIds.join(', '))}${s.unknownCount > s.unknownIds.length ? '…' : ''}<div class="muted small">Gán “User ID máy chấm công” cho nhân viên rồi nhập lại file.</div></dd>` : ''}
            </dl>`, foot: '<button class="btn primary" data-close>Đóng</button>' });
          load();
        },
      });
    };
  }
  await load();
}
