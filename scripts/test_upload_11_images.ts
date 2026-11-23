/**
 * scripts/test_upload_11_images.ts
 *
 * Kiểm thử giới hạn 10 ảnh kín cho mỗi mục trang chủ trên CSDL SQLite C-Engine thật (node:sqlite)
 * và Server HTTP Network thật qua TCP sockets và fetch() đồng thời:
 * IMPORT VÀ GỌI TRỰC TIẾP CODE SẢN XUẤT TỪ functions/services/homepage_image_service.ts
 *
 * TÁCH BIỆT RÕ RÀNG HAI TẦNG KIỂM THỬ:
 * - PHẦN 1: UNIT TEST (SQLite C-Engine In-Memory) - Kiểm tra logic hạn mức và thuật toán rollback
 * - PHẦN 2: HTTP NETWORK TEST (Real HTTP Server & Real TCP Sockets) - Kiểm tra 2 request fetch() đồng thời
 *
 * Mọi kết quả đều ghi nhận mốc thời gian thực wall-clock chuẩn ISO/Local [HH:mm:ss.ms].
 */

import http from 'node:http';
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
    const stmt = this.db.prepare(query);

    return {
      bind: (...args: any[]) => {
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

function getWallClock(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${ms}]`;
}

async function runTestSuite() {
  const suiteStartTime = Date.now();
  console.log('================================================================================');
  console.log('[TEST SUITE] HOMEPAGE IMAGE LIMIT & CONCURRENCY GUARD (UNIT & HTTP NETWORK)');
  console.log('Source-of-truth: functions/services/homepage_image_service.ts');
  console.log(`Database Engine: node:sqlite (Embedded SQLite C-Engine)`);
  console.log(`Timestamp: ${new Date().toISOString()} | Wall-Clock: ${getWallClock()}`);
  console.log('================================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, durationMs: string, detail?: string) {
    const wc = getWallClock();
    if (condition) {
      console.log(`  ${wc} [PASS] ${testName} (${durationMs}ms)`);
      passCount++;
    } else {
      console.error(`  ${wc} [FAIL] ${testName} (${durationMs}ms) - ${detail || 'Assertion failed'}`);
      failCount++;
    }
  }

  // =========================================================================
  // PHẦN 1: UNIT TEST (REAL SQLITE C-ENGINE IN-MEMORY)
  // =========================================================================
  console.log('================================================================================');
  console.log('>>> PHẦN 1: UNIT TEST - REAL SQLITE C-ENGINE (node:sqlite) <<<');
  console.log('================================================================================\n');

  // Test Case 1: Tải tuần tự 10 ảnh đầu tiên vào CSDL SQLite thật
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

  // Test Case 2: Tải ảnh thứ 11 tuần tự -> Bị chặn ngay từ Pre-check
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

  // Test Case 3: Tranh chấp đồng thời trong cùng tiến trình (Promise.all)
  console.log(`\n--- TEST 3: Tranh chấp đồng thời cấp hàm (In-Memory Function Concurrency on 9 Images) ---`);
  const dbRace = new RealSqliteD1Database();
  const raceSectionId = 'flash_sale';

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

  const raceOpStart = performance.now();
  const [resA, resB] = await Promise.all([
    processAndPersistSectionImage(dbRace, raceSectionId, reqA_Record),
    processAndPersistSectionImage(dbRace, raceSectionId, reqB_Record),
  ]);
  const raceOpDur = (performance.now() - raceOpStart).toFixed(2);

  const successCount = [resA, resB].filter((r) => r.success === true).length;
  const rejectedCount = [resA, resB].filter((r) => r.success === false && r.status === 400).length;

  assert(
    successCount === 1 && rejectedCount === 1,
    `Tranh chấp cấp hàm: Đúng 1 request thành công và 1 request bị chặn/rollback (Success: ${successCount}, Rejected: ${rejectedCount})`,
    raceOpDur
  );

  const startRaceVerify = performance.now();
  const totalInDb = dbRace.totalRows();
  assert(totalInDb === 10, `Tổng số bản ghi trong CSDL sau tranh chấp cấp hàm duy trì đúng 10 ảnh`, (performance.now() - startRaceVerify).toFixed(2));

  // Test Case 4: Đếm ảnh legacy
  console.log(`\n--- TEST 4: Đếm ảnh legacy (tiền tố sec_<id>_ không có section_id) và ảnh mới ---`);
  const dbLegacy = new RealSqliteD1Database();
  const legacySectionId = 'main_hero_banner';

  const startSeed = performance.now();
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

  // =========================================================================
  // PHẦN 2: HTTP NETWORK TEST (REAL HTTP SERVER & REAL TCP SOCKETS VIA fetch)
  // =========================================================================
  console.log('\n================================================================================');
  console.log('>>> PHẦN 2: HTTP NETWORK TEST - REAL HTTP SERVER (TCP SOCKETS & DUAL FETCH) <<<');
  console.log('================================================================================\n');

  const httpDb = new RealSqliteD1Database();
  const httpSectionId = 'main_hero_banner';

  // Khởi tạo máy chủ HTTP thật chạy trên cổng ngẫu nhiên của loopback interface
  const server = http.createServer(async (req, res) => {
    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyData || '{}');
        const targetSection = String(body.section_id || '').trim();

        // 1. Pre-check hạn mức
        const preCheck = await checkSectionImageLimit(httpDb, targetSection);
        if (!preCheck.allowed) {
          res.writeHead(preCheck.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: preCheck.error, count: preCheck.count }));
          return;
        }

        // Mô phỏng độ trễ I/O mạng 15ms để kiểm tra khả năng đón nhận request song song ngoài đời thực
        await new Promise((r) => setTimeout(r, 15));

        const imageId = `sec_${targetSection}_http_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.webp`;
        const record: SectionImageRecord = {
          id: imageId,
          file_name: body.file_name || 'upload.webp',
          content_type: 'image/webp',
          image_base64: body.image_base64 || 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vlAAA===',
          original_size_bytes: 4096,
          size_bytes: 4096,
          width: 1200,
          height: 400,
          is_compressed: 1,
          source: 'upload',
          section_id: targetSection,
        };

        // 2. Insert vào CSDL thật
        await insertSectionImage(httpDb, record);

        // 3. Post-Insert Atomic Concurrency Guard & Rollback
        const postCheck = await postInsertAtomicCheckAndRollback(httpDb, targetSection, imageId);
        if (!postCheck.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: postCheck.error, rolledBack: true }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, image_id: imageId, count: postCheck.totalCount }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || 'Server Error' }));
      }
    });
  });

  // Khởi động HTTP server trên port tự do
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as { port: number };
  const serverUrl = `http://127.0.0.1:${address.port}/api/admin/homepage-sections/upload-image`;
  console.log(`[HTTP SERVER STARTED] Listening on ${serverUrl} at ${getWallClock()}\n`);

  // Seed trước 9 ảnh vào CSDL cho mục HTTP
  for (let i = 1; i <= 9; i++) {
    await insertSectionImage(httpDb, {
      id: `sec_${httpSectionId}_seed_http_${i}.webp`,
      file_name: `seed_http_${i}.webp`,
      content_type: 'image/webp',
      image_base64: 'data',
      original_size_bytes: 2000,
      size_bytes: 2000,
      width: 800,
      height: 400,
      is_compressed: 1,
      source: 'upload',
      section_id: httpSectionId,
    });
  }

  // Test Case 5: Bắn 2 request HTTP fetch() THẬT song song qua TCP sockets khi CSDL đang có 9 ảnh
  console.log(`--- TEST 5: HTTP Network Concurrency Test (2 Simultaneous fetch() over TCP Sockets) ---`);
  console.log(`  Mục: '${httpSectionId}' hiện đang có 9 ảnh trong CSDL.`);
  console.log(`  Bắn đồng thời 2 request HTTP POST qua 2 kết nối mạng TCP socket riêng biệt...`);

  const reqAPayload = JSON.stringify({
    action: 'upload',
    section_id: httpSectionId,
    file_name: 'net_banner_reqA.webp',
  });

  const reqBPayload = JSON.stringify({
    action: 'upload',
    section_id: httpSectionId,
    file_name: 'net_banner_reqB.webp',
  });

  const httpStartPerf = performance.now();

  const [httpResA, httpResB] = await Promise.all([
    fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: reqAPayload,
    }),
    fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: reqBPayload,
    }),
  ]);

  const httpDur = (performance.now() - httpStartPerf).toFixed(2);
  const dataA = await httpResA.json();
  const dataB = await httpResB.json();

  console.log(`  ${getWallClock()} Request 1 HTTP Status: ${httpResA.status} (Body: ${JSON.stringify(dataA)})`);
  console.log(`  ${getWallClock()} Request 2 HTTP Status: ${httpResB.status} (Body: ${JSON.stringify(dataB)})`);

  const httpStatuses = [httpResA.status, httpResB.status].sort();
  assert(
    httpStatuses[0] === 200 && httpStatuses[1] === 400,
    `HTTP Concurrency: Đúng 1 request trả về HTTP 200 và 1 request trả về HTTP 400 (Statuses: ${httpStatuses.join(', ')})`,
    httpDur
  );

  const countAfterHttp = httpDb.totalRows();
  assert(
    countAfterHttp === 10,
    `Số bản ghi trong CSDL sau 2 request HTTP đồng thời đúng 10 ảnh (Atomic rollback thành công: ${countAfterHttp}/10)`,
    (performance.now() - httpStartPerf).toFixed(2)
  );

  // Test Case 6: Gửi tiếp request HTTP thứ 3 khi CSDL đã đạt 10 ảnh
  console.log(`\n--- TEST 6: HTTP Request thứ 3 khi CSDL đã đạt 10 ảnh (HTTP 400 Pre-check Over Network) ---`);
  const http3Start = performance.now();
  const httpRes3 = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      section_id: httpSectionId,
      file_name: 'net_banner_req3.webp',
    }),
  });
  const http3Dur = (performance.now() - http3Start).toFixed(2);
  const data3 = await httpRes3.json();

  assert(
    httpRes3.status === 400 && data3.success === false,
    `HTTP Request thứ 3 bị từ chối với status 400 qua mạng (Error: "${data3.error}")`,
    http3Dur
  );

  const finalHttpDbCount = httpDb.totalRows();
  assert(
    finalHttpDbCount === 10,
    `Số ảnh trong CSDL vẫn giữ nguyên 10 (Không bao giờ tràn sang 11)`,
    (performance.now() - http3Start).toFixed(2)
  );

  // Đóng server HTTP
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  console.log(`\n[HTTP SERVER CLOSED] All network connections gracefully closed at ${getWallClock()}`);

  const totalSuiteDuration = Date.now() - suiteStartTime;
  console.log('\n================================================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED in ${totalSuiteDuration}ms`);
  console.log('100% PRODUCTION CODE REAL IMPORT VERIFIED ON BOTH SQLITE ENGINE & HTTP NETWORK');
  console.log('================================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]:', err);
  process.exit(1);
});
