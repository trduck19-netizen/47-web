import { verifyAdminAuth } from '../../../services/mission_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { decode } from 'imagescript';
import {
  checkSectionImageLimit,
  insertSectionImage,
  postInsertAtomicCheckAndRollback,
} from '../../../services/homepage_image_service';

interface Env {
  DB: D1Database;
  TINYPNG_API_KEY?: string;
  TINIFY_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

import {
  parseIpv4ToNumber,
  isPrivateIpv4,
  isPrivateIpv6,
  isSafeExternalUrl,
  resolveAndValidateHostDns,
  validateImageMagicBytes,
} from '../../../services/ssrf_service';

export {
  parseIpv4ToNumber,
  isPrivateIpv4,
  isPrivateIpv6,
  isSafeExternalUrl,
  resolveAndValidateHostDns,
  validateImageMagicBytes,
};
const detectImageMime = validateImageMagicBytes;

// Tải an toàn ảnh ngoài: HEAD request kiểm tra kích thước & Content-Type, follow redirect an toàn
async function fetchSafeExternalImage(
  initialUrl: string,
  maxHops = 3
): Promise<{ ok: boolean; bytes?: Uint8Array; contentType?: string; error?: string }> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop < maxHops; hop++) {
    if (!isSafeExternalUrl(currentUrl)) {
      return { ok: false, error: 'Đường dẫn ảnh bị chặn vì lý do bảo mật (chặn private IP / SSRF).' };
    }

    try {
      const urlObj = new URL(currentUrl);
      const dnsCheck = await resolveAndValidateHostDns(urlObj.hostname);
      if (!dnsCheck.ok) {
        return { ok: false, error: dnsCheck.error };
      }
    } catch {
      return { ok: false, error: 'URL không hợp lệ.' };
    }

    // 1. Kiểm tra nhanh bằng HEAD
    try {
      const headRes = await fetch(currentUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'UniversalMall-ImageOptimizer/1.0',
          Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });

      if ([301, 302, 303, 307, 308].includes(headRes.status)) {
        const nextLoc = headRes.headers.get('Location');
        if (!nextLoc) return { ok: false, error: 'Chuyển hướng thiếu header Location.' };
        currentUrl = new URL(nextLoc, currentUrl).toString();
        continue;
      }

      const contentLength = headRes.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
        return { ok: false, error: 'Ảnh ngoài vượt quá giới hạn 10MB.' };
      }
      const cType = headRes.headers.get('Content-Type') || '';
      if (cType && !cType.toLowerCase().startsWith('image/')) {
        return { ok: false, error: `Link không trả về ảnh hợp lệ (Content-Type: ${cType}).` };
      }
    } catch {
      // Fallback sang GET nếu máy chủ không hỗ trợ HEAD
    }

    // 2. Tải toàn bộ bằng GET với redirect manual
    const getRes = await fetch(currentUrl, {
      headers: {
        'User-Agent': 'UniversalMall-ImageOptimizer/1.0',
        Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    if ([301, 302, 303, 307, 308].includes(getRes.status)) {
      const nextLoc = getRes.headers.get('Location');
      if (!nextLoc) return { ok: false, error: 'Chuyển hướng thiếu header Location.' };
      currentUrl = new URL(nextLoc, currentUrl).toString();
      continue;
    }

    if (!getRes.ok) {
      return { ok: false, error: `Máy chủ ngoài trả lỗi HTTP ${getRes.status}: ${getRes.statusText}` };
    }

    const cType = getRes.headers.get('Content-Type') || '';
    if (cType && !cType.toLowerCase().startsWith('image/')) {
      return { ok: false, error: `Link ngoài không phải định dạng ảnh (Content-Type: ${cType}).` };
    }

    const ab = await getRes.arrayBuffer();
    if (ab.byteLength > 10 * 1024 * 1024) {
      return { ok: false, error: 'Ảnh tải về vượt quá giới hạn 10MB.' };
    }

    return {
      ok: true,
      bytes: new Uint8Array(ab),
      contentType: cType,
    };
  }

  return { ok: false, error: 'Quá nhiều lần chuyển hướng (vượt quá 3 lần).' };
}

// Băm SHA-256 dùng WebCrypto native trên Cloudflare Worker
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Kiểm tra cache ảnh đã tối ưu qua TinyPNG
async function getCachedTinyPng(db: D1Database, hash: string): Promise<Uint8Array | null> {
  try {
    const row = await db
      .prepare('SELECT image_base64 FROM homepage_section_images WHERE source = ? AND is_compressed = 1 LIMIT 1')
      .bind(`tinypng_cache_${hash}`)
      .first<any>();
    if (row?.image_base64) {
      return base64ToUint8(row.image_base64);
    }
  } catch {}
  return null;
}

// Lưu cache ảnh TinyPNG theo hash SHA-256
async function saveCachedTinyPng(db: D1Database, hash: string, bytes: Uint8Array): Promise<void> {
  try {
    const b64 = uint8ToBase64(bytes);
    await db
      .prepare(`
        INSERT INTO homepage_section_images (id, file_name, content_type, image_base64, original_size_bytes, size_bytes, width, height, is_compressed, source, created_at, updated_at)
        VALUES (?, ?, 'image/webp', ?, ?, ?, 0, 0, 1, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET image_base64 = excluded.image_base64
      `)
      .bind(`tinypng_${hash.slice(0, 16)}`, `tinypng_${hash.slice(0, 8)}.webp`, b64, bytes.length, bytes.length, `tinypng_cache_${hash}`)
      .run();
  } catch {}
}

// Cấu trúc theo dõi hạn mức gọi API TinyPNG thực tế
interface TinyPngUsageTracker {
  month: string;        // e.g. "2026-11"
  monthlyCalls: number; // max 500 ảnh/tháng
  day: string;          // e.g. "2026-11-22"
  dailyCalls: number;   // max 20 ảnh/ngày
}

// Kiểm tra hạn mức TinyPNG kép (tối đa 20 ảnh/ngày và tối đa 500 ảnh/tháng)
async function checkTinyPngQuota(db: D1Database): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = new Date();
    const curMonth = now.toISOString().slice(0, 7);
    const curDay = now.toISOString().slice(0, 10);

    const setting = await db.prepare("SELECT value FROM system_settings WHERE key = 'tinypng_usage_tracker' LIMIT 1")
      .first<{ value: string }>();

    let tracker: TinyPngUsageTracker = {
      month: curMonth,
      monthlyCalls: 0,
      day: curDay,
      dailyCalls: 0,
    };

    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (parsed.month === curMonth) {
          tracker.monthlyCalls = Number(parsed.monthlyCalls) || 0;
        }
        if (parsed.day === curDay) {
          tracker.dailyCalls = Number(parsed.dailyCalls) || 0;
        }
      } catch {}
    }

    if (tracker.monthlyCalls >= 500) {
      return { allowed: false, reason: 'Đã đạt giới hạn hạn mức TinyPNG 500 ảnh/tháng.' };
    }
    if (tracker.dailyCalls >= 20) {
      return { allowed: false, reason: 'Đã đạt giới hạn hạn mức TinyPNG 20 ảnh/ngày.' };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// Ghi nhận lần gọi API TinyPNG thực tế và lưu log bền vững nếu có lỗi
async function recordTinyPngCall(db: D1Database, isSuccess: boolean, errorMessage?: string): Promise<void> {
  try {
    const now = new Date();
    const curMonth = now.toISOString().slice(0, 7);
    const curDay = now.toISOString().slice(0, 10);

    const setting = await db.prepare("SELECT value FROM system_settings WHERE key = 'tinypng_usage_tracker' LIMIT 1")
      .first<{ value: string }>();

    let tracker: TinyPngUsageTracker = {
      month: curMonth,
      monthlyCalls: 0,
      day: curDay,
      dailyCalls: 0,
    };

    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (parsed.month === curMonth) tracker.monthlyCalls = Number(parsed.monthlyCalls) || 0;
        if (parsed.day === curDay) tracker.dailyCalls = Number(parsed.dailyCalls) || 0;
      } catch {}
    }

    tracker.monthlyCalls += 1;
    tracker.dailyCalls += 1;

    await db.prepare(`
      INSERT INTO system_settings (key, value, description, updated_at)
      VALUES ('tinypng_usage_tracker', ?, 'TinyPNG API Usage Stats (Monthly max 500, Daily max 20)', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(JSON.stringify(tracker)).run();

    if (!isSuccess && errorMessage) {
      await db.prepare(`
        INSERT INTO security_logs (action, details, ip_address, created_at)
        VALUES ('TINYPNG_API_ERROR', ?, '127.0.0.1', datetime('now'))
      `).bind(JSON.stringify({ error: errorMessage, tracker, timestamp: now.toISOString() })).run().catch(() => null);
    }
  } catch (e) {
    console.warn('[TinyPNG Tracker] Failed to record call:', e);
  }
}

// Nén WebP máy chủ bằng ImageScript (Nhóm 1 & 2)
async function compressServerWebp(
  inputBytes: Uint8Array,
  maxDimension: number,
  maxSizeBytes: number
): Promise<{
  success: boolean;
  webpBytes?: Uint8Array;
  width?: number;
  height?: number;
  error?: string;
}> {
  try {
    const decoded: any = await decode(inputBytes);
    if (!decoded || !decoded.width || !decoded.height) {
      return { success: false, error: 'Không thể giải mã dữ liệu ảnh bằng máy chủ.' };
    }

    const origWidth = decoded.width;
    const origHeight = decoded.height;

    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > maxDimension || origHeight > maxDimension) {
      if (origWidth >= origHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.max(1, Math.round((origHeight * maxDimension) / origWidth));
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.max(1, Math.round((origWidth * maxDimension) / origHeight));
      }
      decoded.resize(targetWidth, targetHeight);
    }

    // Nén bước 1 với quality 80
    let quality = 80;
    let webpUint8 = await decoded.encodeWebP(quality);

    // Nếu vượt quá giới hạn dung lượng, giảm quality xuống 65
    if (webpUint8.length > maxSizeBytes) {
      quality = 65;
      const retryUint8 = await decoded.encodeWebP(quality);
      if (retryUint8.length < webpUint8.length) {
        webpUint8 = retryUint8;
      }
    }

    // Nếu vẫn vượt quá, giảm quality xuống 50
    if (webpUint8.length > maxSizeBytes) {
      quality = 50;
      const retryUint8 = await decoded.encodeWebP(quality);
      if (retryUint8.length < webpUint8.length) {
        webpUint8 = retryUint8;
      }
    }

    const isWithinLimits = webpUint8.length <= maxSizeBytes;

    return {
      success: true,
      webpBytes: webpUint8,
      width: targetWidth,
      height: targetHeight,
      error: !isWithinLimits
        ? `Ảnh sau nén máy chủ (${(webpUint8.length / 1024).toFixed(0)}KB) vượt giới hạn ${(maxSizeBytes / 1024).toFixed(0)}KB.`
        : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Lỗi xử lý nén WebP phía máy chủ.',
    };
  }
}

// Tối ưu hóa ảnh qua API ngoài TinyPNG / Tinify (Nhóm 3 & 4)
async function compressWithTinyPng(
  bytes: Uint8Array,
  apiKey: string
): Promise<{ success: boolean; bytes?: Uint8Array; error?: string }> {
  try {
    const authHeader = 'Basic ' + btoa('api:' + apiKey.trim());
    const res = await fetch('https://api.tinify.com/shrink', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'User-Agent': 'UniversalMall-ImageOptimizer/1.0',
      },
      body: bytes,
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 201) {
      const data: any = await res.json().catch(() => null);
      const downloadUrl = data?.output?.url;
      if (downloadUrl) {
        const downloadRes = await fetch(downloadUrl, {
          signal: AbortSignal.timeout(8000),
        });
        if (downloadRes.ok) {
          const ab = await downloadRes.arrayBuffer();
          return { success: true, bytes: new Uint8Array(ab) };
        }
      }
    } else if (res.status === 429) {
      return { success: false, error: 'TinyPNG vượt hạn mức miễn phí (Rate limit 429).' };
    } else {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `TinyPNG API lỗi HTTP ${res.status}: ${errText.slice(0, 100)}` };
    }
    return { success: false, error: 'TinyPNG không trả về URL ảnh kết quả.' };
  } catch (err: any) {
    return { success: false, error: `Lỗi kết nối TinyPNG: ${err.message || err}` };
  }
}

// Chuyển Uint8Array thành base64 an toàn trên Cloudflare Worker
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Chuyển base64 thành Uint8Array
function base64ToUint8(b64: string): Uint8Array {
  const cleanB64 = b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
  const binary = atob(cleanB64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    await ensureSchemaUpgrades(env.DB);

    // Xác thực quyền Quản trị viên
    const auth = await verifyAdminAuth(request, env as any, 'SYSTEM_SETTINGS_UPDATE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên để tải hoặc nén ảnh.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'upload').trim();
    const targetType = body.target_type === 'banner' ? 'banner' : 'icon';
    const maxDimension = targetType === 'banner' ? 1200 : 400;
    const maxSizeBytes = targetType === 'banner' ? 300 * 1024 : 100 * 1024;

    // =========================================================================
    // HÀNH ĐỘNG 1: THỬ NÉN LẠI ẢNH CHƯA ĐẠT CHUẨN (Nhóm 1 - Nút "Nén lại")
    // =========================================================================
    if (action === 'retry_compress') {
      const imageId = String(body.image_id || '').trim();
      if (!imageId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Thiếu mã định danh ảnh (image_id).' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const existing = await env.DB
        .prepare('SELECT id, file_name, content_type, image_base64, original_size_bytes FROM homepage_section_images WHERE id = ? LIMIT 1')
        .bind(imageId)
        .first<any>();

      if (!existing || !existing.image_base64) {
        return new Response(
          JSON.stringify({ success: false, error: `Không tìm thấy ảnh với mã: ${imageId}` }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const rawBytes = base64ToUint8(existing.image_base64);
      const compressResult = await compressServerWebp(rawBytes, maxDimension, maxSizeBytes);

      if (compressResult.success && compressResult.webpBytes) {
        const newBase64 = uint8ToBase64(compressResult.webpBytes);
        const finalSize = compressResult.webpBytes.length;

        await env.DB
          .prepare(`
            UPDATE homepage_section_images
            SET image_base64 = ?,
                content_type = 'image/webp',
                size_bytes = ?,
                width = ?,
                height = ?,
                is_compressed = 1,
                compression_error = NULL,
                updated_at = datetime('now')
            WHERE id = ?
          `)
          .bind(newBase64, finalSize, compressResult.width || 0, compressResult.height || 0, imageId)
          .run();

        return new Response(
          JSON.stringify({
            success: true,
            image_url: `/api/homepage-images/${imageId}`,
            image_id: imageId,
            original_size: existing.original_size_bytes || rawBytes.length,
            compressed_size: finalSize,
            is_compressed: true,
            compression_status: 'compressed',
            width: compressResult.width,
            height: compressResult.height,
            message: 'Đã nén lại thành công sang WebP đạt chuẩn.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } else {
        // Nén lại thất bại: giữ nguyên bản gốc và cập nhật thông báo lỗi
        await env.DB
          .prepare("UPDATE homepage_section_images SET compression_error = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(compressResult.error || 'Nén lại thất bại', imageId)
          .run();

        return new Response(
          JSON.stringify({
            success: true,
            image_url: `/api/homepage-images/${imageId}`,
            image_id: imageId,
            original_size: existing.original_size_bytes || rawBytes.length,
            compressed_size: rawBytes.length,
            is_compressed: false,
            compression_status: 'failed',
            compression_error: compressResult.error || 'Nén lại thất bại',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // =========================================================================
    // HÀNH ĐỘNG 2 & 3: TẢI ẢNH LÊN TRỰC TIẾP HOẶC DÁN LINK NGOÀI (Nhóm 1, 2, 3)
    // =========================================================================
    let rawBytes: Uint8Array | null = null;
    let fileName = String(body.file_name || 'image').trim();
    let sourceMode: 'upload' | 'url_mirror' | 'ai_generated' =
      body.source === 'ai_generated' ? 'ai_generated' : 'upload';

    if (action === 'mirror_url' || body.url) {
      sourceMode = 'url_mirror';
      const targetUrl = String(body.url || '').trim();

      const mirrorRes = await fetchSafeExternalImage(targetUrl);
      if (!mirrorRes.ok || !mirrorRes.bytes) {
        return new Response(
          JSON.stringify({
            success: false,
            error: mirrorRes.error || 'Không thể tải ảnh từ link ngoài.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      rawBytes = mirrorRes.bytes;

      try {
        const urlPath = new URL(targetUrl).pathname;
        const extractedName = urlPath.split('/').pop() || 'mirrored-image';
        fileName = decodeURIComponent(extractedName);
      } catch {
        fileName = 'mirrored-image';
      }
    } else {
      // Tải ảnh trực tiếp (Base64 Data URL hoặc raw base64)
      const base64Data = String(body.image_base64 || body.file_data || '').trim();
      if (!base64Data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Thiếu dữ liệu ảnh (image_base64).' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      try {
        rawBytes = base64ToUint8(base64Data);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Dữ liệu base64 ảnh không hợp lệ.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    if (!rawBytes || rawBytes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dữ liệu ảnh rỗng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Giới hạn ảnh tải lên tối đa 10MB trước khi nén
    if (rawBytes.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Ảnh gốc quá lớn (${(rawBytes.length / (1024 * 1024)).toFixed(1)}MB). Giới hạn tối đa là 10MB.`,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Giới hạn số lượng ảnh cho mỗi mục (tối đa 10 ảnh / mục) - Yêu cầu bắt buộc section_id (Fail-Closed)
    const sectionId = String(body.section_id || body.item_id || '').trim();
    const quotaCheck = await checkSectionImageLimit(env.DB, sectionId);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: quotaCheck.error,
        }),
        { status: quotaCheck.status, headers: CORS_HEADERS }
      );
    }
    const safeSectionId = sectionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'sec';

    // Kiểm tra Magic Bytes để xác thực định dạng ảnh thật (Nhóm 5)
    const detected = detectImageMime(rawBytes);
    if (!detected) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Tệp không phải định dạng ảnh hợp lệ (chỉ chấp nhận JPEG, PNG, WebP, GIF, AVIF). File SVG không được nhận.',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const originalSizeBytes = rawBytes.length;

    // Sinh ID duy nhất cho tệp lưu trữ có gắn tiền tố mục để đếm quota và quản lý chính xác
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    const imageId = `sec_${safeSectionId}_${timestamp}_${randomHex}.webp`;

    // =========================================================================
    // NÉN ẢNH PHÍA MÁY CHỦ (TinyPNG API ngoài + ImageScript WebP máy chủ + Fallback an toàn)
    // =========================================================================
    let bytesToCompress = rawBytes;
    const compressionNotes: string[] = [];
    const tinyPngKey = (env.TINYPNG_API_KEY || env.TINIFY_API_KEY || '').trim();

    if (tinyPngKey) {
      // 1. Kiểm tra cache SHA-256 của ảnh để không gọi trùng
      const imgHash = await sha256Hex(rawBytes);
      const cached = await getCachedTinyPng(env.DB, imgHash);
      if (cached) {
        bytesToCompress = cached;
        compressionNotes.push('Đã tối ưu qua TinyPNG (từ cache SHA-256)');
      } else {
        const quotaCheck = await checkTinyPngQuota(env.DB);
        if (quotaCheck.allowed) {
          const tinyResult = await compressWithTinyPng(rawBytes, tinyPngKey);
          await recordTinyPngCall(env.DB, tinyResult.success, tinyResult.error);
          if (tinyResult.success && tinyResult.bytes) {
            bytesToCompress = tinyResult.bytes;
            await saveCachedTinyPng(env.DB, imgHash, tinyResult.bytes);
            compressionNotes.push('Đã tối ưu sơ bộ qua TinyPNG API');
          } else {
            console.error(`[TinyPNG API Error] ${tinyResult.error}`);
            compressionNotes.push(`TinyPNG (${tinyResult.error || 'Lỗi'}). Tự động fallback dùng bộ nén nội bộ.`);
          }
        } else {
          compressionNotes.push(`${quotaCheck.reason || 'Hạn mức TinyPNG đã chạm ngưỡng'}, dùng bộ nén nội bộ ImageScript.`);
        }
      }
    }

    let finalBytes = bytesToCompress;
    let finalContentType = detected.mime;
    let isCompressed = false;
    let compressionError: string | undefined = undefined;
    let imageWidth = 0;
    let imageHeight = 0;

    const serverCompress = await compressServerWebp(bytesToCompress, maxDimension, maxSizeBytes);

    if (serverCompress.success && serverCompress.webpBytes) {
      finalBytes = serverCompress.webpBytes;
      finalContentType = 'image/webp';
      isCompressed = true;
      compressionError = serverCompress.error; // Chỉ gán nếu serverCompress thực tế có warning/error
      imageWidth = serverCompress.width || 0;
      imageHeight = serverCompress.height || 0;
    } else {
      // Nén thất bại -> Fallback lưu bản tốt nhất có được, đánh dấu để admin nén lại sau (Không chặn tải lên!)
      isCompressed = false;
      compressionError = serverCompress.error || 'Máy chủ chưa thể nén sang WebP, đã lưu bản gốc.';
    }

    // Sửa lỗi: Chỉ ghép compressionNotes vào compressionError khi thực tế có lỗi (isCompressed === false)!
    // Khi nén thành công, không bao giờ gán chuỗi "Đã tối ưu sơ bộ qua TinyPNG API" vào compressionError!
    if (!isCompressed && compressionNotes.length > 0) {
      compressionError = compressionError
        ? `${compressionNotes.join(' | ')} - ${compressionError}`
        : compressionNotes.join(' | ');
    }

    const finalSizeBytes = finalBytes.length;
    const finalBase64 = uint8ToBase64(finalBytes);

    // Lưu vào D1 bảng homepage_section_images (Không lưu vào system_settings để chống phình CSDL)
    await insertSectionImage(env.DB, {
      id: imageId,
      file_name: fileName,
      content_type: finalContentType,
      image_base64: finalBase64,
      original_size_bytes: originalSizeBytes,
      size_bytes: finalSizeBytes,
      width: imageWidth,
      height: imageHeight,
      is_compressed: isCompressed ? 1 : 0,
      compression_error: compressionError || null,
      source: sourceMode,
      section_id: sectionId,
    });

    // Kiểm tra nguyên tử chống tranh chấp đồng thời (Post-Insert Atomic Concurrency Guard)
    const postCheck = await postInsertAtomicCheckAndRollback(env.DB, sectionId, imageId);
    if (!postCheck.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: postCheck.error,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const imageUrl = `/api/homepage-images/${imageId}`;

    return new Response(
      JSON.stringify({
        success: true,
        image_url: imageUrl,
        image_id: imageId,
        file_name: fileName,
        original_size: originalSizeBytes,
        compressed_size: finalSizeBytes,
        is_compressed: isCompressed,
        compression_status: isCompressed ? 'compressed' : 'original_fallback',
        compression_error: compressionError || null,
        width: imageWidth,
        height: imageHeight,
        content_type: finalContentType,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống khi xử lý ảnh.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
