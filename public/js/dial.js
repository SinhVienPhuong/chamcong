// Mặt đồng hồ 24 giờ: 00 ở đỉnh, kim giờ quay 1 vòng/ngày.
// Cung đồng thau = khung giờ ca; cung sáng = phần ca đã làm; chấm xanh = giờ vào, chấm vàng = giờ ra.
const C = 100;
const R_TICK = 92, R_ARC = 74, R_NUM = 60;
let uid = 0;

const polar = (deg, r) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const minToDeg = (m) => ((((m % 1440) + 1440) % 1440) / 1440) * 360;

function arcPath(m1, m2, r) {
  let span = m2 - m1;
  if (span <= 0) span += 1440;
  span = Math.min(span, 1439.9);
  const a1 = minToDeg(m1), a2 = a1 + (span / 1440) * 360;
  const [x1, y1] = polar(a1, r), [x2, y2] = polar(a2, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function dialSVG({ withShift = true, label = 'Đồng hồ' } = {}) {
  const id = 'brassGrad' + (++uid);
  let ticks = '';
  for (let i = 0; i < 96; i++) {
    const deg = (i / 96) * 360, hour = i % 4 === 0;
    const [x1, y1] = polar(deg, hour ? R_TICK - 7 : R_TICK - 3), [x2, y2] = polar(deg, R_TICK);
    ticks += `<line class="tick${hour ? ' h' : ''}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
  }
  let nums = '';
  for (let h = 0; h < 24; h += 3) {
    const [x, y] = polar((h / 24) * 360, R_NUM + (withShift ? 0 : 8));
    nums += `<text class="num" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${String(h).padStart(2, '0')}</text>`;
  }
  return `<svg class="dial" viewBox="0 0 200 200" role="img" aria-label="${label}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecd29d"/><stop offset="1" stop-color="#b08a4e"/></linearGradient></defs>
    <circle cx="100" cy="100" r="97" fill="rgba(255,255,255,.02)" stroke="rgba(255,255,255,.07)"/>
    ${ticks}${nums}
    ${withShift ? `<path class="shift-arc" d=""/><path class="done-arc" d="" style="stroke:url(#${id})"/><circle class="mark-in" r="4.2" cx="-20" cy="-20"/><circle class="mark-out" r="4.2" cx="-20" cy="-20"/>` : ''}
    <line class="hand-h" x1="100" y1="100" x2="100" y2="54"/>
    <line class="hand-m" x1="100" y1="112" x2="100" y2="24"/>
    <line class="hand-s" x1="100" y1="118" x2="100" y2="16"/>
    <circle class="pin" cx="100" cy="100" r="3.6"/>
  </svg>`;
}

/** Cập nhật kim và các cung. shift: {start, end} phút trong ngày; inMin/outMin: phút giờ vào/ra */
export function updateDial(svg, { now = new Date(), shift, inMin = null, outMin = null } = {}) {
  if (!svg) return;
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const set = (sel, deg) => svg.querySelector(sel)?.setAttribute('transform', `rotate(${deg.toFixed(2)} 100 100)`);
  set('.hand-h', minToDeg(mins));
  set('.hand-m', (now.getMinutes() + now.getSeconds() / 60) * 6);
  set('.hand-s', now.getSeconds() * 6);
  if (!shift) return;
  svg.querySelector('.shift-arc')?.setAttribute('d', arcPath(shift.start, shift.end, R_ARC));
  const done = svg.querySelector('.done-arc');
  if (done) {
    if (inMin == null) done.setAttribute('d', '');
    else {
      const endAt = outMin != null ? outMin : mins;
      done.setAttribute('d', ((endAt - inMin + 1440) % 1440) < 1 ? '' : arcPath(inMin, endAt, R_ARC));
    }
  }
  const place = (sel, m) => {
    const el = svg.querySelector(sel); if (!el) return;
    if (m == null) { el.setAttribute('cx', -20); el.setAttribute('cy', -20); return; }
    const [x, y] = polar(minToDeg(m), R_ARC); el.setAttribute('cx', x.toFixed(2)); el.setAttribute('cy', y.toFixed(2));
  };
  place('.mark-in', inMin); place('.mark-out', outMin);
}

export const hmToMin = (s) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
