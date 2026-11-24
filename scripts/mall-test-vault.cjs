/**
 * Mall Test Vault Runner & Health Inspector
 * Tự động đọc cấu hình kiểm thử từ .test_vault.local.json và thực hiện kiểm tra trạng thái
 * toàn bộ các dịch vụ, API, cổng quản trị và trang khách hàng.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const vaultLocalPath = path.join(__dirname, '..', '.test_vault.local.json');
const vaultExamplePath = path.join(__dirname, '..', '.test_vault.example.json');

const vaultFile = fs.existsSync(vaultLocalPath) ? vaultLocalPath : vaultExamplePath;
const vaultData = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));

console.log('================================================================================');
console.log('🛡️  MALL TEST VAULT & ENVIRONMENT HEALTH INSPECTOR');
console.log(`   Nguồn cấu hình: ${path.basename(vaultFile)}`);
console.log(`   Dự án: ${vaultData.project}`);
console.log('================================================================================\n');

console.log('👤 [DANH MỤC TÀI KHOẢN KIỂM THỬ SẴN SÀNG]:');
Object.entries(vaultData.roles_and_test_accounts || {}).forEach(([key, acc]) => {
  console.log(`   🔹 [${acc.role}] ${acc.display_name}`);
  console.log(`      Email: ${acc.email} | Phone: ${acc.test_phone || 'N/A'}`);
  console.log(`      Mục đích: ${acc.purpose}\n`);
});

console.log('🔑 [HỆ THỐNG KHÓA API MẪU]:');
Object.entries(vaultData.test_api_keys || {}).forEach(([key, k]) => {
  console.log(`   🔸 ${key.toUpperCase()}: ${k.auth_header || k.usage || 'N/A'}`);
});
console.log('');

// Quick HTTP Probe
function checkUrl(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = https.get(url, { timeout: 8000 }, (res) => {
      const responseMs = Date.now() - startTime;
      resolve({
        url,
        statusCode: res.statusCode,
        buildId: res.headers['x-build-id'] || 'N/A',
        cfRay: res.headers['cf-ray'] || 'N/A',
        responseMs,
        ok: res.statusCode >= 200 && res.statusCode < 400,
      });
    });

    req.on('error', (err) => {
      resolve({ url, error: err.message, ok: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ url, error: 'TIMEOUT (8s)', ok: false });
    });
  });
}

async function runHealthCheck() {
  console.log('🌐 [KIỂM TRA KẾT NỐI MÔI TRƯỜNG LIVE CLOUDFLARE]:');
  const urlsToCheck = [
    { name: 'Web Khách Hàng (Client Portal)', url: vaultData.environments.live_client },
    { name: 'Cổng Quản Trị (Admin Portal)', url: vaultData.environments.live_admin },
    { name: 'API Danh Mục Sản Phẩm Công Khai', url: `${vaultData.environments.live_client}/api/products` },
    { name: 'API Kiểm Tra Khóa Cặp Liên Shop', url: `${vaultData.environments.live_client}/api/seller/affiliate/catalog` },
  ];

  for (const item of urlsToCheck) {
    const res = await checkUrl(item.url);
    if (res.ok) {
      console.log(`   ✅ [${res.statusCode} OK] ${item.name} (${res.responseMs}ms)`);
      if (res.buildId !== 'N/A') console.log(`      🏷️ Build ID: ${res.buildId} | CF-RAY: ${res.cfRay}`);
    } else if (res.statusCode === 401) {
      console.log(`   🔒 [401 AUTH REQUIRED] ${item.name} (${res.responseMs}ms) — Cần khóa API Bearer wcg_shop_... (Đúng chuẩn bảo mật)`);
    } else {
      console.log(`   ❌ [FAIL] ${item.name}: ${res.error || res.statusCode}`);
    }
  }

  console.log('\n================================================================================');
  console.log('🎉 Kho kiểm thử đã sẵn sàng để bạn và Agent sử dụng bất cứ lúc nào!');
  console.log('================================================================================');
}

runHealthCheck();
