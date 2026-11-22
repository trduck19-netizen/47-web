import { verifyAdminAuth } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  GEMINI_API_KEY?: string;
  AI_API_KEY?: string;
  IMAGE_AI_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    // 1. Xác thực quyền Quản trị viên
    const auth = await verifyAdminAuth(request, env as any, 'SYSTEM_SETTINGS_UPDATE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên để tạo ảnh AI.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // 2. Kiểm tra API Key (Cloudflare Secret / Env)
    const apiKey = (env.IMAGE_AI_API_KEY || env.GEMINI_API_KEY || env.AI_API_KEY || '').trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          unconfigured: true,
          message: 'Dịch vụ AI tạo ảnh chưa được cấu hình khóa API (IMAGE_AI_API_KEY hoặc GEMINI_API_KEY) trong Cloudflare Secrets.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const userPrompt = String(body.prompt || '').trim();
    const aspectRatio = body.aspect_ratio === '16:9' ? '16:9' : '1:1';
    const sectionId = String(body.section_id || '').trim();

    if (!userPrompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng nhập mô tả ảnh cần tạo.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Sinh Alt text trước bằng logic hoặc qua Prompt
    const altVi = `Hình minh họa: ${userPrompt} (${aspectRatio === '16:9' ? 'Banner ngang' : 'Icon vuông'})`;
    const altEn = `Illustration: ${userPrompt} (${aspectRatio === '16:9' ? 'Horizontal banner' : 'Square icon'})`;

    // Gọi Gemini Imagen 3 API (predict/generateImages) hoặc Vertex/REST endpoint
    // Endpoint Imagen 3 của Google: https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=...
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const res = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [
          {
            prompt: `Commercial e-commerce website graphic, clean, professional, high quality, vibrant colors: ${userPrompt}`,
          },
        ],
        parameters: {
          sampleCount: 2,
          aspectRatio: aspectRatio === '16:9' ? '16:9' : '1:1',
          outputMimeType: 'image/jpeg',
        },
      }),
      signal: controller.signal,
    }).catch((err) => {
      clearTimeout(timeoutId);
      throw new Error(`Lỗi kết nối dịch vụ tạo ảnh AI: ${err.message || err}`);
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return new Response(
        JSON.stringify({
          success: false,
          error: `Dịch vụ AI tạo ảnh trả về lỗi HTTP ${res.status}: ${errText.slice(0, 200)}`,
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const data: any = await res.json().catch(() => null);
    const predictions = data?.predictions || [];

    if (!Array.isArray(predictions) || predictions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không nhận được ảnh tạo từ mô hình AI.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Chuyển danh sách ảnh thành candidates dạng data URL
    const images = predictions.map((p: any, idx: number) => {
      const b64 = p.bytesBase64Encoded || p.image?.imageBytes;
      const mime = p.mimeType || 'image/jpeg';
      return {
        id: `ai_img_${Date.now()}_${idx}`,
        data_url: b64 ? `data:${mime};base64,${b64}` : '',
        alt_vi: altVi,
        alt_en: altEn,
      };
    }).filter((img: any) => Boolean(img.data_url));

    return new Response(
      JSON.stringify({
        success: true,
        images,
        alt_vi: altVi,
        alt_en: altEn,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý tạo ảnh AI.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
