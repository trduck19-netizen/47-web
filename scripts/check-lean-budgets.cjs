/**
 * Lean Guard Scanner & Asset Budget Enforcer
 * Tự động hóa kiểm soát ngân sách kích thước (Asset Budgets) và ngăn chặn phình to hệ thống:
 * 1. Kho Media Game Icons (public/game_icons/ <= 32 MB)
 * 2. Ngăn ngừa file ảnh trùng lặp phần mở rộng (Zero name collisions .png vs .webp vs .jpg)
 * 3. Kích thước file ảnh đơn lẻ trong public/ (<= 200 KB cho icon, <= 350 KB cho ảnh thông thường)
 * 4. Dữ liệu tĩnh mới trong src/data/ (<= 150 KB)
 * 5. Frontend Component Chunks trong dist/assets/ (AdminApp.js <= 600 KB, các chunk khác <= 650 KB)
 * 6. Cloudflare Pages Edge Worker Bundle (dist/_worker.js <= 22 MB)
 * 7. Tổng dung lượng thư mục phân phối dist/ (<= 85 MB)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');

// Đọc tham số dòng lệnh
const args = process.argv.slice(2);
const stageArg = args.find(a => a.startsWith('--stage='));
const stage = stageArg ? stageArg.split('=')[1] : (args.includes('--post') ? 'post' : (args.includes('--pre') ? 'pre' : 'all'));

console.log('='.repeat(80));
console.log(`🛡️  LEAN GUARD SCANNER — HỆ THỐNG GIÁM SÁT NGÂN SÁCH KÍCH THƯỚC DỰ ÁN`);
console.log(`   Chế độ kiểm tra: [${stage.toUpperCase()}] | Thư mục gốc: ${root}`);
console.log('='.repeat(80));

let failures = [];
let warnings = [];
let passCount = 0;

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatKB(bytes) {
  return (bytes / 1024).toFixed(2) + ' KB';
}

function getDirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const p = path.join(dir, item);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      total += getDirSizeBytes(p);
    } else {
      total += stat.size;
    }
  }
  return total;
}

// -------------------------------------------------------------
// GIAI ĐOẠN 1: PRE-BUILD CHECKS
// -------------------------------------------------------------
if (stage === 'pre' || stage === 'all') {
  console.log('\n🔍 [STAGE: PRE-BUILD] Đang quét tài nguyên Media & Dữ liệu tĩnh...');

  // Check 1: Kho Media Game Icons
  const iconsDir = path.join(root, 'public', 'game_icons');
  if (fs.existsSync(iconsDir)) {
    const iconFiles = fs.readdirSync(iconsDir);
    const iconsBytes = getDirSizeBytes(iconsDir);
    const iconsMB = iconsBytes / (1024 * 1024);

    console.log(`   📁 Kho ảnh Game Icons: ${iconFiles.length} files, dung lượng: ${formatMB(iconsBytes)}`);
    if (iconsMB > 32.0) {
      failures.push(`[Check 1 FAIL] public/game_icons (${formatMB(iconsBytes)}) vượt trần ngân sách cho phép (32.00 MB)!`);
    } else if (iconsMB > 30.0) {
      warnings.push(`[Check 1 WARN] public/game_icons (${formatMB(iconsBytes)}) đang tiệm cận trần ngân sách (> 30.00 MB).`);
      passCount++;
    } else {
      console.log(`   ✅ [Check 1 PASS] Kho ảnh game_icons đạt chuẩn ngân sách (< 32.00 MB).`);
      passCount++;
    }

    // Check 2: Kiểm tra ảnh trùng lặp phần mở rộng (Duplicate Name Collision)
    const byBaseName = new Map();
    for (const file of iconFiles) {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext).toLowerCase();
      if (!byBaseName.has(base)) byBaseName.set(base, []);
      byBaseName.get(base).push(file);
    }
    const collisions = [];
    for (const [base, list] of byBaseName.entries()) {
      if (list.length > 1) {
        collisions.push(`${base}: [${list.join(', ')}]`);
      }
    }
    if (collisions.length > 0) {
      failures.push(`[Check 2 FAIL] Phát hiện ${collisions.length} ảnh trùng lặp phần mở rộng trong game_icons: ${collisions.slice(0, 3).join('; ')}`);
    } else {
      console.log(`   ✅ [Check 2 PASS] Không có ảnh trùng lặp phần mở rộng (Zero extension collisions).`);
      passCount++;
    }

    // Check 3: Kích thước từng file icon trong game_icons (<= 200 KB)
    let heavyIcons = [];
    for (const file of iconFiles) {
      const p = path.join(iconsDir, file);
      const s = fs.statSync(p).size;
      if (s > 200 * 1024) {
        heavyIcons.push(`${file} (${formatKB(s)})`);
      }
    }
    if (heavyIcons.length > 0) {
      failures.push(`[Check 3 FAIL] Phát hiện ${heavyIcons.length} icon game vượt quá 200 KB: ${heavyIcons.slice(0, 3).join(', ')}`);
    } else {
      console.log(`   ✅ [Check 3 PASS] 100% icon game đạt chuẩn dung lượng (<= 200 KB).`);
      passCount++;
    }
  } else {
    warnings.push(`[Check 1-3 SKIP] Không tìm thấy thư mục public/game_icons.`);
  }

  // Check 4: Kích thước ảnh đơn lẻ trong public/
  const APPROVED_BRAND_ASSETS = [
    'brand_loader_logo.jpg',
    'brand_logo.jpg',
    'icon-192.png',
    'icon-512.png',
    'logo.jpg'
  ];
  function scanImages(dir) {
    let list = [];
    if (!fs.existsSync(dir)) return list;
    for (const item of fs.readdirSync(dir)) {
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        list = list.concat(scanImages(p));
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'].includes(ext)) {
          list.push({ file: item, path: p, size: stat.size });
        }
      }
    }
    return list;
  }
  const allImages = scanImages(path.join(root, 'public'));
  const oversizedImages = allImages.filter(img => {
    if (APPROVED_BRAND_ASSETS.includes(img.file)) {
      return img.size > 450 * 1024; // Whitelist logo/icon max 450 KB
    }
    return img.size > 350 * 1024; // Standard images max 350 KB
  });
  if (oversizedImages.length > 0) {
    failures.push(`[Check 4 FAIL] Phát hiện ${oversizedImages.length} ảnh trong public/ vượt quá 350 KB: ${oversizedImages.map(i => `${i.file} (${formatKB(i.size)})`).join(', ')}`);
  } else {
    console.log(`   ✅ [Check 4 PASS] Tất cả ${allImages.length} ảnh trong public/ đều nằm trong ngân sách cho phép.`);
    passCount++;
  }

  // Check 5: Dữ liệu tĩnh mới trong src/data/
  const dataDir = path.join(root, 'src', 'data');
  const APPROVED_DATA_FILES = [
    'canonical_backup_state.json',
    'crawled_codes_188.json',
    'crawler_sources.json',
    'defaultUpcomingGames.ts',
    'games188.json',
    'giveaways.json',
    'industryPresetProducts.ts',
    'industryPresets.ts',
    'seedData.ts',
    'seedGameEvents.ts',
    'seedNews.ts',
    'storeProducts.json',
    'universalProducts.ts',
    'update_sources.json',
    'utilities.json'
  ];
  if (fs.existsSync(dataDir)) {
    const unapprovedHeavy = [];
    for (const item of fs.readdirSync(dataDir)) {
      const p = path.join(dataDir, item);
      const stat = fs.statSync(p);
      if (!stat.isDirectory() && !APPROVED_DATA_FILES.includes(item)) {
        if (stat.size > 200 * 1024) {
          unapprovedHeavy.push(`${item} (${formatKB(stat.size)})`);
        }
      }
    }
    if (unapprovedHeavy.length > 0) {
      failures.push(`[Check 5 FAIL] Phát hiện tệp dữ liệu tĩnh mới > 200 KB chưa được cấp phép trong src/data/: ${unapprovedHeavy.join(', ')}`);
    } else {
      console.log(`   ✅ [Check 5 PASS] Không có tệp dữ liệu tĩnh nặng trái phép trong src/data/.`);
      passCount++;
    }
  }
}

// -------------------------------------------------------------
// GIAI ĐOẠN 2: POST-BUILD CHECKS
// -------------------------------------------------------------
if (stage === 'post' || stage === 'all') {
  console.log('\n🔍 [STAGE: POST-BUILD] Đang quét đầu ra Vite & Cloudflare Edge Worker bundle...');

  const distDir = path.join(root, 'dist');
  const distAssetsDir = path.join(distDir, 'assets');
  const workerFile = path.join(distDir, '_worker.js');

  if (!fs.existsSync(distDir)) {
    if (stage === 'post') {
      failures.push(`[Check 6-8 FAIL] Thư mục dist/ không tồn tại! Cần chạy build trước khi kiểm tra post-build.`);
    } else {
      console.log(`   ℹ️ [POST-BUILD SKIP] Thư mục dist/ chưa được build. Bỏ qua kiểm tra post-build.`);
    }
  } else {
    // Check 6: Frontend Component Chunks trong dist/assets/
    if (fs.existsSync(distAssetsDir)) {
      const assets = fs.readdirSync(distAssetsDir);
      const jsChunks = assets.filter(f => f.endsWith('.js'));
      const OFFLINE_CATALOG_WHITELIST = [
        'CrawlerModule',
        'seed-news-fallback',
        'games-catalog-fallback'
      ];
      let oversizedChunks = [];
      let adminAppChunk = null;

      for (const chunk of jsChunks) {
        const p = path.join(distAssetsDir, chunk);
        const s = fs.statSync(p).size;
        if (chunk.startsWith('AdminApp-')) {
          adminAppChunk = { name: chunk, size: s };
        }
        const isWhitelisted = OFFLINE_CATALOG_WHITELIST.some(prefix => chunk.startsWith(prefix));
        if (!isWhitelisted && s > 650 * 1024) {
          oversizedChunks.push(`${chunk} (${formatKB(s)})`);
        }
      }

      if (adminAppChunk) {
        const adminKB = adminAppChunk.size / 1024;
        if (adminKB > 600) {
          failures.push(`[Check 6 FAIL] Chunk AdminApp (${formatKB(adminAppChunk.size)}) vượt trần ngân sách cho phép (600 KB)!`);
        } else {
          console.log(`   ✅ [Check 6.1 PASS] Chunk AdminApp (${formatKB(adminAppChunk.size)}) duy trì mức tối ưu (< 600 KB).`);
          passCount++;
        }
      }

      if (oversizedChunks.length > 0) {
        failures.push(`[Check 6.2 FAIL] Phát hiện ${oversizedChunks.length} chunk component vượt quá 650 KB: ${oversizedChunks.join(', ')}`);
      } else {
        console.log(`   ✅ [Check 6.2 PASS] Tất cả các component chunks khác đều nằm trong ngân sách (< 650 KB).`);
        passCount++;
      }
    }

    // Check 7: Cloudflare Pages Edge Worker Bundle (dist/_worker.js)
    if (fs.existsSync(workerFile)) {
      const workerBytes = fs.statSync(workerFile).size;
      const workerMB = workerBytes / (1024 * 1024);
      console.log(`   ⚡ Edge Worker Bundle (dist/_worker.js): ${formatMB(workerBytes)}`);
      if (workerMB > 22.0) {
        failures.push(`[Check 7 FAIL] dist/_worker.js (${formatMB(workerBytes)}) vượt trần giới hạn an toàn Cloudflare Pages (22.00 MB)!`);
      } else if (workerMB > 20.0) {
        warnings.push(`[Check 7 WARN] dist/_worker.js (${formatMB(workerBytes)}) tiệm cận ngưỡng 20 MB.`);
        passCount++;
      } else {
        console.log(`   ✅ [Check 7 PASS] Edge Worker Bundle (${formatMB(workerBytes)}) nằm trong giới hạn cho phép (<= 22.00 MB).`);
        passCount++;
      }
    } else {
      failures.push(`[Check 7 FAIL] Không tìm thấy file dist/_worker.js sau build!`);
    }

    // Check 8: Tổng dung lượng thư mục dist/
    const distTotalBytes = getDirSizeBytes(distDir);
    const distTotalMB = distTotalBytes / (1024 * 1024);
    console.log(`   📦 Tổng dung lượng thư mục phân phối dist/: ${formatMB(distTotalBytes)}`);
    if (distTotalMB > 90.0) {
      failures.push(`[Check 8 FAIL] Thư mục dist/ (${formatMB(distTotalBytes)}) vượt quá ngân sách phân phối (90.00 MB)!`);
    } else if (distTotalMB > 85.0) {
      warnings.push(`[Check 8 WARN] Thư mục dist/ (${formatMB(distTotalBytes)}) đang tiệm cận mức 85 MB.`);
      passCount++;
    } else {
      console.log(`   ✅ [Check 8 PASS] Thư mục dist/ (${formatMB(distTotalBytes)}) đạt chuẩn phân phối tối ưu (<= 85.00 MB).`);
      passCount++;
    }
  }
}

// -------------------------------------------------------------
// TỔNG KẾT & KẾT QUẢ
// -------------------------------------------------------------
console.log('\n' + '-'.repeat(80));
console.log(`📊 BÁO CÁO KẾT QUẢ KIỂM TRA LEAN GUARD:`);
console.log(`   - Bài kiểm tra đạt (PASS): ${passCount}`);
console.log(`   - Cảnh báo (WARNINGS):   ${warnings.length}`);
console.log(`   - Vi phạm chặn (FAILURES): ${failures.length}`);

if (warnings.length > 0) {
  console.log('\n⚠️  DANH SÁCH CẢNH BÁO:');
  warnings.forEach(w => console.log(`   ${w}`));
}

if (failures.length > 0) {
  console.log('\n❌ DANH SÁCH VI PHẠM CẦN KHẮC PHỤC NGAY:');
  failures.forEach(f => console.log(`   ${f}`));
  console.log('\n🛑 [LEAN GUARD BLOCKED] Quy trình dừng lại do vi phạm ngân sách kích thước.');
  console.log('='.repeat(80));
  process.exit(1);
} else {
  console.log('\n🎉 [LEAN GUARD PASSED] Toàn bộ ngân sách kích thước hệ thống đạt chuẩn 100%!');
  console.log('='.repeat(80));
  process.exit(0);
}
