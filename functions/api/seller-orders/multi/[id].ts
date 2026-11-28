import { checkAndExpireSellerOrdersD1 } from '../../../services/d1_service';
import { generateVietQrPayload } from '../../../services/marketplace_service';
import { authenticateCaller, authenticateAdmin } from '../../../services/auth_service';
import { ensureSellerSepaySchema, SellerSepayConfigRow } from '../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, request, env } = context;
  const orderId = String(params.id || '').trim();

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 Database chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã đơn hàng đa gian hàng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await ensureSellerSepaySchema(env.DB);
    await checkAndExpireSellerOrdersD1(env.DB, orderId);

    const parentOrder = await env.DB.prepare(`
      SELECT * FROM seller_parent_orders
      WHERE (id = ? OR parent_order_code = ?) AND deleted_at IS NULL
      LIMIT 1
    `)
      .bind(orderId, orderId)
      .first<any>();

    if (!parentOrder) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy đơn hàng đa gian hàng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Xác thực quyền sở hữu đơn hàng
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const callerAuth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    const adminAuth = await authenticateAdmin(env.DB, token, env);
    const isAdmin = adminAuth.authenticated;
    const currentMemberId = callerAuth.member?.id;

    if (!isAdmin && (!currentMemberId || currentMemberId !== parentOrder.buyer_member_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bạn không có quyền xem thông tin đơn hàng này.' }),
        { status: currentMemberId ? 403 : 401, headers: CORS_HEADERS }
      );
    }

    const childOrdersRes = await env.DB.prepare(`
      SELECT so.*, s.name as seller_name, s.avatar_url as seller_avatar
      FROM seller_orders so
      LEFT JOIN sellers s ON so.seller_id = s.id
      WHERE so.parent_order_id = ? AND so.deleted_at IS NULL
      ORDER BY so.created_at ASC
    `)
      .bind(parentOrder.id)
      .all<any>();

    const rawChildren = childOrdersRes?.results || [];
    const sellerIds = Array.from(new Set(rawChildren.map((c: any) => String(c.seller_id)).filter(Boolean)));
    const sepayMap = new Map<string, SellerSepayConfigRow>();
    for (const sId of sellerIds) {
      const cfg = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(sId)
        .first<SellerSepayConfigRow>();
      if (cfg) sepayMap.set(sId, cfg);
    }

    // Gom nhóm theo seller_id để tái dựng đúng mã VietQR riêng từng shop
    const shopGroupsMap = new Map<string, any>();
    for (const co of rawChildren) {
      const cfg = sepayMap.get(String(co.seller_id));
      const isDirectQr =
        co.payment_channel === 'DIRECT_SEPAY' &&
        Boolean(co.shop_qr_group_code) &&
        Boolean(cfg && Number(cfg.is_enabled) === 1 && Number(cfg.admin_locked) !== 1 && cfg.account_number);

      if (!shopGroupsMap.has(co.seller_id)) {
        const prefix = cfg?.payment_prefix || 'SHP';
        shopGroupsMap.set(co.seller_id, {
          seller_id: co.seller_id,
          seller_name: co.seller_name,
          shop_qr_group_code: isDirectQr ? co.shop_qr_group_code : null,
          total_amount: 0,
          qr_allowed: isDirectQr,
          bank_name: isDirectQr ? cfg?.bank_name || '' : '',
          account_number: isDirectQr ? cfg?.account_number || '' : '',
          bank_account: isDirectQr ? cfg?.account_holder || '' : '',
          qr_content: isDirectQr ? `${prefix} ${co.shop_qr_group_code}` : null,
          qr_payload: null as string | null,
          has_api_token: Boolean(cfg?.api_token_encrypted),
          status: co.status,
          order_ids: [] as string[],
        });
      }
      const grp = shopGroupsMap.get(co.seller_id);
      grp.total_amount += Number(co.price_core) || 0;
      grp.order_ids.push(co.id);
      if (co.status === 'PENDING_PAYMENT') {
        grp.status = 'PENDING_PAYMENT';
      }
    }

    for (const grp of shopGroupsMap.values()) {
      if (grp.qr_allowed && grp.bank_name && grp.account_number && grp.qr_content) {
        grp.qr_payload = generateVietQrPayload({
          bankName: grp.bank_name,
          accountNumber: grp.account_number,
          amount: grp.total_amount,
          content: grp.qr_content,
        });
      }
    }

    const childOrders = rawChildren.map((co: any) => {
      const grp = shopGroupsMap.get(co.seller_id);
      return {
        id: co.id,
        order_code: co.order_code,
        seller_id: co.seller_id,
        seller_name: co.seller_name,
        seller_avatar: co.seller_avatar,
        product_id: co.product_id,
        product_name: co.product_name,
        product_type: co.product_type || 'digital',
        price_core: co.price_core,
        status: co.status,
        payment_method: co.payment_method,
        payment_channel: co.payment_channel || 'CORE',
        shop_qr_group_code: co.shop_qr_group_code || null,
        delivered_code:
          co.status === 'PAID' || co.status === 'COMPLETED' || co.status === 'DELIVERED'
            ? co.delivered_code
            : null,
        pending_manual_code: Boolean(co.pending_manual_code),
        expires_at: co.expires_at,
        qr_allowed: Boolean(grp?.qr_allowed),
        qr_payload: grp?.qr_payload || null,
        qr_content: grp?.qr_content || null,
        bank_name: grp?.bank_name || '',
        account_number: grp?.account_number || '',
        bank_account: grp?.bank_account || '',
        has_api_token: Boolean(grp?.has_api_token),
      };
    });

    const expiresMs = parentOrder.expires_at ? new Date(parentOrder.expires_at).getTime() : 0;
    const secondsLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));

    return new Response(
      JSON.stringify({
        success: true,
        parent_order: {
          ...parentOrder,
          seconds_left: secondsLeft,
        },
        shop_groups: Array.from(shopGroupsMap.values()),
        child_orders: childOrders,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[getSellerMultiOrder error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi khi tra cứu đơn hàng đa gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
