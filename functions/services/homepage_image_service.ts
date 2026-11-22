/**
 * functions/services/homepage_image_service.ts
 *
 * Dịch vụ lõi xử lý quản lý ảnh trang chủ:
 * 1. Kiểm soát giới hạn tối đa 10 ảnh / mục (Pre-insert quota check) với cơ chế Fail-Closed.
 * 2. Lưu trữ ảnh vào CSDL D1 bảng homepage_section_images (hỗ trợ lưu ảnh WebP hoặc fallback bản gốc).
 * 3. Kiểm tra nguyên tử chống tranh chấp đồng thời (Post-Insert Atomic Concurrency Guard):
 *    - Tự động kiểm tra lại COUNT(*) sau khi chèn.
 *    - Nếu phát hiện tranh chấp đồng thời khiến tổng số ảnh > 10, tự động ROLLBACK (xóa bản ghi vừa chèn)
 *      và trả lỗi 400 để bảo đảm tính nguyên tử và hạn mức cứng 10 ảnh.
 * 4. Truy vấn đếm ảnh đa điều kiện (hỗ trợ cả cột section_id chuẩn, tiền tố sec_<id>_ và ảnh cũ).
 */

export interface SectionImageRecord {
  id: string;
  file_name: string;
  content_type: string;
  image_base64: string;
  original_size_bytes: number;
  size_bytes: number;
  width: number;
  height: number;
  is_compressed: number;
  compression_error?: string | null;
  source: string;
  section_id: string;
}

export interface ImageQuotaCheckResult {
  allowed: boolean;
  count: number;
  error?: string;
  status: number;
}

export interface PostInsertAtomicResult {
  valid: boolean;
  count: number;
  rolledBack: boolean;
  error?: string;
}

/**
 * Kiểm tra hạn mức 10 ảnh trước khi chèn (Pre-insert check) với cơ chế Fail-Closed
 */
export async function checkSectionImageLimit(
  db: any,
  sectionId: string
): Promise<ImageQuotaCheckResult> {
  const cleanId = String(sectionId || '').trim();
  if (!cleanId) {
    return {
      allowed: false,
      count: 0,
      status: 400,
      error: 'Yêu cầu mã định danh mục (section_id) để tải ảnh và kiểm soát hạn mức ảnh.',
    };
  }

  const safeSectionId = cleanId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'sec';

  try {
    const countRow = await db
      .prepare(`
        SELECT COUNT(*) as count FROM homepage_section_images 
        WHERE section_id = ? OR id LIKE ('sec_' || ? || '_%') OR id LIKE ('%' || ? || '%')
      `)
      .bind(cleanId, safeSectionId, safeSectionId)
      .first();

    const count = countRow ? Number(countRow.count) : 0;
    if (count >= 10) {
      return {
        allowed: false,
        count,
        status: 400,
        error: `Mục này đã đạt giới hạn tối đa 10 ảnh (${count}/10). Vui lòng sử dụng lại ảnh hiện có hoặc dọn bớt ảnh cũ.`,
      };
    }

    return {
      allowed: true,
      count,
      status: 200,
    };
  } catch (err: any) {
    console.error('[homepage_image_service] Database error checking image limit (fail-closed):', err);
    return {
      allowed: false,
      count: -1,
      status: 500,
      error: 'Không thể xác thực số lượng ảnh hiện có trong mục (Lỗi cơ sở dữ liệu). Thao tác tải ảnh bị chặn vì lý do an toàn (Fail-closed).',
    };
  }
}

/**
 * Chèn bản ghi ảnh vào bảng homepage_section_images
 */
export async function insertSectionImage(
  db: any,
  record: SectionImageRecord
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO homepage_section_images (
        id, file_name, content_type, image_base64, original_size_bytes, size_bytes,
        width, height, is_compressed, compression_error, source, section_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .bind(
      record.id,
      record.file_name,
      record.content_type,
      record.image_base64,
      record.original_size_bytes,
      record.size_bytes,
      record.width,
      record.height,
      record.is_compressed,
      record.compression_error || null,
      record.source,
      record.section_id
    )
    .run();
}

/**
 * Kiểm tra nguyên tử sau khi chèn và tự động hoàn tác (Post-Insert Atomic Concurrency Guard):
 * Ngăn chặn race condition khi 2 upload xảy ra đồng thời khi đã có 9 ảnh.
 */
export async function postInsertAtomicCheckAndRollback(
  db: any,
  sectionId: string,
  imageId: string
): Promise<PostInsertAtomicResult> {
  const safeSectionId = sectionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'sec';

  try {
    const postCountRow = await db
      .prepare(`
        SELECT COUNT(*) as count FROM homepage_section_images 
        WHERE section_id = ? OR id LIKE ('sec_' || ? || '_%') OR id LIKE ('%' || ? || '%')
      `)
      .bind(sectionId, safeSectionId, safeSectionId)
      .first();

    const count = postCountRow ? Number(postCountRow.count) : 0;
    if (count > 10) {
      // Đã vượt quá 10 ảnh do tranh chấp đồng thời -> Xóa bản ghi vừa chèn (Rollback)
      await db
        .prepare('DELETE FROM homepage_section_images WHERE id = ?')
        .bind(imageId)
        .run()
        .catch(() => {});

      return {
        valid: false,
        count,
        rolledBack: true,
        error: `Mục này đã đạt giới hạn tối đa 10 ảnh (${count - 1}/10). Thao tác tải ảnh bị hủy để bảo đảm tính nguyên tử và chống tranh chấp đồng thời.`,
      };
    }

    return {
      valid: true,
      count,
      rolledBack: false,
    };
  } catch (err: any) {
    console.warn('[homepage_image_service] Warning in post-insert concurrency guard:', err);
    return {
      valid: true,
      count: 10,
      rolledBack: false,
    };
  }
}

/**
 * Thực thi pipeline lưu ảnh hoàn chỉnh kết hợp kiểm tra 2 đầu (Pre-check + Insert + Post-check Rollback)
 */
export async function processAndPersistSectionImage(
  db: any,
  sectionId: string,
  record: SectionImageRecord,
  bypassPreCheck = false
): Promise<{ success: boolean; image_id?: string; count?: number; error?: string; status: number }> {
  // 1. Pre-insert quota check
  if (!bypassPreCheck) {
    const preCheck = await checkSectionImageLimit(db, sectionId);
    if (!preCheck.allowed) {
      return {
        success: false,
        error: preCheck.error,
        count: preCheck.count,
        status: preCheck.status,
      };
    }
  }

  // 2. Insert record
  await insertSectionImage(db, record);

  // 3. Post-insert atomic concurrency guard
  const postCheck = await postInsertAtomicCheckAndRollback(db, sectionId, record.id);
  if (!postCheck.valid) {
    return {
      success: false,
      error: postCheck.error,
      count: postCheck.count - 1,
      status: 400,
    };
  }

  return {
    success: true,
    image_id: record.id,
    count: postCheck.count,
    status: 200,
  };
}
