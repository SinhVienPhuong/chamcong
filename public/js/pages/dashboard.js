import { get, post } from '../api.js';
import { esc, icon, toast, statusBadge, WD_LONG, todayStr, num, mins, fmtDate, LEAVE, KIND, REQ_STATUS, SOURCE, emptyState, sparkline, donut } from '../ui.js';
import { dialSVG, updateDial, hmToMin } from '../dial.js';

let timer = null;

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

export async function render(view, ctx) {
  clearInterval(timer);
  const me = ctx.me;
  const mgr = ctx.isManager();
  const tracked = !!me.track_attendance;
  view.innerHTML = `
    <div class="page-head"><div><h1>${greeting()}, ${esc(me.full_name)}</h1>
      <div class="sub">${esc(WD_LONG[new Date().getDay()])}, ${fmtDate(todayStr())}${tracked && me.shift_name ? `. Ca ${esc(me.shift_name)}, ${esc(me.start_time)}–${esc(me.end_time)}` : ''}</div></div>
      ${mgr ? `<div class="actions"><a class="btn" href="#/timesheet">${icon('grid')} Bảng công</a><a class="btn primary" href="#/requests?tab=approve">${icon('check')} Duyệt đơn</a></div>` : ''}</div>
    <div class="${tracked ? 'grid-main' : ''}">
      ${tracked ? '<div class="stack" id="left"></div>' : ''}
      <div class="stack" id="right"><div class="loading">Đang tải…</div></div>
    </div>`;
  if (tracked) renderTimecard(view.querySelector('#left'), ctx);
  if (mgr) await renderTeam(view.querySelector('#right'), ctx);
  else await renderMine(view.querySelector('#right'));
}

