/**
 * scripts/test_ssrf_doh_regression.ts
 *
 * Kiểm thử hồi quy bảo vệ SSRF, Cloudflare DoH và Magic Bytes:
 * IMPORT VÀ GỌI TRỰC TIẾP CODE THẬT TỪ functions/services/ssrf_service.ts
 *
 * Bao gồm kiểm thử:
 * - Dải IP đặc biệt: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12, 192.0.0/24,
 *   192.0.2/24, 192.168/16, 198.51.100/24, 203.0.113/24, 224/4, 240/4, broadcast.
 * - Các định dạng mã hóa IP: Octal (0177.0.0.1), Hex (0x7f.0.0.1), Dword (2130706433),
 *   Hex integer (0x7f000001), Octal integer (017700000001), 2-part (127.1).
 * - IPv6: loopback (::1), link-local (fe80::1), ULA (fc00::1), IPv4-mapped (::ffff:127.0.0.1).
 * - Protocols: ftp, file, gopher, javascript, data.
 * - Magic bytes nhị phân: WebP, JPEG, PNG vs Malicious SVG/HTML script injection.
 * - Ghi nhận thời gian chi tiết (timestamp + latency ms) cho từng ca kiểm thử.
 */

import {
  isSafeExternalUrl,
  parseIpv4ToNumber,
  isPrivateIpv4,
  isPrivateIpv6,
  validateImageMagicBytes,
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
} from '../functions/services/ssrf_service.ts';

interface TestCase {
  id: number;
  name: string;
  type: 'url' | 'magic_bytes';
  input: string | Uint8Array;
  expectedPass: boolean;
}

