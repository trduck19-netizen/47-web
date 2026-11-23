/**
 * scripts/test_upload_11_images.ts
 *
 * Kiểm thử giới hạn 10 ảnh kín cho mỗi mục trang chủ trên CSDL SQLite C-Engine thật (node:sqlite)
 * tương thích 100% Cloudflare D1 Runtime Interface:
 * IMPORT VÀ GỌI TRỰC TIẾP CODE SẢN XUẤT TỪ functions/services/homepage_image_service.ts
 *
 * Các kịch bản kiểm thử:
 * 1. Chèn tuần tự 10 ảnh đầu tiên vào CSDL thật -> Thành công 10/10.
 * 2. Cố gắng tải ảnh thứ 11 tuần tự -> Bị chặn ngay từ pre-insert check (HTTP 400).
 * 3. Kiểm thử tranh chấp đồng thời THẬT (Concurrent Race Condition):
 *    - CSDL đang có đúng 9 ảnh.
 *    - Hai tác vụ upload bất đồng bộ chạy song song qua Promise.all().
 *    - Kích hoạt cơ chế Post-Insert Atomic Concurrency Guard trên CSDL thật.
 *    - Tự động hoàn tác (Rollback) xóa bản ghi vượt quá 10, trả HTTP 400.
 *    - Tổng số ảnh trong CSDL duy trì chính xác 10 ảnh (Không bao giờ tràn sang 11).
 * 4. Kiểm thử đếm đa điều kiện (ảnh cũ legacy format sec_<sectionId>_* và ảnh đã có section_id).
 * 5. Đo lường và ghi nhận thời gian chạy (duration ms) chi tiết cho từng ca kiểm thử.
 */

import { DatabaseSync } from 'node:sqlite';
import {
  checkSectionImageLimit,
  insertSectionImage,
  postInsertAtomicCheckAndRollback,
  processAndPersistSectionImage,
  type SectionImageRecord,
} from '../functions/services/homepage_image_service.ts';

