/**
 * Script Dọn Dẹp Kho Ảnh Media Tĩnh An Toàn (Strict Pre-Check Protocol)
 * Căn cứ: Kế hoạch chi tiết Bước 3 (plan_dot_3_lean_media_optimization.md)
 * 
 * Nguyên tắc an toàn:
 * 1. Quét toàn bộ tệp trong public/game_icons/
 * 2. Xác định các tệp legacy (.jpg, .jpeg, .png)
 * 3. CHỈ XÓA khi tệp .webp tương ứng tồn tại và có dung lượng > 0 byte
 * 4. Ghi nhận nhật ký và số liệu đo lường chính xác
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'game_icons');

if (!fs.existsSync(ICONS_DIR)) {
  console.error('❌ Thư mục không tồn tại:', ICONS_DIR);
  process.exit(1);
}

const allFiles = fs.readdirSync(ICONS_DIR);
console.log(`🔍 Tổng số tệp ban đầu trong public/game_icons: ${allFiles.length} files`);

let initialTotalBytes = 0;
allFiles.forEach(f => {
  initialTotalBytes += fs.statSync(path.join(ICONS_DIR, f)).size;
});
console.log(`📊 Tổng dung lượng ban đầu: ${(initialTotalBytes / (1024 * 1024)).toFixed(2)} MB\n`);

let deletedCount = 0;
let deletedBytes = 0;
let skippedCount = 0;
const deletedList = [];
const skippedList = [];

for (const file of allFiles) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    const baseSlug = path.basename(file, ext);
    const targetWebpFile = `${baseSlug}.webp`;
    const targetWebpPath = path.join(ICONS_DIR, targetWebpFile);

    // Strict Pre-Check: Chỉ xóa nếu có bản .webp tồn tại và > 0 byte
    if (fs.existsSync(targetWebpPath)) {
      const webpStat = fs.statSync(targetWebpPath);
      if (webpStat.size > 0) {
        const filePath = path.join(ICONS_DIR, file);
        const fileStat = fs.statSync(filePath);
        deletedBytes += fileStat.size;
        deletedCount++;
        deletedList.push({ file, size: fileStat.size, targetWebpFile });
        fs.unlinkSync(filePath);
      } else {
        skippedCount++;
        skippedList.push({ file, reason: 'File .webp tương ứng 0 bytes' });
      }
    } else {
      skippedCount++;
      skippedList.push({ file, reason: 'Không tìm thấy file .webp tương ứng' });
    }
  }
}

const remainingFiles = fs.readdirSync(ICONS_DIR);
let finalTotalBytes = 0;
remainingFiles.forEach(f => {
  finalTotalBytes += fs.statSync(path.join(ICONS_DIR, f)).size;
});

console.log('====================================================');
console.log('✅ KẾT QUẢ DỌN DẸP KHO ẢNH MEDIA TĨNH:');
console.log(`   - Số files đã xóa an toàn: ${deletedCount} files`);
console.log(`   - Dung lượng đã giải phóng: ${(deletedBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - Số files bỏ qua (không đủ điều kiện): ${skippedCount} files`);
if (skippedList.length > 0) {
  console.log('   ⚠️ Danh sách bỏ qua:', skippedList);
}
console.log('----------------------------------------------------');
console.log(`   - Tổng số files còn lại: ${remainingFiles.length} files`);
console.log(`   - Tổng dung lượng còn lại: ${(finalTotalBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - Tỷ lệ giảm dung lượng: ${(((initialTotalBytes - finalTotalBytes) / initialTotalBytes) * 100).toFixed(2)}%`);
console.log('====================================================');

// Ghi kết quả vào file log đo lường thực tế (Gate 2: Zero-manual-copy numbers)
const logOutput = {
  timestamp: new Date().toISOString(),
  initialFileCount: allFiles.length,
  initialTotalBytes,
  initialTotalMB: Number((initialTotalBytes / (1024 * 1024)).toFixed(2)),
  deletedCount,
  deletedBytes,
  deletedMB: Number((deletedBytes / (1024 * 1024)).toFixed(2)),
  remainingFileCount: remainingFiles.length,
  remainingTotalBytes: finalTotalBytes,
  remainingTotalMB: Number((finalTotalBytes / (1024 * 1024)).toFixed(2)),
  reductionPercentage: Number((((initialTotalBytes - finalTotalBytes) / initialTotalBytes) * 100).toFixed(2))
};

fs.writeFileSync(
  path.join(__dirname, '..', 'docs', 'lean_media_cleanup_result.json'),
  JSON.stringify(logOutput, null, 2),
  'utf8'
);
console.log('📄 Đã ghi kết quả đo lường thực tế vào docs/lean_media_cleanup_result.json');
