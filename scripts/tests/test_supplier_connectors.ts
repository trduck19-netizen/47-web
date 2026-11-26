import fs from 'node:fs';
import path from 'node:path';
import {
  SupplierConfigError,
  SUPPLIER_ENCRYPTED_PREFIX,
  encryptSupplierSecret,
  decryptSupplierSecret,
  maskSecretPrefix,
  validateOutboundHttpsUrl,
  signHmacPayload,
  verifyHmacSignature,
  calculateResellPrice,
} from '../../functions/services/supplier_connector_service';
import { ensureSchemaUpgrades } from '../../functions/services/d1_service';

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

  // =========================================================================
  // PART 1: Fail-Closed AES-256-GCM Secret Encryption & Zero Legacy Dependency
  // =========================================================================
  const serviceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'functions/services/supplier_connector_service.ts'),
    'utf8'
  );
  check('static_no_legacy_encryptCode', /\bencryptCode\b/.test(serviceSource), false);
  check('static_no_legacy_decryptCode', /\bdecryptCode\b/.test(serviceSource), false);
  check('static_no_marketplace_service_import', /marketplace_service/.test(serviceSource), false);
  check('static_no_isSafeExternalUrl_call', /\bisSafeExternalUrl\b/.test(serviceSource), false);
  check('static_no_default_32_key', /default_32/.test(serviceSource), false);

  let missingKeyErrorCode = '';
  try {
    await encryptSupplierSecret('secret_value_for_test', {});
  } catch (err: any) {
    if (err instanceof SupplierConfigError) {
      missingKeyErrorCode = `${err.code}:${err.status}`;
    }
  }
  check('crypto_fail_closed_missing_key', missingKeyErrorCode, 'SERVER_MISCONFIGURED:500');

  let shortKeyErrorCode = '';
  try {
    await encryptSupplierSecret('secret_value_for_test', {
      MARKETPLACE_CODE_KEY: 'too_short_15chr',
    });
  } catch (err: any) {
    if (err instanceof SupplierConfigError) {
      shortKeyErrorCode = `${err.code}:${err.status}`;
    }
  }
  check('crypto_fail_closed_short_key', shortKeyErrorCode, 'SERVER_MISCONFIGURED:500');

  const testEnvPrimary = { MARKETPLACE_CODE_KEY: 'unit_test_primary_key_32_chars_ok' };
  const testEnvFallbackJwt = { JWT_SECRET: 'unit_test_jwt_secret_key_32_chars' };
  const testEnvWrong = { MARKETPLACE_CODE_KEY: 'unit_test_different_key_32_chars!' };

  const samplePlain = 'partner_api_token_sample_99112233';
  const enc1 = await encryptSupplierSecret(samplePlain, testEnvPrimary);
  const enc2 = await encryptSupplierSecret(samplePlain, testEnvPrimary);
  check('crypto_enc_has_prefix', enc1.startsWith(SUPPLIER_ENCRYPTED_PREFIX), true);
  check('crypto_enc_random_iv_differs', enc1 !== enc2, true);
  check('crypto_enc_not_contains_plaintext', enc1.includes(samplePlain), false);

  const dec1 = await decryptSupplierSecret(enc1, testEnvPrimary);
  check('crypto_decrypt_roundtrip_primary', dec1, samplePlain);

  const encJwt = await encryptSupplierSecret(samplePlain, testEnvFallbackJwt);
  const decJwt = await decryptSupplierSecret(encJwt, testEnvFallbackJwt);
  check('crypto_decrypt_roundtrip_jwt_secret', decJwt, samplePlain);

  let wrongKeyRejected = false;
  try {
    await decryptSupplierSecret(enc1, testEnvWrong);
  } catch {
    wrongKeyRejected = true;
  }
  check('crypto_decrypt_wrong_key_throws', wrongKeyRejected, true);

  let tamperedRejected = false;
  try {
    const tampered = `${enc1.slice(0, -2)}AA`;
    await decryptSupplierSecret(tampered, testEnvPrimary);
  } catch {
    tamperedRejected = true;
  }
  check('crypto_decrypt_tampered_throws', tamperedRejected, true);

  const masked = maskSecretPrefix(samplePlain);
  check('crypto_mask_hides_raw', masked !== samplePlain && masked.includes('••••'), true);

  // =========================================================================
  // PART 2: Strict Outbound HTTPS-only SSRF Guard
  // =========================================================================
  const blockedUrls: Array<[string, string]> = [
    ['ssrf_block_http', 'http://api.partner.example/v1/orders'],
    ['ssrf_block_file', 'file:///etc/passwd'],
    ['ssrf_block_ftp', 'ftp://files.partner.example/catalog'],
    ['ssrf_block_localhost', 'https://localhost/api'],
    ['ssrf_block_localhost_dot', 'https://localhost./api'],
    ['ssrf_block_127_0_0_1', 'https://127.0.0.1/api'],
    ['ssrf_block_127_short', 'https://127.1/api'],
    ['ssrf_block_octal_loopback', 'https://0177.0.0.1/api'],
    ['ssrf_block_hex_loopback', 'https://0x7f000001/api'],
    ['ssrf_block_dword_loopback', 'https://2130706433/api'],
    ['ssrf_block_metadata_ip', 'https://169.254.169.254/latest/meta-data/'],
    ['ssrf_block_metadata_google', 'https://metadata.google.internal/computeMetadata/v1/'],
    ['ssrf_block_rfc1918_10', 'https://10.0.0.1/internal'],
    ['ssrf_block_rfc1918_172', 'https://172.16.10.2/internal'],
    ['ssrf_block_rfc1918_192', 'https://192.168.1.1/internal'],
    ['ssrf_block_cgnat', 'https://100.64.0.1/internal'],
    ['ssrf_block_ipv6_loopback', 'https://[::1]/api'],
    ['ssrf_block_ipv6_link_local', 'https://[fe80::1]/api'],
    ['ssrf_block_ipv6_ula', 'https://[fc00::1]/api'],
    ['ssrf_block_ipv6_mapped_v4', 'https://[::ffff:127.0.0.1]/api'],
    ['ssrf_block_local_suffix', 'https://shop.local/api'],
    ['ssrf_block_internal_suffix', 'https://service.internal/api'],
    ['ssrf_block_single_label', 'https://redis/api'],
    ['ssrf_block_userinfo', 'https://user:pass@api.partner.example/v1'],
    ['ssrf_block_non_https_port', 'https://api.partner.example:22/v1'],
  ];

  for (const [name, url] of blockedUrls) {
    check(name, validateOutboundHttpsUrl(url).ok, false);
  }

  check(
    'ssrf_allow_public_https_443',
    validateOutboundHttpsUrl('https://api.partner.example/v1/orders').ok,
    true
  );
  check(
    'ssrf_allow_public_https_8443',
    validateOutboundHttpsUrl('https://bot.partner.example:8443/webhook').ok,
    true
  );

  // =========================================================================
  // PART 3: HMAC-SHA256 Signing & Anti-Replay Verification (±300s)
  // =========================================================================
  const hmacSecret = 'unit_test_hmac_webhook_secret_key';
  const payload = JSON.stringify({ event: 'order.paid', order_code: 'ORD-001', amount: 150000 });
  const fixedNow = 1795680000;

  const signed = await signHmacPayload(payload, hmacSecret, fixedNow);
  check('hmac_signature_64_hex', /^[0-9a-f]{64}$/.test(signed.signature), true);

  const validVerify = await verifyHmacSignature({
    payload,
    secret: hmacSecret,
    signature: signed.signature,
    timestamp: signed.timestamp,
    nowSec: fixedNow + 10,
  });
  check('hmac_verify_valid_raw_sig', validVerify.ok, true);

  const validHeaderVerify = await verifyHmacSignature({
    payload,
    secret: hmacSecret,
    signature: signed.headerValue,
    timestamp: signed.timestamp,
    nowSec: fixedNow + 300, // exact boundary ±300s
  });
  check('hmac_verify_valid_header_at_boundary_300s', validHeaderVerify.ok, true);

  const tamperedPayloadVerify = await verifyHmacSignature({
    payload: payload.replace('150000', '1000'),
    secret: hmacSecret,
    signature: signed.signature,
    timestamp: signed.timestamp,
    nowSec: fixedNow + 5,
  });
  check('hmac_reject_tampered_payload', tamperedPayloadVerify.reason, 'INVALID_SIGNATURE');

  const wrongSecretVerify = await verifyHmacSignature({
    payload,
    secret: 'wrong_hmac_secret',
    signature: signed.signature,
    timestamp: signed.timestamp,
    nowSec: fixedNow + 5,
  });
  check('hmac_reject_wrong_secret', wrongSecretVerify.reason, 'INVALID_SIGNATURE');

  const expiredReplayVerify = await verifyHmacSignature({
    payload,
    secret: hmacSecret,
    signature: signed.signature,
    timestamp: signed.timestamp,
    nowSec: fixedNow + 301,
  });
  check('hmac_reject_replay_past_301s', expiredReplayVerify.reason, 'TIMESTAMP_OUT_OF_WINDOW');

  const futureReplayVerify = await verifyHmacSignature({
    payload,
    secret: hmacSecret,
    signature: signed.signature,
    timestamp: signed.timestamp,
    nowSec: fixedNow - 301,
  });
  check('hmac_reject_replay_future_301s', futureReplayVerify.reason, 'TIMESTAMP_OUT_OF_WINDOW');

  const malformedSigVerify = await verifyHmacSignature({
    payload,
    secret: hmacSecret,
    signature: 'not-a-hex-signature',
    timestamp: signed.timestamp,
    nowSec: fixedNow,
  });
  check('hmac_reject_malformed_sig', malformedSigVerify.reason, 'MALFORMED_SIGNATURE');

  // =========================================================================
  // PART 4: Anti-Loss Price Calculator
  // =========================================================================
  const pctPrice = calculateResellPrice({
    supplierCostCore: 100000,
    markupType: 'PERCENT',
    markupValue: 15,
    minMarginCore: 5000,
    externalStock: 10,
  });
  check('pricing_percent_selling', pctPrice.sellingPriceCore, 115000);
  check('pricing_percent_profit', pctPrice.profitCore, 15000);
  check('pricing_percent_not_paused', pctPrice.antiLossPaused, false);

  const fixedPrice = calculateResellPrice({
    supplierCostCore: 80000,
    markupType: 'FIXED',
    markupValue: 12000,
    minMarginCore: 10000,
    externalStock: 3,
  });
  check('pricing_fixed_selling', fixedPrice.sellingPriceCore, 92000);
  check('pricing_fixed_not_paused', fixedPrice.antiLossPaused, false);

  const belowCost = calculateResellPrice({
    supplierCostCore: 100000,
    markupType: 'PERCENT',
    markupValue: 10,
    overrideSellingPriceCore: 95000,
    externalStock: 5,
  });
  check('pricing_below_cost_paused', belowCost.antiLossPaused, true);
  check('pricing_below_cost_reason', belowCost.antiLossReason, 'BELOW_COST');

  const belowMinMargin = calculateResellPrice({
    supplierCostCore: 100000,
    markupType: 'FIXED',
    markupValue: 10000,
    minMarginCore: 5000,
    overrideSellingPriceCore: 103000,
    externalStock: 5,
  });
  check('pricing_below_min_margin_paused', belowMinMargin.antiLossPaused, true);
  check('pricing_below_min_margin_reason', belowMinMargin.antiLossReason, 'BELOW_MIN_MARGIN');

  const feeCausesLoss = calculateResellPrice({
    supplierCostCore: 100000,
    markupType: 'FIXED',
    markupValue: 2000,
    overrideSellingPriceCore: 102000,
    feeRatePercent: 3, // feeCore = 3060 -> profitCore = -1060
    externalStock: 5,
  });
  check('pricing_fee_loss_paused', feeCausesLoss.antiLossPaused, true);
  check('pricing_fee_loss_reason', feeCausesLoss.antiLossReason, 'BELOW_COST');

  const outOfStock = calculateResellPrice({
    supplierCostCore: 100000,
    markupType: 'PERCENT',
    markupValue: 20,
    externalStock: 0,
  });
  check('pricing_out_of_stock_paused', outOfStock.antiLossPaused, true);
  check('pricing_out_of_stock_reason', outOfStock.antiLossReason, 'OUT_OF_STOCK');

  const invalidCost = calculateResellPrice({
    supplierCostCore: 0,
    markupType: 'PERCENT',
    markupValue: 15,
  });
  check('pricing_invalid_cost_paused', invalidCost.antiLossPaused, true);
  check('pricing_invalid_cost_reason', invalidCost.antiLossReason, 'INVALID_SUPPLIER_COST');

  // =========================================================================
  // PART 5: D1 Migration 0050_supplier_connectors_v1 Position, Schema & Sửa Nhỏ 1
  // =========================================================================
  const d1Source = fs.readFileSync(
    path.resolve(process.cwd(), 'functions/services/d1_service.ts'),
    'utf8'
  );
  const idx0049 = d1Source.indexOf("0049_store_products_seller_column_and_index_v1");
  const idx0050 = d1Source.indexOf("0050_supplier_connectors_v1");
  const idxLastSchemaTiming = d1Source.lastIndexOf("lastSchemaTiming = {");
  check('d1_mig_0050_after_0049_before_timing', idx0049 > 0 && idx0050 > idx0049 && idx0050 < idxLastSchemaTiming, true);

  // Extract all prior migration IDs from d1_service.ts except 0050 so mock D1 runs ONLY 0050
  const allMigIds = new Set<string>();
  const migRegex = /appliedMigSet\.has\(['"]([^'"]+)['"]\)/g;
  let m: RegExpExecArray | null;
  while ((m = migRegex.exec(d1Source)) !== null) {
    if (m[1] !== '0050_supplier_connectors_v1') {
      allMigIds.add(m[1]);
    }
  }
  const executedSqls: string[] = [];
  const mockDb = {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async all() {
          if (sql.includes('SELECT id FROM schema_migrations')) {
            return { results: Array.from(allMigIds).map((id) => ({ id })) };
          }
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          executedSqls.push(sql);
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  } as any;

  await ensureSchemaUpgrades(mockDb);
  const joinedSql = executedSqls.join('\n');
  const expectedTables = [
    'external_suppliers',
    'external_supplier_products',
    'external_supplier_ledger',
    'supplier_fulfillment_webhooks',
    'supplier_fulfillment_deliveries',
  ];
  for (const tbl of expectedTables) {
    check(`d1_mig_0050_creates_${tbl}`, joinedSql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), true);
  }
  check(
    'd1_mig_0050_ledger_unique_includes_entry_type',
    joinedSql.includes('UNIQUE(supplier_id, external_order_ref, entry_type)'),
    true
  );
  check(
    'd1_mig_0050_records_migration_id',
    joinedSql.includes("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('0050_supplier_connectors_v1')"),
    true
  );

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        suite: 'test_supplier_connectors',
        total: results.length,
        passed,
        failedCount: failed.length,
        failed,
      },
      null,
      2
    )
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
