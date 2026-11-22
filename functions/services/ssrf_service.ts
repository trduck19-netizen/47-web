/**
 * functions/services/ssrf_service.ts
 *
 * Dịch vụ bảo vệ SSRF, Cloudflare DoH DNS Rebinding Guard và kiểm định Magic Bytes:
 * - Chặn 100% dải IP nội bộ / private / loopback / link-local / CGNAT / documentation / broadcast.
 * - Hỗ trợ phân tích mọi định dạng IPv4: dot-decimal, octal, hex, dword/integer, 2-part, 3-part.
 * - Hỗ trợ IPv6: loopback (::1), link-local (fe80::/10), ULA (fc00::/7), documentation (2001:db8::/32), IPv4-mapped IPv6 (::ffff:...).
 * - Phân giải DNS hai ngăn xếp qua Cloudflare DoH (A + AAAA), đệ quy theo dõi CNAME (tối đa 3 hops).
 * - Xác thực Magic Bytes nhị phân định dạng ảnh thật (WebP, JPEG, PNG, GIF, AVIF).
 */

// Bảng danh mục dải IPv4 đặc biệt bị chặn theo tiêu chuẩn IANA / IETF
export const BLOCKED_IPV4_RANGES = [
  { cidr: '0.0.0.0/8', name: 'Current network (this host on this network)', rfc: 'RFC 1122' },
  { cidr: '10.0.0.0/8', name: 'Private-Use Networks', rfc: 'RFC 1918' },
  { cidr: '100.64.0.0/10', name: 'Shared Address Space / Carrier-Grade NAT (CGNAT)', rfc: 'RFC 6598' },
  { cidr: '127.0.0.0/8', name: 'Loopback', rfc: 'RFC 1122' },
  { cidr: '169.254.0.0/16', name: 'Link-Local / Cloud Metadata (AWS/GCP/Azure)', rfc: 'RFC 3927' },
  { cidr: '172.16.0.0/12', name: 'Private-Use Networks', rfc: 'RFC 1918' },
  { cidr: '192.0.0.0/24', name: 'IETF Protocol Assignments', rfc: 'RFC 6890' },
  { cidr: '192.0.2.0/24', name: 'TEST-NET-1 Documentation', rfc: 'RFC 5737' },
  { cidr: '192.168.0.0/16', name: 'Private-Use Networks', rfc: 'RFC 1918' },
  { cidr: '198.51.100.0/24', name: 'TEST-NET-2 Documentation', rfc: 'RFC 5737' },
  { cidr: '203.0.113.0/24', name: 'TEST-NET-3 Documentation', rfc: 'RFC 5737' },
  { cidr: '224.0.0.0/4', name: 'Multicast', rfc: 'RFC 5771' },
  { cidr: '240.0.0.0/4', name: 'Reserved for Future Use', rfc: 'RFC 1112' },
  { cidr: '255.255.255.255/32', name: 'Limited Broadcast', rfc: 'RFC 919' },
];

export const BLOCKED_IPV6_RANGES = [
  { cidr: '::1/128', name: 'IPv6 Loopback', rfc: 'RFC 4291' },
  { cidr: '::/128', name: 'IPv6 Unspecified address', rfc: 'RFC 4291' },
  { cidr: 'fe80::/10', name: 'Link-Local Unicast', rfc: 'RFC 4291' },
  { cidr: 'fc00::/7', name: 'Unique Local Address (ULA - fc00::/8 & fd00::/8)', rfc: 'RFC 4193' },
  { cidr: 'ff00::/8', name: 'Multicast', rfc: 'RFC 4291' },
  { cidr: '2001:db8::/32', name: 'Documentation', rfc: 'RFC 3849' },
  { cidr: '::ffff:0:0/96', name: 'IPv4-mapped IPv6 Address', rfc: 'RFC 4291' },
];

/**
 * Phân tích chuỗi IPv4 sang số nguyên không dấu 32-bit theo chuẩn inet_aton:
 * Hỗ trợ các định dạng: decimal (127.0.0.1), octal (0177.0.0.1, 017700000001), hex (0x7f.0.0.1, 0x7f000001),
 * dword (2130706433), 2-part (127.1), 3-part (127.0.1).
 */
