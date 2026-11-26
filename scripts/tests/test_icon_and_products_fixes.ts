import {
  PHYSICAL_DEFAULT_IMAGE_URL,
  sanitizeImageUrl,
  resolveProductCoverImage,
} from '../../src/utils/safeImageUrl';
import { onRequestGet as gameIconGet } from '../../functions/game_icons/[file]';
import worker from '../../functions/_worker';

interface TestResult {
  name: string;
  pass: boolean;
  actual: unknown;
  expected: unknown;
}

async function main() {
  const results: TestResult[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => {
    results.push({ name, pass: actual === expected, actual, expected });
  };

  // 1. safeImageUrl ?v=2 normalization (4 checks)
  check(
    'sanitize_physical_default_adds_v2',
    sanitizeImageUrl('/game_icons/physical-default.webp'),
    PHYSICAL_DEFAULT_IMAGE_URL
  );
  check(
    'sanitize_physical_default_v2_preserved',
    sanitizeImageUrl('/game_icons/physical-default.webp?v=2'),
    PHYSICAL_DEFAULT_IMAGE_URL
  );
  check(
    'resolve_physical_default_v2',
    resolveProductCoverImage({
      product_type: 'physical',
      cover_image_url: '/game_icons/physical-default.webp',
    }),
    PHYSICAL_DEFAULT_IMAGE_URL
  );
  check(
    'resolve_physical_missing_cover_v2',
    resolveProductCoverImage({
      product_type: 'physical',
      cover_image_url: '',
    }),
    PHYSICAL_DEFAULT_IMAGE_URL
  );

  // 2. functions/game_icons/[file].ts — rejects SPA 200 text/html & serves valid image/webp (4 checks)
  const spaHtmlResponse = () =>
    new Response('<!DOCTYPE html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  const validWebpResponse = () =>
    new Response(new Uint8Array([82, 73, 70, 70]), {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    });

  const fileSpaRes = await gameIconGet({
    request: new Request('https://example.test/game_icons/physical_goods.webp'),
    env: { ASSETS: { fetch: async () => spaHtmlResponse() } },
    params: { file: 'physical_goods.webp' },
    waitUntil: () => {},
  });
  check('file_handler_spa_html_returns_404', fileSpaRes.status, 404);
  check(
    'file_handler_404_no_store',
    (fileSpaRes.headers.get('cache-control') || '').includes('no-store'),
    true
  );

  const fileValidRes = await gameIconGet({
    request: new Request('https://example.test/game_icons/physical-default.webp'),
    env: { ASSETS: { fetch: async () => validWebpResponse() } },
    params: { file: 'physical-default.webp' },
    waitUntil: () => {},
  });
  check('file_handler_valid_webp_returns_200', fileValidRes.status, 200);
  check('file_handler_valid_webp_content_type', fileValidRes.headers.get('content-type'), 'image/webp');

  // 3. functions/_worker.ts (handleGameIconRequest via default export fetch) — real production Edge Worker entrypoint (4 checks)
  const noopCtx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as any;

  const workerSpaRes = await worker.fetch(
    new Request('https://example.test/game_icons/physical_goods.webp'),
    { ASSETS: { fetch: async () => spaHtmlResponse() } } as any,
    noopCtx
  );
  check('worker_spa_html_returns_404', workerSpaRes.status, 404);
  check(
    'worker_404_no_store',
    (workerSpaRes.headers.get('cache-control') || '').includes('no-store'),
    true
  );

  const workerValidRes = await worker.fetch(
    new Request('https://example.test/game_icons/physical-default.webp?v=2'),
    { ASSETS: { fetch: async () => validWebpResponse() } } as any,
    noopCtx
  );
  check('worker_valid_webp_returns_200', workerValidRes.status, 200);
  check('worker_valid_webp_content_type', workerValidRes.headers.get('content-type'), 'image/webp');

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error('FAILED:', failed.map((f) => f.name));
    process.exit(1);
  }
  console.log(`ALL ${results.length}/${results.length} ICON + WORKER + SAFEIMAGE TESTS PASSED`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
