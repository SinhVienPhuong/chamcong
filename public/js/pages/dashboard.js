import { get, post } from '../api.js';
import { esc, icon, toast, statusBadge, WD_LONG, pad, todayStr, num, mins, fmtDate, LEAVE, KIND, REQ_STATUS, SOURCE, emptyState } from '../ui.js';

let timer = null;

export async function render(view, ctx) {
  clearInterval(timer);
  const me = ctx.me;
  const mgr = ctx.isManager();
  view.innerHTML = `
    <div class="page-head"><div><h1>Xin chào, ${esc(me.full_name)}</h1>
      <div class="sub">${esc(WD_LONG[new Date().getDay()])}, ${fmtDate(todayStr())}${me.shift_name ? `. Ca ${esc(me.shift_name)} ${esc(me.start_time)}–${esc(me.end_time)}` : ''}</div></div></div>
    <div class="${me.track_attendance ? 'grid-main' : ''}">
      ${me.track_attendance ? '<div class="stack" id="left"></div>' : ''}
      <div class="stack" id="right"><div class="loading">Đang tải…</div></div>
    </div>`;
  if (me.track_attendance) renderTimecard(view.querySelector('#left'), ctx);
  if (mgr) renderTeam(view.querySelector('#right'), ctx);
  else renderMine(view.querySelector('#right'), ctx);
}