export function parseIpv4ToNumber(ipStr: string): number | null {
  if (typeof ipStr !== 'string') return null;
  const str = ipStr.trim();
  if (!str) return null;

  const parts = str.split('.');

  function parsePart(p: string): number | null {
    p = p.trim();
    if (!p) return null;
    // Hex: 0x...
    if (p.startsWith('0x') || p.startsWith('0X')) {
      const n = parseInt(p, 16);
      return isNaN(n) ? null : n;
    }
    // Octal: 0... (chỉ nhận chữ số 0-7)
    if (p.startsWith('0') && p.length > 1 && /^0[0-7]+$/.test(p)) {
      const n = parseInt(p, 8);
      return isNaN(n) ? null : n;
    }
    // Decimal
    if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  // Single part (dword / hex integer / octal integer: 2130706433, 0x7f000001, 017700000001)
  if (parts.length === 1) {
    const val = parsePart(parts[0]);
    if (val !== null && val >= 0 && val <= 0xffffffff) return val >>> 0;
    return null;
  }

  // 2 parts: a.b (a: 8-bit, b: 24-bit: 127.1 -> 127.0.0.1)
  if (parts.length === 2) {
    const a = parsePart(parts[0]);
    const b = parsePart(parts[1]);
    if (a !== null && b !== null && a >= 0 && a <= 255 && b >= 0 && b <= 0xffffff) {
      return ((a << 24) | b) >>> 0;
    }
    return null;
  }

  // 3 parts: a.b.c (a: 8-bit, b: 8-bit, c: 16-bit: 127.0.1 -> 127.0.0.1)
  if (parts.length === 3) {
    const a = parsePart(parts[0]);
    const b = parsePart(parts[1]);
    const c = parsePart(parts[2]);
    if (a !== null && b !== null && c !== null && a >= 0 && a <= 255 && b >= 0 && b <= 255 && c >= 0 && c <= 0xffff) {
      return ((a << 24) | (b << 16) | c) >>> 0;
    }
    return null;
  }

  // 4 parts: a.b.c.d (standard dot-decimal / octal / hex parts)
  if (parts.length === 4) {
    let num = 0;
    for (let i = 0; i < 4; i++) {
      const p = parsePart(parts[i]);
      if (p === null || p < 0 || p > 255) return null;
      num = (num << 8) | p;
    }
    return num >>> 0;
  }

  return null;
}

/**
 * Kiểm tra xem địa chỉ IPv4 (dưới dạng số nguyên 32-bit) có thuộc các dải nội bộ / bảo mật không
 */
export function isPrivateIpv4(num: number): boolean {
  const a = (num >>> 24) & 0xff;
  const b = (num >>> 16) & 0xff;
  const c = (num >>> 8) & 0xff;

  // 0.0.0.0/8 (Current network / "this host on this network")
  if (a === 0) return true;

  // 10.0.0.0/8 (Private-Use Networks - RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / Carrier-Grade NAT - RFC 6598)
  // Dải 100.64.0.0 đến 100.127.255.255
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback - RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Metadata - RFC 3927)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private-Use Networks - RFC 1918)
  // Dải 172.16.0.0 đến 172.31.255.255
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments - RFC 6890)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1 Documentation - RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private-Use Networks - RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.51.100.0/24 (TEST-NET-2 Documentation - RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3 Documentation - RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast - RFC 5771)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved for future use - RFC 1112)
  if (a >= 240) return true;

  // 255.255.255.255/32 (Limited Broadcast)
  if (num === 0xffffffff) return true;

  return false;
}

/**
 * Kiểm tra xem địa chỉ IPv6 có thuộc các dải nội bộ / loopback / link-local / ULA / metadata không
 */
