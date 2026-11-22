/**
 * scripts/test_upload_11_images.ts
 *
 * Kiểm thử giới hạn 10 ảnh kín cho mỗi mục trang chủ:
 * IMPORT VÀ GỌI TRỰC TIẾP CODE THẬT TỪ functions/services/homepage_image_service.ts
 *
 * Các kịch bản kiểm thử:
 * 1. Chèn tuần tự 10 ảnh đầu tiên -> Thành công 10/10.
 * 2. Cố gắng tải ảnh thứ 11 tuần tự -> Bị chặn ngay từ pre-insert check (HTTP 400).
 * 3. Kiểm thử tranh chấp đồng thời (Atomic Concurrency Race Condition):
 *    - 2 request upload đồng thời khi đã có 9 ảnh.
 *    - Cả 2 cùng vượt qua pre-check.
 *    - Request A chèn xong -> tổng 10 ảnh (hợp lệ).
 *    - Request B chèn xong -> tổng 11 ảnh -> kích hoạt Post-Insert Concurrency Guard.
 *    - Tự động hoàn tác xóa ảnh B (Rollback), trả HTTP 400. Tổng ảnh giữ nguyên chính xác 10.
 * 4. Kiểm thử đếm cả ảnh cũ (legacy format `sec_<sectionId>_*`) và ảnh đã backfill `section_id`.
 */

import {
  checkSectionImageLimit,
  insertSectionImage,
  postInsertAtomicCheckAndRollback,
  processAndPersistSectionImage,
  type SectionImageRecord,
} from '../functions/services/homepage_image_service.ts';

// D1 Database Driver Mock tương thích chuẩn D1 API của Cloudflare
class MockD1Database {
  private images: Array<SectionImageRecord & { created_at?: string; updated_at?: string }> = [];

  prepare(sql: string) {
    const trimmedSql = sql.replace(/\s+/g, ' ').trim();
    return {
      bind: (...args: any[]) => {
        return {
          first: async <T = any>(): Promise<T | null> => {
            if (trimmedSql.includes('COUNT(*) as count FROM homepage_section_images')) {
              const [sectionId, safe1, safe2] = args;
              const count = this.images.filter((img) => {
                if (img.section_id === sectionId) return true;
                if (img.id.startsWith(`sec_${safe1}_`)) return true;
                if (img.id.includes(safe2)) return true;
                return false;
              }).length;
              return { count } as unknown as T;
            }
            return null;
          },
          run: async () => {
            if (trimmedSql.includes('INSERT INTO homepage_section_images')) {
              const [
                id,
                file_name,
                content_type,
                image_base64,
                original_size_bytes,
                size_bytes,
                width,
                height,
                is_compressed,
                compression_error,
                source,
                section_id,
              ] = args;

              this.images.push({
                id,
                file_name,
                content_type,
                image_base64,
                original_size_bytes,
                size_bytes,
                width,
                height,
                is_compressed,
                compression_error,
                source,
                section_id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }

            if (trimmedSql.includes('DELETE FROM homepage_section_images WHERE id = ?')) {
              const [targetId] = args;
              const initialLen = this.images.length;
              this.images = this.images.filter((img) => img.id !== targetId);
              return { success: true, meta: { changes: initialLen - this.images.length } };
            }

            return { success: true, meta: { changes: 0 } };
          },
        };
      },
    };
  }

  getImages() {
    return [...this.images];
  }

  seed(record: SectionImageRecord) {
    this.images.push(record);
  }

  clear() {
    this.images = [];
  }
}

async function runTestSuite() {
  const startTime = Date.now();
  console.log(`================================================================================`);
  console.log(`[TEST SUITE] HOMEPAGE IMAGE LIMIT (10 IMAGES QUOTA & ATOMIC CONCURRENCY GUARD)`);
  console.log(`Source-of-truth: functions/services/homepage_image_service.ts`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`================================================================================\n`);

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failCount++;
    }
  }

  // -------------------------------------------------------------
  // Test Case 1: Tải tuần tự 10 ảnh đầu tiên vào 1 mục hợp lệ
  // -------------------------------------------------------------
  console.log(`--- TEST 1: Tải tuần tự 10 ảnh đầu tiên vào mục 'hero_banner' ---`);
  const db1 = new MockD1Database();
  const sectionId = 'hero_banner';

  for (let i = 1; i <= 10; i++) {
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
    assert(result.success === true && result.count === i, `Ảnh ${i}/10 tải thành công (count: ${result.count})`);
  }

  const finalCount1 = (await checkSectionImageLimit(db1, sectionId)).count;
  assert(finalCount1 === 10, `Tổng số ảnh sau 10 lần tải tuần tự là đúng 10 (Thực tế: ${finalCount1})`);

