/**
 * Admin Soft-Delete History & Recovery API
 * Route: /api/admin/history
 */

import { listDeletedRecords, restoreSoftDeletedRecord, recordSoftDelete, getActiveTombstonesMap, SoftDeleteRecordType } from '../../services/soft_delete_service';
import { verifyToken, authenticateAdmin } from '../../services/auth_service';
import { computeSha256, hasScope } from '../../services/mission_service';

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Api-Key, x-api-key, X-Requested-With',
};

async function isAuthorizedAdmin(request: Request, env: Env): Promise<{ authorized: boolean; actor: string }> {
  const configuredSecret = (env.ADMIN_SYNC_SECRET || '').trim();
  const authHeader = request.headers.get('Authorization') || '';
  const syncKeyHeader = request.headers.get('X-Sync-Key') || '';
  const apiKeyHeader = request.headers.get('X-Api-Key') || request.headers.get('x-api-key') || '';

  // 1. Sync Secret Key
  if (configuredSecret && configuredSecret.length >= 16) {
    if (syncKeyHeader && syncKeyHeader === configuredSecret) return { authorized: true, actor: 'sync_bot' };
    if (apiKeyHeader && apiKeyHeader === configuredSecret) return { authorized: true, actor: 'admin_sync' };
    if (authHeader.startsWith('Bearer ') && authHeader.replace(/^Bearer\s+/i, '').trim() === configuredSecret) {
      return { authorized: true, actor: 'admin_sync' };
    }
  }

  // 2. Dynamic API Key with HISTORY_FULL or ADMIN_FULL
  const candidateApiKey = (apiKeyHeader || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '')).trim();
  if (candidateApiKey && env.DB) {
    try {
      const hash = await computeSha256(candidateApiKey);
      const row: any = await env.DB.prepare(
        'SELECT id, key_name, scope, is_active, expires_at FROM mission_ai_api_keys WHERE api_key_hash = ? AND is_active = 1 LIMIT 1'
      ).bind(hash).first();
      if (row) {
        if (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()) {
          if (hasScope(row.scope, 'HISTORY_FULL') || hasScope(row.scope, 'ADMIN_FULL')) {
            env.DB.prepare("UPDATE mission_ai_api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run().catch(() => {});
            return { authorized: true, actor: `api_key:${row.key_name || row.id}` };
          }
        }
      }
    } catch {}
  }

  // 3. Admin Session Token
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && env.DB) {
    const adminAuth = await authenticateAdmin(env.DB, token, {
      JWT_SECRET: env.JWT_SECRET,
      ADMIN_SYNC_SECRET: env.ADMIN_SYNC_SECRET,
    });
    if (adminAuth.authenticated) {
      return { authorized: true, actor: adminAuth.adminId || 'admin' };
    }
  }

  return { authorized: false, actor: 'anonymous' };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await isAuthorizedAdmin(request, env);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Quyền quản trị viên bắt buộc' }), { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const recordType = (url.searchParams.get('type') || 'ALL') as any;
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const includeRestored = url.searchParams.get('include_restored') === 'true';

  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database D1 không khả dụng' }), { status: 503, headers: CORS_HEADERS });
  }

  const result = await listDeletedRecords(env.DB, {
    recordType,
    limit,
    offset,
    includeRestored,
  });

  const tombstones = await getActiveTombstonesMap(env.DB);

  return new Response(JSON.stringify({
    success: true,
    records: result.records,
    total: result.total,
    limit,
    offset,
    tombstonesCount: tombstones.size,
  }), { headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await isAuthorizedAdmin(request, env);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Quyền quản trị viên bắt buộc' }), { status: 401, headers: CORS_HEADERS });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON payload' }), { status: 400, headers: CORS_HEADERS });
  }

  const action = String(body.action || '').trim();

  // 1. Restore action
  if (action === 'restore') {
    const id = String(body.id || '').trim();
    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu ID của bản ghi cần khôi phục' }), { status: 400, headers: CORS_HEADERS });
    }

    const restoreRes = await restoreSoftDeletedRecord(env.DB, {
      id,
      actor: auth.actor,
      context,
      request,
      env,
    });

    return new Response(JSON.stringify(restoreRes), {
      status: restoreRes.success ? 200 : 400,
      headers: CORS_HEADERS,
    });
  }

  // 2. Soft delete action
  if (action === 'soft_delete') {
    const { recordType, recordId, recordSlug, title, deleteReason, originalData } = body;
    if (!recordType || !recordId) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu recordType hoặc recordId' }), { status: 400, headers: CORS_HEADERS });
    }

    // Capture originalData server-side from live record to prevent caller injection
    let capturedOriginalData = originalData || {};
    if (env.DB) {
      try {
        if (recordType === 'game') {
          const gameRow = await env.DB.prepare('SELECT * FROM games WHERE id = ? OR slug = ? LIMIT 1').bind(String(recordId), recordSlug ? String(recordSlug) : String(recordId)).first<any>().catch(() => null);
          if (gameRow) capturedOriginalData = gameRow;
        } else if (recordType === 'code') {
          const codeRow = await env.DB.prepare('SELECT * FROM codes WHERE id = ? LIMIT 1').bind(String(recordId)).first<any>().catch(() => null);
          if (codeRow) capturedOriginalData = codeRow;
        } else if (recordType === 'giveaway') {
          const giveawayRow = await env.DB.prepare('SELECT * FROM giveaways WHERE id = ? LIMIT 1').bind(String(recordId)).first<any>().catch(() => null);
          if (giveawayRow) capturedOriginalData = giveawayRow;
        } else if (recordType === 'mission') {
          const missionRow = await env.DB.prepare('SELECT * FROM missions WHERE id = ? LIMIT 1').bind(String(recordId)).first<any>().catch(() => null);
          if (missionRow) capturedOriginalData = missionRow;
        } else if (recordType === 'news') {
          const newsRow = await env.DB.prepare('SELECT * FROM news WHERE id = ? OR slug = ? LIMIT 1').bind(String(recordId), recordSlug ? String(recordSlug) : String(recordId)).first<any>().catch(() => null);
          if (newsRow) capturedOriginalData = newsRow;
        }
      } catch {}
    }

    const delRes = await recordSoftDelete(env.DB, {
      recordType: recordType as SoftDeleteRecordType,
      recordId: String(recordId),
      recordSlug: recordSlug ? String(recordSlug) : null,
      title: title ? String(title) : null,
      actor: auth.actor,
      deleteReason,
      originalData: capturedOriginalData,
      context,
      request,
      env,
    });

    return new Response(JSON.stringify(delRes), {
      status: delRes.success ? 200 : 400,
      headers: CORS_HEADERS,
    });
  }

  return new Response(JSON.stringify({ success: false, error: `Hành động "${action}" không được hỗ trợ` }), { status: 400, headers: CORS_HEADERS });
};
