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
  dispatchSupplierFulfillmentWebhook,
  retrySupplierWebhookDelivery,
  syncExternalSupplierCatalog,
  reserveSupplierCreditAtomic,
  refundSupplierOrder,
  processAffiliatePostback,
} from '../../functions/services/supplier_connector_service';
import { ensureSchemaUpgrades, lastSchemaTiming } from '../../functions/services/d1_service';
import * as adminSuppliersIndexApi from '../../functions/api/admin/suppliers/index';
import * as affiliatePostbackApi from '../../functions/api/webhooks/affiliate-postback';
import * as inventoryPushApi from '../../functions/api/seller/affiliate/inventory-push';

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

  const [schemaTimingCallerA, schemaTimingCallerB] = await Promise.all([
    ensureSchemaUpgrades(mockDb),
    ensureSchemaUpgrades(mockDb),
  ]);
  check(
    'd1_concurrent_schema_timing_shared_run',
    schemaTimingCallerA.cacheHit === false &&
      schemaTimingCallerB.cacheHit === false &&
      schemaTimingCallerA.migSelectMs === schemaTimingCallerB.migSelectMs &&
      schemaTimingCallerA.ddlMs === schemaTimingCallerB.ddlMs &&
      lastSchemaTiming.cacheHit === false,
    true
  );
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
  check(
    'd1_mig_0051_cleans_approved_partnership_revoked_at',
    d1Source.includes('0051_fix_approved_partnership_revoked_at_v1') &&
      d1Source.includes("WHERE id = 'sap_mwug5g1i_7cixz'") &&
      d1Source.includes('SET revoked_at = NULL'),
    true
  );

  // =========================================================================
  // PART 6: Admin API Auth, Selective Projection & Scope Registration (Mảnh 2)
  // =========================================================================
  const storeState = {
    suppliers: [] as any[],
    products: [] as any[],
    ledger: [] as any[],
    webhooks: [] as any[],
    deliveries: [] as any[],
    orders: [
      { id: 'ord_sup_01', status: 'PROCESSING', escrow_status: 'HELD', buyer_member_id: 'mem_01' },
    ] as any[],
    members: [{ id: 'mem_01', email: 'buyer@example.com', balance: 50000 }] as any[],
    walletTx: [] as any[],
  };

  function createStatefulMockDb() {
    const execOne = (sql: string, binds: any[]) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.includes('SELECT id FROM schema_migrations')) {
        return {
          results: [...Array.from(allMigIds), '0050_supplier_connectors_v1', '0051_fix_approved_partnership_revoked_at_v1'].map(
            (id) => ({ id })
          ),
        };
      }
      if (s.startsWith('SELECT id FROM external_suppliers WHERE code = ?')) {
        const hit = storeState.suppliers.find((x) => x.code === binds[0]) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.startsWith('SELECT * FROM external_suppliers WHERE code = ? AND is_active = 1')) {
        const hit = storeState.suppliers.find((x) => x.code === binds[0] && x.is_active === 1) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.startsWith('SELECT * FROM external_suppliers WHERE id = ?')) {
        const hit = storeState.suppliers.find((x) => x.id === binds[0]) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.includes('FROM external_suppliers WHERE id = ? LIMIT 1')) {
        const raw = storeState.suppliers.find((x) => x.id === binds[0]);
        if (!raw) return { first: null, results: [] };
        const safe = { ...raw };
        delete safe.encrypted_api_key;
        delete safe.encrypted_webhook_secret;
        safe.has_api_key = raw.encrypted_api_key ? 1 : 0;
        safe.has_webhook_secret = raw.encrypted_webhook_secret ? 1 : 0;
        return { first: safe, results: [safe] };
      }
      if (s.includes('FROM external_suppliers WHERE 1=1')) {
        const safeList = storeState.suppliers.map((raw) => {
          const safe = { ...raw };
          delete safe.encrypted_api_key;
          delete safe.encrypted_webhook_secret;
          safe.has_api_key = raw.encrypted_api_key ? 1 : 0;
          safe.has_webhook_secret = raw.encrypted_webhook_secret ? 1 : 0;
          return safe;
        });
        return { results: safeList };
      }
      if (s.startsWith('INSERT INTO external_suppliers')) {
        storeState.suppliers.push({
          id: binds[0],
          name: binds[1],
          code: binds[2],
          mode: binds[3],
          base_url: binds[4],
          auth_type: binds[5],
          auth_header_name: binds[6],
          encrypted_api_key: binds[7],
          api_key_prefix: binds[8],
          encrypted_webhook_secret: binds[9],
          webhook_secret_prefix: binds[10],
          catalog_path: binds[11],
          order_path: binds[12],
          balance_path: binds[13],
          field_mapping_json: binds[14],
          supports_idempotency: binds[15],
          markup_type: binds[16],
          markup_value: binds[17],
          min_margin_core: binds[18],
          credit_limit_core: binds[19],
          credit_used_core: 0,
          prepaid_balance_core: binds[20],
          prepaid_min_balance: binds[21],
          auto_pause_enabled: binds[22],
          is_active: binds[23],
          created_at: binds[24],
          updated_at: binds[25],
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('SET credit_used_core = credit_used_core + ?')) {
        const [cost, nowIso, supId, ledgerId, supId2] = binds;
        const hasLedger = storeState.ledger.some(
          (r) => r.id === ledgerId && r.supplier_id === supId2 && r.entry_type === 'ORDER_DEBIT'
        );
        const sup = storeState.suppliers.find((x) => x.id === supId);
        if (!sup || !hasLedger) return { success: true, meta: { changes: 0 } };
        sup.credit_used_core += cost;
        sup.updated_at = nowIso;
        return { success: true, meta: { changes: 1 } };
      }
      if (s.startsWith('SELECT id FROM external_supplier_ledger WHERE supplier_id = ? AND external_order_ref = ?')) {
        const hit =
          storeState.ledger.find(
            (r) => r.supplier_id === binds[0] && r.external_order_ref === binds[1] && r.entry_type === 'ORDER_DEBIT'
          ) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.includes('SET credit_used_core = CASE WHEN credit_used_core >= ?')) {
        const [cost, , nowIso, supId, ordId] = binds;
        const ord = storeState.orders.find(
          (o) => o.id === ordId && !['REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'].includes(o.status)
        );
        const sup = storeState.suppliers.find((x) => x.id === supId);
        if (!ord || !sup) return { success: true, meta: { changes: 0 } };
        sup.credit_used_core = Math.max(0, sup.credit_used_core - cost);
        sup.updated_at = nowIso;
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('UPDATE members SET balance = balance + ?')) {
        const [amt, nowIso, memId, ordId] = binds;
        const ord = storeState.orders.find(
          (o) => o.id === ordId && !['REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'].includes(o.status)
        );
        const mem = storeState.members.find((x) => x.id === memId);
        if (!ord || !mem) return { success: true, meta: { changes: 0 } };
        mem.balance += amt;
        mem.updated_at = nowIso;
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('INSERT INTO wallet_transactions')) {
        const [txId, amt, , desc, ordId, nowIso, memId, guardOrdId] = binds;
        const ord = storeState.orders.find(
          (o) => o.id === guardOrdId && !['REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'].includes(o.status)
        );
        if (!ord) return { success: true, meta: { changes: 0 } };
        storeState.walletTx.push({ id: txId, member_id: memId, amount: amt, order_id: ordId, description: desc, created_at: nowIso });
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('UPDATE orders SET status = \'REFUNDED_SUPPLIER_ERROR\'')) {
        const [nowIso, ordId] = binds;
        const ord = storeState.orders.find(
          (o) => o.id === ordId && !['REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'].includes(o.status)
        );
        if (!ord) return { success: true, meta: { changes: 0 } };
        ord.status = 'REFUNDED_SUPPLIER_ERROR';
        ord.escrow_status = 'REFUNDED';
        ord.updated_at = nowIso;
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('INSERT OR IGNORE INTO external_supplier_ledger')) {
        let entryType = 'ORDER_DEBIT';
        let supId = '';
        let ref = '';
        let rowObj: any = null;
        if (s.includes("'AFFILIATE_COMMISSION'")) {
          entryType = 'AFFILIATE_COMMISSION';
          supId = binds[1];
          ref = binds[6];
          rowObj = { id: binds[0], supplier_id: supId, entry_type: entryType, external_order_ref: ref, profit_core: binds[5] };
        } else if (s.includes("'REFUND_CREDIT'")) {
          entryType = 'REFUND_CREDIT';
          supId = binds[9];
          ref = binds[5];
          const guardOrdId = binds[10];
          const ord = storeState.orders.find(
            (o) => o.id === guardOrdId && !['REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'].includes(o.status)
          );
          if (!ord) return { success: true, meta: { changes: 0 } };
          rowObj = { id: binds[0], supplier_id: supId, entry_type: entryType, external_order_ref: ref, cost_core: binds[3] };
        } else {
          entryType = 'ORDER_DEBIT';
          supId = binds[11];
          const costCheck = binds[12];
          ref = binds[7];
          const sup = storeState.suppliers.find(
            (x) =>
              x.id === supId &&
              x.is_active === 1 &&
              x.mode === 'POSTPAID_CREDIT' &&
              x.credit_used_core + costCheck <= x.credit_limit_core
          );
          if (!sup) return { success: true, meta: { changes: 0 } };
          rowObj = { id: binds[0], supplier_id: supId, entry_type: entryType, external_order_ref: ref, cost_core: binds[3] };
        }
        // Enforce Sửa nhỏ 1: UNIQUE(supplier_id, external_order_ref, entry_type)
        const dup = storeState.ledger.some(
          (r) => r.supplier_id === supId && r.external_order_ref === ref && r.entry_type === entryType
        );
        if (dup) return { success: true, meta: { changes: 0 } };
        storeState.ledger.push(rowObj);
        return { success: true, meta: { changes: 1 } };
      }
      if (s.startsWith('SELECT id, selling_price_core FROM external_supplier_products')) {
        const hit = storeState.products.find((p) => p.supplier_id === binds[0] && p.external_sku === binds[1]) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.startsWith('INSERT INTO external_supplier_products')) {
        const idx = storeState.products.findIndex((p) => p.supplier_id === binds[1] && p.external_sku === binds[2]);
        const row = {
          id: binds[0],
          supplier_id: binds[1],
          external_sku: binds[2],
          external_name: binds[3],
          supplier_cost_core: binds[4],
          selling_price_core: binds[5],
          profit_core: binds[6],
          external_stock: binds[7],
          anti_loss_paused: binds[9],
          anti_loss_reason: binds[10],
        };
        if (idx >= 0) storeState.products[idx] = row;
        else storeState.products.push(row);
        return { success: true, meta: { changes: 1 } };
      }
      if (s.includes('FROM supplier_fulfillment_webhooks WHERE seller_id IN')) {
        const hits = storeState.webhooks.filter((w) => binds.includes(w.seller_id) && w.is_active === 1);
        return { results: hits };
      }
      if (s.startsWith('SELECT * FROM supplier_fulfillment_webhooks WHERE id = ?')) {
        const hit = storeState.webhooks.find((w) => w.id === binds[0]) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.startsWith('SELECT * FROM supplier_fulfillment_deliveries WHERE id = ?')) {
        const hit = storeState.deliveries.find((d) => d.id === binds[0]) || null;
        return { first: hit, results: hit ? [hit] : [] };
      }
      if (s.startsWith('INSERT INTO supplier_fulfillment_deliveries')) {
        storeState.deliveries.push({
          id: binds[0],
          webhook_id: binds[1],
          seller_id: binds[2],
          order_id: binds[3],
          order_code: binds[4],
          event_type: binds[5],
          request_payload_json: binds[6],
          http_status: binds[7],
          response_snippet: binds[8],
          attempts: Number(binds[9] ?? 1),
          delivery_status: binds[10],
          external_fulfillment_ref: binds[11] ?? null,
          error_message: binds[12] ?? null,
          created_at: binds[13] ?? null,
          delivered_at: binds[14] ?? null,
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (s.startsWith('UPDATE supplier_fulfillment_deliveries SET http_status = ?')) {
        const d = storeState.deliveries.find((x) => x.id === binds[5]);
        if (d) {
          d.http_status = binds[0];
          d.response_snippet = binds[1];
          d.attempts += 1;
          d.delivery_status = binds[2];
          d.error_message = binds[3];
        }
        return { success: true, meta: { changes: d ? 1 : 0 } };
      }
      return { first: null, results: [], success: true, meta: { changes: 1 } };
    };

    return {
      prepare(sql: string) {
        let bound: any[] = [];
        return {
          bind(...args: any[]) {
            bound = args;
            return this;
          },
          async all() {
            const res = await execOne(sql, bound);
            return { results: res.results || [] };
          },
          async first() {
            const res = await execOne(sql, bound);
            return res.first !== undefined ? res.first : (res.results?.[0] ?? null);
          },
          async run() {
            return await execOne(sql, bound);
          },
          _sql: sql,
          _getBinds: () => bound,
        };
      },
      async batch(stmts: any[]) {
        // SQLite / Cloudflare D1 executes db.batch() as a single serialized transaction without interleaving
        return stmts.map((st) => execOne(st._sql, st._getBinds()));
      },
    } as any;
  }

  const statefulDb = createStatefulMockDb();
  const apiEnv = {
    DB: statefulDb,
    MARKETPLACE_CODE_KEY: 'unit_test_primary_key_32_chars_ok',
    ADMIN_API_KEY: 'unit_test_admin_master_secret_32_ok',
  };

  // Unauthenticated GET / POST must return 401
  const unauthGet = await adminSuppliersIndexApi.onRequestGet({
    request: new Request('https://example.test/api/admin/suppliers'),
    env: apiEnv,
  } as any);
  check('api_suppliers_unauth_get_401', unauthGet.status, 401);

  const unauthPost = await adminSuppliersIndexApi.onRequestPost({
    request: new Request('https://example.test/api/admin/suppliers', { method: 'POST', body: '{}' }),
    env: apiEnv,
  } as any);
  check('api_suppliers_unauth_post_401', unauthPost.status, 401);

  // Authenticated POST with http:// must be rejected 400 SSRF/HTTPS_REQUIRED
  const httpPost = await adminSuppliersIndexApi.onRequestPost({
    request: new Request('https://example.test/api/admin/suppliers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiEnv.ADMIN_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad HTTP Partner',
        code: 'bad_http',
        mode: 'POSTPAID_CREDIT',
        base_url: 'http://api.partner.example',
      }),
    }),
    env: apiEnv,
  } as any);
  check('api_suppliers_reject_http_400', httpPost.status, 400);

  // Authenticated POST with valid HTTPS + secret -> 201 and selective projection (no encrypted_* leaked)
  const createRes = await adminSuppliersIndexApi.onRequestPost({
    request: new Request('https://example.test/api/admin/suppliers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiEnv.ADMIN_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Partner Credit 0d',
        code: 'partner_credit',
        mode: 'POSTPAID_CREDIT',
        base_url: 'https://api.partner.example',
        api_key: 'partner_live_key_9988776655',
        markup_type: 'PERCENT',
        markup_value: 15,
        credit_limit_core: 100000,
      }),
    }),
    env: apiEnv,
  } as any);
  const createJson: any = await createRes.json();
  check('api_suppliers_create_201', createRes.status, 201);
  check('api_suppliers_create_no_encrypted_key_leaked', 'encrypted_api_key' in (createJson.supplier || {}), false);
  check('api_suppliers_create_has_prefix', Boolean(createJson.supplier?.api_key_prefix), true);

  const listRes = await adminSuppliersIndexApi.onRequestGet({
    request: new Request('https://example.test/api/admin/suppliers', {
      headers: { Authorization: `Bearer ${apiEnv.ADMIN_API_KEY}` },
    }),
    env: apiEnv,
  } as any);
  const listJson: any = await listRes.json();
  check('api_suppliers_list_200', listRes.status, 200);
  check('api_suppliers_list_zero_encrypted_cols', !JSON.stringify(listJson).includes('encrypted_api_key'), true);

  const apiKeysModSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/admin/modules/ApiKeysModule.tsx'),
    'utf8'
  );
  check('scopes_registered_supplier_connectors_full', apiKeysModSource.includes("'SUPPLIER_CONNECTORS_FULL'"), true);
  check('scopes_registered_supplier_fulfillment_manage', apiKeysModSource.includes("'SUPPLIER_FULFILLMENT_MANAGE'"), true);

  // =========================================================================
  // PART 7: PA2 Webhook Dispatch, Retry, Seller-Orders WaitUntil & Inventory Push (Mảnh 3)
  // =========================================================================
  const whRawSecret = 'whsec_test_partner_secret_123456';
  const whEncSecret = await encryptSupplierSecret(whRawSecret, apiEnv);
  storeState.webhooks.push({
    id: 'whk_test_1',
    seller_id: 'seller_alpha',
    name: 'Alpha Bot Webhook',
    webhook_url: 'https://bot.partner.example/orders',
    encrypted_hmac_secret: whEncSecret,
    events_json: '["order.paid"]',
    is_active: 1,
    timeout_ms: 5000,
    retry_max: 2,
  });

  let capturedSig = '';
  let capturedTs = '';
  let capturedBody = '';
  const dispatchOk = await dispatchSupplierFulfillmentWebhook(statefulDb, apiEnv, {
    sellerIds: ['seller_alpha'],
    orderId: 'sord_1',
    orderCode: 'CGM-001',
    eventType: 'order.paid',
    payloadData: { price_core: 120000 },
    fetchImpl: (async (_url: any, init: any) => {
      capturedSig = init.headers['X-WCG-Signature'];
      capturedTs = init.headers['X-WCG-Timestamp'];
      capturedBody = init.body;
      return new Response(JSON.stringify({ ok: true, fulfillment_ref: 'BOT-REF-1' }), { status: 200 });
    }) as any,
  });
  check('pa2_webhook_delivered_count', dispatchOk.delivered, 1);
  const sigCheck = await verifyHmacSignature({
    payload: capturedBody,
    secret: whRawSecret,
    signature: capturedSig,
    timestamp: capturedTs,
  });
  check('pa2_webhook_signature_verified', sigCheck.ok, true);

  // Failed delivery then retry succeeds
  const dispatchFail = await dispatchSupplierFulfillmentWebhook(statefulDb, apiEnv, {
    sellerIds: ['seller_alpha'],
    orderId: 'sord_2',
    orderCode: 'CGM-002',
    eventType: 'order.paid',
    payloadData: { price_core: 50000 },
    fetchImpl: (async () => new Response('upstream err', { status: 500 })) as any,
  });
  check('pa2_webhook_failed_recorded', dispatchFail.failed, 1);
  const retryRes = await retrySupplierWebhookDelivery(
    statefulDb,
    apiEnv,
    dispatchFail.deliveryIds[0],
    (async () => new Response('ok', { status: 200 })) as any
  );
  check('pa2_webhook_retry_delivered', retryRes.ok && retryRes.status === 'DELIVERED', true);

  const sellerOrdersSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'functions/api/seller-orders/index.ts'),
    'utf8'
  );
  check(
    'pa2_seller_orders_nonblocking_waitUntil',
    sellerOrdersSrc.includes('dispatchSupplierFulfillmentWebhook') && sellerOrdersSrc.includes('context.waitUntil'),
    true
  );

  const invPushUnauth = await inventoryPushApi.onRequestPost({
    request: new Request('https://example.test/api/seller/affiliate/inventory-push', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    }),
    env: apiEnv,
  } as any);
  check('pa2_inventory_push_unauth_401', invPushUnauth.status, 401);

  // =========================================================================
  // PART 8: PA1 Sync, Credit Race Guard, Atomic Refund + Sửa Nhỏ 1, Affiliate Postback (Mảnh 4)
  // =========================================================================
  const supId = createJson.supplier.id;
  const syncRes = await syncExternalSupplierCatalog(statefulDb, apiEnv, supId, {
    skipDnsCheck: true,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          items: [
            { sku: 'SKU-OK', name: 'Valid Card 100k', price: 100000, stock: 5 },
            { sku: 'SKU-OOS', name: 'Empty Stock Card', price: 50000, stock: 0 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any,
  });
  check('pa1_sync_ok', syncRes.ok, true);
  check('pa1_sync_count_2', syncRes.synced, 2);
  check('pa1_sync_antiloss_paused_1', syncRes.pausedByAntiLoss, 1);

  // Concurrent credit limit guard: limit = 100,000; 2 parallel debits of 70,000 -> strictly 1 passes, 1 rejected
  const [resA, resB] = await Promise.all([
    reserveSupplierCreditAtomic(statefulDb, {
      supplierId: supId,
      orderId: 'ord_sup_01',
      orderCode: 'ORD-RACE-1',
      externalOrderRef: 'EXT-ORD-999',
      costCore: 70000,
      sellingCore: 120000,
    }),
    reserveSupplierCreditAtomic(statefulDb, {
      supplierId: supId,
      orderId: 'ord_sup_02',
      orderCode: 'ORD-RACE-2',
      externalOrderRef: 'EXT-ORD-1000',
      costCore: 70000,
      sellingCore: 120000,
    }),
  ]);
  const racePassedCount = [resA, resB].filter((r) => r.ok).length;
  const raceFailedExceeded = [resA, resB].filter((r) => !r.ok && r.reason === 'CREDIT_LIMIT_EXCEEDED').length;
  check('pa1_credit_race_only_one_passes', racePassedCount, 1);
  check('pa1_credit_race_second_rejected', raceFailedExceeded, 1);
  check('pa1_credit_used_equals_70000', storeState.suppliers[0].credit_used_core, 70000);

  // Idempotency guard test (Nhóm 2b): calling reserveSupplierCreditAtomic TWICE for the same (supplier_id, external_order_ref)
  // even when remaining credit limit (30,000 >= 20,000) could fit another debit MUST NOT deduct credit twice!
  const idemFirst = await reserveSupplierCreditAtomic(statefulDb, {
    supplierId: supId,
    orderId: 'ord_sup_idem',
    orderCode: 'ORD-IDEM-1',
    externalOrderRef: 'EXT-ORD-IDEM-1',
    costCore: 10000,
    sellingCore: 15000,
  });
  const idemSecond = await reserveSupplierCreditAtomic(statefulDb, {
    supplierId: supId,
    orderId: 'ord_sup_idem',
    orderCode: 'ORD-IDEM-1',
    externalOrderRef: 'EXT-ORD-IDEM-1',
    costCore: 10000,
    sellingCore: 15000,
  });
  check('pa1_credit_idempotency_first_reserves', idemFirst.ok === true && idemFirst.alreadyReserved === false, true);
  check(
    'pa1_credit_idempotency_second_already_reserved',
    idemSecond.ok === true &&
      idemSecond.alreadyReserved === true &&
      idemSecond.reason === 'ALREADY_RESERVED' &&
      idemSecond.ledgerId === idemFirst.ledgerId,
    true
  );
  // 70,000 (from race) + 10,000 (deducted ONCE, NOT 20,000) = 80,000
  check('pa1_credit_idempotency_deducted_only_once', storeState.suppliers[0].credit_used_core, 80000);
  check(
    'pa1_credit_idempotency_single_ledger_row',
    storeState.ledger.filter((r) => r.external_order_ref === 'EXT-ORD-IDEM-1' && r.entry_type === 'ORDER_DEBIT').length,
    1
  );
  // Reset back the extra 10,000 used by idempotency check so the refund check below still asserts clean restoration to 0
  storeState.suppliers[0].credit_used_core -= 10000;

  // Atomic refundSupplierOrder + Sửa Nhỏ 1 test: ORDER_DEBIT + REFUND_CREDIT share external_order_ref 'EXT-ORD-999'
  const refund1 = await refundSupplierOrder(statefulDb, {
    orderTable: 'orders',
    orderId: 'ord_sup_01',
    orderCode: 'ORD-RACE-1',
    buyerMemberId: 'mem_01',
    refundAmountCore: 120000,
    reason: 'SUPPLIER_TIMEOUT',
    supplierId: supId,
    externalOrderRef: 'EXT-ORD-999',
    supplierCostCore: 70000,
  });
  check('pa1_refund_first_ok', refund1.ok && refund1.refundStatus === 'REFUNDED_SUPPLIER_ERROR', true);
  check('pa1_refund_buyer_credited_once', storeState.members[0].balance, 170000);
  check('pa1_refund_credit_restored_to_0', storeState.suppliers[0].credit_used_core, 0);

  // Verify Sửa nhỏ 1: BOTH ORDER_DEBIT and REFUND_CREDIT rows exist for EXT-ORD-999!
  const sameRefEntries = storeState.ledger.filter((r) => r.external_order_ref === 'EXT-ORD-999');
  check(
    'pa1_sua_nho_1_debit_and_refund_same_ref_both_saved',
    sameRefEntries.length === 2 &&
      sameRefEntries.some((r) => r.entry_type === 'ORDER_DEBIT') &&
      sameRefEntries.some((r) => r.entry_type === 'REFUND_CREDIT'),
    true
  );

  // Second refund attempt on same order MUST be blocked by state-guard (zero double refund!)
  const refund2 = await refundSupplierOrder(statefulDb, {
    orderTable: 'orders',
    orderId: 'ord_sup_01',
    orderCode: 'ORD-RACE-1',
    buyerMemberId: 'mem_01',
    refundAmountCore: 120000,
    reason: 'DUPLICATE_RETRY',
    supplierId: supId,
    externalOrderRef: 'EXT-ORD-999',
    supplierCostCore: 70000,
  });
  check('pa1_refund_second_blocked_already_refunded', refund2.ok === false && refund2.alreadyRefunded === true, true);
  check('pa1_refund_no_double_credit', storeState.members[0].balance, 170000);

  // Affiliate postback HTTP handler rejects missing signature (400)
  const postbackNoSig = await affiliatePostbackApi.onRequestPost({
    request: new Request('https://example.test/api/webhooks/affiliate-postback', {
      method: 'POST',
      body: JSON.stringify({ supplier_code: 'aff_partner', external_order_ref: 'AFF-1' }),
    }),
    env: apiEnv,
  } as any);
  check('pa1_postback_missing_sig_400', postbackNoSig.status, 400);

  // Affiliate postback HMAC + idempotency
  const affSecret = 'aff_postback_secret_key_654321';
  storeState.suppliers.push({
    id: 'esup_aff_1',
    name: 'Official Affiliate Network',
    code: 'aff_partner',
    mode: 'AFFILIATE_POSTBACK',
    base_url: 'https://aff.partner.example',
    encrypted_webhook_secret: await encryptSupplierSecret(affSecret, apiEnv),
    is_active: 1,
  });
  const affBody = JSON.stringify({
    supplier_code: 'aff_partner',
    external_order_ref: 'AFF-ORD-777',
    order_amount_core: 250000,
    commission_core: 25000,
    sub_id: 'mem_01',
  });
  const affSigned = await signHmacPayload(affBody, affSecret, fixedNow);
  const pb1 = await processAffiliatePostback(statefulDb, apiEnv, {
    supplierCode: 'aff_partner',
    rawBody: affBody,
    signatureHeader: affSigned.headerValue,
    timestampHeader: String(affSigned.timestamp),
    nowSec: fixedNow + 5,
  });
  const pb2 = await processAffiliatePostback(statefulDb, apiEnv, {
    supplierCode: 'aff_partner',
    rawBody: affBody,
    signatureHeader: affSigned.headerValue,
    timestampHeader: String(affSigned.timestamp),
    nowSec: fixedNow + 10,
  });
  check('pa1_postback_first_recorded', pb1.ok && pb1.duplicate === false, true);
  check('pa1_postback_second_idempotent_duplicate', pb2.ok && pb2.duplicate === true, true);
  check(
    'pa1_postback_ledger_count_strictly_1',
    storeState.ledger.filter((r) => r.external_order_ref === 'AFF-ORD-777').length,
    1
  );

  // =========================================================================
  // PART 9: Bilingual Symmetry & Rule 9 Single-Screen Check (Mảnh 5)
  // =========================================================================
  const viJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/locales/vi.json'), 'utf8'));
  const enJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/locales/en.json'), 'utf8'));
  const viKeys = Object.keys(viJson.supplierConnectors || {}).sort();
  const enKeys = Object.keys(enJson.supplierConnectors || {}).sort();
  check('i18n_supplierConnectors_symmetry', JSON.stringify(viKeys) === JSON.stringify(enKeys) && viKeys.length >= 100, true);

  const uiSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/admin/modules/SupplierConnectorsModule.tsx'),
    'utf8'
  );
  const tableMatches = uiSrc.match(/<table\b[^>]*>/g) || [];
  check(
    'ui_rule9_all_tables_fixed_full',
    tableMatches.length === 5 && tableMatches.every((tTag) => tTag.includes('table-fixed w-full')),
    true
  );

  // =========================================================================
  // PART 10: Regression Checks for #44 (Credit Reason Codes) & #66 (Webhook retry_max)
  // =========================================================================
  const notFoundCredit = await reserveSupplierCreditAtomic(statefulDb, {
    supplierId: 'esup_missing_id',
    orderId: 'ord_missing',
    orderCode: 'ORD-MISS-1',
    externalOrderRef: 'EXT-MISS-1',
    costCore: 5000,
    sellingCore: 8000,
  });
  check('reg44_credit_supplier_not_found', notFoundCredit.reason, 'SUPPLIER_NOT_FOUND');

  const wrongModeCredit = await reserveSupplierCreditAtomic(statefulDb, {
    supplierId: 'esup_aff_1', // mode === 'AFFILIATE_POSTBACK'
    orderId: 'ord_wrong_mode',
    orderCode: 'ORD-MODE-1',
    externalOrderRef: 'EXT-MODE-1',
    costCore: 5000,
    sellingCore: 8000,
  });
  check('reg44_credit_wrong_billing_mode', wrongModeCredit.reason, 'SUPPLIER_NOT_POSTPAID_MODE');

  storeState.suppliers.push({
    id: 'esup_inactive_1',
    name: 'Paused Credit Supplier',
    code: 'paused_credit',
    mode: 'POSTPAID_CREDIT',
    credit_limit_core: 100000,
    credit_used_core: 0,
    is_active: 0,
  });
  const inactiveCredit = await reserveSupplierCreditAtomic(statefulDb, {
    supplierId: 'esup_inactive_1',
    orderId: 'ord_inactive',
    orderCode: 'ORD-INACT-1',
    externalOrderRef: 'EXT-INACT-1',
    costCore: 5000,
    sellingCore: 8000,
  });
  check('reg44_credit_inactive_supplier', inactiveCredit.reason, 'SUPPLIER_INACTIVE');

  // #66a: Transient 503 + network throw succeeds on 3rd attempt (retry_max = 2 -> maxAttempts = 3)
  let transientCalls = 0;
  const dispatchTransientOk = await dispatchSupplierFulfillmentWebhook(statefulDb, apiEnv, {
    sellerIds: ['seller_alpha'],
    webhookId: 'whk_test_1',
    orderId: 'sord_reg66_ok',
    orderCode: 'CGM-R66-OK',
    eventType: 'order.paid',
    payloadData: { price_core: 45000 },
    fetchImpl: (async () => {
      transientCalls++;
      if (transientCalls === 1) return new Response('gateway unavailable', { status: 503 });
      if (transientCalls === 2) throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ ok: true, ref: 'REF-TRY3' }), { status: 200 });
    }) as any,
  });
  const transientDeliv = storeState.deliveries.find((d) => d.id === dispatchTransientOk.deliveryIds[0]);
  check('reg66_transient_retries_succeed_attempt_3', dispatchTransientOk.delivered === 1 && transientDeliv?.attempts === 3, true);

  // #66b: 405 Method Not Allowed (4xx client error) stops immediately at 1 attempt (zero hang)
  let client405Calls = 0;
  const dispatch405 = await dispatchSupplierFulfillmentWebhook(statefulDb, apiEnv, {
    sellerIds: ['seller_alpha'],
    webhookId: 'whk_test_1',
    orderId: 'sord_reg66_405',
    orderCode: 'CGM-R66-405',
    eventType: 'webhook.test',
    payloadData: { ping: true },
    fetchImpl: (async () => {
      client405Calls++;
      return new Response('Method Not Allowed', { status: 405 });
    }) as any,
  });
  const deliv405 = storeState.deliveries.find((d) => d.id === dispatch405.deliveryIds[0]);
  check('reg66_405_no_retry_stops_at_1', client405Calls === 1 && deliv405?.attempts === 1 && deliv405?.http_status === 405, true);

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
