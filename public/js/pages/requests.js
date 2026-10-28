import { get, post } from '../api.js';
import { esc, icon, toast, statusBadge, fmtDate, fmtDT, num, KIND, LEAVE, REQ_STATUS, emptyState, openForm, confirmDialog } from '../ui.js';
import { newRequest } from './shared.js';

function detail(r) {
  if (r.kind === 'leave') return `${esc(LEAVE[r.leave_type])}: ${fmtDate(r.date_from)}${r.date_to !== r.date_from ? ' – ' + fmtDate(r.date_to) : ''}${r.half ? (r.half === 'am' ? ' (sáng)' : ' (chiều)') : ''}, <strong>${num(r.amount, 1)} ngày</strong>`;
  if (r.kind === 'ot') return `${fmtDate(r.date_from)}, ${r.time_from}–${r.time_to}, <strong>${num(r.amount, 1)} giờ</strong>`;
  return `${fmtDate(r.date_from)}: bổ sung giờ ${r.half === 'in' ? 'vào' : 'ra'} <strong>${r.time_from}</strong>`;
}

export async function render(view, ctx, params) {
  const mgr = ctx.isManager();
  let tab = params.get('tab') || 'mine';
  let kind = '', status = '';

  view.innerHTML = `
    <div class="page-head"><div><h1>Đơn từ</h1><div class="sub">Nghỉ phép, đăng ký tăng ca và giải trình chấm công.</div></div>
      <div class="actions">
        <button class="btn primary" data-new="leave">${icon('plus')} Xin nghỉ</button>
        <button class="btn" data-new="ot">${icon('plus')} Tăng ca</button>
        <button class="btn" data-new="adjust">${icon('plus')} Giải trình</button>
      </div></div>
    <div class="tabs" role="tablist">
      <button data-tab="mine">Đơn của tôi</button>
      ${mgr ? '<button data-tab="approve">Cần duyệt <span class="badge count hidden" id="pc"></span></button>' : ''}
    </div>
    <div class="filters">
      <div class="field"><label for="fk">Loại đơn</label><select class="input" id="fk"><option value="">Tất cả</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="fs">Trạng thái</label><select class="input" id="fs"><option value="">Tất cả</option>${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    </div>
    <section class="panel"><div class="panel-body flush table-wrap" id="list"></div></section>`;

  const list = view.querySelector('#list');
  const load = async () => {
    view.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    list.innerHTML = '<div class="loading">Đang tải…</div>';
    const rows = await get('/requests', { scope: tab, kind, status });
    if (mgr) {
      const pending = tab === 'approve' && !kind && !status ? rows.filter((r) => r.status === 'pending').length : (await get('/requests/pending-count')).count;
      const pc = view.querySelector('#pc'); pc.textContent = pending; pc.classList.toggle('hidden', !pending);
      ctx.refreshBadge();
    }
    if (!rows.length) {
      list.innerHTML = tab === 'approve' ? emptyState('Không có đơn nào', 'Đơn của nhân viên trong phạm vi bạn quản lý sẽ hiện ở đây.')
        : emptyState('Bạn chưa có đơn nào', 'Dùng các nút ở góc trên để xin nghỉ, đăng ký tăng ca hoặc giải trình.');
      return;
    }
    list.innerHTML = `<table class="tbl"><thead><tr>
      ${tab === 'approve' ? '<th>Nhân viên</th>' : ''}<th>Loại</th><th>Nội dung</th><th>Lý do</th><th>Gửi lúc</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        ${tab === 'approve' ? `<td><div class="person">${esc(r.full_name)}<span class="code">${esc(r.code)}${r.department_name ? ', ' + esc(r.department_name) : ''}</span></div></td>` : ''}
        <td class="nowrap">${esc(KIND[r.kind])}</td>
        <td>${detail(r)}</td>
        <td style="max-width:280px">${esc(r.reason)}${r.decision_note ? `<div class="muted small">Phản hồi: ${esc(r.decision_note)}</div>` : ''}</td>
        <td class="nowrap small">${fmtDT(r.created_at)}</td>
        <td class="nowrap">${statusBadge(r.status, REQ_STATUS[r.status])}${r.approver_name ? `<div class="muted small">${esc(r.approver_name)}</div>` : ''}</td>
        <td class="right nowrap">${r.status !== 'pending' ? '' : tab === 'approve'
          ? `<button class="btn sm primary" data-ok="${r.id}">${icon('check')} Duyệt</button> <button class="btn sm danger" data-no="${r.id}">Từ chối</button>`
          : `<button class="btn sm" data-cancel="${r.id}">Huỷ đơn</button>`}</td>
      </tr>`).join('')}</tbody></table>`;
  };

  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; load(); });
  view.querySelector('#fk').onchange = (e) => { kind = e.target.value; load(); };
  view.querySelector('#fs').onchange = (e) => { status = e.target.value; load(); };
  view.querySelectorAll('[data-new]').forEach((b) => b.onclick = async () => {
    if (await newRequest(b.dataset.new)) { tab = 'mine'; load(); }
  });
  list.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.ok) {
        t.disabled = true;
        await post(`/requests/${t.dataset.ok}/approve`); toast('Đã duyệt đơn'); load();
      } else if (t.dataset.no) {
        await openForm({ title: 'Từ chối đơn', submit: 'Từ chối', size: 'sm', fields: [{ name: 'note', label: 'Lý do từ chối', type: 'textarea', required: true }],
          onSubmit: async (v) => { await post(`/requests/${t.dataset.no}/reject`, v); toast('Đã từ chối đơn'); load(); } });
      } else if (t.dataset.cancel) {
        if (await confirmDialog('Huỷ đơn này?', { ok: 'Huỷ đơn', danger: true })) { await post(`/requests/${t.dataset.cancel}/cancel`); toast('Đã huỷ đơn'); load(); }
      }
    } catch (err) { toast(err.message, 'err'); t.disabled = false; }
  });

  if (tab === 'mine' && mgr && !params.get('tab')) {
    const { count } = await get('/requests/pending-count');
    if (count) tab = 'approve';
  }
  await load();
  const nk = params.get('new');
  if (nk && KIND[nk]) { history.replaceState(null, '', '#/requests'); if (await newRequest(nk)) { tab = 'mine'; load(); } }
}
