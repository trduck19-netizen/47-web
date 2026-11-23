const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../src/admin/modules/HomepageSectionsModule.tsx');
const code = fs.readFileSync(targetFile, 'utf8');

// Loại bỏ comment block /* ... */ và comment inline // ...
const cleanCode = code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// Regex trích xuất tất cả các lệnh gọi t('...') hoặc t("...")
const tCallRegex = /\bt\(\s*['"]([^'"]+)['"]/g;
const matches = [];
let match;

while ((match = tCallRegex.exec(cleanCode)) !== null) {
  matches.push(match[1]);
}

const uniqueKeys = Array.from(new Set(matches)).sort();

console.log('=====================================================');
console.log('HOMEPAGE SECTIONS MODULE I18N AST/REGEX AUDIT (CLEAN)');
console.log('Target:', targetFile);
console.log('Total t(...) Call Sites (Excluding Comments):', matches.length);
console.log('Total Unique Translation Keys:', uniqueKeys.length);
console.log('=====================================================');
console.log('Sample Keys (First 10):');
uniqueKeys.slice(0, 10).forEach((k, idx) => console.log(`  ${idx + 1}. ${k}`));
console.log('Sample Keys (Last 10):');
uniqueKeys.slice(-10).forEach((k, idx) => console.log(`  ${uniqueKeys.length - 10 + idx + 1}. ${k}`));
console.log('=====================================================');
