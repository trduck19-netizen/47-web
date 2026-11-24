import { computeSha256 } from './mission_service';

export interface UserAiApiKeyRecord {
  id: string;
  member_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string; // JSON mảng string
  wallet_permissions: string; // JSON UserAiWalletPermissions
  daily_spend_limit: number;
  daily_spent_today: number;
  daily_spent_date: string;
  daily_withdraw_limit: number;
  daily_withdrawn_today: number;
  max_devices: number;
  is_active: number;
  call_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string;
  last_used_endpoint: string;
  last_used_ip: string;
  created_at: string;
  updated_at: string;
}

export interface UserAiWalletPermissions {
  wallet_view: boolean;
  wallet_deposit: boolean;
  wallet_pay: boolean;
  seller_withdraw: boolean;
}

export interface UserAiApiDeviceRecord {
  id: string;
  key_id: string;
  member_id: string;
  ip_address: string;
  device_id: string;
  first_seen_at: string;
  last_seen_at: string;
  is_blocked: number;
}

export interface UserAiApiCallLogRecord {
  id: string;
  key_id: string;
  member_id: string;
  key_prefix: string;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string;
  device_id: string;
  error_code: string;
  response_summary: string;
  created_at: string;
}

export interface UserAiSecurityAlertRecord {
  id: string;
  key_id: string;
  member_id: string;
  ip_address: string;
  device_id: string;
  status: 'UNACKNOWLEDGED' | 'ACKNOWLEDGED';
  email_sent_count: number;
  first_alert_at: string;
  last_email_sent_at: string;
  acknowledged_at: string | null;
  created_at: string;
}

export interface UserAiAuthResult {
  authorized: boolean;
  status?: number;
  error?: string;
  errorCode?: string;
  member?: any;
  memberId?: string;
  apiKey?: UserAiApiKeyRecord;
  keyId?: string;
  keyName?: string;
  scopes?: string[];
  walletPermissions?: UserAiWalletPermissions;
}

// Danh mục tất cả các quyền thành viên hợp pháp (Nhóm 2)
export const ALL_USER_AI_SCOPES = [
  'profile',       // Xem và cập nhật hồ sơ, avatar, SĐT, địa chỉ giao hàng
  'shopping',      // Xem/tìm kiếm game, sản phẩm, giỏ hàng, đặt hàng, voucher, phí ship
  'reviews',       // Đánh giá sản phẩm đã mua
  'disputes',      // Gửi khiếu nại đơn hàng của mình
  'seller',        // Quản lý gian hàng, sản phẩm, kho mã, đơn bán (nếu có gian hàng)
  'rewards',       // Làm nhiệm vụ, nhận giveaway, vòng quay may mắn, theo dõi game, tin tức
  'notifications', // Bật/tắt thông báo, liên kết bot Telegram
] as const;

export type UserAiScope = typeof ALL_USER_AI_SCOPES[number];

/**
 * Sinh khóa API AI ngẫu nhiên cho người dùng
 * Trả về rawKey (chỉ hiển thị duy nhất 1 lần khi tạo) và keyPrefix (đã che để lưu & hiển thị sau này)
 */
