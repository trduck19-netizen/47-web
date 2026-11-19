import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Chi tiết 1 sản phẩm
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;

    const product = await env.DB
      .prepare(`
        SELECT sp.*,
               (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL) as in_stock_count,
               (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'SOLD' AND sc.deleted_at IS NULL) as sold_count
        FROM seller_products sp
        WHERE sp.id = ? AND sp.seller_id = ? AND sp.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền truy cập.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: true, product }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PUT: Cập nhật sản phẩm
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;

    const product = await env.DB
      .prepare(`
        SELECT sp.*, s.status as seller_status, s.trial_order_max
        FROM seller_products sp
        JOIN sellers s ON sp.seller_id = s.id
        WHERE sp.id = ? AND sp.seller_id = ? AND sp.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền chỉnh sửa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const {
      name,
      description,
      price_core,
      original_price_core,
      warranty_type,
      warranty_hours,
      delivery_type,
      low_stock_threshold,
    } = body;

    let newStatus = product.status;
    let newPrice = product.price_core;

    if (price_core !== undefined) {
      const parsedPrice = parseInt(price_core, 10);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Giá Core không hợp lệ.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const marketplaceConfig = await getMarketplaceConfig(env.DB);
      const maxOrderPrice = (product.trial_order_max !== null && product.trial_order_max !== undefined)
        ? Number(product.trial_order_max)
        : marketplaceConfig.default_trial_order_max;

      if (product.seller_status === 'TRIAL' && parsedPrice > maxOrderPrice) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Gian hàng thử việc chỉ được đặt giá tối đa ${maxOrderPrice} Core.`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      newPrice = parsedPrice;
      // Nếu ở TRIAL mà đổi giá thì cần duyệt lại
      if (product.seller_status === 'TRIAL' && newPrice !== product.price_core) {
        newStatus = 'PENDING_REVIEW';
      }
    }

    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        UPDATE seller_products
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            price_core = ?,
            original_price_core = COALESCE(?, original_price_core),
            warranty_type = COALESCE(?, warranty_type),
            warranty_hours = COALESCE(?, warranty_hours),
            delivery_type = COALESCE(?, delivery_type),
            low_stock_threshold = COALESCE(?, low_stock_threshold),
            status = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        name?.trim() || null,
        description !== undefined ? description?.trim() : null,
        newPrice,
        original_price_core !== undefined ? parseInt(original_price_core, 10) : null,
        warranty_type || null,
        warranty_hours !== undefined ? parseInt(warranty_hours, 10) : null,
        delivery_type || null,
        low_stock_threshold !== undefined ? parseInt(low_stock_threshold, 10) : null,
        newStatus,
        nowIso,
        productId
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã cập nhật sản phẩm.',
        status: newStatus,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PATCH: Bật/tắt bán hoặc chuyển đổi trạng thái sản phẩm (§5)
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;

    const product = await env.DB
      .prepare('SELECT id, status FROM seller_products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền cập nhật.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let targetStatus = product.status;
    if (body.status !== undefined) {
      const s = String(body.status).toUpperCase().trim();
      if (['DRAFT', 'APPROVED', 'PENDING_REVIEW'].includes(s)) {
        targetStatus = s;
      }
    } else if (body.is_active !== undefined) {
      targetStatus = body.is_active ? 'APPROVED' : 'DRAFT';
    } else {
      targetStatus = product.status === 'APPROVED' ? 'DRAFT' : 'APPROVED';
    }

    const nowIso = new Date().toISOString();
    await env.DB
      .prepare('UPDATE seller_products SET status = ?, updated_at = ? WHERE id = ?')
      .bind(targetStatus, nowIso, productId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: targetStatus === 'APPROVED' ? 'Đã bật bán sản phẩm thành công.' : 'Đã tạm tắt bán sản phẩm (chuyển về nháp).',
        status: targetStatus,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// DELETE: Xóa mềm sản phẩm (§0: cấm hard delete)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;

    const product = await env.DB
      .prepare('SELECT sp.id, sp.seller_id FROM seller_products sp WHERE sp.id = ? AND sp.seller_id = ? AND sp.deleted_at IS NULL LIMIT 1')
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền xóa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Kiểm tra xem có đơn hàng nào đang ở trạng thái REPORTED của sản phẩm này không
    const pendingDispute = await env.DB
      .prepare("SELECT COUNT(*) as count FROM seller_orders WHERE product_id = ? AND status = 'REPORTED'")
      .bind(productId)
      .first<{ count: number }>();

    if (pendingDispute && pendingDispute.count > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Không thể xóa sản phẩm khi đang có đơn hàng khiếu nại báo lỗi chưa giải quyết.',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    // Xóa mềm sản phẩm
    await env.DB
      .prepare("UPDATE seller_products SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(nowIso, nowIso, productId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa sản phẩm thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
