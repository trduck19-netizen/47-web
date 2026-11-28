import { computeSha256, verifyMemberAuth } from './mission_service';
import { getSigningSecret, verifyToken } from './auth_service';
import { SellerRecord } from './marketplace_service';

export interface SellerApiKeyRecord {
  id: string;
  seller_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scope: string; // 'FULL' | 'READ_ONLY' | 'PRODUCTS' | 'ORDERS' | 'CODES'
  is_active: number;
  call_count: number;
  last_used_at: string;
  last_used_endpoint: string;
  last_used_ip: string;
  created_at: string;
  revoked_at?: string | null;
}

export interface SellerThirdPartyAppRecord {
  id: string;
  app_name: string;
  app_url?: string;
  description?: string;
  developer_email?: string;
  created_at: string;
}

export interface SellerAppAuthRecord {
  id: string;
  seller_id: string;
  app_id: string;
  app_name: string;
  token_hash: string;
  token_prefix: string;
  scope: string; // 'FULL' | 'READ_ONLY' | 'PRODUCTS_ONLY' | 'ORDERS_ONLY'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  call_count: number;
  last_used_at: string;
  last_used_endpoint: string;
  approved_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export interface StoreAuthResult {
  authorized: boolean;
  authType?: 'STORE_API_KEY' | 'THIRD_PARTY_TOKEN' | 'MEMBER_SESSION';
  seller?: SellerRecord;
  sellerId?: string;
  memberId?: string;
  member?: {
    id: string;
    username?: string;
    email?: string;
    role?: string;
  };
  keyId?: string;
  keyName?: string;
  scope?: string;
  role?: 'OWNER' | 'MANAGE_STOCK' | 'VIEW_ORDERS' | 'FULL';
  error?: string;
  status?: number;
}

/**
 * Generate a new random Store API Key
 * Returns rawKey (shown only once) and keyPrefix (masked for display)
 */
export function generateStoreApiKey(sellerId: string): { rawKey: string; keyPrefix: string } {
  const shortId = sellerId.replace(/^seller_|^sel_/, '').slice(0, 8);
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `wcg_sk_${shortId}_${randomHex}`;
  const keyPrefix = `wcg_sk_${shortId}_${randomHex.slice(0, 4)}••••••••••••••••••••${randomHex.slice(-4)}`;
  return { rawKey, keyPrefix };
}

/**
 * Generate a new random Third-party App Token
 * Returns rawToken (shown only once) and tokenPrefix (masked for display)
 */
export function generateAppToken(appId: string): { rawToken: string; tokenPrefix: string } {
  const shortId = appId.replace(/^app_/, '').slice(0, 8);
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const rawToken = `wcg_app_tok_${shortId}_${randomHex}`;
  const tokenPrefix = `wcg_app_tok_${shortId}_${randomHex.slice(0, 4)}••••••••••••••••••••${randomHex.slice(-4)}`;
  return { rawToken, tokenPrefix };
}

/**
 * Verify Store Access via Store API Key, Third-party Token, or Member Session.
 * Strictly enforces store boundaries (Cross-store access returns 403 Forbidden).
 * Rate limits API Keys & Tokens to 600 calls/minute.
 */
export async function verifyStoreApiAccess(
  request: Request,
  env: { DB: D1Database; JWT_SECRET?: string; ADMIN_SYNC_SECRET?: string },
  options: {
    targetSellerId?: string;
    targetSlug?: string;
    requiredRole?: 'ANY' | 'MANAGE_STOCK' | 'OWNER';
    requiredScope?: string;
    allowReadOnly?: boolean;
  } = {}
): Promise<StoreAuthResult> {
  const { targetSellerId, targetSlug, requiredRole = 'ANY', allowReadOnly = true } = options;

  if (!env.DB) {
    return { authorized: false, status: 500, error: 'Cơ sở dữ liệu chưa sẵn sàng.' };
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';

  // 1. Extract Candidate Tokens
  const storeKeyHeader = request.headers.get('X-Store-Key') || request.headers.get('x-store-key') || '';
  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  const tokenCandidate = (storeKeyHeader.trim() || bearerToken).trim();

  // 2. Case A: Dedicated Store API Key (starts with wcg_sk_)
  if (tokenCandidate.startsWith('wcg_sk_')) {
    const keyHash = await computeSha256(tokenCandidate);

    const apiKey = await env.DB
      .prepare(`
        SELECT * FROM seller_api_keys 
        WHERE key_hash = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')
        LIMIT 1
      `)
      .bind(keyHash)
      .first<SellerApiKeyRecord>();

    if (!apiKey) {
      return {
        authorized: false,
        status: 401,
        error: 'Khóa API gian hàng không hợp lệ, đã bị thu hồi hoặc đã hết hiệu lực.',
      };
    }

    // Rate Limit Check (Max 600 calls/minute per key)
    const rateCheck = await env.DB
      .prepare(`
        SELECT COUNT(*) as recent_calls 
        FROM seller_api_call_logs 
        WHERE key_id = ? AND created_at >= datetime('now', '-1 minute')
      `)
      .bind(apiKey.id)
      .first<{ recent_calls: number }>()
      .catch(() => ({ recent_calls: 0 }));

    if (rateCheck && rateCheck.recent_calls >= 600) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 429, clientIp);
      return {
        authorized: false,
        status: 429,
        error: 'Tần suất gọi API vượt quá giới hạn cho phép (Tối đa 600 lượt gọi/phút). Vui lòng thử lại sau.',
      };
    }

    // Fetch Seller
    const seller = await env.DB
      .prepare('SELECT * FROM sellers WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(apiKey.seller_id)
      .first<SellerRecord>();

    if (!seller) {
      return {
        authorized: false,
        status: 404,
        error: 'Gian hàng gắn với khóa API này không tồn tại hoặc đã bị xóa.',
      };
    }

    // Strict Boundary Check (Cannot touch other stores)
    if (targetSellerId && targetSellerId !== apiKey.seller_id) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Từ chối truy cập: Khóa API không có quyền thực hiện trên gian hàng khác (Cross-store Access Denied).',
      };
    }

