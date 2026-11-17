import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * PATCH /api/platform-leads/:id
 * Cập nhật trạng thái xử lý khách hàng tiềm năng
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const id = params.id as string;

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
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { status, note } = body;

    const updates: string[] = [];
    const bindParams: any[] = [];

    if (status) {
      updates.push('status = ?');
      bindParams.push(String(status).toUpperCase());
    }

    if (note !== undefined) {
      updates.push('note = ?');
      bindParams.push(note);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không có dữ liệu cập nhật.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    bindParams.push(id, id);
    await env.DB.prepare(`
      UPDATE platform_leads
      SET ${updates.join(', ')}
      WHERE id = ? OR lead_code = ?
    `).bind(...bindParams).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Cập nhật trạng thái khách hàng thành công!' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi cập nhật khách hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