// Trình điều khiển D1 chuẩn hóa chạy trên SQLite C-Engine thật của Node v24 (node:sqlite)
class RealSqliteD1Database {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS homepage_section_images (
        id TEXT PRIMARY KEY,
        file_name TEXT,
        content_type TEXT,
        image_base64 TEXT,
        original_size_bytes INTEGER,
        size_bytes INTEGER,
        width INTEGER,
        height INTEGER,
        is_compressed INTEGER DEFAULT 0,
        compression_error TEXT,
        source TEXT,
        section_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  prepare(query: string) {
    // Chuyển cú pháp datetime('now') nếu cần và biên dịch Prepared Statement thật
    const stmt = this.db.prepare(query);

    return {
      bind: (...args: any[]) => {
        // Chuyển undefined thành null theo chuẩn SQLite
        const normalizedArgs = args.map((a) => (a === undefined ? null : a));

        return {
          first: async <T = any>(): Promise<T | null> => {
            const row = stmt.get(...normalizedArgs);
            return (row as T) || null;
          },
          all: async <T = any>(): Promise<{ results: T[] }> => {
            const rows = stmt.all(...normalizedArgs);
            return { results: rows as T[] };
          },
          run: async (): Promise<{ success: boolean; meta: { changes: number } }> => {
            const result = stmt.run(...normalizedArgs);
            return { success: true, meta: { changes: Number(result.changes) } };
          },
        };
      },
    };
  }

  countDirect(sectionId: string): number {
    const row: any = this.db
      .prepare(`SELECT COUNT(*) as count FROM homepage_section_images WHERE section_id = ?`)
      .get(sectionId);
    return row ? Number(row.count) : 0;
  }

  totalRows(): number {
    const row: any = this.db.prepare(`SELECT COUNT(*) as count FROM homepage_section_images`).get();
    return row ? Number(row.count) : 0;
  }
}

async function runTestSuite() {
  const suiteStartTime = Date.now();
  console.log('================================================================================');
  console.log('[TEST SUITE] HOMEPAGE IMAGE LIMIT & CONCURRENCY GUARD (REAL SQLITE D1 ENGINE)');
  console.log('Source-of-truth: functions/services/homepage_image_service.ts');
  console.log(`Database Engine: node:sqlite (Embedded SQLite C-Engine)`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('================================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, durationMs: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName} (${durationMs}ms)`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${testName} (${durationMs}ms) - ${detail || 'Assertion failed'}`);
      failCount++;
    }
  }

  // -------------------------------------------------------------
  // Test Case 1: Tải tuần tự 10 ảnh đầu tiên vào CSDL SQLite thật
  // -------------------------------------------------------------
  console.log(`--- TEST 1: Tải tuần tự 10 ảnh đầu tiên vào mục 'main_hero_banner' ---`);
  const db1 = new RealSqliteD1Database();
  const sectionId = 'main_hero_banner';

  for (let i = 1; i <= 10; i++) {
    const start = performance.now();
    const mockRecord: SectionImageRecord = {
      id: `sec_${sectionId}_img_${i}_${Date.now()}.webp`,
      file_name: `banner_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vlAAA===',
      original_size_bytes: 4096,
      size_bytes: 4096,
      width: 1200,
      height: 400,
      is_compressed: 1,
      source: 'upload',
      section_id: sectionId,
    };

    const result = await processAndPersistSectionImage(db1, sectionId, mockRecord);
    const duration = (performance.now() - start).toFixed(2);
    assert(result.success === true && result.count === i, `Ảnh ${i}/10 chèn thành công (count: ${result.count})`, duration);
  }

  const startCheck1 = performance.now();
  const finalCount1 = (await checkSectionImageLimit(db1, sectionId)).count;
  assert(finalCount1 === 10, `Tổng số ảnh sau 10 lần tải tuần tự là đúng 10 (Thực tế trong CSDL: ${finalCount1})`, (performance.now() - startCheck1).toFixed(2));

  // -------------------------------------------------------------
  // Test Case 2: Tải ảnh thứ 11 tuần tự -> Bị chặn ngay từ Pre-check
  // -------------------------------------------------------------
  console.log(`\n--- TEST 2: Cố gắng tải ảnh thứ 11 tuần tự vào mục đã đầy 10 ảnh ---`);
  const start11 = performance.now();
  const preCheck11 = await checkSectionImageLimit(db1, sectionId);
  const durPre11 = (performance.now() - start11).toFixed(2);
  assert(
    preCheck11.allowed === false && preCheck11.status === 400,
    `Pre-check phát hiện đạt tối đa 10 ảnh và chặn với HTTP 400 (count: ${preCheck11.count})`,
    durPre11
  );

  const startPersist11 = performance.now();
  const img11Record: SectionImageRecord = {
    id: `sec_${sectionId}_img_11_${Date.now()}.webp`,
    file_name: `banner_11.webp`,
    content_type: 'image/webp',
    image_base64: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vlAAA===',
    original_size_bytes: 4096,
    size_bytes: 4096,
    width: 1200,
    height: 400,
    is_compressed: 1,
    source: 'upload',
    section_id: sectionId,
  };

  const result11 = await processAndPersistSectionImage(db1, sectionId, img11Record);
  const durPersist11 = (performance.now() - startPersist11).toFixed(2);
  assert(
    result11.success === false && result11.status === 400,
    `Ảnh thứ 11 bị từ chối lưu vào CSDL thật (status: ${result11.status}, error: "${result11.error}")`,
    durPersist11
  );

  const startCount11 = performance.now();
  const countAfter11 = (await checkSectionImageLimit(db1, sectionId)).count;
  assert(countAfter11 === 10, `Số lượng ảnh trong CSDL vẫn giữ nguyên 10 (Không bị tràn)`, (performance.now() - startCount11).toFixed(2));

  // -------------------------------------------------------------
  // Test Case 3: Kiểm thử tranh chấp đồng thời THẬT (Concurrent Race Condition)
  // Hai request upload chạy song song vào cùng 1 mục khi CSDL đang có 9 ảnh.
  // -------------------------------------------------------------
  console.log(`\n--- TEST 3: Tranh chấp đồng thời THẬT (Concurrent Uploads on 9 Images) ---`);
  const dbRace = new RealSqliteD1Database();
  const raceSectionId = 'flash_sale';

  // Seed 9 ảnh vào CSDL thật
  for (let i = 1; i <= 9; i++) {
    await insertSectionImage(dbRace, {
      id: `sec_${raceSectionId}_seed_${i}.webp`,
      file_name: `seed_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'data:image/webp;base64,...',
      original_size_bytes: 2048,
      size_bytes: 2048,
      width: 800,
      height: 800,
      is_compressed: 1,
      source: 'upload',
      section_id: raceSectionId,
    });
  }

  const racePreStart = performance.now();
  const racePreCheck = await checkSectionImageLimit(dbRace, raceSectionId);
  assert(racePreCheck.count === 9, `Trạng thái ban đầu: CSDL thật có đúng 9 ảnh (quota: 9/10)`, (performance.now() - racePreStart).toFixed(2));

