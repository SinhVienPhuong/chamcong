import { get, put } from '../api.js';
import { esc, toast, fmtDT } from '../ui.js';

const ACTIONS = {
  login: 'Đăng nhập', login_failed: 'Đăng nhập sai', change_password: 'Đổi mật khẩu', checkin_denied: 'Chấm công bị từ chối',
  employee_create: 'Tạo nhân viên', employee_update: 'Sửa nhân viên', employee_reset_password: 'Đặt lại mật khẩu', employee_deactivate: 'Khoá nhân viên',
  log_manual_add: 'Thêm công thủ công', log_delete: 'Xoá lượt chấm', log_import: 'Nhập file chấm công', device_sync: 'Đồng bộ máy', device_push: 'Agent đẩy log',
  request_create: 'Tạo đơn', request_approved: 'Duyệt đơn', request_rejected: 'Từ chối đơn', request_cancel: 'Huỷ đơn', settings_update: 'Sửa cài đặt',
};

export async function render(view, ctx, params) {
  let tab = params.get('tab') || 'general';
  view.innerHTML = `
    <div class="page-head"><div><h1>Cài đặt & nhật ký</h1><div class="sub">Quy định chấm công và lịch sử thao tác trên hệ thống.</div></div></div>
    <div class="tabs"><button data-tab="general">Cài đặt</button><button data-tab="audit">Nhật ký hệ thống</button></div>
    <div id="body"></div>`;
  const body = view.querySelector('#body');

  const general = async () => {
    const s = await get('/settings');
    body.innerHTML = `<form id="sf" class="stack" style="max-width:760px">
      <section class="panel"><div class="panel-head"><h2>Công ty</h2></div><div class="panel-body form-grid">
        <div class="field full"><label for="company_name">Tên công ty</label><input class="input" id="company_name" name="company_name" value="${esc(s.company_name)}"><div class="help">Hiển thị trên giao diện và tiêu đề file Excel.</div></div>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Chấm công trên web, điện thoại</h2></div><div class="panel-body form-grid">
        <div class="field full"><label for="checkin_mode">Điều kiện để được chấm công</label><select class="input" id="checkin_mode" name="checkin_mode">
          ${[['ip_or_gps', 'Ở mạng nội bộ HOẶC trong bán kính văn phòng'], ['ip', 'Chỉ khi ở mạng nội bộ công ty (theo IP)'], ['gps', 'Chỉ khi ở trong bán kính văn phòng (GPS)'], ['anywhere', 'Ở bất kỳ đâu (không kiểm tra)']]
            .map(([v, l]) => `<option value="${v}"${s.checkin_mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field full"><label for="allowed_ips">Dải IP được phép</label><textarea class="input" id="allowed_ips" name="allowed_ips" rows="4">${esc(s.allowed_ips)}</textarea>
          <div class="help">Mỗi dòng một dải CIDR, VD <code>192.168.10.0/24</code> hoặc IP WAN tĩnh của văn phòng <code>113.160.x.x/32</code>. IP bạn đang dùng: <strong>${esc(s._client_ip)}</strong>.
          Nếu chạy sau reverse proxy, đặt <code>TRUST_PROXY</code> để server thấy đúng IP người dùng.</div></div>
        <div class="field"><label for="office_lat">Vĩ độ văn phòng</label><input class="input" id="office_lat" name="office_lat" value="${esc(s.office_lat)}" placeholder="21.0285"></div>
        <div class="field"><label for="office_lng">Kinh độ văn phòng</label><input class="input" id="office_lng" name="office_lng" value="${esc(s.office_lng)}" placeholder="105.8048"></div>
        <div class="field"><label for="office_radius">Bán kính cho phép (mét)</label><input class="input" type="number" id="office_radius" name="office_radius" value="${esc(s.office_radius)}"></div>
        <div class="field" style="justify-content:flex-end"><button type="button" class="btn" id="here">Lấy vị trí hiện tại của tôi</button></div>
        <div class="field"><label for="min_punch_interval">Khoảng cách tối thiểu giữa 2 lần chấm (phút)</label><input class="input" type="number" id="min_punch_interval" name="min_punch_interval" value="${esc(s.min_punch_interval)}"></div>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Hệ số tăng ca (%)</h2></div><div class="panel-body form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="field"><label for="ot_rate_weekday">Ngày thường</label><input class="input" type="number" id="ot_rate_weekday" name="ot_rate_weekday" value="${esc(s.ot_rate_weekday)}"></div>
        <div class="field"><label for="ot_rate_weekend">Ngày nghỉ hằng tuần</label><input class="input" type="number" id="ot_rate_weekend" name="ot_rate_weekend" value="${esc(s.ot_rate_weekend)}"></div>
        <div class="field"><label for="ot_rate_holiday">Ngày lễ, Tết</label><input class="input" type="number" id="ot_rate_holiday" name="ot_rate_holiday" value="${esc(s.ot_rate_holiday)}"></div>
        <div class="help full">Mặc định theo Điều 98 Bộ luật Lao động 2019: tối thiểu 150%, 200%, 300%.</div>
      </div></section>
      <div class="row"><button class="btn primary">Lưu cài đặt</button><span class="form-error" role="alert" style="margin:0"></span></div>
    </form>`;
    const f = body.querySelector('#sf');
    body.querySelector('#here').onclick = () => {
      if (!navigator.geolocation) return toast('Trình duyệt không hỗ trợ định vị', 'err');
      navigator.geolocation.getCurrentPosition((p) => {
        f.office_lat.value = p.coords.latitude.toFixed(6); f.office_lng.value = p.coords.longitude.toFixed(6);
        toast(`Đã lấy vị trí (sai số khoảng ${Math.round(p.coords.accuracy)} m)`);
      }, (e) => toast('Không lấy được vị trí: ' + e.message, 'err'), { enableHighAccuracy: true, timeout: 10000 });
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = f.querySelector('.form-error'); err.textContent = '';
      const v = Object.fromEntries(new FormData(f).entries());
      try { await put('/settings', v); toast('Đã lưu cài đặt'); } catch (ex) { err.textContent = ex.message; }
    };
  };

  const audit = async () => {
    const rows = await get('/audit', { limit: 300 });
    body.innerHTML = `<section class="panel"><div class="panel-body flush table-wrap"><table class="tbl"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Chi tiết</th><th>IP</th></tr></thead>
      <tbody>${rows.map((a) => `<tr><td class="nowrap small">${fmtDT(a.ts)}</td><td>${a.full_name ? `${esc(a.full_name)} <span class="muted small">${esc(a.code)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="nowrap">${esc(ACTIONS[a.action] || a.action)}</td><td class="small muted" style="max-width:420px;word-break:break-word">${esc(a.detail && a.detail !== 'null' ? a.detail : '')}</td><td class="small nowrap">${esc(a.ip || '')}</td></tr>`).join('')}</tbody></table></div></section>
      <p class="muted small" style="margin-top:8px">300 thao tác gần nhất.</p>`;
  };

  const show = async () => {
    view.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    body.innerHTML = '<div class="loading">Đang tải…</div>';
    await (tab === 'audit' ? audit() : general());
  };
  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; show(); });
  void ctx;
  await show();
}