export function isPrivateIpv6(ipStr: string): boolean {
  if (typeof ipStr !== 'string') return false;
  let cleanIp = ipStr.toLowerCase().trim();
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1);
  }

  // Loopback / Unspecified (::1, ::)
  if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // Link-local unicast (fe80::/10 -> fe80:, fe90:, fea0:, feb0:)
  if (/^fe[89ab][0-9a-f]:/i.test(cleanIp) || cleanIp.startsWith('fe80:')) {
    return true;
  }

  // Unique local address (fc00::/7 -> fc00:, fd00:)
  if (/^f[cd][0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:')) {
    return true;
  }

  // Multicast (ff00::/8)
  if (/^ff[0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith('ff')) {
    return true;
  }

  // Documentation (2001:db8::/32)
  if (cleanIp.startsWith('2001:db8:') || cleanIp.startsWith('2001:0db8:')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:w.x.y.z hoặc ::ffff:7f00:1)
  if (cleanIp.includes('::ffff:')) {
    const parts = cleanIp.split('::ffff:');
    const v4 = parts[1];
    if (v4) {
      if (v4.includes('.')) {
        const num = parseIpv4ToNumber(v4);
        if (num !== null && isPrivateIpv4(num)) return true;
      } else if (v4.includes(':')) {
        // Hex representation (e.g. 7f00:0001)
        const hexParts = v4.split(':');
        if (hexParts.length === 2) {
          const w1 = parseInt(hexParts[0], 16);
          const w2 = parseInt(hexParts[1], 16);
          if (!isNaN(w1) && !isNaN(w2)) {
            const num = ((w1 << 16) | w2) >>> 0;
            if (isPrivateIpv4(num)) return true;
          }
        }
      }
    }
    return true;
  }

  return false;
}

/**
 * Kiểm tra tính an toàn của URL ngoài trước khi tải về (Chống SSRF cấp 1)
 */
export function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    let host = parsed.hostname.toLowerCase().trim();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    // Chặn tên miền nội bộ, localhost, cloud metadata
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost') ||
      host === 'metadata.google.internal' ||
      host === 'instance-data'
    ) {
      return false;
    }

    // Kiểm tra IPv6
    if (isPrivateIpv6(host)) {
      return false;
    }

    // Kiểm tra IPv4 ở mọi định dạng (dot-decimal, octal, hex, dword)
    const ipv4Num = parseIpv4ToNumber(host);
    if (ipv4Num !== null && isPrivateIpv4(ipv4Num)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Phân giải DNS qua Cloudflare DoH để chống tấn công DNS Rebinding (Chống SSRF cấp 2)
 */
export async function resolveAndValidateHostDns(hostname: string, depth = 0): Promise<{ ok: boolean; error?: string }> {
  if (depth > 3) {
    return { ok: false, error: `Chuỗi chuyển hướng DNS CNAME vượt quá giới hạn (Loop detected: ${hostname})` };
  }

  // Nếu host đã là địa chỉ IP trực tiếp, kiểm tra ngay
  const directIpv4 = parseIpv4ToNumber(hostname);
  if (directIpv4 !== null) {
    if (isPrivateIpv4(directIpv4)) {
      return { ok: false, error: `Địa chỉ IPv4 ${hostname} thuộc dải nội bộ/bị chặn.` };
    }
    return { ok: true };
  }

  if (hostname.includes(':')) {
    if (isPrivateIpv6(hostname)) {
      return { ok: false, error: `Địa chỉ IPv6 ${hostname} thuộc dải nội bộ/bị chặn.` };
    }
    return { ok: true };
  }

  try {
    const dohA = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const dohAAAA = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=AAAA`;

    const [resA, resAAAA] = await Promise.all([
      fetch(dohA, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(3500) }).catch(() => null),
      fetch(dohAAAA, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(3500) }).catch(() => null),
    ]);

    const dataA: any = resA?.ok ? await resA.json().catch(() => null) : null;
    const dataAAAA: any = resAAAA?.ok ? await resAAAA.json().catch(() => null) : null;

    const answersA = Array.isArray(dataA?.Answer) ? dataA.Answer : [];
    const answersAAAA = Array.isArray(dataAAAA?.Answer) ? dataAAAA.Answer : [];
    const allAnswers = [...answersA, ...answersAAAA];

    if (allAnswers.length === 0) {
      return { ok: false, error: `Tên miền không tồn tại hoặc không thể phân giải qua DNS: ${hostname}` };
    }

    let hasValidIp = false;
    const cnamesToFollow: string[] = [];

    for (const record of allAnswers) {
      // Type 1: A (IPv4)
      if (record.type === 1 && typeof record.data === 'string') {
        const ip = record.data.trim();
        const ipv4Num = parseIpv4ToNumber(ip);
        if (ipv4Num === null || isPrivateIpv4(ipv4Num)) {
          return {
            ok: false,
            error: `Tên miền ${hostname} phân giải về IPv4 nội bộ (${ip}) bị chặn (Chống SSRF / DNS Rebinding).`,
          };
        }
        hasValidIp = true;
      }
      // Type 28: AAAA (IPv6)
      else if (record.type === 28 && typeof record.data === 'string') {
        const ip6 = record.data.trim();
        if (isPrivateIpv6(ip6)) {
          return {
            ok: false,
            error: `Tên miền ${hostname} phân giải về IPv6 nội bộ (${ip6}) bị chặn (Chống SSRF / DNS Rebinding).`,
          };
        }
        hasValidIp = true;
      }
      // Type 5: CNAME
      else if (record.type === 5 && typeof record.data === 'string') {
        const targetCname = record.data.trim().replace(/\.$/, '');
        if (targetCname && targetCname.toLowerCase() !== hostname.toLowerCase()) {
          cnamesToFollow.push(targetCname);
        }
      }
    }

    if (!hasValidIp && cnamesToFollow.length > 0) {
      for (const target of cnamesToFollow) {
        const cnameCheck = await resolveAndValidateHostDns(target, depth + 1);
        if (!cnameCheck.ok) return cnameCheck;
      }
      return { ok: true };
    }

    if (!hasValidIp) {
      return { ok: false, error: `Tên miền ${hostname} không có bản ghi A hoặc AAAA hợp lệ.` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Kiểm tra DNS chống DNS rebinding thất bại: ${err?.message || 'timeout'}` };
  }
}

/**
 * Kiểm tra Magic Bytes nhị phân thật của ảnh (Chống giả mạo đuôi tệp / SVG XSS)
 */
export function validateImageMagicBytes(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (!bytes || bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: RIFF ... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // GIF: GIF87a hoặc GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }

  // AVIF: ftypavif hoặc ftypavis
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  return null;
}
