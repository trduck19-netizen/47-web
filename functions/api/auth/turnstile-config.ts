import { isTurnstileCheckEnabled, isAdminTurnstileEnabled, TurnstileEnv } from '../../services/turnstile_service';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<TurnstileEnv> = async (context) => {
  const url = new URL(context.request.url);
  const scope = url.searchParams.get('scope');
  const clientEnabled = isTurnstileCheckEnabled(context.env);
  const adminEnabled = isAdminTurnstileEnabled(context.env);
  const enabled = scope === 'admin' ? adminEnabled : clientEnabled;
  return new Response(
    JSON.stringify({
      success: true,
      enabled,
      adminEnabled,
    }),
    { status: 200, headers: CORS_HEADERS }
  );
};