    if (targetSlug && seller.slug !== targetSlug) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Từ chối truy cập: Khóa API không khớp với slug của gian hàng được yêu cầu.',
      };
    }

    // Scope check: Scoped keys can never manage API keys, finance/withdraw, or staff/subaccounts
    if (apiKey.scope !== 'FULL' && (pathname.includes('/api/seller/api-keys') || pathname.includes('/api/seller/finance') || pathname.includes('/api/seller/staff'))) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: `Khóa API phân quyền (${apiKey.scope}) không được phép thao tác trên tài chính, nhân sự hoặc quản lý khóa API.`,
      };
    }

    // Scope check: READ_ONLY forbids write operations
    if (apiKey.scope === 'READ_ONLY' && (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Khóa API này chỉ được cấp quyền đọc (READ_ONLY), không thể thực hiện thao tác sửa đổi dữ liệu.',
      };
    }

    // Scope check: PRODUCTS only allows products, media, vouchers & categories endpoints
    if (apiKey.scope === 'PRODUCTS' && !pathname.includes('/products') && !pathname.includes('/media') && !pathname.includes('/vouchers') && !pathname.includes('/categories') && !pathname.includes('/stats')) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Khóa API này chỉ có quyền thao tác trên Sản Phẩm (PRODUCTS).',
      };
    }

    // Scope check: ORDERS only allows orders & disputes endpoints
    if (apiKey.scope === 'ORDERS' && !pathname.includes('/orders') && !pathname.includes('/disputes')) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Khóa API này chỉ có quyền thao tác trên Đơn Hàng (ORDERS).',
      };
    }

    // Scope check: CODES only allows codes & vault endpoints
    if (apiKey.scope === 'CODES' && !pathname.includes('/codes') && !pathname.includes('/vault')) {
      await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Khóa API này chỉ có quyền thao tác trên Kho Mã (CODES).',
      };
    }

    // Asynchronous usage update
    const nowIso = new Date().toISOString();
    env.DB.prepare(`
      UPDATE seller_api_keys 
      SET call_count = call_count + 1, 
          last_used_at = ?, 
          last_used_endpoint = ?, 
          last_used_ip = ?
      WHERE id = ?
    `).bind(nowIso, pathname, clientIp, apiKey.id).run().catch(() => {});

    await logStoreApiCall(env.DB, apiKey.seller_id, apiKey.id, 'STORE_API_KEY', pathname, method, 200, clientIp);

    return {
      authorized: true,
      authType: 'STORE_API_KEY',
      seller,
      sellerId: seller.id,
      keyId: apiKey.id,
      keyName: apiKey.name,
      scope: apiKey.scope,
      role: apiKey.scope === 'FULL' ? 'OWNER' : 'MANAGE_STOCK',
    };
  }

  // 3. Case B: Third-party Application Token (starts with wcg_app_tok_)
  if (tokenCandidate.startsWith('wcg_app_tok_')) {
    const tokenHash = await computeSha256(tokenCandidate);

    const appAuth = await env.DB
      .prepare(`
        SELECT * FROM seller_app_authorizations 
        WHERE token_hash = ? AND status = 'APPROVED' AND (revoked_at IS NULL OR revoked_at = '')
        LIMIT 1
      `)
      .bind(tokenHash)
      .first<SellerAppAuthRecord>();

    if (!appAuth) {
      return {
        authorized: false,
        status: 401,
        error: 'Token ứng dụng bên thứ ba không hợp lệ hoặc đã bị chủ gian hàng thu hồi quyền.',
      };
    }

    // Rate Limit Check (Max 600 calls/minute per token)
    const rateCheck = await env.DB
      .prepare(`
        SELECT COUNT(*) as recent_calls 
        FROM seller_api_call_logs 
        WHERE key_id = ? AND created_at >= datetime('now', '-1 minute')
      `)
      .bind(appAuth.id)
      .first<{ recent_calls: number }>()
      .catch(() => ({ recent_calls: 0 }));

    if (rateCheck && rateCheck.recent_calls >= 600) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 429, clientIp);
      return {
        authorized: false,
        status: 429,
        error: 'Ứng dụng đã vượt quá giới hạn tần suất gọi API (Tối đa 600 lượt gọi/phút).',
      };
    }

    // Fetch Seller
    const seller = await env.DB
      .prepare('SELECT * FROM sellers WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(appAuth.seller_id)
      .first<SellerRecord>();

    if (!seller) {
      return {
        authorized: false,
        status: 404,
        error: 'Gian hàng được ủy quyền không tồn tại hoặc đã bị xóa.',
      };
    }

    // Strict Boundary Check
    if (targetSellerId && targetSellerId !== appAuth.seller_id) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Từ chối truy cập: Token ứng dụng không có quyền trên gian hàng khác.',
      };
    }

    if (targetSlug && seller.slug !== targetSlug) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Từ chối truy cập: Token ứng dụng không khớp với slug của gian hàng được yêu cầu.',
      };
    }

    // Third-party App Scope Check
    if (appAuth.scope === 'READ_ONLY' && (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Token ứng dụng này chỉ có quyền đọc (READ_ONLY).',
      };
    }

    if (appAuth.scope === 'PRODUCTS_ONLY' && !pathname.includes('/products') && !pathname.includes('/media') && !pathname.includes('/vouchers') && !pathname.includes('/codes')) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Token ứng dụng này chỉ được phân quyền quản lý Sản Phẩm và Kho Mã (PRODUCTS_ONLY).',
      };
    }

    if (appAuth.scope === 'ORDERS_ONLY' && !pathname.includes('/orders') && !pathname.includes('/disputes')) {
      await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 403, clientIp);
      return {
        authorized: false,
        status: 403,
        error: 'Token ứng dụng này chỉ được phân quyền xử lý Đơn Hàng và Khiếu Nại (ORDERS_ONLY).',
      };
    }

    // Asynchronous usage update
    const nowIso = new Date().toISOString();
    env.DB.prepare(`
      UPDATE seller_app_authorizations 
      SET call_count = call_count + 1, 
          last_used_at = ?, 
          last_used_endpoint = ?
      WHERE id = ?
    `).bind(nowIso, pathname, appAuth.id).run().catch(() => {});

    await logStoreApiCall(env.DB, appAuth.seller_id, appAuth.id, 'THIRD_PARTY_TOKEN', pathname, method, 200, clientIp);

    return {
      authorized: true,
      authType: 'THIRD_PARTY_TOKEN',
      seller,
      sellerId: seller.id,
      keyId: appAuth.id,
      keyName: appAuth.app_name,
      scope: appAuth.scope,
      role: 'OWNER',
    };
  }

  // 4. Case C: Web Member Session Fallback (tối ưu 1 D1 RTT qua db.batch khi token là signed JWT)
  const bearerClean = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let resolvedMember: any = null;
  let seller: any = null;
  let subRole: 'OWNER' | 'MANAGE_STOCK' | 'VIEW_ORDERS' = 'OWNER';

  if (
    (bearerClean.startsWith('pine_edge_tok_') || bearerClean.startsWith('wcg_edge_tok_')) &&
    typeof (env.DB as any).batch === 'function'
  ) {
    try {
      const secret = env.JWT_SECRET || getSigningSecret(env);
      const verified = await verifyToken(bearerClean, [secret]);
      if (verified.valid && verified.userId) {
        const batchRes: any[] = await (env.DB as any).batch([
          env.DB.prepare('SELECT * FROM members WHERE id = ? OR username = ? LIMIT 1').bind(verified.userId, verified.userId),
          env.DB.prepare('SELECT * FROM sellers WHERE owner_member_id = ? AND deleted_at IS NULL LIMIT 1').bind(verified.userId),
          env.DB
            .prepare(`
              SELECT s.*, sa.role as sub_role
              FROM seller_subaccounts sa
              JOIN sellers s ON sa.seller_id = s.id
              WHERE sa.member_id = ? AND s.deleted_at IS NULL
              LIMIT 1
            `)
            .bind(verified.userId),
        ]);
        const memEntry = batchRes?.[0];
        if (memEntry && Array.isArray(memEntry.results)) {
          const memRow = memEntry.results[0] || null;
          if (memRow) {
            if (memRow.status === 'BANNED') {
              return {
                authorized: false,
                status: 401,
                error: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên.',
              };
            }
            resolvedMember = memRow;
            if (memRow.id === verified.userId) {
              seller = batchRes?.[1]?.results?.[0] || null;
              if (!seller) {
                const subRow = batchRes?.[2]?.results?.[0] || null;
                if (subRow) {
                  seller = subRow;
                  subRole = subRow.sub_role;
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  if (!resolvedMember) {
    const memberAuth = await verifyMemberAuth(request, env as any);
    if (!memberAuth.authorized || !memberAuth.member) {
      return {
        authorized: false,
        status: 401,
        error: memberAuth.error || 'Vui lòng cung cấp khóa API gian hàng (X-Store-Key / Authorization: Bearer wcg_sk_...) hoặc đăng nhập tài khoản.',
      };
    }
    resolvedMember = memberAuth.member;
  }

  const memberId = resolvedMember.id;

  if (!seller) {
    seller = await env.DB
      .prepare('SELECT * FROM sellers WHERE owner_member_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(memberId)
      .first<SellerRecord>();
  }

  if (!seller) {
    const sub = await env.DB
      .prepare(`
        SELECT s.*, sa.role as sub_role 
        FROM seller_subaccounts sa
        JOIN sellers s ON sa.seller_id = s.id
        WHERE sa.member_id = ? AND s.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(memberId)
      .first<any>();

    if (sub) {
      seller = sub;
      subRole = sub.sub_role;
    }
  }

  if (!seller) {
    return {
      authorized: false,
      authType: 'MEMBER_SESSION',
      status: 404,
      error: 'Bạn chưa có gian hàng hoặc chưa được gán quyền thành viên trong bất kỳ gian hàng nào.',
    };
  }

  // Cross-store Boundary Check
  if (targetSellerId && targetSellerId !== seller.id) {
    return {
      authorized: false,
      status: 403,
      error: 'Từ chối truy cập: Bạn không có quyền truy cập gian hàng khác.',
    };
  }

  if (targetSlug && seller.slug !== targetSlug) {
    return {
      authorized: false,
      status: 403,
      error: 'Từ chối truy cập: Gian hàng của bạn không khớp với đường dẫn này.',
    };
  }

  // Role Check for Subaccount
  if (requiredRole === 'OWNER' && subRole !== 'OWNER') {
    return {
      authorized: false,
      status: 403,
      error: 'Chỉ chủ gian hàng mới có quyền thực hiện thao tác này.',
    };
  }

  if (requiredRole === 'MANAGE_STOCK' && subRole !== 'OWNER' && subRole !== 'MANAGE_STOCK') {
    return {
      authorized: false,
      status: 403,
      error: 'Tài khoản phụ cần quyền Quản lý kho (MANAGE_STOCK) để thực hiện thao tác này.',
    };
  }

  return {
    authorized: true,
    authType: 'MEMBER_SESSION',
    seller,
    sellerId: seller.id,
    memberId,
    member: {
      id: memberId,
      username: resolvedMember.username,
      email: resolvedMember.email,
      role: resolvedMember.role,
    },
    role: subRole,
  };
}

/**
 * Log Store API calls for audit trail and rate-limiting
 */
export async function logStoreApiCall(
  db: D1Database,
  sellerId: string,
  keyId: string,
  authType: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress: string
): Promise<void> {
  const logId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await db
    .prepare(`
      INSERT INTO seller_api_call_logs (id, seller_id, key_id, auth_type, endpoint, method, status_code, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    .bind(logId, sellerId, keyId, authType, endpoint, method, statusCode, ipAddress)
    .run()
    .catch(() => {});
}
