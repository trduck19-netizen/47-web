import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/shipping/:id
 * Tra cứu hành trình vận đơn theo mã vận đơn (tracking_code) hoặc ID
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const idOrTracking = params.id as string;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const order = await env.DB.prepare(`
      SELECT * FROM shipping_orders
      WHERE id = ? OR tracking_code = ? OR order_id = ?
      LIMIT 1
    `).bind(idOrTracking, idOrTracking, idOrTracking).first<any>();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy thông tin vận đơn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let timeline = [];
    try { timeline = JSON.parse(order.timeline_json || '[]'); } catch {}

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...order,
          timeline,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi tra cứu vận đơn.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * DELETE /api/shipping/:id
 * Xóa vận đơn (Zero Test Artifacts)
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const idOrTracking = params.id as string;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare('DELETE FROM shipping_orders WHERE id = ? OR tracking_code = ?').bind(idOrTracking, idOrTracking).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa vận đơn thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi xóa vận đơn.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * PATCH /api/shipping/:id
 * Cập nhật trạng thái và bổ sung bước tiến trình giao hàng (Timeline)
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const idOrTracking = params.id as string;

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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'SHIPPING_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { status, title, description, location } = body;

    const existing = await env.DB.prepare(`
      SELECT * FROM shipping_orders
      WHERE id = ? OR tracking_code = ?
      LIMIT 1
    `).bind(idOrTracking, idOrTracking).first<any>();

    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy vận đơn để cập nhật.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let timeline: any[] = [];
    try { timeline = JSON.parse(existing.timeline_json || '[]'); } catch {}

    const nowIso = new Date().toISOString();

    if (title || description) {
      // Đánh dấu các bước cũ hoàn thành
      timeline = timeline.map((step) => ({ ...step, current: false, completed: true }));
      timeline.push({
        title: title || `Cập nhật trạng thái: ${status}`,
        description: description || '',
        location: location || '',
        timestamp: nowIso,
        completed: status === 'DELIVERED',
        current: status !== 'DELIVERED',
      });
    }

    const newStatus = status ? String(status).toUpperCase() : existing.current_status;

    await env.DB.prepare(`
      UPDATE shipping_orders
      SET current_status = ?, timeline_json = ?, updated_at = ?
      WHERE id = ?
    `).bind(newStatus, JSON.stringify(timeline), nowIso, existing.id).run();

    // Đồng bộ sang bảng orders nếu đơn hàng hoàn tất
    if (newStatus === 'DELIVERED') {
      await env.DB.prepare(`
        UPDATE orders
        SET shipping_status = 'DELIVERED', updated_at = ?
        WHERE id = ? OR order_code = ?
      `).bind(nowIso, existing.order_id, existing.order_id).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cập nhật hành trình vận đơn thành công!',
        data: { id: existing.id, current_status: newStatus, timeline },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi cập nhật vận đơn.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
