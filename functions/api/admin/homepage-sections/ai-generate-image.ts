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
    const sampleCount = Math.min(4, Math.max(2, parseInt(body.sample_count || body.count || '2', 10) || 2));

    if (!userPrompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng nhập mô tả ảnh cần tạo.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Gọi Gemini sinh Alt text song ngữ VI/EN thật cho từng ảnh dựa trên ngữ cảnh người dùng
    let generatedAlts: Array<{ alt_vi: string; alt_en: string }> = [];
    try {
      const altPrompt = `You are a digital accessibility and visual description expert.
Generate exactly ${sampleCount} distinct image alt texts in both Vietnamese and English for an e-commerce storefront image based on this specific description: "${userPrompt}" (${aspectRatio === '16:9' ? '16:9 banner' : '1:1 icon'}).
Each pair must describe the visual elements vividly without generic boilerplate.
Output strictly JSON format:
[
  {"alt_vi": "mô tả chi tiết bằng tiếng Việt", "alt_en": "detailed English description"}
]`;

      const altGeminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const altRes = await fetch(altGeminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: altPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (altRes.ok) {
        const altData: any = await altRes.json().catch(() => null);
        const textOut = altData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textOut) {
          const parsed = JSON.parse(textOut);
          if (Array.isArray(parsed) && parsed.length > 0) {
            generatedAlts = parsed;
          }
        }
      }
    } catch (e: any) {
      console.warn('[Gemini Alt Text Generation] Fallback to contextual generator:', e?.message);
      if (env.DB) {
        await env.DB.prepare(`
          INSERT INTO security_logs (action, details, ip_address, created_at)
          VALUES ('GEMINI_ALT_GEN_ERROR', ?, '127.0.0.1', datetime('now'))
        `).bind(JSON.stringify({ error: e?.message, prompt: userPrompt })).run().catch(() => null);
      }
    }

    const getFallbackAlt = (idx: number) => {
      const cleanPrompt = userPrompt.trim();
      const styleVi = idx % 2 === 0 ? 'Giao diện đồ họa quảng bá' : 'Hình ảnh thiết kế phong cách hiện đại';
      const styleEn = idx % 2 === 0 ? 'Promotional graphic interface' : 'Modern design illustration';
      const typeVi = aspectRatio === '16:9' ? 'banner trang chủ' : 'biểu tượng lối tắt';
      const typeEn = aspectRatio === '16:9' ? 'homepage banner' : 'shortcut icon';
      return {
        alt_vi: `${styleVi} cho ${typeVi}: ${cleanPrompt}`,
        alt_en: `${styleEn} for ${typeEn}: ${cleanPrompt}`,
        is_fallback: true,
      };
    };

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
          sampleCount,
          aspectRatio: aspectRatio === '16:9' ? '16:9' : '1:1',
          outputMimeType: 'image/jpeg',
        },
      }),
      signal: controller.signal,
    }).catch(async (err) => {
      clearTimeout(timeoutId);
      console.error('[Gemini AI Image Network Error]:', err?.message || err);
      if (env.DB) {
        await env.DB.prepare(`
          INSERT INTO security_logs (action, details, ip_address, created_at)
          VALUES ('GEMINI_AI_NETWORK_ERROR', ?, '127.0.0.1', datetime('now'))
        `).bind(JSON.stringify({ error: err?.message || String(err), prompt: userPrompt })).run().catch(() => null);
      }
      throw new Error(`Lỗi kết nối dịch vụ tạo ảnh AI: ${err.message || err}`);
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Gemini AI Image Error] HTTP ${res.status}: ${errText}`);
      if (env.DB) {
        await env.DB.prepare(`
          INSERT INTO security_logs (action, details, ip_address, created_at)
          VALUES ('GEMINI_AI_IMAGE_ERROR', ?, '127.0.0.1', datetime('now'))
        `).bind(JSON.stringify({ status: res.status, error: errText.slice(0, 500), prompt: userPrompt })).run().catch(() => null);
      }
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

    const isFallbackUsed = generatedAlts.length === 0;
    if (isFallbackUsed && env.DB) {
      await env.DB.prepare(`
        INSERT INTO security_logs (action, details, ip_address, created_at)
        VALUES ('GEMINI_ALT_FALLBACK_USED', ?, '127.0.0.1', datetime('now'))
      `).bind(JSON.stringify({ reason: 'AI alt generation failed or returned empty; used contextual fallback', prompt: userPrompt })).run().catch(() => null);
    }

    // Chuyển danh sách ảnh thành candidates dạng data URL kèm Alt text sinh bởi AI
    const images = predictions.map((p: any, idx: number) => {
      const b64 = p.bytesBase64Encoded || p.image?.imageBytes;
      const mime = p.mimeType || 'image/jpeg';
      const altPair = generatedAlts[idx] || getFallbackAlt(idx);
      return {
        id: `ai_img_${Date.now()}_${idx}`,
        data_url: b64 ? `data:${mime};base64,${b64}` : '',
        alt_vi: altPair.alt_vi,
        alt_en: altPair.alt_en,
        is_fallback_alt: !generatedAlts[idx],
      };
    }).filter((img: any) => Boolean(img.data_url));

    const defaultAlt = generatedAlts[0] || getFallbackAlt(0);
    return new Response(
      JSON.stringify({
        success: true,
        images,
        alt_vi: defaultAlt.alt_vi,
        alt_en: defaultAlt.alt_en,
        is_fallback_alt: isFallbackUsed,
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
