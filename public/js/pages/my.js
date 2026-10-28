import { get } from '../api.js';
import { esc, icon, WD, monthStr, todayStr, num, mins, wdOf, LEAVE } from '../ui.js';
import { showDayDetail, newRequest, adjustPrefill } from './shared.js';

const FLAG = { late: 'Muộn', early: 'Về sớm', late_early: 'Muộn, sớm', partial: 'Thiếu giờ', missing: 'Thiếu chấm', absent: 'Vắng', working: 'Đang làm' };

export async function render(view, ctx, params) {
  let month = params.get('month') || monthStr();
  const userId = params.get('user_id');
  const self = !userId || +userId === ctx.me.id;

  const load = async () => {
    const data = await get('/attendance/month', { month, user_id: userId });
    const s = data.summary;
    const [y, m] = month.split('-').map(Number);
    const first = wdOf(`${month}-01`);
    const lead = (first + 6) % 7; // tuần bắt đầu thứ 2
    const today = todayStr();
    view.innerHTML = `
      <div class="page-head"><div><h1>${self ? 'Công của tôi' : esc(data.user.full_name)}</h1><div class="sub">${self ? 'Lịch công theo tháng. Chọn một ngày để xem chi tiết hoặc gửi giải trình.' : `Mã ${esc(data.user.code)}`}</div></div>
        <div class="actions">
          <button class="btn" data-m="-1" aria-label="Tháng trước">‹</button>
          <input type="month" class="input" id="mm" value="${month}" style="width:auto">
          <button class="btn" data-m="1" aria-label="Tháng sau">›</button>
          ${self ? `<button class="btn primary" id="adj">${icon('plus')} Giải trình</button>` : ''}
        </div></div>
      <div class="stats" style="margin-bottom:18px">
        <div class="stat tone-ok"><div class="l">Công thực tế / chuẩn</div><div class="v">${num(s.workUnits)}<small> / ${num(s.stdUnits)}</small></div></div>
        <div class="stat tone-brass"><div class="l">Tổng công hưởng lương</div><div class="v">${num(s.totalPaidUnits)}</div></div>
        <div class="stat tone-late"><div class="l">Đi muộn</div><div class="v">${s.lateCount}<small> lần, ${mins(s.lateMin) || '0 phút'}</small></div></div>
        <div class="stat tone-leave"><div class="l">Ngày nghỉ phép</div><div class="v">${num(s.paidLeaveUnits + s.sickUnits + s.unpaidUnits, 1)}<small> còn ${num(data.leave.remaining, 1)} phép năm</small></div></div>
        <div class="stat tone-absent"><div class="l">Vắng, thiếu chấm</div><div class="v">${s.absentDays + s.missingDays}</div></div>
        <div class="stat"><div class="l">Tăng ca được tính</div><div class="v">${num(s.ot.weekday + s.ot.weekend + s.ot.holiday, 1)}<small> giờ</small></div></div>
      </div>
      <section class="panel"><div class="panel-body">
        <div class="cal">
          ${[1, 2, 3, 4, 5, 6, 0].map((i) => `<div class="cal-h">${WD[i]}</div>`).join('')}
          ${'<div class="cal-d blank"></div>'.repeat(lead)}
          ${data.days.map((d, i) => {
            const flag = d.holiday ? `<span class="flag st-holiday">${esc(d.holiday)}</span>`
              : d.leaveType ? `<span class="flag st-leave">${esc(LEAVE[d.leaveType])}${d.leaveUnits === 0.5 ? ' ½' : ''}</span>`
              : FLAG[d.status] ? `<span class="flag st-${d.status}">${FLAG[d.status]}</span>` : '';
            return `<button class="cal-d s-${d.status}${d.date === today ? ' today' : ''}" data-i="${i}">
              <span class="n"><span>${+d.date.slice(8)}</span>${d.workUnits ? `<span class="muted small">${num(d.workUnits)}</span>` : ''}</span>
              ${d.checkIn ? `<span class="tm">${d.checkIn}${d.checkOut ? ' – ' + d.checkOut : ''}</span>` : ''}
              ${flag}</button>`;
          }).join('')}
        </div>
      </div></section>`;
    view.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { const d = new Date(y, m - 1 + +b.dataset.m, 1); month = monthStr(d); load(); });
    view.querySelector('#mm').onchange = (e) => { if (e.target.value) { month = e.target.value; load(); } };
    view.querySelector('#adj')?.addEventListener('click', () => newRequest('adjust'));
    view.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => showDayDetail(data.days[+b.dataset.i], self ? null : data.user, {
      canAdjust: self, onAdjust: (d) => newRequest('adjust', adjustPrefill(d)),
    }));
  };
  await load();
}
