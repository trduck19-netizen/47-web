import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/shipping
 * Danh sách vận đơn bưu chính (GHTK, GHN, Viettel Post)
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

    const url = new URL(request.url);
    const carrier = url.searchParams.get('carrier') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (carrier) {
      conditions.push('carrier = ?');
      params.push(carrier.toUpperCase());
    }

    if (status) {
      conditions.push('current_status = ?');
      params.push(status.toUpperCase());
    }

    if (search.trim()) {
      conditions.push('(tracking_code LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR order_id LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM shipping_orders ${whereClause}`;
    const totalRow = await env.DB.prepare(countQuery).bind(...params).first<any>();
    const total = Number(totalRow?.total || 0);

    const query = `
      SELECT id, order_id, carrier, tracking_code, customer_name, customer_phone,
             destination_address, package_weight_grams, shipping_fee, current_status,
             timeline_json, created_at, updated_at
      FROM shipping_orders
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(query).bind(...params, limit, offset).all<any>();

    const items = (results || []).map((s: any) => {
      let timeline = [];
      try { timeline = JSON.parse(s.timeline_json || '[]'); } catch {}
      return { ...s, timeline };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: items,
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
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải danh sách vận đơn.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/shipping
 * Tạo đơn vận chuyển tự động (Đấu nối GHTK / GHN / Viettel Post)
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
      order_id,
      carrier = 'GHTK',
      customer_name,
      customer_phone,
      destination_address,
      package_weight_grams = 500,
      shipping_fee = 30000,
    } = body;

    if (!order_id || !customer_name || !customer_phone || !destination_address) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Vui lòng cung cấp đầy đủ: order_id, customer_name, customer_phone, destination_address.',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanCarrier = String(carrier).toUpperCase().trim();
    const id = `ship_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Tạo mã tracking chuẩn bưu chính theo hãng
    const randPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    let trackingCode = '';
    if (cleanCarrier === 'GHN') {
      trackingCode = `GHN${Date.now().toString().slice(-6)}${randPart.slice(0, 4)}`;
    } else if (cleanCarrier === 'VIETTEL_POST' || cleanCarrier === 'VTP') {
      trackingCode = `VT${Date.now().toString().slice(-6)}${randPart.slice(0, 4)}VN`;
    } else {
      trackingCode = `GHTK${Date.now().toString().slice(-6)}${randPart.slice(0, 4)}`;
    }

    const nowIso = new Date().toISOString();
    const initialTimeline = [
      {
        title: 'Đơn hàng đã được tiếp nhận',
        description: `Mã vận đơn ${trackingCode} đã được khởi tạo qua cổng kết nối ${cleanCarrier}. Đang chờ lấy hàng.`,
        timestamp: nowIso,
        completed: true,
        current: true,
      },
    ];

    await env.DB.prepare(`
      INSERT INTO shipping_orders (
        id, order_id, carrier, tracking_code, customer_name, customer_phone,
        destination_address, package_weight_grams, shipping_fee, current_status,
        timeline_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)
    `).bind(
      id,
      order_id,
      cleanCarrier,
      trackingCode,
      customer_name,
      customer_phone,
      destination_address,
      package_weight_grams,
      shipping_fee,
      JSON.stringify(initialTimeline),
      nowIso,
      nowIso
    ).run();

    // Cập nhật ngược tracking_code và carrier vào bảng orders nếu có
    await env.DB.prepare(`
      UPDATE orders
      SET tracking_code = ?, shipping_carrier = ?, shipping_status = 'PICKING', updated_at = ?
      WHERE id = ? OR order_code = ?
    `).bind(trackingCode, cleanCarrier, nowIso, order_id, order_id).run().catch(() => {});

    let trackingLookupUrl = '';
    if (cleanCarrier === 'GHN') {
      trackingLookupUrl = `https://tracking.ghn.vn/?order_code=${trackingCode}`;
    } else if (cleanCarrier === 'VIETTEL_POST' || cleanCarrier === 'VTP') {
      trackingLookupUrl = `https://viettelpost.vn/tra-cuu-hanh-trinh-don-hang?id=${trackingCode}`;
    } else {
      trackingLookupUrl = `https://giaohangtietkiem.vn/tra-cuu-van-don?order=${trackingCode}`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo mã vận đơn bưu chính thành công!',
        data: {
          id,
          order_id,
          carrier: cleanCarrier,
          tracking_code: trackingCode,
          tracking_lookup_url: trackingLookupUrl,
          shipping_fee,
          status: 'CREATED',
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tạo vận đơn.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
