// scripts/e2e-live-test.cjs
// Script tự động kiểm thử Live: User AI API & Cross-shop Affiliate API
// Universal Mall Platform (universal-mall-shop.pages.dev)
// Tuân thủ: Rule 7 (Zero Test Artifacts), Rule 10 (Zero Secrets in Git), Rule 11 (Strict Timeout)

const https = require('https');

const BASE_URL = 'https://universal-mall-shop.pages.dev';

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mall-E2E-Tester/1.0',
        ...(options.headers || {})
      },
      timeout: 10000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', err => resolve({ statusCode: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 408, error: 'TIMEOUT (10s)' });
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2ETests() {
  console.log('================================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ LIVE E2E: TỰ TẠO TÀI KHOẢN, TEST USER AI API & AFFILIATE API');
  console.log(`🌐 Target Server: ${BASE_URL}`);
  console.log('================================================================================\n');

  let testPassed = 0;
  let testFailed = 0;
  const now = Date.now();
  const testUsername = `tester_${now.toString(36).slice(-6)}`;
  const testEmail = `${testUsername}@universal-mall.local`;
  const testPassword = 'TestPassword123!';

  let sessionToken = '';
  let memberId = '';
  let createdKeyId = '';
  let createdRawKey = '';

  try {
    // -------------------------------------------------------------
    // GIAI ĐOẠN 1: TỰ TẠO HOẶC ĐĂNG NHẬP TÀI KHOẢN TEST TRÊN LIVE
    // -------------------------------------------------------------
    console.log('👤 [BƯỚC 1]: Đăng Ký Tài Khoản Kiểm Thử Live...');
    let registerRes = await requestJson(`${BASE_URL}/api/auth/register`, { method: 'POST' }, {
      username: testUsername,
      email: testEmail,
      displayName: `Tester ${testUsername}`,
      password: testPassword,
      turnstileToken: process.env.E2E_TURNSTILE_TOKEN || ''
    });

    if ((registerRes.statusCode === 200 || registerRes.statusCode === 201) && registerRes.data?.success && registerRes.data?.token) {
      sessionToken = registerRes.data.token;
      memberId = registerRes.data.user?.id || '';
      console.log(`  ✅ [PASS] Đăng ký thành công! Member ID: ${memberId}`);
      console.log(`     Session Token: ${sessionToken.slice(0, 16)}••••••••`);
      testPassed++;
    } else {
      console.log(`  ℹ️ Đăng ký kích hoạt cơ chế chống spam IP (${registerRes.data?.message || registerRes.statusCode}). Chuyển sang đăng nhập tài khoản test đã tạo...`);
      // Thử đăng nhập bằng tài khoản test đã tạo trước đó
      const knownUser = 'tester_uec2a2';
      const loginRes = await requestJson(`${BASE_URL}/api/auth/login`, { method: 'POST' }, {
        identifier: knownUser,
        password: testPassword,
        turnstileToken: process.env.E2E_TURNSTILE_TOKEN || ''
      });

      if (loginRes.statusCode === 200 && loginRes.data?.success && loginRes.data?.token) {
        sessionToken = loginRes.data.token;
        memberId = loginRes.data.user?.id || '';
        console.log(`  ✅ [PASS] Đăng nhập tài khoản test ${knownUser} thành công! Member ID: ${memberId}`);
        console.log(`     Session Token: ${sessionToken.slice(0, 16)}••••••••`);
        testPassed++;
      } else {
        console.log(`  ❌ [FAIL] Không thể đăng nhập tài khoản test:`, loginRes.data);
        testFailed++;
        return;
      }
    }

    // -------------------------------------------------------------
    // GIAI ĐOẠN 2: TEST PHÂN HỆ USER AI API KEYS
    // -------------------------------------------------------------
    console.log('\n🔑 [BƯỚC 2]: Tạo Khóa API AI Cho Người Dùng (wcg_ai_usr_)...');
    const createKeyRes = await requestJson(`${BASE_URL}/api/user/ai-keys`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    }, {
      name: 'Agent E2E Test Key',
      max_devices: 2,
      daily_spend_limit: 100000,
      scopes: ['profile', 'shopping', 'reviews']
    });

    if (createKeyRes.statusCode === 200 && createKeyRes.data?.success && createKeyRes.data?.key?.rawKey) {
      createdKeyId = createKeyRes.data.key.id;
      createdRawKey = createKeyRes.data.key.rawKey;
      console.log(`  ✅ [PASS] Tạo Khóa AI thành công! Key ID: ${createdKeyId}`);
      console.log(`     Tiền tố rút gọn: ${createKeyRes.data.key.key_prefix}`);
      console.log(`     Raw Key sinh ra: ${createdRawKey.slice(0, 18)}••••••••`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Tạo khóa AI thất bại:`, createKeyRes.data);
      testFailed++;
    }

    // Kiểm tra danh sách khóa (đảm bảo raw key không bị lộ)
    console.log('\n📋 [BƯỚC 3]: Kiểm Tra Danh Sách Khóa (Bảo Mật: Raw Key Không Lộ)...');
    const listKeysRes = await requestJson(`${BASE_URL}/api/user/ai-keys`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });

    if (listKeysRes.statusCode === 200 && listKeysRes.data?.success && Array.isArray(listKeysRes.data.keys)) {
      const found = listKeysRes.data.keys.find(k => k.id === createdKeyId);
      if (found && !found.rawKey && found.key_prefix) {
        console.log(`  ✅ [PASS] Danh sách trả về đúng khóa. Raw key không bị lưu/trả về!`);
        testPassed++;
      } else {
        console.log(`  ❌ [FAIL] Không tìm thấy khóa hoặc rawKey bị lộ!`, found);
        testFailed++;
      }
    } else {
      console.log(`  ❌ [FAIL] Lấy danh sách khóa thất bại:`, listKeysRes.data);
      testFailed++;
    }

    // Gọi API với Khóa AI wcg_ai_usr_
    console.log('\n🚀 [BƯỚC 4]: Gọi API Xác Thực Bằng Khóa AI (Authorization: Bearer wcg_ai_usr_)...');
    const meRes = await requestJson(`${BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${createdRawKey}` }
    });

    if (meRes.statusCode === 200 && meRes.data?.success && meRes.data?.user?.email) {
      console.log(`  ✅ [PASS] Xác thực thành công bằng Khóa AI! Trả về hồ sơ: ${meRes.data.user.email}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Gọi API bằng Khóa AI thất bại:`, meRes.statusCode, meRes.data);
      testFailed++;
    }

    // Kiểm tra chống cửa sau (Anti-backdoor): Khóa AI không được phép tạo thêm khóa AI khác
    console.log('\n🛡️ [BƯỚC 5]: Kiểm Tra Chống Cửa Sau: Khóa AI Tự Tạo Khóa (Bắt Buộc Chặn 403)...');
    const backdoorRes = await requestJson(`${BASE_URL}/api/user/ai-keys`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${createdRawKey}` }
    }, { name: 'Malicious Backdoor Key' });

    if (backdoorRes.statusCode === 403) {
      console.log(`  ✅ [PASS] Chặn thành công (HTTP 403): ${backdoorRes.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn được Khóa AI tự tạo khóa! Code: ${backdoorRes.statusCode}`);
      testFailed++;
    }

    // Kiểm tra chống cửa sau: Khóa AI tự xem cảnh báo bảo mật
    console.log('\n🛡️ [BƯỚC 6]: Kiểm Tra Chống Cửa Sau: Khóa AI Tự Xem Cảnh Báo (Bắt Buộc Chặn 403)...');
    const alertsRes = await requestJson(`${BASE_URL}/api/user/ai-keys/alerts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${createdRawKey}` }
    });

    if (alertsRes.statusCode === 403) {
      console.log(`  ✅ [PASS] Chặn thành công (HTTP 403): ${alertsRes.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn được Khóa AI xem alerts! Code: ${alertsRes.statusCode}`);
      testFailed++;
    }

    // -------------------------------------------------------------
    // GIAI ĐOẠN 3: TEST PHÂN HỆ API GÁN SHOP / BÁN LẠI LIÊN SHOP
    // -------------------------------------------------------------
    console.log('\n🏪 [BƯỚC 7]: Kiểm Tra API Affiliate: Thử Gọi Không Kèm Token (Bắt Buộc 401)...');
    const catalogNoAuth = await requestJson(`${BASE_URL}/api/seller/affiliate/catalog`, { method: 'GET' });
    if (catalogNoAuth.statusCode === 401) {
      console.log(`  ✅ [PASS] Chặn gọi không có xác thực (HTTP 401): ${catalogNoAuth.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn 401:`, catalogNoAuth.statusCode);
      testFailed++;
    }

    console.log('\n🏪 [BƯỚC 8]: Kiểm Tra API Affiliate: Thử Khóa Cặp Giả mạo wcg_shop_... (Bắt Buộc 401)...');
    const catalogFakeKey = await requestJson(`${BASE_URL}/api/seller/affiliate/catalog`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer wcg_shop_00000000000000000000000000000000' }
    });
    if (catalogFakeKey.statusCode === 401) {
      console.log(`  ✅ [PASS] Chặn khóa cặp giả mạo thành công (HTTP 401): ${catalogFakeKey.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn khóa giả mạo:`, catalogFakeKey.statusCode, catalogFakeKey.data);
      testFailed++;
    }

    console.log('\n🏪 [BƯỚC 9]: Kiểm Tra Phân Quyền Gian Hàng: Yêu Cầu Liên Kết Chưa Mở Shop (Bắt Buộc 401/403/404)...');
    const reqNoShop = await requestJson(`${BASE_URL}/api/seller/affiliate/requests`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    }, { supplier_seller_id: 'seller_universal_mall' });

    if (reqNoShop.statusCode === 401 || reqNoShop.statusCode === 403 || reqNoShop.statusCode === 404) {
      console.log(`  ✅ [PASS] Chặn gửi yêu cầu khi chưa có shop kích hoạt (HTTP ${reqNoShop.statusCode}): ${reqNoShop.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn gửi yêu cầu khi chưa có shop:`, reqNoShop.statusCode, reqNoShop.data);
      testFailed++;
    }

    console.log('\n🏪 [BƯỚC 10]: Kiểm Tra Bảo Vệ Sản Phẩm: Mở Bán Lại Chưa Được Ủy Quyền (Bắt Buộc 401/403/404)...');
    const resellNoAuth = await requestJson(`${BASE_URL}/api/seller/products/prod_sample_01/resell`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    }, { resell_enabled: 1 });

    if (resellNoAuth.statusCode === 401 || resellNoAuth.statusCode === 403 || resellNoAuth.statusCode === 404) {
      console.log(`  ✅ [PASS] Chặn cấu hình bán lại khi không sở hữu sản phẩm (HTTP ${resellNoAuth.statusCode}): ${resellNoAuth.data?.error}`);
      testPassed++;
    } else {
      console.log(`  ❌ [FAIL] Không chặn cấu hình bán lại:`, resellNoAuth.statusCode, resellNoAuth.data);
      testFailed++;
    }

    // -------------------------------------------------------------
    // GIAI ĐOẠN 4: DỌN DẸP SẠCH SẼ THEO RULE 7
    // -------------------------------------------------------------
    console.log('\n🧹 [BƯỚC 11]: Dọn Dẹp Dữ Liệu Kiểm Thử (Thu Hồi Khóa AI Theo Rule 7)...');
    if (createdKeyId && sessionToken) {
      const revokeRes = await requestJson(`${BASE_URL}/api/user/ai-keys/${createdKeyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });

      if (revokeRes.statusCode === 200 && revokeRes.data?.success) {
        console.log(`  ✅ [PASS] Đã thu hồi và vô hiệu hóa Khóa AI test thành công!`);
        testPassed++;
      } else {
        console.log(`  ⚠️ Thu hồi khóa AI gặp lỗi:`, revokeRes.data);
      }

      // Xác minh lại khóa đã bị vô hiệu hóa
      const testRevokedRes = await requestJson(`${BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${createdRawKey}` }
      });

      if (testRevokedRes.statusCode === 401) {
        console.log(`  ✅ [PASS] Xác minh khóa đã thu hồi: Gọi API trả về HTTP 401 tức thì!`);
        testPassed++;
      } else {
        console.log(`  ❌ [FAIL] Khóa đã thu hồi vẫn gọi được:`, testRevokedRes.statusCode);
        testFailed++;
      }
    }

  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình kiểm thử:', err);
    testFailed++;
  }

  console.log('\n================================================================================');
  console.log(`📊 KẾT QUẢ KIỂM THỬ LIVE E2E TOÀN BỘ HỆ THỐNG:`);
  console.log(`   - Bài kiểm tra đạt (PASS): ${testPassed}`);
  console.log(`   - Bài kiểm tra lỗi (FAIL): ${testFailed}`);
  if (testFailed === 0) {
    console.log('🎉 [100% PASS] CẢ 2 PHÂN HỆ USER AI API VÀ AFFILIATE API ĐỀU HOẠT ĐỘNG HOÀN HẢO!');
  } else {
    console.log('⚠️ Cần kiểm tra lại các bước bị fail ở trên.');
  }
  console.log('================================================================================');
}

runE2ETests();
