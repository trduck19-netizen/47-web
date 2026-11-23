const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('dist/assets').filter(f => f.endsWith('.js'));
const patterns = [
  '||"Mục Tự Thêm"',
  '||"Custom Items"',
  'groupNameVi:"Thanh Điều Hướng"',
  'groupNameEn:"Navigation Bar"',
  'groupNameVi:"Hàng Lối Tắt"',
  'groupNameEn:"Quick Shortcuts"',
  'groupNameVi:"Tab Ngành Hàng"',
  'groupNameEn:"Category Tabs"',
  'groupNameVi:"Thanh Sắp Xếp"',
  'groupNameEn:"Sorting Bar"',
];

let totalHits = 0;
for (const file of files) {
  const content = fs.readFileSync(path.join('dist/assets', file), 'utf8');
  for (const p of patterns) {
    if (content.includes(p)) {
      console.log('HIT:', p, 'in', file);
      totalHits++;
    }
  }
}

console.log('=== CHỐT CHẶN 5 KẾT QUẢ QUÉT BUNDLE ===');
console.log('Total pattern hits in dist/assets:', totalHits);
if (totalHits === 0) {
  console.log('PASSED: 10/10 patterns = 0 hits in bundle!');
  process.exit(0);
} else {
  console.log('FAILED: Found hardcoded patterns in bundle!');
  process.exit(1);
}