export async function generateUserAiApiKey(memberId: string): Promise<{ rawKey: string; keyPrefix: string; keyHash: string }> {
  const shortId = memberId.replace(/^usr_|^mem_/, '').slice(0, 8);
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `wcg_ai_usr_${shortId}_${randomHex}`;
  const keyPrefix = `wcg_ai_usr_${shortId}_${randomHex.slice(0, 4)}••••••••••••••••••••${randomHex.slice(-4)}`;
  const keyHash = await computeSha256(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

/**
 * Xác thực truy cập bằng Khóa AI cấp người dùng (Nhóm 2, 3, 4, 5)
 * Kiểm tra:
 * 1. Khóa hợp lệ, còn hạn, chưa bị thu hồi
 * 2. Giới hạn tốc độ: 600 yêu cầu/phút/khóa (429)
 * 3. Giới hạn thiết bị / IP kết nối (Nhóm 4 - Chặn nếu vượt max_devices)
 * 4. Kiểm tra Scope phạm vi quyền (403)
 * 5. Kiểm tra quyền và hạn mức ví nếu thao tác chi tiêu/rút tiền (Nhóm 3)
 * 6. Ghi log lịch sử gọi chi tiết (Nhóm 5)
 */
export async function verifyUserAiApiAccess(
  request: Request,
  env: { DB: D1Database; [key: string]: any },
  options: {
    requiredScope?: string;
    spendAmount?: number;
    isWithdraw?: boolean;
    requiredWalletPerm?: 'wallet_view' | 'wallet_deposit' | 'wallet_pay' | 'seller_withdraw';
  } = {}
): Promise<UserAiAuthResult> {
  if (!env.DB) {
    return { authorized: false, status: 500, error: 'Cơ sở dữ liệu chưa sẵn sàng.' };
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
  const deviceId = (request.headers.get('X-Device-Id') || request.headers.get('x-device-id') || '').trim();

  // 1. Trích xuất Authorization Bearer hoặc X-User-AI-Key
  const customHeader = request.headers.get('X-User-AI-Key') || request.headers.get('x-user-ai-key') || '';
  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenCandidate = (customHeader.trim() || bearerToken).trim();

  if (!tokenCandidate || !tokenCandidate.startsWith('wcg_ai_usr_')) {
    return {
      authorized: false,
      status: 401,
      error: 'Khóa API AI không hợp lệ hoặc thiếu tiền tố wcg_ai_usr_.',
      errorCode: 'INVALID_AI_KEY',
    };
  }

  // CẤM TUYỆT ĐỐI các hành vi quản trị hoặc nhạy cảm qua khóa API
  const forbiddenPatterns = [
    /^\/api\/admin/i,
    /^\/api\/auth\/reset-password/i,
    /^\/api\/auth\/change-password/i,
    /^\/api\/auth\/change-email/i,
    /^\/api\/user\/ai-keys/i, // Khóa không tự tạo, gia hạn hoặc thu hồi khóa khác
  ];

  for (const pat of forbiddenPatterns) {
    if (pat.test(pathname)) {
      await logAiCall(env.DB, 'FORBIDDEN', 'system', 'N/A', pathname, method, 403, clientIp, deviceId, 'FORBIDDEN_ENDPOINT', 'Cố gắng truy cập endpoint bị cấm qua khóa AI.');
      return {
        authorized: false,
        status: 403,
        error: 'CẤM TUYỆT ĐỐI: Thao tác quản trị hoặc đổi bảo mật tài khoản không được phép thực hiện qua Khóa API.',
        errorCode: 'FORBIDDEN_OPERATION',
      };
    }
  }

  // 2. Tính mã băm SHA-256 để tìm khóa trong D1
  const keyHash = await computeSha256(tokenCandidate);
  const apiKey = await env.DB
    .prepare(`
      SELECT * FROM user_ai_api_keys 
      WHERE key_hash = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')
      LIMIT 1
    `)
    .bind(keyHash)
    .first<UserAiApiKeyRecord>();

  if (!apiKey) {
    await logAiCall(env.DB, 'UNKNOWN', 'unknown', 'N/A', pathname, method, 401, clientIp, deviceId, 'KEY_NOT_FOUND', 'Khóa không tồn tại hoặc đã bị thu hồi.');
    return {
      authorized: false,
      status: 401,
      error: 'Khóa API AI không tồn tại, đã bị thu hồi hoặc không còn hoạt động.',
      errorCode: 'KEY_REVOKED_OR_NOT_FOUND',
    };
  }

  // 3. Kiểm tra ngày hết hạn
  if (apiKey.expires_at) {
    const expDate = new Date(apiKey.expires_at).getTime();
    if (Date.now() > expDate) {
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 401, clientIp, deviceId, 'KEY_EXPIRED', 'Khóa đã hết hạn sử dụng.');
      return {
        authorized: false,
        status: 401,
        error: `Khóa API AI '${apiKey.name}' đã hết hạn vào ${apiKey.expires_at}. Vui lòng gia hạn trên web.`,
        errorCode: 'KEY_EXPIRED',
      };
    }
  }

  // 4. Giới hạn tốc độ: 600 yêu cầu / phút / khóa
  const recentCallsRes = await env.DB
    .prepare(`
      SELECT COUNT(*) as recent_calls 
      FROM user_ai_api_call_logs 
      WHERE key_id = ? AND created_at >= datetime('now', '-1 minute')
    `)
    .bind(apiKey.id)
    .first<{ recent_calls: number }>();

  if (recentCallsRes && recentCallsRes.recent_calls >= 600) {
    await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 429, clientIp, deviceId, 'RATE_LIMIT_EXCEEDED', 'Vượt quá 600 yêu cầu/phút.');
    return {
      authorized: false,
      status: 429,
      error: 'Vượt quá giới hạn tốc độ 600 yêu cầu/phút cho Khóa API này. Vui lòng thử lại sau giây lát.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
    };
  }

  // 5. Quản lý Thiết Bị / Địa Chỉ Mạng (Nhóm 4)
  const existingDevices = await env.DB
    .prepare('SELECT * FROM user_ai_api_devices WHERE key_id = ?')
    .bind(apiKey.id)
    .all<UserAiApiDeviceRecord>();

  const deviceList = existingDevices.results || [];
  let isMatched = false;

  for (const dev of deviceList) {
    // Trùng địa chỉ mạng HOẶC trùng mã thiết bị
    const ipMatch = dev.ip_address === clientIp;
    const deviceMatch = Boolean(deviceId && dev.device_id && dev.device_id === deviceId);

    if (ipMatch || deviceMatch) {
      isMatched = true;
      // Cập nhật lại thời gian thấy gần nhất
      await env.DB
        .prepare("UPDATE user_ai_api_devices SET last_seen_at = datetime('now'), ip_address = ?, device_id = ? WHERE id = ?")
        .bind(clientIp, deviceId || dev.device_id, dev.id)
        .run()
        .catch(() => {});
      break;
    }
  }

  // Nếu cả địa chỉ mạng lẫn mã thiết bị đều mới
  if (!isMatched) {
    const currentDeviceCount = deviceList.length;
    const maxDevices = Math.max(1, apiKey.max_devices || 3);

    if (currentDeviceCount >= maxDevices) {
      // VƯỢT GIỚI HẠN: CHẶN LUÔN KẾT NỐI MỚI (403 DEVICE_LIMIT_EXCEEDED)
      await handleSecurityAlertForDeviceLimit(env, apiKey, clientIp, deviceId);
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'DEVICE_LIMIT_EXCEEDED', `Vượt giới hạn kết nối (${currentDeviceCount}/${maxDevices}).`);
      
      return {
        authorized: false,
        status: 403,
        error: `Kết nối bị từ chối: Số lượng thiết bị / mạng kết nối (${currentDeviceCount}/${maxDevices}) đã vượt quá giới hạn cho phép của khóa '${apiKey.name}'. Vui lòng nâng giới hạn trong Cài đặt tài khoản.`,
        errorCode: 'DEVICE_LIMIT_EXCEEDED',
      };
    } else {
      // Thêm kết nối mới vào danh sách thiết bị
      const newDevId = `uai_dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await env.DB
        .prepare(`
          INSERT INTO user_ai_api_devices (id, key_id, member_id, ip_address, device_id, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `)
        .bind(newDevId, apiKey.id, apiKey.member_id, clientIp, deviceId)
        .run()
        .catch(() => {});
    }
  }

  // 6. Kiểm tra Scope phạm vi quyền (Nhóm 2)
  let allowedScopes: string[] = [];
  try {
    allowedScopes = JSON.parse(apiKey.scopes || '[]');
  } catch {
    allowedScopes = [];
  }

  if (options.requiredScope && !allowedScopes.includes(options.requiredScope)) {
    await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'SCOPE_FORBIDDEN', `Yêu cầu quyền ${options.requiredScope}.`);
    return {
      authorized: false,
      status: 403,
      error: `Khóa API '${apiKey.name}' không có quyền truy cập phạm vi '${options.requiredScope}'. Vui lòng cấp quyền trong Cài đặt tài khoản.`,
      errorCode: 'SCOPE_FORBIDDEN',
    };
  }

  // 7. Kiểm tra Quyền Ví & Hạn Mức Chi (Nhóm 3)
  let walletPerms: UserAiWalletPermissions = {
    wallet_view: false,
    wallet_deposit: false,
    wallet_pay: false,
    seller_withdraw: false,
  };
  try {
    walletPerms = JSON.parse(apiKey.wallet_permissions || '{}');
  } catch {}

  if (options.requiredWalletPerm) {
    if (!walletPerms[options.requiredWalletPerm]) {
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'WALLET_PERMISSION_DENIED', `Chưa bật quyền ví ${options.requiredWalletPerm}.`);
      return {
        authorized: false,
        status: 403,
        error: `Khóa API '${apiKey.name}' chưa được bật quyền ví '${options.requiredWalletPerm}'. Bạn phải tự bật quyền này trong Cài đặt tài khoản.`,
        errorCode: 'WALLET_PERMISSION_DENIED',
      };
    }
  }

  // Kiểm tra hạn mức chi theo ngày (wallet_pay)
  if (options.spendAmount && options.spendAmount > 0) {
    if (!walletPerms.wallet_pay) {
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'WALLET_PAY_DISABLED', 'Chưa bật quyền thanh toán bằng ví.');
      return {
        authorized: false,
        status: 403,
        error: `Khóa API '${apiKey.name}' chưa được cấp quyền thanh toán bằng ví (wallet_pay).`,
        errorCode: 'WALLET_PAY_DISABLED',
      };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyLimit = Number(apiKey.daily_spend_limit || 0);

    if (dailyLimit <= 0) {
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'WALLET_SPEND_LIMIT_ZERO', 'Hạn mức chi ngày = 0đ.');
      return {
        authorized: false,
        status: 403,
        error: `Hạn mức chi tiêu theo ngày của khóa '${apiKey.name}' bằng 0đ (không được phép chi). Vui lòng nâng hạn mức trong Cài đặt tài khoản.`,
        errorCode: 'WALLET_SPEND_LIMIT_ZERO',
      };
    }

    let spentToday = apiKey.daily_spent_date === todayStr ? Number(apiKey.daily_spent_today || 0) : 0;
    if (spentToday + options.spendAmount > dailyLimit) {
      await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 403, clientIp, deviceId, 'WALLET_DAILY_LIMIT_EXCEEDED', `Chi ${options.spendAmount}đ vượt hạn mức ngày ${dailyLimit}đ (đã chi ${spentToday}đ).`);
      return {
        authorized: false,
        status: 403,
        error: `Giao dịch bị từ chối: Số tiền thanh toán ${options.spendAmount.toLocaleString('vi-VN')}đ vượt quá hạn mức chi tiêu theo ngày còn lại (${(dailyLimit - spentToday).toLocaleString('vi-VN')}đ / ${dailyLimit.toLocaleString('vi-VN')}đ). Tiền không bị trừ.`,
        errorCode: 'WALLET_DAILY_LIMIT_EXCEEDED',
      };
    }
  }

  // Lấy thông tin thành viên sở hữu khóa
  const member = await env.DB
    .prepare('SELECT * FROM members WHERE id = ? LIMIT 1')
    .bind(apiKey.member_id)
    .first<any>();

  if (!member) {
    return {
      authorized: false,
      status: 401,
      error: 'Không tìm thấy tài khoản người dùng gắn với khóa này.',
      errorCode: 'MEMBER_NOT_FOUND',
    };
  }

  if (member.status === 'BANNED') {
    return {
      authorized: false,
      status: 403,
      error: 'Tài khoản người dùng này đang bị tạm khóa.',
      errorCode: 'MEMBER_BANNED',
    };
  }

  // 8. Cập nhật thống kê sử dụng khóa (Async không chặn response)
  await env.DB
    .prepare(`
      UPDATE user_ai_api_keys 
      SET call_count = call_count + 1,
          last_used_at = datetime('now'),
          last_used_endpoint = ?,
          last_used_ip = ?
      WHERE id = ?
    `)
    .bind(pathname, clientIp, apiKey.id)
    .run()
    .catch(() => {});

  // Ghi log lần gọi thành công
  await logAiCall(env.DB, apiKey.id, apiKey.member_id, apiKey.key_prefix, pathname, method, 200, clientIp, deviceId, '', 'OK');

  return {
    authorized: true,
    member,
    memberId: apiKey.member_id,
    apiKey,
    keyId: apiKey.id,
    keyName: apiKey.name,
    scopes: allowedScopes,
    walletPermissions: walletPerms,
  };
}

/**
 * Ghi nhận lịch sử gọi API vào bảng D1 `user_ai_api_call_logs` (Nhóm 5)
 */
export async function logAiCall(
  db: D1Database,
  keyId: string,
  memberId: string,
  keyPrefix: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress: string,
  deviceId: string,
  errorCode = '',
  summary = ''
): Promise<void> {
  try {
    const logId = `ucl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db
      .prepare(`
        INSERT INTO user_ai_api_call_logs (
          id, key_id, member_id, key_prefix, endpoint, method, status_code, ip_address, device_id, error_code, response_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(logId, keyId, memberId, keyPrefix, endpoint, method, statusCode, ipAddress, deviceId || '', errorCode, summary)
      .run();
  } catch (err) {
    console.warn('[UserAiApiService logAiCall error]', err);
  }
}

/**
 * Ghi nhận số tiền đã chi hôm nay khi hoàn tất thanh toán thành công
 */
export async function recordAiDailySpend(db: D1Database, keyId: string, amount: number): Promise<void> {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const key = await db.prepare('SELECT daily_spent_today, daily_spent_date FROM user_ai_api_keys WHERE id = ?').bind(keyId).first<any>();
    if (!key) return;

    let currentSpent = key.daily_spent_date === todayStr ? Number(key.daily_spent_today || 0) : 0;
    const newSpent = currentSpent + amount;

    await db
      .prepare('UPDATE user_ai_api_keys SET daily_spent_today = ?, daily_spent_date = ? WHERE id = ?')
      .bind(newSpent, todayStr, keyId)
      .run();
  } catch (e) {
    console.warn('[recordAiDailySpend error]', e);
  }
}

/**
 * Xử lý cảnh báo an ninh khi vượt giới hạn thiết bị (Nhóm 4):
 * Gửi cảnh báo ngay lần đầu, và hỗ trợ quét gửi lặp lại 1 giờ/lần tối đa 24h
 */
export async function handleSecurityAlertForDeviceLimit(
  env: { DB: D1Database; [key: string]: any },
  apiKey: UserAiApiKeyRecord,
  ipAddress: string,
  deviceId: string
): Promise<void> {
  try {
    // 1. Kiểm tra xem đã có cảnh báo UNACKNOWLEDGED cho IP / Device này chưa
    const existingAlert = await env.DB
      .prepare(`
        SELECT * FROM user_ai_api_security_alerts 
        WHERE key_id = ? AND ip_address = ? AND status = 'UNACKNOWLEDGED'
        LIMIT 1
      `)
      .bind(apiKey.id, ipAddress)
      .first<UserAiSecurityAlertRecord>();

    const nowIso = new Date().toISOString();

    if (!existingAlert) {
      // Lần chặn đầu tiên: Tạo bản ghi cảnh báo mới
      const alertId = `uasa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await env.DB
        .prepare(`
          INSERT INTO user_ai_api_security_alerts (
            id, key_id, member_id, ip_address, device_id, status, email_sent_count, first_alert_at, last_email_sent_at, created_at
          ) VALUES (?, ?, ?, ?, ?, 'UNACKNOWLEDGED', 1, ?, ?, datetime('now'))
        `)
        .bind(alertId, apiKey.id, apiKey.member_id, ipAddress, deviceId || '', nowIso, nowIso)
        .run();

      // Gửi thông báo cảnh báo qua Telegram / In-app log
      await sendDeviceAlertNotification(env, apiKey, ipAddress, deviceId);
    } else {
      // Đã có cảnh báo: Kiểm tra xem đã quá 1 giờ chưa và chưa quá 24 lần
      const lastSentMs = new Date(existingAlert.last_email_sent_at).getTime();
      const oneHourMs = 3600 * 1000;
      if (Date.now() - lastSentMs >= oneHourMs && existingAlert.email_sent_count < 24) {
        await env.DB
          .prepare(`
            UPDATE user_ai_api_security_alerts 
            SET email_sent_count = email_sent_count + 1,
                last_email_sent_at = ?
            WHERE id = ?
          `)
          .bind(nowIso, existingAlert.id)
          .run();

        await sendDeviceAlertNotification(env, apiKey, ipAddress, deviceId);
      }
    }
  } catch (err) {
    console.warn('[handleSecurityAlertForDeviceLimit error]', err);
  }
}

/**
 * Gửi thông báo cảnh báo thiết bị lạ qua kênh hệ thống
 */
async function sendDeviceAlertNotification(
  env: { DB: D1Database; [key: string]: any },
  apiKey: UserAiApiKeyRecord,
  ipAddress: string,
  deviceId: string
): Promise<void> {
  try {
    const member = await env.DB.prepare('SELECT email, username FROM members WHERE id = ?').bind(apiKey.member_id).first<any>();
    const userEmail = member?.email || 'N/A';
    const alertMessage = `⚠️ CẢNH BÁO BẢO MẬT KHÓA AI: Khóa '${apiKey.name}' của tài khoản ${member?.username || apiKey.member_id} vừa bị chặn do vượt giới hạn kết nối!\n- Địa chỉ IP lạ: ${ipAddress}\n- Mã thiết bị: ${deviceId || 'Không cung cấp'}\n- Giới hạn tối đa: ${apiKey.max_devices} thiết bị\n- Email tài khoản: ${userEmail}\nVui lòng truy cập Cài đặt tài khoản để xác nhận hoặc nâng giới hạn kết nối.`;
    
    // Ghi log vào security_logs nếu bảng tồn tại
    const secLogId = `sec_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await env.DB
      .prepare(`
        INSERT INTO security_logs (id, event_type, severity, description, ip_address, user_id, created_at)
        VALUES (?, 'AI_KEY_DEVICE_LIMIT_BLOCKED', 'WARNING', ?, ?, ?, datetime('now'))
      `)
      .bind(secLogId, alertMessage, ipAddress, apiKey.member_id)
      .run()
      .catch(() => {});
  } catch {}
}
