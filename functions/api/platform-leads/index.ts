import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/platform-leads
 * Quản trị danh sách khách hàng doanh nghiệp đăng ký tư vấn giải pháp SaaS sàn TMĐT
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminCheck = await verifyAdminAuth(request, env);
    let isAuthorized = adminCheck.authorized;
    if (!isAuthorized) {
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'PLATFORM_LEADS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối (yêu cầu quyền PLATFORM_LEADS_FULL).' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM platform_leads';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status.toUpperCase());
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all<any>();

    const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM platform_leads').first<any>();
    const total = Number(countRow?.total || 0);

    return new Response(
      JSON.stringify({
        success: true,
        data: results || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải danh sách khách hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/platform-leads
 * Tiếp nhận thông tin đăng ký tư vấn giải pháp Platform Solutions
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const {
      full_name,
      phone,
      email,
      package_type = 'startup',
      domain_requested,
      industry_focus,
      note,
    } = body;

    if (!full_name || !phone) {
      return new Response(
        JSON.stringify({ success: false, message: 'Họ tên và Số điện thoại liên hệ là bắt buộc.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const leadCode = `LEAD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    await env.DB.prepare(`
      INSERT INTO platform_leads (
        id, lead_code, full_name, phone, email, package_type,
        domain_requested, industry_focus, note, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', datetime('now'))
    `).bind(
      id,
      leadCode,
      full_name.trim(),
      phone.trim(),
      email ? email.trim() : null,
      package_type,
      domain_requested || null,
      industry_focus || null,
      note || null
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đăng ký tư vấn giải pháp thành công! Chuyên viên sẽ liên hệ với bạn trong vòng 15 phút.',
        data: { lead_code: leadCode },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi gửi thông tin đăng ký.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
