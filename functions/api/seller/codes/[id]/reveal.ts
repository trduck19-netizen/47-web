import { verifyMemberAuth } from '../../../../services/mission_service';
import { ensureMarketplaceSchema } from '../../../../services/d1_service';
import { decryptCode } from '../../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST: Xem mã nguyên vẹn trong kho (ghi nhật ký kiểm toán)
export const onRequestPost: PagesFunction<Env> = async (context) => {
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

    const codeId = params.id as string;
    const sellerId = storeAuth.seller.id;

    // Tìm mã và kiểm tra quyền
    const codeRow = await env.DB
      .prepare(`
        SELECT sc.id, sc.seller_id, sc.code_encrypted, sc.status
        FROM seller_codes sc
        WHERE sc.id = ? AND sc.seller_id = ? AND sc.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(codeId, sellerId)
      .first<any>();

    if (!codeRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mã không tồn tại hoặc bạn không có quyền xem.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const codeSecretKey = env.MARKETPLACE_CODE_KEY || env.JWT_SECRET || 'wcg_marketplace_code_aes_key_default_32';

    const plainCode = await decryptCode(codeRow.code_encrypted, codeSecretKey);
    const viewLogId = `scv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ipAddress = request.headers.get('cf-connecting-ip') || '127.0.0.1';

    const viewerMemberId = storeAuth.member?.id || storeAuth.seller.member_id || 'system';
    const viewerName = storeAuth.authType === 'STORE_API_KEY'
      ? `API_KEY:${storeAuth.keyName || 'StoreKey'}`
      : storeAuth.authType === 'THIRD_PARTY_TOKEN'
      ? `APP:${storeAuth.keyName || 'AppToken'}`
      : (storeAuth.member?.username || storeAuth.seller?.name || 'Seller');

    // Ghi audit log vào seller_code_views (§5.2)
    await env.DB
      .prepare(`
        INSERT INTO seller_code_views (
          id, code_id, seller_id, viewer_member_id, viewer_name, ip_address, viewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        viewLogId,
        codeRow.id,
        codeRow.seller_id,
        viewerMemberId,
        viewerName,
        ipAddress
      )
      .run()
      .catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        code_id: codeRow.id,
        code: plainCode,
        status: codeRow.status,
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