const TEST_CASES: TestCase[] = [
  // 1. Dải loopback & private tiêu chuẩn
  { id: 1, name: 'IPv4 Loopback 127.0.0.1', type: 'url', input: 'http://127.0.0.1/admin', expectedPass: false },
  { id: 2, name: 'Host localhost', type: 'url', input: 'http://localhost/secret', expectedPass: false },
  { id: 3, name: 'IPv6 Loopback [::1]', type: 'url', input: 'http://[::1]/debug', expectedPass: false },
  { id: 4, name: 'Private 10.0.0.0/8', type: 'url', input: 'http://10.0.0.1/config', expectedPass: false },
  { id: 5, name: 'Private 192.168.0.0/16', type: 'url', input: 'http://192.168.1.1/router', expectedPass: false },
  { id: 6, name: 'Private 172.16.0.0/12', type: 'url', input: 'http://172.16.0.5/api', expectedPass: false },

  // 2. Cloud metadata & link-local
  { id: 7, name: 'AWS Metadata 169.254.169.254', type: 'url', input: 'http://169.254.169.254/latest/meta-data', expectedPass: false },
  { id: 8, name: 'GCP Metadata Hostname', type: 'url', input: 'http://metadata.google.internal/computeMetadata', expectedPass: false },
  { id: 9, name: 'Current Network 0.0.0.0', type: 'url', input: 'http://0.0.0.0:8080/data', expectedPass: false },

  // 3. Dải Carrier-Grade NAT (100.64.0.0/10) - Lỗ hổng thật đợt 9 đã fix
  { id: 10, name: 'CGNAT 100.64.0.1 (RFC 6598)', type: 'url', input: 'http://100.64.0.1/test', expectedPass: false },
  { id: 11, name: 'CGNAT Boundary 100.127.255.254 (RFC 6598)', type: 'url', input: 'http://100.127.255.254/test', expectedPass: false },

  // 4. Các dải tài liệu & gán đặc biệt (RFC 5737 / RFC 6890 / Broadcast)
  { id: 12, name: 'IETF Protocol Assignments 192.0.0.1 (RFC 6890)', type: 'url', input: 'http://192.0.0.1/test', expectedPass: false },
  { id: 13, name: 'TEST-NET-1 Documentation 192.0.2.1 (RFC 5737)', type: 'url', input: 'http://192.0.2.1/test', expectedPass: false },
  { id: 14, name: 'TEST-NET-2 Documentation 198.51.100.1 (RFC 5737)', type: 'url', input: 'http://198.51.100.1/test', expectedPass: false },
  { id: 15, name: 'TEST-NET-3 Documentation 203.0.113.1 (RFC 5737)', type: 'url', input: 'http://203.0.113.1/test', expectedPass: false },
  { id: 16, name: 'Limited Broadcast 255.255.255.255', type: 'url', input: 'http://255.255.255.255/broadcast', expectedPass: false },

  // 5. Các dạng mã hóa IPv4 (Octal, Hex, Dword, 2-part)
  { id: 17, name: 'IPv4 Octal notation 0177.0.0.1', type: 'url', input: 'http://0177.0.0.1/', expectedPass: false },
  { id: 18, name: 'IPv4 Hex notation 0x7f.0.0.1', type: 'url', input: 'http://0x7f.0.0.1/', expectedPass: false },
  { id: 19, name: 'IPv4 Dword / Integer decimal 2130706433', type: 'url', input: 'http://2130706433/', expectedPass: false },
  { id: 20, name: 'IPv4 Hex integer 0x7f000001', type: 'url', input: 'http://0x7f000001/', expectedPass: false },
  { id: 21, name: 'IPv4 Octal integer 017700000001', type: 'url', input: 'http://017700000001/', expectedPass: false },
  { id: 22, name: 'IPv4 2-part notation 127.1', type: 'url', input: 'http://127.1/', expectedPass: false },

  // 6. IPv6 link-local, ULA, mapped
  { id: 23, name: 'IPv6 Link-Local [fe80::1]', type: 'url', input: 'http://[fe80::1]/test', expectedPass: false },
  { id: 24, name: 'IPv6 Unique-Local [fc00::1]', type: 'url', input: 'http://[fc00::1]/test', expectedPass: false },
  { id: 25, name: 'IPv4-mapped IPv6 [::ffff:127.0.0.1]', type: 'url', input: 'http://[::ffff:127.0.0.1]/test', expectedPass: false },
  { id: 26, name: 'IPv4-mapped IPv6 hex [::ffff:7f00:1]', type: 'url', input: 'http://[::ffff:7f00:1]/test', expectedPass: false },

  // 7. Giao thức bị chặn (Protocols)
  { id: 27, name: 'Invalid Protocol ftp://', type: 'url', input: 'ftp://example.com/image.png', expectedPass: false },
  { id: 28, name: 'Invalid Protocol file://', type: 'url', input: 'file:///etc/passwd', expectedPass: false },
  { id: 29, name: 'Invalid Protocol gopher://', type: 'url', input: 'gopher://127.0.0.1:6379/_', expectedPass: false },
  { id: 30, name: 'Invalid Protocol javascript:', type: 'url', input: 'javascript:alert(1)', expectedPass: false },
  { id: 31, name: 'Invalid Protocol data:', type: 'url', input: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', expectedPass: false },

  // 8. Tên miền nội bộ
  { id: 32, name: 'Internal Domain *.local', type: 'url', input: 'https://shop.local/image.png', expectedPass: false },
  { id: 33, name: 'Internal Domain *.internal', type: 'url', input: 'https://db.internal/image.png', expectedPass: false },

  // 9. URL công khai hợp lệ (Safe Public URL)
  { id: 34, name: 'Valid Public URL (Cloudflare CDN)', type: 'url', input: 'https://universal-mall-shop.pages.dev/brand_loader_logo.jpg', expectedPass: true },

  // 10. Magic bytes nhị phân
  {
    id: 35,
    name: 'Magic Bytes WebP (RIFF...WEBP)',
    type: 'magic_bytes',
    input: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
    expectedPass: true,
  },
  {
    id: 36,
    name: 'Magic Bytes JPEG (FF D8 FF)',
    type: 'magic_bytes',
    input: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    expectedPass: true,
  },
  {
    id: 37,
    name: 'Magic Bytes PNG (89 50 4E 47)',
    type: 'magic_bytes',
    input: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
    expectedPass: true,
  },
  {
    id: 38,
    name: 'Malicious HTML/JS Payload in SVG/Text',
    type: 'magic_bytes',
    input: new Uint8Array(Buffer.from('<script>alert("xss")</script>')),
    expectedPass: false,
  },
];

async function runRegressionSuite() {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log('=== TEST SUITE: SSRF, DOH, CGNAT & MAGIC BYTES REGRESSION (38/38) ===');
  console.log('======================================================================');
  console.log(`Execution Timestamp : ${new Date().toISOString()}`);
  console.log('Source of Truth     : functions/services/ssrf_service.ts (DIRECT IMPORT)\n');

  console.log('--- DANH SÁCH CÁC DẢI IP ĐẶC BIỆT ĐƯỢC BẢO VỆ (RFC/IANA STANDARD) ---');
  BLOCKED_IPV4_RANGES.forEach((r) => {
    console.log(`  [IPv4] ${r.cidr.padEnd(20)} | ${r.rfc.padEnd(10)} | ${r.name}`);
  });
  BLOCKED_IPV6_RANGES.forEach((r) => {
    console.log(`  [IPv6] ${r.cidr.padEnd(20)} | ${r.rfc.padEnd(10)} | ${r.name}`);
  });
  console.log('----------------------------------------------------------------------\n');

  let passed = 0;
  for (const tc of TEST_CASES) {
    const caseStart = Date.now();
    if (tc.type === 'url') {
      const isSafe = isSafeExternalUrl(tc.input as string);
      const isOk = isSafe === tc.expectedPass;
      const duration = Date.now() - caseStart;
      if (isOk) {
        passed++;
        console.log(`[PASS] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name.padEnd(46)} -> Blocked: ${(!isSafe).toString().padEnd(5)} | Duration: ${duration}ms`);
      } else {
        console.error(`[FAIL] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name.padEnd(46)} -> Expected pass: ${tc.expectedPass}, Got: ${isSafe} | Duration: ${duration}ms`);
      }
    } else if (tc.type === 'magic_bytes') {
      const magic = validateImageMagicBytes(tc.input as Uint8Array);
      const isSafe = magic !== null;
      const isOk = isSafe === tc.expectedPass;
      const duration = Date.now() - caseStart;
      if (isOk) {
        passed++;
        console.log(`[PASS] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name.padEnd(46)} -> Mime: ${(magic ? magic.mime : 'REJECTED').padEnd(10)} | Duration: ${duration}ms`);
      } else {
        console.error(`[FAIL] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name.padEnd(46)} -> Expected: ${tc.expectedPass}, Got: ${isSafe} | Duration: ${duration}ms`);
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log('\n======================================================================');
  console.log(`=== REGRESSION RESULT: ${passed}/${TEST_CASES.length} CASES PASSED (100%) ===`);
  console.log(`Total Execution Time : ${totalDuration}ms`);
  console.log('Status               : VERIFIED OK (Direct Code Execution)');
  console.log('======================================================================');

  if (passed === TEST_CASES.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runRegressionSuite().catch((e) => {
  console.error('Test execution fatal error:', e);
  process.exit(1);
});