// ---------- Mặt đồng hồ ca làm ----------
async function renderTimecard(el, ctx) {
  const me = ctx.me;
  el.innerHTML = `
  <section class="timecard" aria-label="Chấm công hôm nay">
    <div class="tc-top"><div class="tc-date" id="tc-date"></div><div class="tc-shift" id="tc-shift"></div></div>
    <div class="dial-wrap">${dialSVG({ label: 'Đồng hồ ca làm hôm nay' })}</div>
    <div class="dial-readout"><div class="dial-time" id="tc-clock"></div><div class="dial-state" id="tc-state"></div></div>
    ${me.allow_web_checkin ? `<div class="tc-actions"><button class="punch" id="tc-punch" disabled>${icon('clock')}<span>Đang kiểm tra…</span></button>
      <div class="punch-note" id="tc-note" aria-live="polite"></div></div>`
      : '<div class="tc-device">Bạn chấm công bằng máy chấm công tại công ty. Giờ vào ra cập nhật sau mỗi lần đồng bộ máy.</div>'}
    <div class="tc-strip" id="tc-strip"></div>
    <div class="tc-extra" id="tc-extra"></div>
  </section>`;
  const svg = el.querySelector('svg.dial');
  let today = null;
  const pad = (n) => String(n).padStart(2, '0');

  const tick = () => {
    const d = new Date();
    const c = el.querySelector('#tc-clock'); if (!c) { clearInterval(timer); return; }
    c.innerHTML = `${pad(d.getHours())}:${pad(d.getMinutes())}<span class="sec">${pad(d.getSeconds())}</span>`;
    el.querySelector('#tc-date').textContent = `${WD_LONG[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    const t = today;
    const shift = t && (t.isWorkday || t.leaveType) ? { start: hmToMin(t.plannedIn), end: hmToMin(t.plannedOut) } : null;
    updateDial(svg, { now: d, shift, inMin: hmToMin(t?.checkIn), outMin: hmToMin(t?.checkOut) });
  };

  const stateText = (t) => {
    if (t.holiday) return `Nghỉ lễ: ${t.holiday}`;
    if (!t.isWorkday && !t.checkIn) return 'Hôm nay là ngày nghỉ';
    if (!t.checkIn) {
      const now = new Date(), start = hmToMin(t.plannedIn), cur = now.getHours() * 60 + now.getMinutes();
      const diff = start - cur;
      return diff > 0 && diff < 600 ? `Còn ${mins(diff)} đến giờ vào ca` : 'Chưa chấm công';
    }
    if (!t.checkOut) return `Đã làm ${mins(Math.max(0, (new Date().getHours() * 60 + new Date().getMinutes()) - hmToMin(t.checkIn))) || '0 phút'}`;
    return `Đã làm ${mins(t.workMin) || '0 phút'} tính công`;
  };

  const paint = (stamp = false) => {
    const t = today;
    el.querySelector('#tc-shift').textContent = t.holiday ? 'Ngày lễ' : t.isWorkday ? `Ca ${t.shift}  ${t.plannedIn}–${t.plannedOut}${t.isHalfDay ? ', nửa ngày' : ''}` : 'Ngày nghỉ';
    el.querySelector('#tc-state').textContent = stateText(t);
    const cell = (k, color, v, extra, cls, st) => `<div class="tc-cell"><div class="k"><i style="background:${color}"></i>${k}</div>
      <div class="t ${v ? '' : 'blank'} ${st ? 'stamp' : ''}">${v || '--:--'}</div><div class="x ${cls}">${extra}</div></div>`;
    el.querySelector('#tc-strip').innerHTML =
      cell('Giờ vào', '#5ed0a0', t.checkIn, t.lateMin ? `Muộn ${mins(t.lateMin)}` : t.checkIn ? 'Đúng giờ' : '', t.lateMin ? 'warn' : 'good', stamp && !t.checkOut)
      + cell('Giờ ra', '#f0c35a', t.checkOut, t.earlyMin ? `Sớm ${mins(t.earlyMin)}` : t.checkOut && t.otActualMin >= 30 ? `Ở lại ${mins(t.otActualMin)}` : '', t.earlyMin ? 'warn' : 'good', stamp && !!t.checkOut);
    el.querySelector('#tc-extra').innerHTML = (t.punches.length > 2 ? `Tất cả lần chấm: ${t.punches.join(', ')}` : '')
      + (t.leaveType ? `<div class="note">Hôm nay bạn có đơn ${esc(LEAVE[t.leaveType])}${t.leaveUnits === 0.5 ? ' nửa ngày' : ''}.</div>` : '');
    const btn = el.querySelector('#tc-punch');
    if (btn) {
      btn.disabled = false;
      const out = !!t.checkIn;
      btn.classList.toggle('out', out);
      btn.querySelector('span').textContent = out ? (t.checkOut ? 'Cập nhật giờ ra' : 'Chấm công ra') : 'Chấm công vào';
    }
    tick();
  };

  tick(); timer = setInterval(tick, 1000);
  try { today = await get('/attendance/today'); paint(); } catch (e) { el.querySelector('#tc-extra').textContent = e.message; return; }

  const btn = el.querySelector('#tc-punch');
  if (!btn) return;
  btn.onclick = async () => {
    const note = el.querySelector('#tc-note');
    btn.disabled = true; note.className = 'punch-note'; note.textContent = 'Đang xác định vị trí…';
    const pos = await getPosition();
    note.textContent = 'Đang ghi nhận…';
    try {
      const r = await post('/attendance/checkin', pos || {});
      today = r.today; paint(true);
      note.textContent = `Đã ghi nhận lúc ${r.time}`;
      toast(`Chấm công thành công lúc ${r.time}`);
    } catch (e) { note.className = 'punch-note err'; note.textContent = e.message; btn.disabled = false; }
  };
}

function getPosition() {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
}

// ---------- Nhân viên: tóm tắt tháng ----------
async function renderMine(el) {
  const [m, reqs] = await Promise.all([get('/attendance/month'), get('/requests', { scope: 'mine' })]);
  const s = m.summary;
  const pct = s.stdUnits ? Math.min(100, Math.round((s.workUnits / s.stdUnits) * 100)) : 0;
  el.innerHTML = `
    <div class="stats">
      <div class="stat tone-ok"><div class="l">Công tháng này</div><div class="v">${num(s.workUnits)}<small> / ${num(s.stdUnits)}</small></div></div>
      <div class="stat tone-late"><div class="l">Đi muộn</div><div class="v">${s.lateCount}<small> lần, ${mins(s.lateMin) || '0 phút'}</small></div></div>
      <div class="stat tone-leave"><div class="l">Phép năm còn lại</div><div class="v">${num(m.leave.remaining, 1)}<small> / ${num(m.leave.quota, 1)} ngày</small></div></div>
      <div class="stat tone-brass"><div class="l">Tăng ca được tính</div><div class="v">${num(s.ot.weekday + s.ot.weekend + s.ot.holiday, 1)}<small> giờ</small></div></div>
    </div>
    <section class="panel"><div class="panel-head"><h2>Tiến độ công tháng</h2><span class="hint">${pct}% công chuẩn</span><div class="actions"><a class="btn sm" href="#/my">Xem lịch công</a></div></div>
      <div class="panel-body">
        <div class="dept-bars"><div class="r" style="grid-template-columns:1fr 60px"><div class="track" style="height:10px"><span style="width:${pct}%;background:linear-gradient(90deg,var(--primary-2),var(--primary))"></span></div><b class="right">${num(s.totalPaidUnits)}</b></div></div>
        <p class="muted small" style="margin-top:10px">Tổng công hưởng lương ${num(s.totalPaidUnits)} = công thực tế ${num(s.workUnits)} + phép có lương ${num(s.paidLeaveUnits)} + lễ ${num(s.holidayUnits)}.</p>
        ${s.missingDays ? `<div class="callout warn" style="margin-top:12px">Bạn có ${s.missingDays} ngày thiếu giờ vào hoặc ra. <a href="#/my">Mở lịch công</a> và gửi giải trình để được tính công.</div>` : ''}
      </div></section>
    <section class="panel"><div class="panel-head"><h2>Đơn gần đây</h2><div class="actions"><a class="btn sm primary" href="#/requests?new=leave">${icon('plus')} Tạo đơn</a></div></div>
      <div class="panel-body flush">${reqs.length ? `<table class="tbl"><tbody>${reqs.slice(0, 6).map((r) => `
        <tr><td><strong>${esc(KIND[r.kind])}</strong>${r.leave_type ? `<div class="muted small">${esc(LEAVE[r.leave_type])}</div>` : ''}</td>
        <td class="nowrap">${fmtDate(r.date_from)}${r.date_to !== r.date_from ? ' – ' + fmtDate(r.date_to) : ''}</td>
        <td class="right">${statusBadge(r.status, REQ_STATUS[r.status])}</td></tr>`).join('')}</tbody></table>`
        : emptyState('Chưa có đơn nào', 'Đơn nghỉ phép, tăng ca và giải trình sẽ hiện ở đây.', 'doc')}</div></section>`;
}

// ---------- Quản lý: tình hình hôm nay ----------
async function renderTeam(el, ctx) {
  const d = await get('/reports/dashboard');
  const s = d.stats;
  const max = Math.max(1, ...d.trend.map((t) => t.scheduled));
  const presentSeries = d.trend.filter((t) => t.scheduled).map((t) => t.present);
  const lateSeries = d.trend.filter((t) => t.scheduled).map((t) => t.late);
  const rate = s.scheduled ? Math.round((s.present / s.scheduled) * 100) : 0;
  const onTime = Math.max(0, s.present - s.late);
  const person = (p, extra) => `<tr><td><div class="person">${esc(p.full_name)}<span class="code">${esc(p.code)}${p.department_name ? ', ' + esc(p.department_name) : ''}</span></div></td><td class="right nowrap">${extra}</td></tr>`;
  const today = todayStr();
  el.innerHTML = `
    ${d.holiday ? `<div class="callout brass">Hôm nay là ngày lễ: ${esc(d.holiday)}.</div>` : ''}
    <div class="stats">
      <div class="stat tone-ok"><div class="l">Đã chấm công</div><div class="v">${s.present}<small> / ${s.scheduled}</small></div>${sparkline(presentSeries, 'var(--st-ok)')}</div>
      <div class="stat tone-late"><div class="l">Đi muộn</div><div class="v">${s.late}</div>${sparkline(lateSeries, 'var(--st-late)')}</div>
      <div class="stat tone-leave"><div class="l">Nghỉ phép</div><div class="v">${s.leave}</div></div>
      <div class="stat tone-absent"><div class="l">Vắng không phép</div><div class="v">${s.absent}${s.notYet ? `<small> +${s.notYet} chưa đến ca</small>` : ''}</div></div>
    </div>
    <div class="grid-3">
      <section class="panel"><div class="panel-head"><h2>14 ngày gần nhất</h2>
        <div class="actions"><span class="legend" style="margin:0"><span><i style="background:var(--primary)"></i>Đúng giờ</span><span><i style="background:var(--brass)"></i>Đi muộn</span></span></div></div>
        <div class="panel-body"><div class="bars">${d.trend.map((t) => `
          <div class="bar ${t.scheduled ? '' : 'off'} ${t.date === today ? 'today' : ''}" title="${fmtDate(t.date)}: ${t.present}/${t.scheduled} đi làm, ${t.late} muộn">
            <div class="col"><div class="b-late" style="height:${(t.late / max) * 100}%"></div><div class="b-present" style="height:${t.scheduled ? (Math.max(0, t.present - t.late) / max) * 100 : 0}%"></div></div>
            <div class="lbl">${t.date.slice(8)}</div></div>`).join('')}</div></div></section>
      <section class="panel"><div class="panel-head"><h2>Hôm nay</h2><span class="hint">${s.total} nhân viên</span></div>
        <div class="panel-body"><div class="donut-wrap">
          ${donut([{ value: onTime, color: 'var(--primary)' }, { value: s.late, color: 'var(--brass)' }, { value: s.leave, color: 'var(--st-leave)' }, { value: s.absent + s.notYet, color: 'var(--line-2)' }], rate + '%', 'có mặt')}
          <div class="legend-list">
            <div><i style="background:var(--primary)"></i>Đúng giờ<b>${onTime}</b></div>
            <div><i style="background:var(--brass)"></i>Đi muộn<b>${s.late}</b></div>
            <div><i style="background:var(--st-leave)"></i>Nghỉ phép<b>${s.leave}</b></div>
            <div><i style="background:var(--line-2)"></i>Chưa chấm<b>${s.absent + s.notYet}</b></div>
          </div></div></div></section>
    </div>
    ${d.departments.length > 1 ? `<section class="panel"><div class="panel-head"><h2>Theo phòng ban</h2><span class="hint">Có mặt / có lịch làm hôm nay</span></div>
      <div class="panel-body"><div class="dept-bars">${d.departments.map((p) => {
        const w = p.scheduled ? (p.present / p.scheduled) * 100 : 0, lw = p.scheduled ? (p.late / p.scheduled) * 100 : 0;
        return `<div class="r"><span class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
          <div class="track"><span style="width:${w - lw}%;background:var(--primary)"></span><span style="width:${lw}%;background:var(--brass)"></span></div>
          <b class="right">${p.present}/${p.scheduled}</b></div>`;
      }).join('')}</div></div></section>` : ''}
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>Đi muộn hôm nay</h2></div><div class="panel-body flush">
        ${d.late.length ? `<table class="tbl"><tbody>${d.late.map((p) => person(p, `<strong>${p.checkIn}</strong> <span class="badge st st-late">+${mins(p.lateMin)}</span>`)).join('')}</tbody></table>` : emptyState('Không ai đi muộn', '', 'ok')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Chưa chấm công</h2></div><div class="panel-body flush">
        ${d.absentees.length ? `<table class="tbl"><tbody>${d.absentees.slice(0, 12).map((p) => person(p, `<span class="muted small">Ca ${p.plannedIn}</span>`)).join('')}</tbody></table>${d.absentees.length > 12 ? `<div class="muted small" style="padding:10px 14px">và ${d.absentees.length - 12} người khác</div>` : ''}` : emptyState('Tất cả đã chấm công', '', 'ok')}</div></section>
    </div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>Nghỉ phép hôm nay</h2></div><div class="panel-body flush">
        ${d.onLeave.length ? `<table class="tbl"><tbody>${d.onLeave.map((p) => person(p, statusBadge('leave', LEAVE[p.leaveType]))).join('')}</tbody></table>` : emptyState('Không ai nghỉ', '', 'cal')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Lượt chấm gần nhất</h2><div class="actions"><a class="btn sm" href="#/logs">Xem tất cả</a></div></div><div class="panel-body flush">
        ${d.recent.length ? `<table class="tbl"><tbody>${d.recent.map((r) => `<tr><td><div class="person">${esc(r.full_name)}<span class="code">${esc(r.code)}</span></div></td><td class="nowrap"><strong>${r.ts.slice(11, 16)}</strong></td><td class="right"><span class="badge">${esc(SOURCE[r.source])}</span></td></tr>`).join('')}</tbody></table>` : emptyState('Chưa có lượt chấm nào hôm nay', '', 'clock')}</div></section>
    </div>`;
  ctx.refreshBadge();
}
