// Kiểm tra IP theo CIDR (IPv4) và khoảng cách GPS
function normIp(ip) {
  if (!ip) return '';
  ip = String(ip).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}
function ipToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
  return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3];
}
function parseCidrList(text) {
  return String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}
function ipInCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = bitsStr === undefined ? 32 : parseInt(bitsStr, 10);
  const a = ipToInt(normIp(ip)), b = ipToInt(base);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
const ipAllowed = (ip, list) => parseCidrList(list).some((c) => ipInCidr(ip, c));
const isValidCidr = (c) => { const [b, bits] = c.split('/'); return ipToInt(b) !== null && (bits === undefined || (/^\d+$/.test(bits) && +bits <= 32)); };

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = { normIp, ipAllowed, isValidCidr, parseCidrList, distanceMeters };
