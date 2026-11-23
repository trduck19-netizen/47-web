/**
 * scripts/test_ssrf_doh_regression.ts
 *
 * Kiểm thử hồi quy bảo vệ SSRF, Cloudflare DoH và Magic Bytes:
 * IMPORT VÀ GỌI TRỰC TIẾP CODE THẬT TỪ functions/services/ssrf_service.ts
 *
 * Bao gồm kiểm thử:
 * 1. Gọi trực tiếp Cloudflare DoH qua hàm resolveAndValidateHostDns():
 *    - Domain công khai hợp lệ (cloudflare.com, google.com) -> DoH trả IP public -> PASS.
 *    - Domain tấn công DNS Rebinding trỏ về Loopback (127.0.0.1.nip.io) -> DoH phát hiện private IP -> CHẶN.
 *    - Domain trỏ về Private Network (10.0.0.1.nip.io, 192.168.1.1.nip.io) -> DoH phát hiện private IP -> CHẶN.
 *    - Domain trỏ về Carrier-Grade NAT (100.64.0.1.nip.io) -> DoH phát hiện CGNAT -> CHẶN.
 *    - Domain trỏ về Cloud Metadata (169.254.169.254.nip.io) -> DoH phát hiện Link-local -> CHẶN.
 *    - Domain không tồn tại hoặc lỗi DNS -> CHẶN an toàn (Fail-closed).
 * 2. Dải IP đặc biệt bị chặn cấp 1: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12, 192.0.0/24,
 *    192.0.2/24, 192.168/16, 198.51.100/24, 203.0.113/24, 224/4, 240/4, broadcast.
 * 3. Các định dạng mã hóa IP: Octal (0177.0.0.1), Hex (0x7f.0.0.1), Dword (2130706433),
 *    Hex integer (0x7f000001), Octal integer (017700000001), 2-part (127.1).
 * 4. IPv6: loopback (::1), link-local (fe80::1), ULA (fc00::1), IPv4-mapped (::ffff:127.0.0.1).
 * 5. Protocols: ftp, file, gopher, javascript, data.
 * 6. Magic bytes nhị phân: WebP, JPEG, PNG vs Malicious SVG/HTML script injection.
 * 7. Ghi nhận thời gian chi tiết (duration ms) cho từng ca kiểm thử.
 */

import {
  isSafeExternalUrl,
  resolveAndValidateHostDns,
  parseIpv4ToNumber,
  isPrivateIpv4,
  isPrivateIpv6,
  validateImageMagicBytes,
} from '../functions/services/ssrf_service.ts';

