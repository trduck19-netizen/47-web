/**
 * Wrangler Pages Dev E2E Suite — SePay Webhook 1h Sliding-Window Rate Limit (HTTP 429 + Retry-After) & Rotate Key Reset
 *
 * Chạy hoàn toàn bằng 1 lệnh: `npm run test:e2e-wrangler-sepay`
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const PORT = 8790;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT_DIR = process.cwd();

function assert(cond, label, detail) {
  if (!cond) {
    throw new Error(`ASSERTION_FAILED [${label}]: ${JSON.stringify(detail)}`);
  }
  console.log(`PASS | ${label}`);
}

function runLocalD1Sql(persistDir, sqlFilePath) {
  const res = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'npx',
    process.platform === 'win32'
      ? ['/c', 'npx', '-y', 'wrangler', 'd1', 'execute', '47webdanganh', '--local', '-y', `--persist-to=${persistDir}`, `--file=${sqlFilePath}`]
      : ['-y', 'wrangler', 'd1', 'execute', '47webdanganh', '--local', '-y', `--persist-to=${persistDir}`, `--file=${sqlFilePath}`],
    { cwd: ROOT_DIR, encoding: 'utf8', timeout: 25000 }
  );
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute --local failed: ${res.stderr || res.stdout}`);
  }
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {}
}

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/brand`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Wrangler server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function main() {
  const workerBundle = path.join(ROOT_DIR, 'dist', '_worker.js');
  if (!fs.existsSync(workerBundle)) {
    throw new Error('Missing dist/_worker.js. Run `npm run build` before `npm run test:e2e-wrangler-sepay`.');
  }

  const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-e2e-sepay-429-'));
  const initSqlPath = path.join(persistDir, 'init_e2e.sql');
  const approveSqlPath = path.join(persistDir, 'approve_shop.sql');
  console.log(`[E2E-WRANGLER-SEPAY] Started at ${new Date().toISOString()} | Base: ${BASE_URL}`);

  fs.writeFileSync(
    initSqlPath,
    `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, executed_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  full_name TEXT DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'MEMBER',
  balance INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  salt TEXT DEFAULT '',
  password_hash TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  session_token TEXT DEFAULT NULL,
  registered_ip TEXT DEFAULT '',
  last_login TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_address TEXT NOT NULL,
  action_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  locked_until INTEGER DEFAULT 0,
  last_attempt INTEGER NOT NULL,
  PRIMARY KEY (ip_address, action_type)
);
CREATE TABLE IF NOT EXISTS security_logs (
  id TEXT PRIMARY KEY,
  actor_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  target_user TEXT,
  ip_address TEXT,
  severity TEXT NOT NULL DEFAULT 'INFO',
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
    'utf8'
  );
  runLocalD1Sql(persistDir, initSqlPath);
  console.log('PASS | initialized_isolated_local_sqlite_d1');

  const wranglerArgs = [
    '-y',
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--port',
    String(PORT),
    '--ip',
    '127.0.0.1',
    '--local',
    `--persist-to=${persistDir}`,
    '--binding',
    'JWT_SECRET=local_e2e_jwt_secret_key_32bytes_ok',
    '--binding',
    'MARKETPLACE_CODE_KEY=local_e2e_code_key_32bytes_ok',
    '--binding',
    'ADMIN_API_KEY=local_e2e_admin_api_key_32_bytes_ok',
    '--binding',
    'PASSWORD_PEPPER=local_e2e_pepper_key_32_bytes_ok',
  ];

  const wranglerChild = spawn(
    process.platform === 'win32' ? 'cmd' : 'npx',
    process.platform === 'win32' ? ['/c', 'npx', ...wranglerArgs] : wranglerArgs,
    { cwd: ROOT_DIR, stdio: ['ignore', 'ignore', 'ignore'], detached: process.platform !== 'win32' }
  );

  try {
    await waitForServer(BASE_URL);
    console.log('PASS | wrangler_pages_dev_ready_on_127.0.0.1_8790');

    const vouchersHealth = await fetch(`${BASE_URL}/api/vouchers`, { signal: AbortSignal.timeout(5000) });
    assert(vouchersHealth.status === 200, 'get_api_vouchers_runs_migrations_0057_0058', vouchersHealth.status);

    const ts = Date.now();
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `e2e_sepay_${ts}`,
        email: `e2e_sepay_${ts}@example.test`,
        displayName: 'E2E SePay Shop Owner',
        password: 'E2eWrangler#2026',
      }),
    });
    const regJson = await regRes.json();
    assert(regRes.status === 201 && Boolean(regJson.token), 'register_seller_owner_201', regRes.status);
    const token = regJson.token;

    const shopRes = await fetch(`${BASE_URL}/api/seller`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'E2E SePay 429 Shop',
        slug: `e2e-sepay-${ts}`,
        contact_phone: '0900000002',
      }),
    });
    const shopJson = await shopRes.json();
    const sellerId = shopJson.seller_id;
    assert(shopRes.status === 201 && Boolean(sellerId), 'post_api_seller_201', shopJson);

    fs.writeFileSync(approveSqlPath, `UPDATE sellers SET status = 'ACTIVE' WHERE id = '${sellerId}';\n`, 'utf8');
    runLocalD1Sql(persistDir, approveSqlPath);
    console.log('PASS | approved_local_shop_via_d1_execute_local');

    const cfgRes = await fetch(`${BASE_URL}/api/seller/sepay`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        bank_name: 'MBBank',
        account_number: '0900000002',
        account_holder: 'TEST SELLER',
        is_enabled: true,
      }),
    });
    const cfgJson = await cfgRes.json();
    assert(cfgRes.status === 200 && cfgJson.success === true, 'put_api_seller_sepay_200', cfgJson);

    const rot1Res = await fetch(`${BASE_URL}/api/seller/sepay/rotate-key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const rot1Json = await rot1Res.json();
    assert(rot1Res.status === 200 && Boolean(rot1Json.one_time_webhook_key), 'initial_rotate_key_200', rot1Res.status);

    for (let i = 1; i <= 10; i++) {
      const failRes = await fetch(`${BASE_URL}/api/webhooks/sepay/seller/${sellerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Apikey wrong_key_${i}` },
        body: JSON.stringify({ transferType: 'in', transferAmount: 10000, content: 'TEST' }),
      });
      assert(failRes.status === 401, `wrong_auth_attempt_${i}_returns_401`, failRes.status);
    }

    const blockedRes = await fetch(`${BASE_URL}/api/webhooks/sepay/seller/${sellerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Apikey wrong_key_11' },
      body: JSON.stringify({ transferType: 'in', transferAmount: 10000, content: 'TEST' }),
    });
    const retryAfterHdr = blockedRes.headers.get('retry-after');
    const blockedJson = await blockedRes.json();
    assert(
      blockedRes.status === 429 && Number(retryAfterHdr) > 0 && blockedJson.code === 'RATE_LIMITED',
      'attempt_11_returns_429_with_Retry_After_and_RATE_LIMITED',
      { status: blockedRes.status, retryAfterHdr, blockedJson }
    );

    const rot2Res = await fetch(`${BASE_URL}/api/seller/sepay/rotate-key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const rot2Json = await rot2Res.json();
    assert(rot2Res.status === 200 && Boolean(rot2Json.one_time_webhook_key), 'post_rotate_key_resets_window_200', rot2Res.status);

    const postRotateWrong = await fetch(`${BASE_URL}/api/webhooks/sepay/seller/${sellerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Apikey still_wrong_after_rotate' },
      body: JSON.stringify({ transferType: 'in', transferAmount: 10000, content: 'TEST' }),
    });
    assert(postRotateWrong.status === 401, 'wrong_auth_after_rotate_returns_401_not_429', postRotateWrong.status);

    const postRotateValid = await fetch(`${BASE_URL}/api/webhooks/sepay/seller/${sellerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${rot2Json.one_time_webhook_key}` },
      body: JSON.stringify({ id: 999111, transferType: 'in', transferAmount: 10000, content: 'WCG_NO_ORDER' }),
    });
    assert(postRotateValid.status === 200, 'valid_auth_with_new_key_returns_200', postRotateValid.status);

    console.log(
      JSON.stringify(
        {
          suite: 'e2e_wrangler_sepay_429',
          baseUrl: BASE_URL,
          passed: true,
          sellerId,
          blockedStatus: blockedRes.status,
          retryAfterHeader: retryAfterHdr,
          postRotateWrongStatus: postRotateWrong.status,
          postRotateValidStatus: postRotateValid.status,
        },
        null,
        2
      )
    );
  } finally {
    killProcessTree(wranglerChild);
    try {
      fs.rmSync(persistDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('[E2E-WRANGLER-SEPAY FAILED]', err);
  process.exit(1);
});