  // -------------------------------------------------------------
  // Test Case 2: Tải ảnh thứ 11 tuần tự -> Bị chặn ngay từ Pre-check
  // -------------------------------------------------------------
  console.log(`\n--- TEST 2: Cố gắng tải ảnh thứ 11 tuần tự vào mục đã đầy ---`);
  const preCheck11 = await checkSectionImageLimit(db1, sectionId);
  assert(
    preCheck11.allowed === false && preCheck11.status === 400,
    `Pre-check phát hiện đạt tối đa 10 ảnh và chặn với HTTP 400 (count: ${preCheck11.count})`
  );

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
  assert(
    result11.success === false && result11.status === 400,
    `Ảnh thứ 11 bị từ chối lưu vào CSDL (status: ${result11.status}, error: "${result11.error}")`
  );

  const countAfter11 = (await checkSectionImageLimit(db1, sectionId)).count;
  assert(countAfter11 === 10, `Số lượng ảnh trong CSDL vẫn giữ nguyên 10 (Không bị tràn)`);

  // -------------------------------------------------------------
  // Test Case 3: Kiểm thử tranh chấp đồng thời (Atomic Concurrency Race Condition)
  // Giả lập 2 request đồng thời khi CSDL đang có 9 ảnh:
  // Cả Request A và Request B đều vượt qua Pre-check (vì lúc đó count = 9 < 10).
  // -------------------------------------------------------------
  console.log(`\n--- TEST 3: Tranh chấp đồng thời (Atomic Concurrency Guard & Rollback) ---`);
  const dbRace = new MockD1Database();
  const raceSectionId = 'flash_sale';

  // Seed 9 ảnh vào CSDL
  for (let i = 1; i <= 9; i++) {
    dbRace.seed({
      id: `sec_${raceSectionId}_seed_${i}.webp`,
      file_name: `seed_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'test',
      original_size_bytes: 2048,
      size_bytes: 2048,
      width: 800,
      height: 800,
      is_compressed: 1,
      source: 'upload',
      section_id: raceSectionId,
    });
  }

  const racePreCheck = await checkSectionImageLimit(dbRace, raceSectionId);
  assert(racePreCheck.count === 9, `Trạng thái ban đầu: CSDL có 9 ảnh (quota: 9/10)`);

  // Giả lập Request A và Request B cùng vượt qua Pre-check
  const preCheckA = await checkSectionImageLimit(dbRace, raceSectionId);
  const preCheckB = await checkSectionImageLimit(dbRace, raceSectionId);
  assert(preCheckA.allowed && preCheckB.allowed, `Cả 2 request A và B đều pass Pre-check vì count = 9`);

  const reqA_Record: SectionImageRecord = {
    id: `sec_${raceSectionId}_reqA.webp`,
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
    id: `sec_${raceSectionId}_reqB.webp`,
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

  // Request A chèn trước -> Hợp lệ (tổng lên 10)
  const resA = await processAndPersistSectionImage(dbRace, raceSectionId, reqA_Record, true);
  assert(resA.success === true && resA.count === 10, `Request A chèn thành công (count: 10/10)`);

  // Request B chèn sau mà không có pre-check lại -> Tổng lên 11 -> Kích hoạt Post-Insert Concurrency Guard
  const resB = await processAndPersistSectionImage(dbRace, raceSectionId, reqB_Record, true);
  assert(
    resB.success === false && resB.status === 400,
    `Request B bị Post-Insert Guard phát hiện vi phạm và trả HTTP 400`
  );

  const imagesInDb = dbRace.getImages();
  const reqBExists = imagesInDb.some((img) => img.id === reqB_Record.id);
  assert(!reqBExists, `Request B đã được tự động ROLLBACK xóa khỏi CSDL`);
  assert(imagesInDb.length === 10, `Tổng số ảnh sau tranh chấp đồng thời duy trì đúng 10 ảnh (Không vượt quá)`);

  // -------------------------------------------------------------
  // Test Case 4: Nhận diện và đếm cả ảnh cũ (legacy) và ảnh mới
  // -------------------------------------------------------------
  console.log(`\n--- TEST 4: Đếm ảnh legacy (tiền tố sec_<id>_ không có section_id) và ảnh mới ---`);
  const dbLegacy = new MockD1Database();
  const legacySectionId = 'main_hero_banner';

  // Seed 4 ảnh cũ chỉ có id theo định dạng 'sec_main_hero_banner_...' với section_id null
  for (let i = 1; i <= 4; i++) {
    dbLegacy.seed({
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
      section_id: '' as any, // Legacy record without section_id
    });
  }

  // Seed 3 ảnh mới có section_id đầy đủ
  for (let i = 1; i <= 3; i++) {
    dbLegacy.seed({
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

  const legacyCheck = await checkSectionImageLimit(dbLegacy, legacySectionId);
  assert(
    legacyCheck.count === 7,
    `Đếm chính xác tổng cộng 7 ảnh (4 legacy + 3 mới): count = ${legacyCheck.count}`
  );
  assert(legacyCheck.allowed === true, `Quota còn 3 chỗ trống (7/10)`);

  console.log(`\n================================================================================`);
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED in ${Date.now() - startTime}ms`);
  console.log(`100% PRODUCTION CODE REAL IMPORT VERIFIED`);
  console.log(`================================================================================`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]:', err);
  process.exit(1);
});