interface TestCase {
  id: number;
  name: string;
  category: 'DoH_Live' | 'SSRF_URL' | 'Magic_Bytes';
  run: () => Promise<boolean> | boolean;
  expectedPass: boolean;
}

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // NHÓM 1: KIỂM THỬ THẬT NHÁNH CLOUDFLARE DoH (DNS OVER HTTPS)
  // Gọi trực tiếp resolveAndValidateHostDns() kết nối https://cloudflare-dns.com
  // =========================================================================
  {
    id: 1,
    name: 'DoH Live: Phân giải tên miền công khai cloudflare.com (A/AAAA Public)',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('cloudflare.com');
      return res.ok;
    },
    expectedPass: true,
  },
  {
    id: 2,
    name: 'DoH Live: Phân giải tên miền công khai google.com (A/AAAA Public)',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('google.com');
      return res.ok;
    },
    expectedPass: true,
  },
  {
    id: 3,
    name: 'DoH Rebinding Guard: 127.0.0.1.nip.io trỏ về Loopback 127.0.0.1',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('127.0.0.1.nip.io');
      return res.ok;
    },
    expectedPass: false,
  },
  {
    id: 4,
    name: 'DoH Rebinding Guard: 10.0.0.1.nip.io trỏ về Private IP 10.0.0.1',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('10.0.0.1.nip.io');
      return res.ok;
    },
    expectedPass: false,
  },
  {
    id: 5,
    name: 'DoH Rebinding Guard: 192.168.1.1.nip.io trỏ về Private IP 192.168.1.1',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('192.168.1.1.nip.io');
      return res.ok;
    },
    expectedPass: false,
  },
  {
    id: 6,
    name: 'DoH Rebinding Guard: 100.64.0.1.nip.io trỏ về CGNAT (RFC 6598)',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('100.64.0.1.nip.io');
      return res.ok;
    },
    expectedPass: false,
  },
  {
    id: 7,
    name: 'DoH Rebinding Guard: 169.254.169.254.nip.io trỏ về Cloud Metadata',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('169.254.169.254.nip.io');
      return res.ok;
    },
    expectedPass: false,
  },
  {
    id: 8,
    name: 'DoH Live Fail-Closed: Tên miền không tồn tại hoặc lỗi phân giải DNS',
    category: 'DoH_Live',
    run: async () => {
      const res = await resolveAndValidateHostDns('this-domain-does-not-exist-at-all-xyz9876.invalid');
      return res.ok;
    },
    expectedPass: false,
  },

  // =========================================================================
  // NHÓM 2: KIỂM THỬ SSRF CẤP 1 (URL PARSER & IP DECODER)
  // =========================================================================
  {
    id: 9,
    name: 'IPv4 Loopback 127.0.0.1',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://127.0.0.1/admin'),
    expectedPass: false,
  },
  {
    id: 10,
    name: 'Host localhost',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://localhost/secret'),
    expectedPass: false,
  },
  {
    id: 11,
    name: 'IPv6 Loopback [::1]',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://[::1]/debug'),
    expectedPass: false,
  },
  {
    id: 12,
    name: 'Private 10.0.0.0/8',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://10.0.0.1/config'),
    expectedPass: false,
  },
  {
    id: 13,
    name: 'Private 192.168.0.0/16',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://192.168.1.1/router'),
    expectedPass: false,
  },
  {
    id: 14,
    name: 'Private 172.16.0.0/12',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://172.16.0.5/api'),
    expectedPass: false,
  },
  {
    id: 15,
    name: 'AWS Metadata 169.254.169.254',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://169.254.169.254/latest/meta-data'),
    expectedPass: false,
  },
  {
    id: 16,
    name: 'GCP Metadata Hostname',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://metadata.google.internal/computeMetadata'),
    expectedPass: false,
  },
  {
    id: 17,
    name: 'Current Network 0.0.0.0',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://0.0.0.0:8080/data'),
    expectedPass: false,
  },
  {
    id: 18,
    name: 'CGNAT 100.64.0.1 (RFC 6598)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://100.64.0.1/test'),
    expectedPass: false,
  },
  {
    id: 19,
    name: 'CGNAT Boundary 100.127.255.254 (RFC 6598)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://100.127.255.254/test'),
    expectedPass: false,
  },
  {
    id: 20,
    name: 'IETF Protocol Assignments 192.0.0.1 (RFC 6890)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://192.0.0.1/test'),
    expectedPass: false,
  },
  {
    id: 21,
    name: 'TEST-NET-1 Documentation 192.0.2.1 (RFC 5737)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://192.0.2.1/test'),
    expectedPass: false,
  },
  {
    id: 22,
    name: 'TEST-NET-2 Documentation 198.51.100.1 (RFC 5737)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://198.51.100.1/test'),
    expectedPass: false,
  },
  {
    id: 23,
    name: 'TEST-NET-3 Documentation 203.0.113.1 (RFC 5737)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://203.0.113.1/test'),
    expectedPass: false,
  },
  {
    id: 24,
    name: 'Limited Broadcast 255.255.255.255',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://255.255.255.255/broadcast'),
    expectedPass: false,
  },
  {
    id: 25,
    name: 'IPv4 Octal notation 0177.0.0.1',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://0177.0.0.1/'),
    expectedPass: false,
  },
  {
    id: 26,
    name: 'IPv4 Hex notation 0x7f.0.0.1',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://0x7f.0.0.1/'),
    expectedPass: false,
  },
  {
    id: 27,
    name: 'IPv4 Dword decimal 2130706433',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://2130706433/'),
    expectedPass: false,
  },
  {
    id: 28,
    name: 'IPv4 Hex integer 0x7f000001',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://0x7f000001/'),
    expectedPass: false,
  },
  {
    id: 29,
    name: 'IPv4 Octal integer 017700000001',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://017700000001/'),
    expectedPass: false,
  },
  {
    id: 30,
    name: 'IPv4 2-part notation 127.1',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://127.1/'),
    expectedPass: false,
  },
  {
    id: 31,
    name: 'IPv6 Link-Local [fe80::1]',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://[fe80::1]/test'),
    expectedPass: false,
  },
  {
    id: 32,
    name: 'IPv6 Unique-Local [fc00::1]',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://[fc00::1]/test'),
    expectedPass: false,
  },
  {
    id: 33,
    name: 'IPv4-mapped IPv6 [::ffff:127.0.0.1]',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://[::ffff:127.0.0.1]/test'),
    expectedPass: false,
  },
  {
    id: 34,
    name: 'IPv4-mapped IPv6 hex [::ffff:7f00:1]',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('http://[::ffff:7f00:1]/test'),
    expectedPass: false,
  },
  {
    id: 35,
    name: 'Invalid Protocol ftp://',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('ftp://example.com/image.png'),
    expectedPass: false,
  },
  {
    id: 36,
    name: 'Invalid Protocol file://',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('file:///etc/passwd'),
    expectedPass: false,
  },
  {
    id: 37,
    name: 'Invalid Protocol gopher://',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('gopher://127.0.0.1:6379/_'),
    expectedPass: false,
  },
  {
    id: 38,
    name: 'Invalid Protocol javascript:',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('javascript:alert(1)'),
    expectedPass: false,
  },
  {
    id: 39,
    name: 'Invalid Protocol data:',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    expectedPass: false,
  },
  {
    id: 40,
    name: 'Internal Domain *.local',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('https://shop.local/image.png'),
    expectedPass: false,
  },
  {
    id: 41,
    name: 'Internal Domain *.internal',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('https://db.internal/image.png'),
    expectedPass: false,
  },
  {
    id: 42,
    name: 'Valid Public URL (Cloudflare CDN)',
    category: 'SSRF_URL',
    run: () => isSafeExternalUrl('https://universal-mall-shop.pages.dev/brand_loader_logo.jpg'),
    expectedPass: true,
  },

  // =========================================================================
  // NHÓM 3: KIỂM THỬ MAGIC BYTES NHỊ PHÂN
  // =========================================================================
  {
    id: 43,
    name: 'Magic Bytes WebP (RIFF...WEBP)',
    category: 'Magic_Bytes',
    run: () => validateImageMagicBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])) !== null,
    expectedPass: true,
  },
  {
    id: 44,
    name: 'Magic Bytes JPEG (FF D8 FF E0...JFIF)',
    category: 'Magic_Bytes',
    run: () => validateImageMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60])) !== null,
    expectedPass: true,
  },
  {
    id: 45,
    name: 'Magic Bytes PNG (89 50 4E 47 0D 0A 1A 0A...IHDR)',
    category: 'Magic_Bytes',
    run: () => validateImageMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])) !== null,
    expectedPass: true,
  },
  {
    id: 46,
    name: 'Chặn SVG XSS Script (<svg onload=alert(1)>)',
    category: 'Magic_Bytes',
    run: () => validateImageMagicBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')) !== null,
    expectedPass: false,
  },
  {
    id: 47,
    name: 'Chặn HTML File Upload (<!DOCTYPE html>)',
    category: 'Magic_Bytes',
    run: () => validateImageMagicBytes(new TextEncoder().encode('<!DOCTYPE html><html><body>malicious</body></html>')) !== null,
    expectedPass: false,
  },
];

