import { verifyAdminAuth } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  GEMINI_API_KEY?: string;
  AI_API_KEY?: string;
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
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên để gọi tính năng AI.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // 2. Kiểm tra API Key (Cloudflare Secret / Env)
    const apiKey = (env.GEMINI_API_KEY || env.AI_API_KEY || '').trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          unconfigured: true,
          message: 'Dịch vụ AI chưa được cấu hình khóa API (GEMINI_API_KEY hoặc AI_API_KEY) trong Cloudflare Secrets.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const userPrompt = String(body.prompt || '').trim();
    const sectionId = String(body.section_id || '').trim();
    const currentName = String(body.current_name || '').trim();
    const isSubsection = Boolean(body.is_subsection);

    // Xây dựng System & User Prompt cho Gemini
    const systemInstruction = `Bạn là trợ lý AI chuyên gia tối ưu trải nghiệm thương mại điện tử (E-Commerce UX Copywriter) cho Universal Mall.
Nhiệm vụ: Dựa vào ý tưởng/chủ đề mà người quản trị cung cấp, hãy tạo tiêu đề, mô tả ngắn gọn và huy hiệu bắt mắt cho mục trang chủ của sàn thương mại điện tử.
BẮT BUỘC trả về đúng định dạng JSON chuẩn (không chứa markdown hay thẻ bọc code ngoài JSON) với cấu trúc sau:
{
  "title_vi": "Tiêu đề tiếng Việt hấp dẫn, tối đa 50 ký tự",
  "title_en": "Engaging English title, max 50 characters",
  "description_vi": "Mô tả ngắn tiếng Việt súc tích, tối đa 120 ký tự",
  "description_en": "Short concise English description, max 120 characters",
  "badge_vi": "Huy hiệu tiếng Việt ngắn gọn (vd: HOT, MỚI, -50%, FREESHIP), tối đa 15 ký tự",
  "badge_en": "Short English badge (e.g. HOT, NEW, 50% OFF, FREE SHIP), max 15 characters"
}`;

    const contextDesc = `Mục: ${sectionId || 'homepage_section'} (${isSubsection ? 'Mục con / Shortcut' : 'Mục lớn / Section'}).
Tên hiện tại: ${currentName || 'Chưa đặt'}.
Ý chính / Yêu cầu của người quản trị: ${userPrompt || 'Gợi ý tiêu đề, mô tả và huy hiệu thu hút khách hàng cho mục này'}.`;

    // Gọi Gemini API v1beta với timeout 8s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemInstruction },
              { text: contextDesc },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    }).catch((err) => {
      clearTimeout(timeoutId);
      throw new Error(`Lỗi kết nối Gemini API: ${err.message || err}`);
    });

    clearTimeout(timeoutId);

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      return new Response(
        JSON.stringify({
          success: false,
          error: `Dịch vụ AI trả về lỗi HTTP ${geminiRes.status}: ${errText.slice(0, 200)}`,
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const geminiData: any = await geminiRes.json().catch(() => null);
    const candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không nhận được phản hồi nội dung từ mô hình AI.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    let parsedResult: any = null;
    try {
      parsedResult = JSON.parse(candidateText);
    } catch {
      // Fallback regex trích xuất JSON
      const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      }
    }

    if (!parsedResult || typeof parsedResult !== 'object') {
      return new Response(
        JSON.stringify({ success: false, error: 'Phản hồi từ AI không đúng cấu trúc JSON.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          title_vi: String(parsedResult.title_vi || '').trim(),
          title_en: String(parsedResult.title_en || '').trim(),
          description_vi: String(parsedResult.description_vi || '').trim(),
          description_en: String(parsedResult.description_en || '').trim(),
          badge_vi: String(parsedResult.badge_vi || '').trim(),
          badge_en: String(parsedResult.badge_en || '').trim(),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý yêu cầu gợi ý AI.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
