import { D1Database } from '@cloudflare/workers-types';
import { runGiveawaySimulation } from '../../services/giveaway_simulation_service';
import { verifyToken, verifyTemporaryAuditToken } from '../../services/auth_service';
import { invalidateCatalogEdgeCache, wasEpochBumpedForRequest } from '../../services/cache_service';

interface Env {
  DB: D1Database;
  ADMIN_API_KEY?: string;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, Cache-Control',
};

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const configuredSecret = (env.ADMIN_API_KEY || '').trim();
  const authHeader = request.headers.get('Authorization') || '';
  const syncKeyHeader = request.headers.get('X-Sync-Key') || '';

  if (configuredSecret && configuredSecret.length >= 16) {
    if (syncKeyHeader && syncKeyHeader === configuredSecret) return true;
    const cleanAuth = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (cleanAuth === configuredSecret) return true;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && env.DB) {
    if (token.startsWith('pine_edge_tok_') || token.startsWith('wcg_edge_tok_')) {
      const { valid } = await verifyToken(token, [env.JWT_SECRET]);
      if (valid) return true;
    }
    const member = await env.DB.prepare(
      'SELECT id, role FROM members WHERE session_token = ? LIMIT 1'
    ).bind(token).first<any>().catch(() => null);
    if (member && (member.role === 'ADMIN' || member.role === 'SUPER_ADMIN')) return true;
  }

  return false;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database not available' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(request.url);
  const authorized = await isAuthorized(request, env);
  const forceEventId = url.searchParams.get('eventId') || undefined;

  // GET mode: simulate dry-run or report status
  const report = await runGiveawaySimulation(env.DB, {
    forceEventId,
    bypassCooldown: false,
    bypassIdleThreshold: false,
  });

  return new Response(JSON.stringify({ success: true, authorized, report }), {
    headers: CORS_HEADERS,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database not available' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  let body: any = {};
  const rawBodyText = await request.text().catch(() => '');
  if (rawBodyText.trim().length > 0) {
    try {
      body = JSON.parse(rawBodyText);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid JSON object payload' }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Malformed JSON payload' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
  }

  const url = new URL(request.url);
  const forceEventId = body.eventId || url.searchParams.get('eventId') || undefined;
  const bypassCooldown = Boolean(body.bypassCooldown || url.searchParams.get('bypassCooldown') === '1');
  const bypassIdleThreshold = Boolean(body.bypassIdleThreshold || url.searchParams.get('bypassIdleThreshold') === '1');

  if (bypassCooldown || bypassIdleThreshold) {
    const authorized = await isAuthorized(request, env);
    if (!authorized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: bypass flags require admin credentials' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  // Chạy mô phỏng
  const report = await runGiveawaySimulation(env.DB, {
    forceEventId,
    bypassCooldown,
    bypassIdleThreshold,
  });

  if (!report.success) {
    return new Response(JSON.stringify(report), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  if (report.simulatedCount > 0 && !wasEpochBumpedForRequest(request)) {
    try {
      await invalidateCatalogEdgeCache(context as any, request, env);
    } catch {}
  }

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: CORS_HEADERS,
  });
};