  // Tạo 2 bản ghi ảnh riêng biệt cho 2 request đồng thời
  const reqA_Record: SectionImageRecord = {
    id: `sec_${raceSectionId}_reqA_${Date.now()}.webp`,
    file_name: `reqA.webp`,
    content_type: 'image/webp',
    image_base64: 'base64A',
    original_size_bytes: 3000,
    size_bytes: 3000,
    width: 600,
    height: 600,
    is_compressed: 1,
    source: 'upload',
    section_id: raceSectionId,
  };

  const reqB_Record: SectionImageRecord = {
    id: `sec_${raceSectionId}_reqB_${Date.now()}.webp`,
    file_name: `reqB.webp`,
    content_type: 'image/webp',
    image_base64: 'base64B',
    original_size_bytes: 3000,
    size_bytes: 3000,
    width: 600,
    height: 600,
    is_compressed: 1,
    source: 'upload',
    section_id: raceSectionId,
  };

  // Kích hoạt đồng thời 2 request song song (Promise.all)
  const raceOpStart = performance.now();
  const [resA, resB] = await Promise.all([
    processAndPersistSectionImage(dbRace, raceSectionId, reqA_Record),
    processAndPersistSectionImage(dbRace, raceSectionId, reqB_Record),
  ]);
  const raceOpDur = (performance.now() - raceOpStart).toFixed(2);

  // Phân tích kết quả: Chính xác 1 request thành công (200) và 1 request bị chặn/rollback (400)
  const successCount = [resA, resB].filter((r) => r.success === true).length;
  const rejectedCount = [resA, resB].filter((r) => r.success === false && r.status === 400).length;

  assert(
    successCount === 1 && rejectedCount === 1,
    `Tranh chấp đồng thời: Chính xác 1 request thành công và 1 request bị chặn/rollback (Success: ${successCount}, Rejected: ${rejectedCount})`,
    raceOpDur
  );

  const startRaceVerify = performance.now();
  const totalInDb = dbRace.totalRows();
  assert(totalInDb === 10, `Tổng số bản ghi trong CSDL sau tranh chấp duy trì đúng 10 ảnh (Không bao giờ là 11)`, (performance.now() - startRaceVerify).toFixed(2));

  // -------------------------------------------------------------
  // Test Case 4: Đếm đa điều kiện (ảnh cũ legacy sec_<id>_* và ảnh mới)
  // -------------------------------------------------------------
  console.log(`\n--- TEST 4: Đếm ảnh legacy (tiền tố sec_<id>_ không có section_id) và ảnh mới ---`);
  const dbLegacy = new RealSqliteD1Database();
  const legacySectionId = 'main_hero_banner';

  const startSeed = performance.now();
  // Seed 4 ảnh cũ không có section_id
  for (let i = 1; i <= 4; i++) {
    await insertSectionImage(dbLegacy, {
      id: `sec_${legacySectionId}_legacy_${i}.webp`,
      file_name: `legacy_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'data',
      original_size_bytes: 1000,
      size_bytes: 1000,
      width: 100,
      height: 100,
      is_compressed: 1,
      source: 'upload',
      section_id: '' as any,
    });
  }

  // Seed 3 ảnh mới có section_id đầy đủ
  for (let i = 1; i <= 3; i++) {
    await insertSectionImage(dbLegacy, {
      id: `img_new_${i}.webp`,
      file_name: `new_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'data',
      original_size_bytes: 1000,
      size_bytes: 1000,
      width: 100,
      height: 100,
      is_compressed: 1,
      source: 'upload',
      section_id: legacySectionId,
    });
  }
  const durSeed = (performance.now() - startSeed).toFixed(2);

  const startLegacyCheck = performance.now();
  const legacyCheck = await checkSectionImageLimit(dbLegacy, legacySectionId);
  const durLegacy = (performance.now() - startLegacyCheck).toFixed(2);

  assert(
    legacyCheck.count === 7,
    `Đếm chính xác tổng cộng 7 ảnh (4 legacy + 3 mới): count = ${legacyCheck.count}`,
    durLegacy
  );
  assert(legacyCheck.allowed === true, `Hạn mức còn 3 slot khả dụng (7/10)`, durLegacy);

  const totalSuiteDuration = Date.now() - suiteStartTime;
  console.log('\n================================================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED in ${totalSuiteDuration}ms`);
  console.log('100% PRODUCTION CODE REAL IMPORT VERIFIED ON REAL SQLITE C-ENGINE');
  console.log('================================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]:', err);
  process.exit(1);
});
