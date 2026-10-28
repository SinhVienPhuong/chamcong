import { get, post, put, del } from '../api.js';
import { esc, icon, toast, fmtDT, emptyState, openForm, confirmDialog, modal } from '../ui.js';

export async function render(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Máy chấm công</h1><div class="sub">Kết nối máy vân tay, khuôn mặt ZKTeco và các dòng tương thích qua cổng 4370.</div></div>
      <div class="actions"><button class="btn primary" id="add">${icon('plus')} Thêm máy</button></div></div>
    <section class="panel"><div class="panel-body flush table-wrap" id="list"></div></section>
    <div class="grid-2" style="margin-top:18px">
      <section class="panel"><div class="panel-head"><h2>Máy cùng mạng với server</h2></div><div class="panel-body small">
        <p>Bấm <strong>Đồng bộ</strong> để kéo dữ liệu ngay. Đặt biến <code>AUTO_SYNC_MINUTES=10</code> để server tự đồng bộ định kỳ.</p>
        <p class="muted">Cần mở UDP/TCP 4370 từ server tới máy. Nếu server và máy ở hai VLAN khác nhau, thêm firewall policy cho phép lưu lượng này.</p>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Máy ở chi nhánh hoặc server trên cloud</h2></div><div class="panel-body small">
        <p>Chạy agent trên một máy trong LAN chi nhánh. Agent kéo log từ máy chấm công rồi đẩy lên server qua HTTPS:</p>
        <p><code>SERVER_URL=https://chamcong.congty.vn DEVICE_API_KEY=… DEVICE_IP=192.168.1.201 DEVICE_ID=1 npm run agent</code></p>
        <p class="muted">DEVICE_API_KEY đặt trong file .env của server. Lên lịch agent bằng Task Scheduler hoặc cron.</p>
      </div></section>
    </div>`;
  const list = view.querySelector('#list');
  let rows = [];
  const load = async () => {
    rows = await get('/devices');
    list.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Tên máy</th><th>Địa chỉ</th><th>Vị trí</th><th>Đồng bộ gần nhất</th><th></th></tr></thead>
      <tbody>${rows.map((d, i) => `<tr><td><strong>${esc(d.name)}</strong> <span class="muted small">#${d.id}</span></td><td class="nowrap">${esc(d.ip)}:${d.port}</td><td>${esc(d.location || '')}</td>
        <td>${d.last_sync ? `${fmtDT(d.last_sync)}<div class="small ${String(d.last_status).startsWith('Lỗi') ? '' : 'muted'}" style="${String(d.last_status).startsWith('Lỗi') ? 'color:var(--st-absent)' : ''}">${esc(d.last_status || '')}</div>` : '<span class="muted">Chưa đồng bộ</span>'}</td>
        <td class="right nowrap"><button class="btn sm primary" data-sync="${i}">${icon('refresh')} Đồng bộ</button> <button class="btn sm" data-edit="${i}">Sửa</button> <button class="btn sm ghost danger" data-del="${i}" aria-label="Xoá">${icon('x')}</button></td></tr>`).join('')}</tbody></table>`
      : emptyState('Chưa khai báo máy chấm công nào', 'Thêm máy để kéo dữ liệu tự động, hoặc dùng “Nhập file” ở trang Nhật ký chấm công với file USB.');
  };
  const form = (d) => openForm({
    title: d ? 'Sửa máy chấm công' : 'Thêm máy chấm công', values: d || { port: 4370 },
    fields: [{ name: 'name', label: 'Tên máy', required: true, placeholder: 'Máy cổng chính' }, { name: 'location', label: 'Vị trí', placeholder: 'Sảnh tầng 1' },
      { name: 'ip', label: 'Địa chỉ IP', required: true, placeholder: '192.168.1.201' }, { name: 'port', label: 'Port', type: 'number' }],
    onSubmit: async (v) => { if (d) await put('/devices/' + d.id, v); else await post('/devices', v); toast('Đã lưu'); load(); },
  });
  view.querySelector('#add').onclick = () => form(null);
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = rows[+(b.dataset.sync ?? b.dataset.edit ?? b.dataset.del)];
    if (b.dataset.edit) return form(d);
    if (b.dataset.del) {
      if (await confirmDialog(`Xoá máy “${d.name}”? Dữ liệu chấm công đã đồng bộ vẫn được giữ.`, { ok: 'Xoá', danger: true })) { await del('/devices/' + d.id); load(); }
      return;
    }
    if (b.dataset.sync) {
      b.disabled = true; b.lastChild.textContent = ' Đang kết nối…';
      try {
        const s = await post(`/devices/${d.id}/sync`);
        modal({ title: `Đồng bộ ${d.name}`, size: 'sm', body: `<dl class="kv"><dt>Bản ghi trên máy</dt><dd>${s.total}</dd><dt>Thêm mới</dt><dd><strong>${s.inserted}</strong></dd><dt>Đã có</dt><dd>${s.duplicate}</dd>
          ${s.unknownCount ? `<dt>User ID chưa gán</dt><dd>${esc(s.unknownIds.join(', '))}<div class="muted small">Gán User ID máy chấm công cho nhân viên tương ứng.</div></dd>` : ''}</dl>`, foot: '<button class="btn primary" data-close>Đóng</button>' });
      } catch (err) { toast(err.message, 'err'); }
      load();
    }
  });
  await load();
}
