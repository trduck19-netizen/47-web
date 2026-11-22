/**
 * brand-migrator.cjs
 * Bộ công cụ quét và di chuyển thương hiệu tự động: CodeGame -> Pine Universal Mall
 * Áp dụng cho:
 *   - Web Khách: https://universal-mall-shop.pages.dev/
 *   - Web Quản trị: https://admin-universal-mall.pages.dev/admin
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Danh mục bảo lưu lịch sử (TUYỆT ĐỐI KHÔNG SỬA)
const HISTORICAL_EXCLUSIONS = [
  'CHANGELOG.md',
  'KNOWN_ISSUES.md',
  'PROJECT_MEMORY.md',
  'AGENTS.md',
  'GEMINI.md',
  'GIT_WORKFLOW.md',
  'docs',
  '.git',
  'node_modules',
  'dist',
  'scratch',
  '.system_generated',
  'scripts/brand-migrator.cjs',
  'scripts/extract.cjs',
  'scripts/extract_15334.cjs',
  'scripts/find_user_inputs.cjs'
];

function isExcluded(filePath) {
  const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  return HISTORICAL_EXCLUSIONS.some(ex => rel === ex || rel.startsWith(ex + '/'));
}

function getAllFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (['node_modules', '.git', 'dist', '.gemini', 'scratch'].includes(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// Kiểm tra quét và đếm
function runScan() {
  const allFiles = getAllFiles(ROOT_DIR);
  const scanResults = {
    historical: { files: 0, matches: 0 },
    activeBrandUrls: { count: 0, files: [] },
    activeBrandNames: { count: 0, files: [] },
    activeWcgStorage: { count: 0, files: [] },
    preservedGenericCodeGame: { count: 0, samples: [] }
  };

  for (const file of allFiles) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.webp', '.jpg', '.jpeg', '.ico', '.gif', '.woff', '.woff2', '.ttf'].includes(ext)) {
      continue;
    }

    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    if (isExcluded(file)) {
      const histMatches = (content.match(/codegame|code\s*game|wcg/gi) || []).length;
      if (histMatches > 0) {
        scanResults.historical.files++;
        scanResults.historical.matches += histMatches;
      }
      continue;
    }

    // Đếm URL thương hiệu cũ
    const urlMatches = content.match(/https?:\/\/(?:www\.)?(?:codegame\.shop|codegame\.store|web-code-game\.pages\.dev|admin-code-game-shop\.pages\.dev|test-code-game-shop\.pages\.dev|admin\.codegame\.shop)/gi) || [];
    if (urlMatches.length > 0) {
      scanResults.activeBrandUrls.count += urlMatches.length;
      scanResults.activeBrandUrls.files.push({ file: rel, count: urlMatches.length });
    }

    // Đếm tên thương hiệu cũ (không tính từ chung giftcode/code game)
    const brandMatches = content.match(/\bCodeGame(?:\.shop|\.Shop|\.store|\.Store)?\b|Sàn CodeGame Mall|CodeGame Mall|CodeGame Admin/g) || [];
    if (brandMatches.length > 0) {
      scanResults.activeBrandNames.count += brandMatches.length;
      scanResults.activeBrandNames.files.push({ file: rel, count: brandMatches.length });
    }

    // Đếm tiền tố wcg_ (ngoại trừ wcg_virtual_aggregates & wcg_virtual_events là 2 bảng D1 bảo lưu)
    if (rel.startsWith('src/')) {
      const wcgAll = content.match(/wcg_[a-zA-Z0-9_]+/g) || [];
      const wcgFiltered = wcgAll.filter(k => k !== 'wcg_virtual_aggregates' && k !== 'wcg_virtual_events');
      if (wcgFiltered.length > 0) {
        scanResults.activeWcgStorage.count += wcgFiltered.length;
        scanResults.activeWcgStorage.files.push({ file: rel, count: wcgFiltered.length });
      }
    }

    // Đếm từ chung giftcode game (để chứng minh không đổi nhầm)
    const genericMatches = content.match(/(?:mã|nhập|danh sách|kho|tổng hợp|tra cứu|hướng dẫn|chia sẻ|săn|quản lý|tìm|hỗ trợ)\s+code\s+game|giftcode\s+game|code\s+game\s+(?:mới nhất|miễn phí|mobile|g1)/gi) || [];
    if (genericMatches.length > 0) {
      scanResults.preservedGenericCodeGame.count += genericMatches.length;
      if (scanResults.preservedGenericCodeGame.samples.length < 8) {
        scanResults.preservedGenericCodeGame.samples.push(`${rel}: "${genericMatches[0]}"`);
      }
    }
  }

  return scanResults;
}

// Thực thi thay thế
function runMigration() {
  console.log('>>> BẮT ĐẦU DI CHUYỂN THƯƠNG HIỆU TỰ ĐỘNG <<<\n');
  const allFiles = getAllFiles(ROOT_DIR);
  let modifiedFilesCount = 0;
  const modifiedList = [];

  for (const file of allFiles) {
    if (isExcluded(file)) continue;

    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.webp', '.jpg', '.jpeg', '.ico', '.gif', '.woff', '.woff2', '.ttf'].includes(ext)) {
      continue;
    }

    let original = '';
    try {
      original = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    let modified = original;

    // ==========================================
    // NHÓM 1: THƯƠNG HIỆU HIỂN THỊ
    // ==========================================
    if (rel === 'index.html') {
      modified = modified.replace(
        /<title>.*CodeGame.*<\/title>/i,
        '<title>Pine Universal Mall - Siêu Thị Trực Tuyến & Cổng Tra Cứu Toàn Diện</title>'
      );
      modified = modified.replace(
        /<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/i,
        '<meta name="apple-mobile-web-app-title" content="Pine Mall" />'
      );
      modified = modified.replace(
        /<meta name="description" content="[^"]*" \/>/i,
        '<meta name="description" content="Pine Universal Mall - Sàn thương mại điện tử đa ngành hàng đầu, cung cấp hàng ngàn sản phẩm chất lượng cao, voucher độc quyền, giftcode miễn phí và tiện ích trực tuyến 24/7." />'
      );
      modified = modified.replace(
        /<meta name="keywords" content="[^"]*" \/>/i,
        '<meta name="keywords" content="pine universal mall, pine mall, sieu thi truc tuyen, san thuong mai dien tu, mua sam online, giftcode game, voucher khuyen mai" />'
      );
      modified = modified.replace(
        /<link rel="canonical" href="https:\/\/codegame\.shop\/" \/>/g,
        '<link rel="canonical" href="https://universal-mall-shop.pages.dev/" />'
      );
      modified = modified.replace(
        /<link rel="alternate" hreflang="vi" href="https:\/\/codegame\.shop\/" \/>/g,
        '<link rel="alternate" hreflang="vi" href="https://universal-mall-shop.pages.dev/" />'
      );
      modified = modified.replace(
        /<link rel="alternate" hreflang="x-default" href="https:\/\/codegame\.shop\/" \/>/g,
        '<link rel="alternate" hreflang="x-default" href="https://universal-mall-shop.pages.dev/" />'
      );
      modified = modified.replace(/<meta property="og:site_name" content="[^"]*" \/>/g, '<meta property="og:site_name" content="Pine Universal Mall" />');
      modified = modified.replace(/<meta property="og:url" content="https:\/\/codegame\.shop\/" \/>/g, '<meta property="og:url" content="https://universal-mall-shop.pages.dev/" />');
      modified = modified.replace(/<meta property="og:title" content="[^"]*" \/>/g, '<meta property="og:title" content="Pine Universal Mall - Siêu Thị Trực Tuyến & Cổng Tra Cứu Toàn Diện" />');
      modified = modified.replace(/<meta property="og:description" content="[^"]*" \/>/g, '<meta property="og:description" content="Pine Universal Mall - Sàn thương mại điện tử đa ngành hàng đầu, cung cấp hàng ngàn sản phẩm chất lượng cao, voucher độc quyền, giftcode miễn phí và tiện ích trực tuyến 24/7." />');
      modified = modified.replace(/<meta property="og:image" content="https:\/\/codegame\.shop\/og-image\.jpg" \/>/g, '<meta property="og:image" content="https://universal-mall-shop.pages.dev/og-image.jpg" />');
      
      modified = modified.replace(/<meta name="twitter:domain" content="[^"]*" \/>/g, '<meta name="twitter:domain" content="universal-mall-shop.pages.dev" />');
      modified = modified.replace(/<meta name="twitter:url" content="https:\/\/codegame\.shop\/" \/>/g, '<meta name="twitter:url" content="https://universal-mall-shop.pages.dev/" />');
      modified = modified.replace(/<meta name="twitter:title" content="[^"]*" \/>/g, '<meta name="twitter:title" content="Pine Universal Mall - Siêu Thị Trực Tuyến & Cổng Tra Cứu Toàn Diện" />');
      modified = modified.replace(/<meta name="twitter:description" content="[^"]*" \/>/g, '<meta name="twitter:description" content="Pine Universal Mall - Sàn thương mại điện tử đa ngành hàng đầu, cung cấp hàng ngàn sản phẩm chất lượng cao, voucher độc quyền, giftcode miễn phí và tiện ích trực tuyến 24/7." />');
      modified = modified.replace(/<meta name="twitter:image" content="https:\/\/codegame\.shop\/og-image\.jpg" \/>/g, '<meta name="twitter:image" content="https://universal-mall-shop.pages.dev/og-image.jpg" />');

      modified = modified.replace(/"name":\s*"CodeGame\.shop"/g, '"name": "Pine Universal Mall"');
      modified = modified.replace(/https:\/\/codegame\.shop\/?/g, 'https://universal-mall-shop.pages.dev/');
      modified = modified.replace(/"description":\s*"Cổng tra cứu giftcode game mobile và webgame số 1 Việt Nam"/g, '"description": "Sàn thương mại điện tử đa ngành & Cổng tiện ích trực tuyến Pine Universal Mall"');

      // Storage migration inline loop
      if (!modified.includes('pine_storage_migrated_v1')) {
        const migrationSnippet = `
        // Storage Migration: wcg_* -> pine_*
        try {
          for (var k in localStorage) {
            if (k.indexOf('wcg_') === 0 && k.indexOf('wcg_virtual_') !== 0) {
              var nk = 'pine_' + k.slice(4);
              if (localStorage.getItem(nk) === null) {
                localStorage.setItem(nk, localStorage.getItem(k));
              }
              localStorage.removeItem(k);
            }
          }
        } catch(e) {}
        `;
        modified = modified.replace('(function() {', '(function() {' + migrationSnippet);
      }
      modified = modified.replace('Quản Trị Hệ Thống | Universal Mall', 'Quản Trị Hệ Thống | Pine Universal Mall');
    }

    if (rel === 'public/manifest.json') {
      modified = modified.replace(/"name":\s*"CodeGame[^"]*"/g, '"name": "Pine Universal Mall - Siêu Thị Trực Tuyến & Cổng Tiện Ích Đa Ngành"');
      modified = modified.replace(/"short_name":\s*"CodeGame"/g, '"short_name": "Pine Mall"');
      modified = modified.replace(
        /"description":\s*"Kho tổng hợp mã giftcode game mobile & PC miễn phí mới nhất 2026[^"]*"/g,
        '"description": "Sàn thương mại điện tử đa ngành Pine Universal Mall - mua sắm trực tuyến, tiện ích số, voucher khuyến mãi và quà tặng 24/7."'
      );
      modified = modified.replace(/"short_name":\s*"Code Game"/g, '"short_name": "Giftcode"');
    }

    if (rel === 'src/locales/vi.json') {
      modified = modified.replace(/"Toàn bộ bản quyền thuộc về CodeGame\.shop\."/g, '"Toàn bộ bản quyền thuộc về Pine Universal Mall."');
      modified = modified.replace(/"Trang Chủ Sàn CodeGame Mall"/g, '"Trang Chủ Pine Universal Mall"');
      modified = modified.replace(/"Về Đầu Trang Sàn CodeGame Mall"/g, '"Về Đầu Trang Pine Universal Mall"');
    }
    if (rel === 'src/locales/en.json') {
      modified = modified.replace(/"All rights reserved by CodeGame\.shop\."/g, '"All rights reserved by Pine Universal Mall."');
    }
    if (rel === 'src/locales/th.json') {
      modified = modified.replace(/"CodeGame Mall"/g, '"Pine Universal Mall"');
      modified = modified.replace(/"เกี่ยวกับ CodeGame Mall"/g, '"เกี่ยวกับ Pine Universal Mall"');
    }

    if (rel === 'src/admin/components/AdminSidebar.tsx') {
      modified = modified.replace(/CodeGame Admin/g, 'Pine Universal Mall');
    }
    if (rel === 'src/admin/components/AdminTopbar.tsx') {
      modified = modified.replace(/CodeGame Management System/g, 'Pine Universal Mall Management System');
      modified = modified.replace(/Hệ thống quản lý CodeGame/g, 'Hệ thống quản lý Pine Universal Mall');
    }
    if (rel === 'src/admin/components/AdminLoginGuard.tsx') {
      modified = modified.replace(/email:\s*res\.user\.email\s*\|\|\s*'admin@codegame\.shop'/g, "email: res.user.email || ''");
    }
    if (rel === 'src/admin/AdminApp.tsx') {
      modified = modified.replace(/email:\s*data\.user\.email\s*\|\|\s*'admin@codegame\.shop'/g, "email: data.user.email || ''");
      modified = modified.replace(
        /const target = isEn \? 'https:\/\/codegame\.shop\/en\/' : 'https:\/\/codegame\.shop\/';/g,
        "const clientOrigin = (import.meta.env.VITE_SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\\/$/, '');\n        const target = isEn ? `${clientOrigin}/en/` : `${clientOrigin}/`;"
      );
      modified = modified.replace(/hostname\.includes\('admin-code-game-shop'\)/g, "hostname.includes('admin-universal-mall') || hostname.includes('admin-code-game-shop')");
    }

    // UI Components brand references
    if (rel === 'src/components/DownloadAppModal.tsx') {
      modified = modified.replace(/CodeGame App/g, 'Pine Universal Mall App');
      modified = modified.replace(/Cài Đặt App CodeGame/g, 'Cài Đặt App Pine Universal Mall');
      modified = modified.replace(/Bạn có thể mở CodeGame/g, 'Bạn có thể mở Pine Universal Mall');
      modified = modified.replace(/Icon CodeGame/g, 'Icon Pine Universal Mall');
      modified = modified.replace(/href="\/download\/codegame\.apk"/g, 'href="/download/pine-universal-mall.apk"');
      modified = modified.replace(/download="CodeGame-v1\.0\.apk"/g, 'download="PineUniversalMall-v1.0.apk"');
      modified = modified.replace(/Tải File CodeGame\.apk \(2\.8 MB\)/g, 'Tải File PineUniversalMall.apk (2.8 MB)');
      modified = modified.replace(/mở app CodeGame trải nghiệm/g, 'mở app Pine Universal Mall trải nghiệm');
      modified = modified.replace(/alt="Mã QR Cài Đặt App CodeGame"/g, 'alt="Mã QR Cài Đặt App Pine Universal Mall"');
    }
    if (rel === 'src/components/Footer.tsx') {
      modified = modified.replace(/Cài Đặt App CodeGame/g, 'Cài Đặt App Pine Mall');
      modified = modified.replace(/Tải App CodeGame/g, 'Tải App Pine Mall');
    }
    if (rel === 'src/components/Header.tsx') {
      modified = modified.replace(/Cài đặt App CodeGame lên điện thoại/g, 'Cài đặt App Pine Universal Mall lên điện thoại');
    }
    if (rel === 'src/components/UserProfileModal.tsx') {
      modified = modified.replace(/Telegram CodeGame/g, 'Telegram Pine Universal Mall');
      modified = modified.replace(/Bot Telegram CodeGame/g, 'Bot Telegram Pine Universal Mall');
    }
    if (rel === 'src/components/shipping/ShippingTrackingModal.tsx') {
      modified = modified.replace(/CodeGame Logistics Center/g, 'Pine Universal Mall Logistics Center');
    }
    if (rel === 'src/components/NewsView.tsx') {
      modified = modified.replace(/alt="CodeGame"/g, 'alt="Pine Universal Mall"');
    }
    if (rel === 'src/admin/modules/NewsModule.tsx') {
      modified = modified.replace(/author:\s*'CodeGame Editorial'/g, "author: 'Pine Universal Mall Editorial'");
      modified = modified.replace(/alt="CodeGame"/g, 'alt="Pine Universal Mall"');
    }
    if (rel === 'src/admin/modules/TelegramModule.tsx') {
      modified = modified.replace(/\[CodeGame Admin Test\]/g, '[Pine Universal Mall Admin Test]');
    }

    // ==========================================
    // NHÓM 2: URL & DOMAIN GHI CỨNG TRONG CODE
    // ==========================================
    if (rel === 'src/services/crossOriginSync.ts') {
      modified = modified.replace(
        /if \(hostname\.includes\('admin-code-game-shop'\)\) {\s*this\.targetOrigin = 'https:\/\/codegame\.shop';\s*} else if \(hostname\.includes\('web-code-game'\) \|\| hostname\.includes\('codegame\.shop'\)\) {\s*this\.targetOrigin = 'https:\/\/admin-code-game-shop\.pages\.dev';\s*}/g,
        `if (hostname.includes('admin-universal-mall') || hostname.includes('admin-code-game-shop')) {
      this.targetOrigin = (import.meta.env.VITE_SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\\/$/, '');
    } else if (hostname.includes('universal-mall-shop') || hostname.includes('web-code-game')) {
      this.targetOrigin = 'https://admin-universal-mall.pages.dev';
    }`
      );
    }

    if (rel === 'src/services/dataService.ts') {
      modified = modified.replace(/'https:\/\/codegame\.shop\/api\/sync'/g, "'/api/sync'");
      modified = modified.replace(/'https:\/\/codegame\.shop\/api\/giveaways\/claim'/g, "'/api/giveaways/claim'");
      modified = modified.replace(/'https:\/\/codegame\.shop\/api\/orders\/create'/g, "'/api/orders/create'");
      modified = modified.replace(/'guest@webcodegame\.vn'/g, "'guest@universal-mall-shop.pages.dev'");
      modified = modified.replace(/`${user\.username}@webcodegame\.vn`/g, "`${user.username}@universal-mall-shop.pages.dev`");
      modified = modified.replace(/'member@webcodegame\.vn'/g, "'member@universal-mall-shop.pages.dev'");
      modified = modified.replace(/'user@webcodegame\.vn'/g, "'user@universal-mall-shop.pages.dev'");
      modified = modified.replace(
        /const endpoint = isLocalhost \? 'https:\/\/codegame\.shop\/api\/auth\/me' : '\/api\/auth\/me';/g,
        "const endpoint = '/api/auth/me';"
      );
      modified = modified.replace(/if \(!host\.includes\('codegame\.shop'\) && !host\.includes\('localhost'\)\)/g, "if (!host.includes('universal-mall-shop.pages.dev') && !host.includes('codegame.shop') && !host.includes('localhost'))");
      modified = modified.replace(/\.\.\.\(currentOrigin && currentOrigin\.includes\('codegame\.shop'\) \? \[\] : \['https:\/\/codegame\.shop\/api\/orders\/create'\]\)/g, "...[]");
      modified = modified.replace(/siteTitle:\s*'CodeGame\.Shop'/g, "siteTitle: 'Pine Universal Mall'");
      modified = modified.replace(/bankAccount:\s*isDummy\s*\?\s*'CODE GAME SHOP'\s*:\s*\(parsed\.bankAccount \|\| 'CODE GAME SHOP'\)/g, "bankAccount: isDummy ? 'PINE UNIVERSAL MALL' : (parsed.bankAccount || 'PINE UNIVERSAL MALL')");
      modified = modified.replace(/bankAccount:\s*'CODE GAME SHOP'/g, "bankAccount: 'PINE UNIVERSAL MALL'");
    }

    if (rel === 'src/services/shippingService.ts') {
      modified = modified.replace(/https:\/\/codegame\.shop\/shipping-label\//g, '/shipping-label/');
      modified = modified.replace(/Kho Tổng Trung Tâm Sàn CodeGame/g, 'Kho Tổng Trung Tâm Pine Universal Mall');
      modified = modified.replace(/CodeGame Mall Official Store/g, 'Pine Universal Mall Official Store');
      modified = modified.replace(/Kho Vận Trung Tâm CodeGame/g, 'Kho Vận Trung Tâm Pine Universal Mall');
    }

    if (rel === 'src/services/newsService.ts') {
      modified = modified.replace(/CodeGame\.shop/gi, 'Pine Universal Mall');
      modified = modified.replace(/CodeGame\.store/gi, 'Pine Universal Mall');
      modified = modified.replace(/author:\s*incoming\.author \|\| existing\.author \|\| 'CodeGame'/g, "author: incoming.author || existing.author || 'Pine Universal Mall'");
      modified = modified.replace(/author:\s*articleData\.author \|\| 'CodeGame Editorial'/g, "author: articleData.author || 'Pine Universal Mall Editorial'");
      modified = modified.replace(/author:\s*'CodeGame Editorial'/g, "author: 'Pine Universal Mall Editorial'");
      modified = modified.replace(/author:\s*'CodeGame'/g, "author: 'Pine Universal Mall'");
    }

    if (rel === 'src/components/seo/LanguageSeoHead.tsx') {
      modified = modified.replace(/CodeGame\.shop - Kho Giftcode Game Mobile & Sàn TMĐT Đa Ngành #1 Việt Nam/g, 'Pine Universal Mall - Siêu Thị Trực Tuyến & Cổng Tra Cứu Toàn Diện');
      modified = modified.replace(/CodeGame\.shop - Latest Verified Game Giftcodes & Universal E-Commerce Platform/g, 'Pine Universal Mall - Leading Multi-Industry Shopping & Verified Services');
      modified = modified.replace(/Tra cứu giftcode game mobile, webgame bản quyền chính hãng ABEI\/G1 tại Việt Nam\. Nền tảng thương mại điện tử đa ngành/g, 'Pine Universal Mall - Sàn thương mại điện tử đa ngành hàng đầu, mua sắm trực tuyến chất lượng cao');
    }

    if (rel === 'functions/_worker.ts') {
      modified = modified.replace(
        /\(url\.hostname === 'web-code-game\.pages\.dev' \|\| url\.hostname === 'www\.codegame\.shop'\) &&\s*redirectUrl\.hostname = 'codegame\.shop';/g,
        `// Canonical domain check
        if (url.hostname === 'web-code-game.pages.dev' || url.hostname === 'www.codegame.shop') {
          redirectUrl.hostname = 'universal-mall-shop.pages.dev';
        }`
      );
      modified = modified.replace(/const BASE_URL = 'https:\/\/codegame\.shop';/g, "const BASE_URL = (env?.SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\\/$/, '');");
      modified = modified.replace(/const origin = 'https:\/\/codegame\.shop';/g, "const origin = (env?.SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\\/$/, '');");
      modified = modified.replace(/CodeGame\.shop/g, 'Pine Universal Mall');
      modified = modified.replace(/CodeGame\.Shop/g, 'Pine Universal Mall');
      modified = modified.replace(/CodeGame/g, 'Pine Universal Mall');
    }

    // Email & Notification helpers
    if (rel.startsWith('functions/api/notifications/')) {
      modified = modified.replace(/notifications@codegame\.shop/g, 'notifications@universal-mall-shop.pages.dev');
      modified = modified.replace(/contact@codegame\.shop/g, 'contact@universal-mall-shop.pages.dev');
      modified = modified.replace(/no-reply@codegame\.shop/g, 'no-reply@universal-mall-shop.pages.dev');
      modified = modified.replace(/const origin = 'https:\/\/codegame\.shop';/g, "const origin = (env?.SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\\/$/, '');");
      modified = modified.replace(/https:\/\/codegame\.shop/g, 'https://universal-mall-shop.pages.dev');
      modified = modified.replace(/<strong>codegame\.shop<\/strong>/g, '<strong>Pine Universal Mall</strong>');
      modified = modified.replace(/Quay Về Trang Chủ CodeGame\.shop/g, 'Quay Về Trang Chủ Pine Universal Mall');
      modified = modified.replace(/CodeGame Alert/g, 'Pine Universal Mall Alert');
      modified = modified.replace(/THÔNG BÁO TỪ CODEGAME\.SHOP/g, 'THÔNG BÁO TỪ PINE UNIVERSAL MALL');
      modified = modified.replace(/\bCODEGAME\.SHOP\b/g, 'PINE UNIVERSAL MALL');
    }

    // Crawler API services & proxies
    if (rel === 'functions/api/crawler/ingest-codes.ts') {
      modified = modified.replace(/service:\s*'CodeGame Crawler & Bot Ingestion API \(Muse Integration\)'/g, "service: 'Pine Universal Mall Crawler & Bot Ingestion API (Muse Integration)'");
      modified = modified.replace(
        /const allowedHosts = \['codegame\.shop', 'web-code-game\.pages\.dev', 'admin-code-game-shop\.pages\.dev', 'localhost'\];/g,
        "const allowedHosts = ['universal-mall-shop.pages.dev', 'admin-universal-mall.pages.dev', 'codegame.shop', 'localhost'];"
      );
    }
    if (rel === 'functions/api/crawler/marketing.ts') {
      modified = modified.replace(/service:\s*'CodeGame Marketing & FOMO Independent Audit API \(Muse Integration\)'/g, "service: 'Pine Universal Mall Marketing & FOMO Independent Audit API (Muse Integration)'");
    }
    if (rel === 'functions/api/game-icon.ts') {
      modified = modified.replace(/'X-Image-Proxy-By':\s*'CodeGame-/g, "'X-Image-Proxy-By': 'Pine-");
    }
    if (rel === 'functions/api/telegram/admin.ts') {
      modified = modified.replace(/website codegame\.shop/g, 'website Pine Universal Mall (universal-mall-shop.pages.dev)');
      modified = modified.replace(/For CodeGame Administrator/g, 'For Pine Universal Mall Administrator');
    }
    if (rel === 'public/download/README.txt') {
      modified = modified.replace(/CodeGame App v1\.0\.0/g, 'Pine Universal Mall App v1.0.0');
    }

    // Thay thế URL cũ trên diện rộng trong code và templates
    modified = modified.replace(/https:\/\/web-code-game\.pages\.dev/g, 'https://universal-mall-shop.pages.dev');
    modified = modified.replace(/https:\/\/admin-code-game-shop\.pages\.dev/g, 'https://admin-universal-mall.pages.dev');
    modified = modified.replace(/https:\/\/test-code-game-shop\.pages\.dev/g, 'https://universal-mall-shop.pages.dev');
    modified = modified.replace(/https:\/\/admin\.codegame\.shop/g, 'https://admin-universal-mall.pages.dev');
    modified = modified.replace(/https:\/\/www\.codegame\.shop/g, 'https://universal-mall-shop.pages.dev');
    modified = modified.replace(/https:\/\/codegame\.store/g, 'https://universal-mall-shop.pages.dev');
    modified = modified.replace(/https:\/\/codegame\.shop/g, 'https://universal-mall-shop.pages.dev');
    modified = modified.replace(/codegame\.shop\/store/g, 'universal-mall-shop.pages.dev/store');
    modified = modified.replace(/codegame\.shop\/game\//g, 'universal-mall-shop.pages.dev/game/');

    // Thay thế các chuỗi thương hiệu cụ thể còn lại
    modified = modified.replace(/CodeGame\.shop/g, 'Pine Universal Mall');
    modified = modified.replace(/CodeGame\.Shop/g, 'Pine Universal Mall');
    modified = modified.replace(/CodeGame\.store/g, 'Pine Universal Mall');
    modified = modified.replace(/CodeGame Store/g, 'Pine Mall Store');
    modified = modified.replace(/Sàn CodeGame Mall/g, 'Sàn Pine Universal Mall');
    modified = modified.replace(/CodeGame Mall/g, 'Pine Universal Mall');

    // ==========================================
    // NHÓM 3: DỮ LIỆU FILE JSON & SEED
    // ==========================================
    if (
      rel === 'src/data/crawled_codes_188.json' ||
      rel === 'public/data/crawled_codes_188.json' ||
      rel === 'public/data/codes_database.json' ||
      rel === 'src/data/seedNews.ts' ||
      rel === 'src/data/canonical_backup_state.json' ||
      rel === 'functions/data/canonical_backup_state.json' ||
      rel === 'public/sitemap.xml' ||
      rel === '.agents/skills/game-code-crawler-sync/SKILL.md'
    ) {
      modified = modified.replace(/https:\/\/codegame\.shop/g, 'https://universal-mall-shop.pages.dev');
      modified = modified.replace(/https:\/\/www\.codegame\.shop/g, 'https://universal-mall-shop.pages.dev');
      modified = modified.replace(/codegame\.shop/g, 'universal-mall-shop.pages.dev');
      modified = modified.replace(/CodeGame Store/g, 'Pine Mall Store');
      modified = modified.replace(/"author":\s*"CodeGame"/g, '"author": "Pine Universal Mall"');
      modified = modified.replace(/Cùng CodeGame tổng hợp/g, 'Cùng Pine Universal Mall tổng hợp');
      modified = modified.replace(/Codegame\.shop sẽ cập nhật/gi, 'Pine Universal Mall sẽ cập nhật');
      modified = modified.replace(/trên codegame\.shop đang có/gi, 'trên Pine Universal Mall đang có');
      modified = modified.replace(/Sau ngày ra mắt, codegame\.shop sẽ cập nhật/gi, 'Sau ngày ra mắt, Pine Universal Mall sẽ cập nhật');
      modified = modified.replace(/"CodeGame"/g, '"Pine Universal Mall"');
    }

    // ==========================================
    // NHÓM 4: ĐỊNH DANH NỘI BỘ (LOCALSTORAGE, CSS, TOKENS)
    // ==========================================
    if (rel === 'src/main.tsx') {
      modified = modified.replace(/import '\.\/codegame-shop-buttons\.css';/g, "import './pine-mall-buttons.css';");
      if (!modified.includes('migrateStoragePrefixes')) {
        modified = "import { migrateStoragePrefixes } from './utils/storageMigration';\nmigrateStoragePrefixes();\n" + modified;
      }
      modified = modified.replace(/wcg_vite_preload_error_reload/g, 'pine_vite_preload_error_reload');
    }

    // Chuyển đổi token prefix
    if (rel === 'src/utils/cryptoUtils.ts') {
      modified = modified.replace(/`wcg_tok_\${userId}_\${timestamp}_\${randomPart}`/g, "`pine_tok_${userId}_${timestamp}_${randomPart}`");
    }
    if (rel === 'functions/services/auth_service.ts') {
      modified = modified.replace(
        /return `wcg_edge_tok_\${userId}_\${timestamp}_\${random}_\${sig}`;/g,
        "return `pine_edge_tok_${userId}_${timestamp}_${random}_${sig}`;"
      );
      modified = modified.replace(
        /if \(token\.startsWith\('wcg_edge_tok_'\)\) {\s*const raw = token\.replace\('wcg_edge_tok_', ''\);/g,
        `if (token.startsWith('pine_edge_tok_') || token.startsWith('wcg_edge_tok_')) {
    const raw = token.startsWith('pine_edge_tok_') ? token.replace('pine_edge_tok_', '') : token.replace('wcg_edge_tok_', '');`
      );
    }
    if (rel === 'functions/api/sync.ts' || rel === 'functions/api/giveaways/simulate.ts') {
      modified = modified.replace(
        /if \(token\.startsWith\('wcg_edge_tok_'\)\)/g,
        "if (token.startsWith('pine_edge_tok_') || token.startsWith('wcg_edge_tok_'))"
      );
    }

    // Chuyển đổi các tiền tố nội bộ còn lại trong src/ (loại trừ 2 bảng D1 wcg_virtual_aggregates & wcg_virtual_events)
    if (rel.startsWith('src/')) {
      // LocalStorage keys:
      modified = modified.replace(/wcg_reported_codes_/g, 'pine_reported_codes_');
      modified = modified.replace(/wcg_search_overlay/g, 'pine_search_overlay');
      modified = modified.replace(/wcg_chunk_retry_/g, 'pine_chunk_retry_');
      modified = modified.replace(/wcg_otp_/g, 'pine_otp_');
      modified = modified.replace(/wcg_cart_updated/g, 'pine_cart_updated');
      
      // Cookie names:
      modified = modified.replace(/wcg_auth_user/g, 'pine_auth_user');
      modified = modified.replace(/wcg_auth_token/g, 'pine_auth_token');

      // Key placeholders:
      modified = modified.replace(/wcg_muse_\.\.\./g, 'pine_muse_...');
      modified = modified.replace(/wcg_ev_\.\.\./g, 'pine_ev_...');
      modified = modified.replace(/wcg_ev_•+/g, 'pine_ev_••••••••••••••••••••');
      modified = modified.replace(/wcg_gw_\.\.\./g, 'pine_gw_...');
      modified = modified.replace(/wcg_sk_YOUR_STORE_API_KEY_HERE/g, 'pine_sk_YOUR_STORE_API_KEY_HERE');
      modified = modified.replace(/`wcg_tg_\${generateRandomHex\(24\)}`/g, "`pine_tg_${generateRandomHex(24)}`");
    }

    if (rel === 'src/admin/modules/CrawlerModule.tsx') {
      modified = modified.replace(/const newKey = `wcg_muse_\${randomHex}`;/g, "const newKey = `pine_muse_${randomHex}`;");
    }

    // Ghi lại nếu có thay đổi
    if (modified !== original) {
      fs.writeFileSync(file, modified, 'utf8');
      modifiedFilesCount++;
      modifiedList.push(rel);
    }
  }

  // Đổi tên file vật lý: src/codegame-shop-buttons.css -> src/pine-mall-buttons.css
  const oldCssPath = path.join(ROOT_DIR, 'src/codegame-shop-buttons.css');
  const newCssPath = path.join(ROOT_DIR, 'src/pine-mall-buttons.css');
  if (fs.existsSync(oldCssPath)) {
    fs.renameSync(oldCssPath, newCssPath);
    console.log('✓ Đã đổi tên file src/codegame-shop-buttons.css -> src/pine-mall-buttons.css');
  }

  console.log(`✓ Đã cập nhật thành công ${modifiedFilesCount} files.`);
  return modifiedList;
}

// Chạy theo tham số
const args = process.argv.slice(2);
const mode = args[0] || 'count';

if (mode === 'migrate') {
  const before = runScan();
  console.log('=== THỐNG KÊ TRƯỚC KHI DI CHUYỂN ===');
  console.log('- URL cũ trong code:', before.activeBrandUrls.count);
  console.log('- Tên thương hiệu trong code:', before.activeBrandNames.count);
  console.log('- Khóa wcg_* trong src:', before.activeWcgStorage.count);
  console.log('- Lịch sử bảo lưu (giữ nguyên):', before.historical.matches);
  console.log('- Từ chung giftcode bảo tồn (giữ nguyên):', before.preservedGenericCodeGame.count);

  const modifiedList = runMigration();

  const after = runScan();
  console.log('\n=== THỐNG KÊ SAU KHI DI CHUYỂN ===');
  console.log('- URL cũ trong code còn lại:', after.activeBrandUrls.count);
  if (after.activeBrandUrls.count > 0) {
    console.log('  Chi tiết URL còn lại:', after.activeBrandUrls.files.slice(0, 10));
  }
  console.log('- Tên thương hiệu trong code còn lại:', after.activeBrandNames.count);
  if (after.activeBrandNames.count > 0) {
    console.log('  Chi tiết tên còn lại:', after.activeBrandNames.files.slice(0, 15));
  }
  console.log('- Khóa wcg_* trong src còn lại:', after.activeWcgStorage.count);
  if (after.activeWcgStorage.count > 0) {
    console.log('  Chi tiết wcg_* còn lại trong src:', after.activeWcgStorage.files.slice(0, 10));
  }
  console.log('- Lịch sử bảo lưu (giữ nguyên):', after.historical.matches);
  console.log('- Từ chung giftcode bảo tồn (giữ nguyên):', after.preservedGenericCodeGame.count);
  console.log('\nCác mẫu từ chung giftcode được bảo tồn hoàn hảo:');
  after.preservedGenericCodeGame.samples.forEach(s => console.log('  *', s));
} else {
  const current = runScan();
  console.log('=== KHẢO SÁT HIỆN TẠI ===');
  console.log('- URL cũ trong code:', current.activeBrandUrls.count);
  console.log('- Tên thương hiệu trong code:', current.activeBrandNames.count);
  console.log('- Khóa wcg_* trong src:', current.activeWcgStorage.count);
  console.log('- Lịch sử bảo lưu (giữ nguyên):', current.historical.matches);
  console.log('- Từ chung giftcode bảo tồn:', current.preservedGenericCodeGame.count);
}