async function runTestSuite() {
  const suiteStartTime = Date.now();
  console.log('================================================================================');
  console.log('[TEST SUITE] SSRF PROTECTION & CLOUDFLARE DoH REGRESSION AUDIT (47 TEST CASES)');
  console.log('Source-of-truth: functions/services/ssrf_service.ts');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('================================================================================\n');

  let passCount = 0;
  let failCount = 0;

  for (const tc of TEST_CASES) {
    const caseStart = performance.now();
    try {
      const result = await tc.run();
      const durationMs = (performance.now() - caseStart).toFixed(2);
      const isPassed = result === tc.expectedPass;

      if (isPassed) {
        console.log(`  [PASS] [${tc.category}] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name} (${durationMs}ms)`);
        passCount++;
      } else {
        console.error(`  [FAIL] [${tc.category}] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name} (Expected: ${tc.expectedPass}, Got: ${result}, ${durationMs}ms)`);
        failCount++;
      }
    } catch (err: any) {
      const durationMs = (performance.now() - caseStart).toFixed(2);
      console.error(`  [ERROR] [${tc.category}] Case ${tc.id.toString().padStart(2, '0')}: ${tc.name} threw error: ${err.message} (${durationMs}ms)`);
      failCount++;
    }
  }

  const suiteDurationMs = Date.now() - suiteStartTime;
  console.log('\n================================================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${TEST_CASES.length} cases in ${suiteDurationMs}ms`);
  console.log('100% PRODUCTION CODE REAL IMPORT VERIFIED (INCLUDING LIVE CLOUDFLARE DoH QUERIES)');
  console.log('================================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]:', err);
  process.exit(1);
});
