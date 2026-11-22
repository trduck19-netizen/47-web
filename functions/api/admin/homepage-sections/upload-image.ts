import { verifyAdminAuth } from '../../../services/mission_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { decode } from 'imagescript';

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

// Phân tích bytes ảnh an toàn bằng Magic Bytes (Nhóm 5)
function detectImageMime(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // WebP: RIFF ... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // GIF: GIF87a hoặc GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // AVIF: ftypavif hoặc ftypavis
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  return null;
}

// Chống SSRF khi fetch ảnh từ URL ngoài (Nhóm 3 & Nhóm 5)
function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
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

      if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Đường dẫn ảnh ngoài không hợp lệ hoặc bị chặn vì lý do an toàn mạng (chỉ nhận http/https công khai).',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Tải bản sao ảnh về máy chủ với giới hạn thời gian (Timeout 8s)
      try {
        const fetchRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'UniversalMall-ImageOptimizer/1.0',
            Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!fetchRes.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Không thể tải ảnh từ link ngoài (HTTP ${fetchRes.status}: ${fetchRes.statusText}).`,
            }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const arrayBuffer = await fetchRes.arrayBuffer();
        rawBytes = new Uint8Array(arrayBuffer);

        // Trích xuất tên tệp từ URL
        try {
          const urlPath = new URL(targetUrl).pathname;
          const extractedName = urlPath.split('/').pop() || 'mirrored-image';
          fileName = decodeURIComponent(extractedName);
        } catch {
          fileName = 'mirrored-image';
        }
      } catch (fetchErr: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Lỗi kết nối tải ảnh từ link ngoài: ${fetchErr?.message || 'Hết thời gian chờ (Timeout)'}.`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
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

    // Sinh ID duy nhất cho tệp lưu trữ
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    const safeBaseName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'sec';
    const imageId = `${safeBaseName}_${timestamp}_${randomHex}.webp`;

    // =========================================================================
    // NÉN ẢNH PHÍA MÁY CHỦ (TinyPNG API ngoài + ImageScript WebP máy chủ + Fallback an toàn)
    // =========================================================================
    let bytesToCompress = rawBytes;
    const compressionNotes: string[] = [];
    const tinyPngKey = (env.TINYPNG_API_KEY || env.TINIFY_API_KEY || '').trim();

    if (tinyPngKey) {
      const tinyResult = await compressWithTinyPng(rawBytes, tinyPngKey);
      if (tinyResult.success && tinyResult.bytes) {
        bytesToCompress = tinyResult.bytes;
        compressionNotes.push('Đã tối ưu sơ bộ qua TinyPNG API');
      } else {
        compressionNotes.push(`TinyPNG (${tinyResult.error || 'Lỗi'}). Tự động fallback dùng bộ nén nội bộ.`);
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
      compressionError = serverCompress.error;
      imageWidth = serverCompress.width || 0;
      imageHeight = serverCompress.height || 0;
    } else {
      // Nén thất bại -> Fallback lưu bản tốt nhất có được, đánh dấu để admin nén lại sau (Không chặn tải lên!)
      isCompressed = false;
      compressionError = serverCompress.error || 'Máy chủ chưa thể nén sang WebP, đã lưu bản gốc.';
    }

    if (compressionNotes.length > 0) {
      compressionError = compressionError
        ? `${compressionNotes.join(' | ')} - ${compressionError}`
        : compressionNotes.join(' | ');
    }

    const finalSizeBytes = finalBytes.length;
    const finalBase64 = uint8ToBase64(finalBytes);

    // Lưu vào D1 bảng homepage_section_images (Không lưu vào system_settings để chống phình CSDL)
    await env.DB
      .prepare(`
        INSERT INTO homepage_section_images (
          id, file_name, content_type, image_base64, original_size_bytes, size_bytes,
          width, height, is_compressed, compression_error, source, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(
        imageId,
        fileName,
        finalContentType,
        finalBase64,
        originalSizeBytes,
        finalSizeBytes,
        imageWidth,
        imageHeight,
        isCompressed ? 1 : 0,
        compressionError || null,
        sourceMode
      )
      .run();

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
