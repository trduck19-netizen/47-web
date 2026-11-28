import { decode } from 'imagescript';
import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import {
  isSafeExternalUrl,
  resolveAndValidateHostDns,
  validateImageMagicBytes,
} from '../../../services/ssrf_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

const MAX_FINAL_IMAGE_BYTES = 350 * 1024; // 350 KB per Rule Lean Step 3
const MAX_RAW_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB raw input ceiling before WebP compression

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as any);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchExternalImageBytes(rawUrl: string): Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }> {
  let currentUrl = rawUrl.trim();
  for (let hop = 0; hop < 3; hop++) {
    if (!isSafeExternalUrl(currentUrl)) {
      return { ok: false, error: 'Đường dẫn ảnh ngoài không hợp lệ hoặc bị chặn bảo mật SSRF.' };
    }
    try {
      const u = new URL(currentUrl);
      const dns = await resolveAndValidateHostDns(u.hostname);
      if (!dns.ok) {
        return { ok: false, error: dns.error || 'Tên miền ảnh ngoài không hợp lệ.' };
      }
    } catch {
      return { ok: false, error: 'Định dạng URL ảnh không hợp lệ.' };
    }

    const res = await fetch(currentUrl, {
      headers: {
        'User-Agent': 'PineUniversalMall-Media/1.0',
        Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const nextLoc = res.headers.get('Location');
      if (!nextLoc) return { ok: false, error: 'Chuyển hướng ảnh thiếu Location.' };
      currentUrl = new URL(nextLoc, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      return { ok: false, error: `Không thể tải ảnh từ URL (HTTP ${res.status}).` };
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_RAW_INPUT_BYTES) {
      return { ok: false, error: 'Ảnh tải về vượt quá giới hạn 5 MB.' };
    }
    return { ok: true, bytes: new Uint8Array(ab) };
  }
  return { ok: false, error: 'URL ảnh chuyển hướng quá nhiều lần.' };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({
          success: false,
          error: storeAuth.error || 'Vui lòng đăng nhập gian hàng để tải ảnh sản phẩm.',
        }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;
    const rawDataUrl = String(body.data_url || body.image_base64 || '').trim();
    const externalUrl = String(body.image_url || '').trim();

    let inputBytes: Uint8Array | null = null;

    if (rawDataUrl) {
      try {
        inputBytes = base64ToUint8(rawDataUrl);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Dữ liệu ảnh Base64 không hợp lệ.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (inputBytes.byteLength > MAX_RAW_INPUT_BYTES) {
        return new Response(
          JSON.stringify({ success: false, error: 'Kích thước ảnh gốc vượt quá 5 MB.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } else if (externalUrl) {
      const fetched = await fetchExternalImageBytes(externalUrl);
      if (!fetched.ok || !fetched.bytes) {
        return new Response(
          JSON.stringify({ success: false, error: fetched.error || 'Không thể tải ảnh ngoài.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      inputBytes = fetched.bytes;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu dữ liệu ảnh tải lên (data_url hoặc image_url).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const detectedMagic = validateImageMagicBytes(inputBytes);
    if (!detectedMagic) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Định dạng tệp không phải ảnh hợp lệ (chỉ hỗ trợ WebP, JPEG, PNG, GIF).',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const detectedMime: string = detectedMagic.mime;
    let finalBytes: Uint8Array = inputBytes;
    let finalMime: string = detectedMime;
    let width: number | null = null;
    let height: number | null = null;

    // Nếu ảnh chưa phải WebP hoặc vượt ngân sách 350 KB, chuẩn hóa sang WebP gọn nhẹ ngay trên Worker
    if (detectedMime !== 'image/webp' || finalBytes.byteLength > MAX_FINAL_IMAGE_BYTES) {
      try {
        const decoded: any = await decode(finalBytes);
        if (decoded) {
          width = decoded.width || null;
          height = decoded.height || null;
          if (decoded.width > 1200 || decoded.height > 1200) {
            const ratio = Math.min(1200 / decoded.width, 1200 / decoded.height);
            decoded.resize(Math.max(1, Math.round(decoded.width * ratio)), Math.max(1, Math.round(decoded.height * ratio)));
            width = decoded.width;
            height = decoded.height;
          }
          let webpBytes = await decoded.encodeWebP({ quality: 80, effort: 4 });
          if (webpBytes.byteLength > MAX_FINAL_IMAGE_BYTES) {
            webpBytes = await decoded.encodeWebP({ quality: 62, effort: 4 });
          }
          if (webpBytes.byteLength <= finalBytes.byteLength || finalBytes.byteLength > MAX_FINAL_IMAGE_BYTES) {
            finalBytes = webpBytes;
            finalMime = 'image/webp';
          }
        }
      } catch {
        // Nếu imagescript không giải mã được nhưng ảnh gốc đã <= 350 KB hợp lệ thì giữ nguyên
      }
    }

    if (finalBytes.byteLength > MAX_FINAL_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ảnh sau khi nén vẫn vượt quá ngân sách 350 KB. Vui lòng chọn ảnh gọn hơn.',
          code: 'IMAGE_BUDGET_EXCEEDED',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const sha256 = await sha256Hex(finalBytes);
    const existing = await env.DB
      .prepare('SELECT id, size_bytes, content_type FROM seller_media_assets WHERE seller_id = ? AND sha256_hash = ? LIMIT 1')
      .bind(sellerId, sha256)
      .first<any>();

    if (existing?.id) {
      return new Response(
        JSON.stringify({
          success: true,
          id: existing.id,
          url: `/api/product-media/${existing.id}.webp`,
          size_bytes: Number(existing.size_bytes || finalBytes.byteLength),
          content_type: existing.content_type || finalMime,
          deduplicated: true,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const mediaId = `smed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const b64Payload = uint8ToBase64(finalBytes);
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_media_assets (
          id, seller_id, sha256_hash, content_type, size_bytes, width, height, image_base64, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(mediaId, sellerId, sha256, finalMime, finalBytes.byteLength, width, height, b64Payload, nowIso)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        id: mediaId,
        url: `/api/product-media/${mediaId}.webp`,
        size_bytes: finalBytes.byteLength,
        content_type: finalMime,
        deduplicated: false,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tải ảnh sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
