/**
 * Script Rào Chắn Tự Động Đa Ngôn Ngữ (Automated i18n Guard Scanner)
 * Mô phỏng tiêu chuẩn máy kiểm của Excel / Word:
 * Quét toàn bộ file giao diện của Web Khách và Bảng Quản Trị thuộc phạm vi đa ngôn ngữ.
 * Phát hiện bất kỳ chuỗi tiếng Việt ghi cứng nào không đi qua hàm dịch t() hoặc nhánh song ngữ.
 * Tự động dừng build/deploy với exit code 1 khi có vi phạm.
 */

const fs = require('fs');
const path = require('path');

const VIETNAMESE_ACCENT_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

// Danh mục các file giao diện cốt lõi của Web Khách & Bảng Quản Trị (In-scope files)
const IN_SCOPE_UI_FILES = [
  'src/App.tsx',
  'src/components/Header.tsx',
  'src/components/Footer.tsx',
  'src/components/MarketingNotificationToast.tsx',
  'src/components/shopee/ShopeeTestView.tsx',
  'src/admin/AdminApp.tsx',
  'src/admin/components/AdminSidebar.tsx',
  'src/admin/components/AdminTopbar.tsx',
  'src/admin/components/MultiLineAnalyticsChart.tsx',
  'src/admin/components/RecentBalanceChangesWidget.tsx',
  'src/admin/components/ui/DataTable.tsx',
  'src/admin/modules/DashboardModule.tsx',
  'src/admin/modules/OrdersModule.tsx',
  'src/admin/modules/MembersModule.tsx',
];

// Danh mục toàn bộ các thư mục giao diện UI (khi chạy ở chế độ audit toàn sàn --all)
const ALL_SCAN_PATHS = [
  path.join(__dirname, '..', 'src', 'App.tsx'),
  path.join(__dirname, '..', 'src', 'admin', 'AdminApp.tsx'),
  path.join(__dirname, '..', 'src', 'admin', 'components'),
  path.join(__dirname, '..', 'src', 'admin', 'modules'),
  path.join(__dirname, '..', 'src', 'components'),
];

// Whitelist các từ khóa hợp lệ (tên game bản quyền, tên thương hiệu, mã đơn, công nghệ, ngân hàng)
const ALLOWED_KEYWORDS = [
  'Pine Universal Mall',
  'Pine Mall',
  'Universal Mall',
  'Shopee',
  'Garena',
  'GHTK',
  'GHN',
  'Viettel Post',
  'VNPost',
  'VietQR',
  'SePay',
  'Telegram',
  'Võ Lâm',
  'Liên Quân',
  'Genshin',
  'Honkai',
  'Hiệp Khách',
  'Tây Du',
  'Kiếm Hiệp',
  'NAPAS',
  'TPBank',
  'MBBank',
  'MALL50K',
  'FREESHIP',
  'ORD-',
  'SPX',
  'Ahamove',
  'Core',
];

// Thu thập danh sách file giao diện (.tsx)
function collectUiFiles(targets) {
  const result = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      if (/\.(tsx|jsx)$/.test(target)) result.push(target);
    } else if (stat.isDirectory()) {
      const entries = fs.readdirSync(target);
      for (const entry of entries) {
        const full = path.join(target, entry);
        const subStat = fs.statSync(full);
        if (subStat.isDirectory()) {
          if (!['node_modules', 'dist', 'locales', 'services', 'data', 'types'].includes(entry)) {
            result.push(...collectUiFiles([full]));
          }
        } else if (/\.(tsx|jsx)$/.test(entry) && !entry.includes('.test.') && !entry.includes('.spec.')) {
          result.push(full);
        }
      }
    }
  }
  return [...new Set(result)];
}

/**
 * Quét một file giao diện tìm chuỗi tiếng Việt ghi cứng ngoài từ điển
 */
function scanUiFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  let inBlockComment = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const lineNum = idx + 1;
    const trimmed = rawLine.trim();

    // 1. Quản lý block comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    // 2. Bỏ qua dòng comment đơn & chỉ thị bỏ qua
    if (trimmed.startsWith('//') || trimmed.startsWith('{/*')) continue;
    if (trimmed.includes('@i18n-ignore') || trimmed.includes('/* i18n-ignore */')) continue;
    if (trimmed.startsWith('import ') || trimmed.startsWith('export type ') || trimmed.startsWith('interface ')) continue;
    if (trimmed.startsWith('console.')) continue;

    // 3. Nếu dòng không có ký tự tiếng Việt có dấu -> Bỏ qua
    if (!VIETNAMESE_ACCENT_REGEX.test(rawLine)) continue;

    // Loại bỏ comment cuối dòng
    const cleanLine = rawLine.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');

    // 4. Kiểm tra xem dòng có hàm dịch t(...) hoặc toán tử song ngữ không
    const isHandledByI18n =
      /\bt\s*(\(|\.|\?\.|\bglossary\b)/.test(cleanLine) ||
      /\b(isEn|language\s*===)\b/.test(cleanLine) ||
      /\bformat(Currency|DateTime|Number|Vnd|Core)\b/.test(cleanLine);

    if (isHandledByI18n) {
      continue;
    }

    // Kiểm tra thêm xem dòng này có nằm trong nhánh ternary isEn gần đó (trong phạm vi 4 dòng trước)
    let isInsideBilingualTernary = false;
    for (let back = 1; back <= 4 && idx - back >= 0; back++) {
      const prevLine = lines[idx - back].trim();
      if (/\b(isEn|language\s*===)\s*\?/.test(prevLine)) {
        isInsideBilingualTernary = true;
        break;
      }
    }
    if (isInsideBilingualTernary) {
      continue;
    }

    // 5. Kiểm tra JSX Text trần: > ... tiếng Việt ... <
    const jsxTextMatches = cleanLine.match(/>([^<>{}]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^<>{}]*)</g);
    if (jsxTextMatches) {
      for (const m of jsxTextMatches) {
        const textVal = m.slice(1, -1).trim();
        const isWhitelisted = ALLOWED_KEYWORDS.some((kw) => textVal.includes(kw));
        if (!isWhitelisted && VIETNAMESE_ACCENT_REGEX.test(textVal)) {
          violations.push({
            line: lineNum,
            type: 'JSX_TEXT_HARDCODED',
            content: textVal,
            snippet: trimmed,
          });
        }
      }
    }

    // 6. Kiểm tra các thuộc tính JSX tĩnh: title="...", placeholder="...", alt="...", label="..."
    const jsxAttrMatches = cleanLine.match(/\b(title|placeholder|alt|label|aria-label)\s*=\s*(["'])([^"']*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^"']*)\2/g);
    if (jsxAttrMatches) {
      for (const m of jsxAttrMatches) {
        const attrVal = m.replace(/^[a-z-]+\s*=\s*["']|["']$/g, '').trim();
        const isWhitelisted = ALLOWED_KEYWORDS.some((kw) => attrVal.includes(kw));
        if (!isWhitelisted && VIETNAMESE_ACCENT_REGEX.test(attrVal)) {
          violations.push({
            line: lineNum,
            type: 'JSX_ATTR_HARDCODED',
            content: attrVal,
            snippet: trimmed,
          });
        }
      }
    }

    // 7. Kiểm tra Template Literal nằm trực tiếp trong JSX: {`... tiếng Việt ...`}
    const jsxTemplateMatches = cleanLine.match(/\{\s*`([^\`]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^\`]*)`\s*\}/g);
    if (jsxTemplateMatches) {
      for (const m of jsxTemplateMatches) {
        const tplVal = m.replace(/^\{\s*`|`\s*\}$/g, '').trim();
        const isWhitelisted = ALLOWED_KEYWORDS.some((kw) => tplVal.includes(kw));
        if (!isWhitelisted && VIETNAMESE_ACCENT_REGEX.test(tplVal)) {
          violations.push({
            line: lineNum,
            type: 'JSX_TEMPLATE_LITERAL_HARDCODED',
            content: tplVal,
            snippet: trimmed,
          });
        }
      }
    }
  }

  return violations;
}

function runScanner() {
  const isAll = process.argv.includes('--all');
  console.log('🛡️  [I18N GUARD SCANNER] Khởi chạy máy kiểm tự động chuỗi tiếng Việt ghi cứng...');

  let filesToScan = [];
  if (isAll) {
    filesToScan = collectUiFiles(ALL_SCAN_PATHS);
    console.log(`   [CHẾ ĐỘ AUDIT TOÀN SÀN] Đang quét toàn bộ ${filesToScan.length} file giao diện (.tsx)...`);
  } else {
    filesToScan = IN_SCOPE_UI_FILES.map((rel) => path.join(__dirname, '..', rel));
    console.log(`   [PHẠM VI ĐA NGÔN NGỮ CHUẨN] Đang quét ${filesToScan.length} file giao diện cốt lõi (Web Khách & Bảng Quản Trị)...`);
  }

  let totalViolations = 0;
  const violationResults = [];

  for (const f of filesToScan) {
    if (!fs.existsSync(f)) continue;
    const violations = scanUiFile(f);
    if (violations.length > 0) {
      totalViolations += violations.length;
      violationResults.push({ file: f, violations });
    }
  }

  if (totalViolations > 0) {
    console.error('\n' + '='.repeat(80));
    console.error('🚨 [I18N SCANNER FAILED] PHÁT HIỆN CHUỖI TIẾNG VIỆT GHI CỨNG NGOÀI TỪ ĐIỂN!');
    console.error('   Quy trình Build / Deploy bị CHẶN ĐỨNG theo tiêu chuẩn đa ngôn ngữ Excel/Word.');
    console.error(`   Tổng số vi phạm: ${totalViolations} chuỗi.\n`);

    violationResults.forEach((res) => {
      const relPath = path.relative(path.join(__dirname, '..'), res.file).replace(/\\/g, '/');
      console.error(`📁 File: ${relPath} (${res.violations.length} lỗi):`);
      res.violations.forEach((v) => {
        console.error(`   • Dòng ${v.line} [${v.type}]: "${v.content}"`);
        console.error(`     Snippet: ${v.snippet}`);
      });
      console.error('');
    });

    console.error('💡 Hướng dẫn sửa chữa:');
    console.error('   1. Đưa chuỗi vào src/locales/vi.json & en.json hoặc glossary.json.');
    console.error('   2. Gọi hiển thị qua hàm dịch: t("key") hoặc {isEn ? "English" : "Tiếng Việt"}.');
    console.error('   3. Với tên riêng/mã đơn ngoại lệ: thêm từ vào ALLOWED_KEYWORDS hoặc ghi chú // @i18n-ignore.');
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }

  console.log(`✅ [I18N SCANNER PASSED] Đã quét sạch ${filesToScan.length} file giao diện.`);
  console.log('   🎉 0 chuỗi tiếng Việt ghi cứng ngoài từ điển! Sẵn sàng cho quy trình build & deploy.\n');
}

if (require.main === module) {
  runScanner();
}

module.exports = { runScanner, scanUiFile, collectUiFiles, IN_SCOPE_UI_FILES };