// ---------- Thẻ chấm công ----------
async function renderTimecard(el, ctx) {
  const me = ctx.me;
  el.innerHTML = `
  <section class="timecard" aria-label="Chấm công hôm nay">
    <div class="timecard-top">
      <div class="timecard-date" id="tc-date"></div>
      <div class="clock" id="tc-clock" aria-live="off"></div>
      <div class="timecard-shift" id="tc-shift"></div>
      ${me.allow_web_checkin ? `<button class="punch" id="tc-punch" disabled>${icon('clock')}<span>Đang kiểm tra…</span></button>
        <div class="punch-note" id="tc-note"></div>` : `<div class="punch-note">Bạn chấm công bằng máy chấm công tại công ty. Thẻ bên dưới cập nhật sau mỗi lần đồng bộ máy.</div>`}
    </div>
    <div class="strip" id="tc-strip"></div>
  </section>`;
  const tick = () => {
    const d = new Date();
    const c = el.querySelector('#tc-clock'); if (!c) { clearInterval(timer); return; }
    c.innerHTML = `${pad(d.getHours())}:${pad(d.getMinutes())}<span class="sec">${pad(d.getSeconds())}</span>`;
    el.querySelector('#tc-date').textContent = `${WD_LONG[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  tick(); timer = setInterval(tick, 1000);

  let today;
  const paint = (stamp = false) => {
    const t = today;
    el.querySelector('#tc-shift').textContent = t.holiday ? `Hôm nay nghỉ lễ: ${t.holiday}` : !t.isWorkday ? 'Hôm nay là ngày nghỉ theo lịch ca'
      : `Ca ${t.shift}: ${t.plannedIn} – ${t.plannedOut}${t.isHalfDay ? ' (làm nửa ngày)' : ''}`;
    const rows = [
      ['Giờ vào', t.checkIn, t.lateMin ? `<span class="badge st st-late">Muộn ${mins(t.lateMin)}</span>` : (t.checkIn ? '<span class="badge st st-ok">Đúng giờ</span>' : '')],
      ['Giờ ra', t.checkOut, t.earlyMin ? `<span class="badge st st-late">Sớm ${mins(t.earlyMin)}</span>` : (t.checkOut && t.otActualMin >= 30 ? `<span class="badge">Ở lại ${mins(t.otActualMin)}</span>` : '')],
    ];
    el.querySelector('#tc-strip').innerHTML = rows.map(([k, v, extra], i) =>
      `<div class="strip-row"><div class="k">${k}</div><div class="t ${v ? '' : 'blank'} ${stamp && i === (t.checkOut ? 1 : 0) ? 'stamp' : ''}">${v || '--:--'}</div><div>${extra}</div></div>`).join('')
      + (t.punches.length > 2 ? `<div class="muted small" style="padding-top:8px">Tất cả lần chấm: ${t.punches.join(', ')}</div>` : '')
      + (t.leaveType ? `<div class="callout" style="margin-top:10px">Hôm nay bạn có đơn ${esc(LEAVE[t.leaveType])}${t.leaveUnits === 0.5 ? ' nửa ngày' : ''}.</div>` : '');
    const btn = el.querySelector('#tc-punch');
    if (btn) {
      btn.disabled = false;
      const out = !!t.checkIn;
      btn.classList.toggle('out', out);
      btn.querySelector('span').textContent = out ? (t.checkOut ? 'Cập nhật giờ ra' : 'Chấm công ra') : 'Chấm công vào';
    }
  };
  try { today = await get('/attendance/today'); paint(); } catch (e) { el.querySelector('#tc-strip').innerHTML = `<div class="muted">${esc(e.message)}</div>`; return; }

  const btn = el.querySelector('#tc-punch');
  if (!btn) return;
  btn.onclick = async () => {
    const note = el.querySelector('#tc-note');
    btn.disabled = true; note.className = 'punch-note'; note.textContent = 'Đang lấy vị trí…';
    const pos = await getPosition();
    note.textContent = 'Đang gửi…';
    try {
      const r = await post('/attendance/checkin', pos || {});
      today = r.today; paint(true);
      note.textContent = `Đã ghi nhận lúc ${r.time}`;
      toast(`Chấm công thành công lúc ${r.time}`);
    } catch (e) {
      note.className = 'punch-note err'; note.textContent = e.message; btn.disabled = false;
    }
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
  el.innerHTML = `
    <section class="panel"><div class="panel-head"><h2>Tháng này</h2><div class="actions"><a class="btn sm" href="#/my">Xem chi tiết</a></div></div>
      <div class="panel-body"><div class="stats">
        <div class="stat tone-ok"><div class="v">${num(s.workUnits)}<small> / ${num(s.stdUnits)}</small></div><div class="l">Công thực tế / chuẩn</div></div>
        <div class="stat tone-late"><div class="v">${s.lateCount}</div><div class="l">Lần đi muộn (${mins(s.lateMin) || '0 phút'})</div></div>
        <div class="stat tone-leave"><div class="v">${num(m.leave.remaining, 1)}</div><div class="l">Ngày phép còn lại</div></div>
        <div class="stat"><div class="v">${num(s.ot.weekday + s.ot.weekend + s.ot.holiday, 1)}</div><div class="l">Giờ tăng ca được tính</div></div>
      </div>
      ${s.missingDays ? `<div class="callout warn" style="margin-top:14px">Bạn có ${s.missingDays} ngày thiếu giờ vào/ra. <a href="#/my">Mở lịch công</a> và gửi giải trình để được tính công.</div>` : ''}
      </div></section>
    <section class="panel"><div class="panel-head"><h2>Đơn gần đây</h2><div class="actions"><a class="btn sm primary" href="#/requests?new=leave">${icon('plus')} Tạo đơn</a></div></div>
      <div class="panel-body flush">${reqs.length ? `<table class="tbl"><tbody>${reqs.slice(0, 6).map((r) => `
        <tr><td>${esc(KIND[r.kind])}${r.leave_type ? `: ${esc(LEAVE[r.leave_type])}` : ''}</td>
        <td class="nowrap">${fmtDate(r.date_from)}${r.date_to !== r.date_from ? ' – ' + fmtDate(r.date_to) : ''}</td>
        <td class="right">${statusBadge(r.status, REQ_STATUS[r.status])}</td></tr>`).join('')}</tbody></table>` : emptyState('Chưa có đơn nào', 'Đơn nghỉ phép, tăng ca và giải trình sẽ hiện ở đây.')}</div></section>`;
}

// ---------- Quản lý: tình hình hôm nay ----------
async function renderTeam(el, ctx) {
  const d = await get('/reports/dashboard');
  const s = d.stats;
  const max = Math.max(1, ...d.trend.map((t) => t.scheduled));
  const person = (p, extra) => `<tr><td><div class="person">${esc(p.full_name)}<span class="code">${esc(p.code)}${p.department_name ? ', ' + esc(p.department_name) : ''}</span></div></td><td class="right nowrap">${extra}</td></tr>`;
  el.innerHTML = `
    ${d.holiday ? `<div class="callout">Hôm nay là ngày lễ: ${esc(d.holiday)}.</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="v">${s.present}<small> / ${s.scheduled}</small></div><div class="l">Đã chấm công / có lịch làm</div></div>
      <div class="stat tone-late"><div class="v">${s.late}</div><div class="l">Đi muộn</div></div>
      <div class="stat tone-leave"><div class="v">${s.leave}</div><div class="l">Nghỉ phép</div></div>
      <div class="stat tone-absent"><div class="v">${s.absent}<small>${s.notYet ? ` +${s.notYet} chưa đến ca` : ''}</small></div><div class="l">Vắng không phép</div></div>
    </div>
    <section class="panel"><div class="panel-head"><h2>14 ngày gần nhất</h2><div class="actions"><span class="legend" style="margin:0"><span><i style="background:var(--primary)"></i>Đi làm</span><span><i style="background:var(--st-late)"></i>Đi muộn</span></span></div></div>
      <div class="panel-body"><div class="bars">${d.trend.map((t) => `
        <div class="bar ${t.scheduled ? '' : 'off'}" title="${fmtDate(t.date)}: ${t.present}/${t.scheduled} đi làm, ${t.late} muộn">
          <div class="b-late" style="height:${(t.late / max) * 100}%"></div>
          <div class="b-present" style="height:${t.scheduled ? ((t.present - t.late) / max) * 100 : 4}%"></div>
          <div class="lbl">${t.date.slice(8)}</div></div>`).join('')}</div></div></section>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>Đi muộn hôm nay</h2></div><div class="panel-body flush">
        ${d.late.length ? `<table class="tbl"><tbody>${d.late.map((p) => person(p, `${p.checkIn} <span class="badge st st-late">+${mins(p.lateMin)}</span>`)).join('')}</tbody></table>` : emptyState('Không ai đi muộn')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Chưa chấm công</h2></div><div class="panel-body flush">
        ${d.absentees.length ? `<table class="tbl"><tbody>${d.absentees.slice(0, 15).map((p) => person(p, `<span class="muted small">Ca ${p.plannedIn}</span>`)).join('')}</tbody></table>${d.absentees.length > 15 ? `<div class="muted small" style="padding:8px 12px">và ${d.absentees.length - 15} người khác</div>` : ''}` : emptyState('Tất cả đã chấm công')}</div></section>
    </div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>Nghỉ phép hôm nay</h2></div><div class="panel-body flush">
        ${d.onLeave.length ? `<table class="tbl"><tbody>${d.onLeave.map((p) => person(p, statusBadge('leave', LEAVE[p.leaveType]))).join('')}</tbody></table>` : emptyState('Không ai nghỉ')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Lượt chấm gần nhất</h2><div class="actions"><a class="btn sm" href="#/logs">Tất cả</a></div></div><div class="panel-body flush">
        ${d.recent.length ? `<table class="tbl"><tbody>${d.recent.map((r) => `<tr><td><div class="person">${esc(r.full_name)}<span class="code">${esc(r.code)}</span></div></td><td class="nowrap"><strong>${r.ts.slice(11, 16)}</strong></td><td class="right"><span class="badge">${esc(SOURCE[r.source])}</span></td></tr>`).join('')}</tbody></table>` : emptyState('Chưa có lượt chấm nào hôm nay')}</div></section>
    </div>`;
  ctx.refreshBadge();
}
