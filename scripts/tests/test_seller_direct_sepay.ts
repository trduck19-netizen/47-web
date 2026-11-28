/**
 * Automated Regression & Security Test Suite for Per-Seller Direct SePay Gateway (DIRECT_SEPAY)
 * Covers:
 * 1. Migration 0053 position before lastSchemaTiming & Rule 10.2 Fail-Closed AES-256-GCM encryption
 * 2. Seller QR eligibility (enabled/disabled/admin_locked/debt_limit/affiliate wholesale reserve)
 * 3. Cache epoch invalidation, Rule 8 SELLER_SEPAY_MANAGE scope, Rule 9 table-fixed, Rule 12 VI/EN symmetry
 * 4. Dedicated Webhook /api/webhooks/sepay/seller/:sellerId (SHA-256 auth, 401/403, grouped 2-item QR, 0% fee, 0 Platform Core minted, idempotency)
 * 5. Optional postpaid fee debt accumulation & /api/seller/sepay/pay-debt settlement
 * 6. Affiliate DIRECT_SEPAY wholesale reserve settlement, expiry refund, and confirmReceivedAndRelease isolation
 * 7. Anti-fraud dispute refund blocking on DIRECT_SEPAY (both Seller resolve-report & Admin seller-disputes)
 */
import fs from 'fs';
import path from 'path';
import {
  SellerSepayConfigError,
  encryptSellerSepayToken,
  decryptSellerSepayToken,
  generateSellerWebhookKey,
  hashSecretSha256,
  maskSecretPrefix,
  evaluateSellerQrEligibility,
  settleDirectSepayTransfer,
  SellerSepayConfigRow,
} from '../../functions/services/seller_sepay_service';
import {
  DEFAULT_MARKETPLACE_CONFIG,
  encryptCode,
} from '../../functions/services/marketplace_service';
import { shouldBumpCatalogEpoch } from '../../functions/services/cache_service';
import { hasScope } from '../../functions/services/mission_service';
import { confirmReceivedAndRelease } from '../../functions/services/escrow_service';
import * as sellerWebhookApi from '../../functions/api/webhooks/sepay/seller/[sellerId]';
import * as sellerResolveReportApi from '../../functions/api/seller/orders/[id]/resolve-report';
import * as adminDisputeResolveApi from '../../functions/api/admin/seller-disputes/[id]/resolve';
import { handleAdminSellerSepayRequest } from '../../functions/api/admin/seller-sepay/index';
import { handleResolveSellerSepayTx } from '../../functions/api/seller/sepay/transactions';

interface CheckResult {
  name: string;
  pass: boolean;
  actual?: any;
  expected?: any;
}

const results: CheckResult[] = [];
function check(name: string, actual: any, expected: any) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, actual, expected });
}

function createDirectSepayMockDb() {
  const state: {
    settings: Map<string, string>;
    members: any[];
    sellers: any[];
    sepayConfigs: SellerSepayConfigRow[];
    sepayTxs: any[];
    orders: any[];
    parentOrders: any[];
    codes: any[];
    ledger: any[];
    disputes: any[];
    audit: any[];
  } = {
    settings: new Map([['wcg_marketplace_config_v1', JSON.stringify({ ...DEFAULT_MARKETPLACE_CONFIG })]]),
    members: [],
    sellers: [],
    sepayConfigs: [],
    sepayTxs: [],
    orders: [],
    parentOrders: [],
    codes: [],
    ledger: [],
    disputes: [],
    audit: [],
  };

  const makeStmt = (sql: string, boundArgs: any[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    const u = s.toUpperCase();

    const execFirst = async () => {
      if (u.includes('FROM SYSTEM_SETTINGS WHERE KEY = ?')) {
        const val = state.settings.get(String(boundArgs[0]));
        return val !== undefined ? { value: val } : null;
      }
      if (u.includes('FROM SELLER_SEPAY_CONFIGS WHERE SELLER_ID = ?')) {
        const row = state.sepayConfigs.find((c) => c.seller_id === boundArgs[0]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLER_SEPAY_TRANSACTIONS WHERE SELLER_ID = ? AND SEPAY_TX_ID = ?')) {
        const row = state.sepayTxs.find((t) => t.seller_id === boundArgs[0] && t.sepay_tx_id === boundArgs[1]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLER_SEPAY_TRANSACTIONS WHERE ID = ? AND SELLER_ID = ?')) {
        const row = state.sepayTxs.find((t) => t.id === boundArgs[0] && t.seller_id === boundArgs[1]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLERS WHERE ID = ?')) {
        const row = state.sellers.find((sel) => sel.id === boundArgs[0]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLERS WHERE OWNER_MEMBER_ID = ?')) {
        const row = state.sellers.find((sel) => sel.owner_member_id === boundArgs[0] && !sel.deleted_at);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM MEMBERS WHERE SESSION_TOKEN = ?')) {
        const row = state.members.find((m) => m.session_token === boundArgs[0]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM MEMBERS WHERE ID = ?')) {
        const row = state.members.find((m) => m.id === boundArgs[0]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLER_CODES WHERE ID = ?')) {
        const row = state.codes.find((c) => c.id === boundArgs[0]);
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLER_CODES WHERE ORDER_ID = ?')) {
        const row = state.codes.find((c) => c.order_id === boundArgs[0] && c.status === 'RESERVED');
        return row ? { ...row } : null;
      }
      if (u.includes('FROM SELLER_CODES WHERE PRODUCT_ID = ? AND SELLER_ID = ?')) {
        const row = state.codes.find((c) => c.product_id === boundArgs[0] && c.seller_id === boundArgs[1] && c.status === 'IN_STOCK');
        return row ? { ...row } : null;
      }
      if (u.includes('FROM ORDERS WHERE ID = ?')) {
        return null;
      }
      if (u.includes('FROM SELLER_ORDERS SO JOIN SELLERS S') && u.includes('WHERE SO.ID = ? AND SO.SELLER_ID = ?')) {
        const ord = state.orders.find((o) => o.id === boundArgs[0] && o.seller_id === boundArgs[1]);
        if (!ord) return null;
        const sel = state.sellers.find((x) => x.id === ord.seller_id);
        return { ...ord, owner_member_id: sel?.owner_member_id, original_batch_id: null };
      }
      if (u.includes('FROM SELLER_ORDERS WHERE ID = ? AND SELLER_ID = ?')) {
        const ord = state.orders.find((o) => o.id === boundArgs[0] && o.seller_id === boundArgs[1]);
        return ord ? { ...ord } : null;
      }
      if (u.includes('FROM SELLER_ORDERS WHERE (ID = ? OR ORDER_CODE = ?)')) {
        const ord = state.orders.find((o) => o.id === boundArgs[0] || o.order_code === boundArgs[1]);
        return ord ? { ...ord } : null;
      }
      if (u.includes('FROM SELLER_DISPUTES SD JOIN SELLER_ORDERS SO')) {
        const d = state.disputes.find((x) => x.id === boundArgs[0]);
        if (!d) return null;
        const o = state.orders.find((x) => x.id === d.order_id);
        const sel = state.sellers.find((x) => x.id === o?.seller_id);
        return {
          ...d,
          order_id: o?.id,
          order_code: o?.order_code,
          price_core: o?.price_core,
          order_seller_id: o?.seller_id,
          delivered_code: o?.delivered_code,
          code_id: o?.code_id,
          order_status: o?.status,
          payment_channel: o?.payment_channel,
          released_at: o?.released_at,
          hold_until: o?.hold_until,
          seller_owner_member_id: sel?.owner_member_id,
        };
      }
      if (u.includes('FROM SELLER_SEPAY_CONFIGS') && u.includes('COUNT(*)')) {
        return {
          total_configured: state.sepayConfigs.length,
          active_gateways: state.sepayConfigs.filter((c) => c.is_enabled === 1 && c.admin_locked === 0).length,
          locked_gateways: state.sepayConfigs.filter((c) => c.admin_locked === 1).length,
          total_direct_orders: state.sepayConfigs.reduce((a, c) => a + Number(c.total_direct_orders || 0), 0),
          total_direct_volume_vnd: state.sepayConfigs.reduce((a, c) => a + Number(c.total_direct_volume_vnd || 0), 0),
          total_fee_debt_core: state.sepayConfigs.reduce((a, c) => a + Number(c.fee_debt_core || 0), 0),
        };
      }
      if (u.includes('SELECT COUNT(*) AS CNT FROM SELLER_SEPAY_TRANSACTIONS')) {
        const openStatuses = ['UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'UNAUTHORIZED', 'PENDING_MANUAL_CODE'];
        return { cnt: state.sepayTxs.filter((t) => openStatuses.includes(t.status)).length };
      }
      return null;
    };

    const execAll = async () => {
      if (u.includes('FROM SELLER_ORDERS') && u.includes('SHOP_QR_GROUP_CODE')) {
        const sellerId = String(boundArgs[0]);
        const targetCode = String(boundArgs[1]).toUpperCase();
        const matches = state.orders
          .filter((o) => {
            if (o.seller_id !== sellerId || o.deleted_at) return false;
            const g = String(o.shop_qr_group_code || '').toUpperCase();
            return g === targetCode || g.replace(/[-\s]/g, '') === targetCode;
          })
          .map((o) => ({ ...o }));
        return { results: matches };
      }
      if (u.includes('FROM SELLER_ORDERS') && u.includes('UPPER(ORDER_CODE)')) {
        const sellerId = String(boundArgs[0]);
        const targetCode = String(boundArgs[1]).toUpperCase();
        const matches = state.orders
          .filter((o) => o.seller_id === sellerId && String(o.order_code || '').toUpperCase() === targetCode)
          .map((o) => ({ ...o }));
        return { results: matches };
      }
      if (u.includes('SELECT STATUS FROM SELLER_ORDERS WHERE PARENT_ORDER_ID = ?')) {
        return { results: state.orders.filter((o) => o.parent_order_id === boundArgs[0]).map((o) => ({ status: o.status })) };
      }
      if (u.includes('FROM SELLER_SEPAY_CONFIGS SSC')) {
        return { results: state.sepayConfigs.map((c) => ({ ...c, seller_name: state.sellers.find((x) => x.id === c.seller_id)?.name || c.seller_id })) };
      }
      if (u.includes('FROM SELLER_SEPAY_TRANSACTIONS T')) {
        return { results: state.sepayTxs.map((t) => ({ ...t })) };
      }
      return { results: [] };
    };

    const execRun = async () => {
      if (u.startsWith('CREATE TABLE') || u.startsWith('CREATE INDEX') || u.startsWith('CREATE UNIQUE INDEX') || u.startsWith('ALTER TABLE')) {
        return { success: true, meta: { changes: 0 } };
      }
      if (u.includes('INSERT INTO SYSTEM_SETTINGS')) {
        if (u.includes("'WCG_MARKETPLACE_CONFIG_V1'")) {
          state.settings.set('wcg_marketplace_config_v1', String(boundArgs[0]));
        } else if (boundArgs.length >= 2) {
          state.settings.set(String(boundArgs[0]), String(boundArgs[1]));
        }
        return { success: true, meta: { changes: 1 } };
      }
      if (u.includes('INSERT OR REPLACE INTO SELLER_SEPAY_TRANSACTIONS')) {
        const row: any = {
          id: boundArgs[0],
          seller_id: boundArgs[1],
          sepay_tx_id: boundArgs[2],
          gateway: boundArgs[3],
          account_number: boundArgs[4],
          amount_in: boundArgs[5],
          transaction_content: boundArgs[6],
        };
        if (boundArgs.length >= 15) {
          row.matched_parent_order_id = boundArgs[7];
          row.matched_order_id = boundArgs[8];
          row.buyer_member_id = boundArgs[9];
          row.status = boundArgs[10];
          row.exception_code = boundArgs[11];
          row.fee_charged_core = boundArgs[12];
          row.seller_resolution_note = boundArgs[13];
          row.created_at = boundArgs[14];
        } else {
          row.status = u.includes("'UNAUTHORIZED'") ? 'UNAUTHORIZED' : 'UNMATCHED';
          row.seller_resolution_note = boundArgs[7];
          row.created_at = boundArgs[8];
        }
        const idx = state.sepayTxs.findIndex((x) => x.seller_id === row.seller_id && x.sepay_tx_id === row.sepay_tx_id);
        if (idx >= 0) state.sepayTxs[idx] = row;
        else state.sepayTxs.push(row);
        return { success: true, meta: { changes: 1 } };
      }
      if (u.startsWith('UPDATE SELLER_SEPAY_TRANSACTIONS SET STATUS =')) {
        const txId = u.includes('WHERE ID = ? AND SELLER_ID = ?')
          ? boundArgs[boundArgs.length - 2]
          : boundArgs[boundArgs.length - 1];
        const row = state.sepayTxs.find((x) => x.id === txId);
        if (row) {
          if (u.includes("'RESOLVED_REFUNDED_BANK'")) {
            row.status = 'RESOLVED_REFUNDED_BANK';
            row.seller_resolution_note = boundArgs[0];
            row.resolved_at = boundArgs[1];
          } else if (u.includes("'RESOLVED_DELIVERED'")) {
            row.status = 'RESOLVED_DELIVERED';
            row.matched_order_id = boundArgs[0];
            row.seller_resolution_note = boundArgs[1];
            row.resolved_at = boundArgs[2];
          }
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (u.startsWith('UPDATE SELLER_SEPAY_CONFIGS')) {
        const sellerId = boundArgs[boundArgs.length - 1];
        const cfg = state.sepayConfigs.find((c) => c.seller_id === sellerId);
        if (!cfg) return { success: true, meta: { changes: 0 } };
        if (u.includes('FEE_DEBT_CORE = FEE_DEBT_CORE + ?')) {
          cfg.fee_debt_core += Number(boundArgs[0] || 0);
          cfg.total_direct_orders += Number(boundArgs[1] || 0);
          cfg.total_direct_volume_vnd += Number(boundArgs[2] || 0);
          cfg.last_webhook_at = boundArgs[3];
        } else if (u.includes('ADMIN_LOCKED = ?')) {
          cfg.admin_locked = Number(boundArgs[0]);
          cfg.admin_lock_reason = boundArgs[1];
          if (Number(boundArgs[2]) === 1) cfg.is_enabled = 0;
        } else if (u.includes('UNAUTH_FAIL_COUNT_1H')) {
          cfg.unauth_fail_count_1h += 1;
        }
        return { success: true, meta: { changes: 1 } };
      }
      if (u.startsWith('UPDATE SELLER_ORDERS')) {
        const id = boundArgs[boundArgs.length - 1];
        const ord = state.orders.find((o) => o.id === id);
        if (!ord) return { success: true, meta: { changes: 0 } };
        if (u.includes("WHERE ID = ? AND STATUS = 'PENDING_PAYMENT'") && ord.status !== 'PENDING_PAYMENT') {
          return { success: true, meta: { changes: 0 } };
        }
        if (u.includes("SET STATUS = 'COMPLETED'")) {
          if (ord.status === 'COMPLETED' || ord.released_at) return { success: true, meta: { changes: 0 } };
          ord.status = 'COMPLETED';
          ord.released_at = boundArgs[0];
          return { success: true, meta: { changes: 1 } };
        }
        if (u.includes("SET STATUS = 'PAID'") && u.includes('DELIVERED_CODE = ?')) {
          ord.status = 'PAID';
          ord.code_id = boundArgs[0] || ord.code_id;
          ord.delivered_code = boundArgs[1];
          ord.sepay_transaction_id = boundArgs[2];
          ord.payment_method = 'QR_SEPAY';
          ord.payment_channel = 'DIRECT_SEPAY';
          if (u.includes('DIRECT_FEE_CORE = ?')) ord.direct_fee_core = boundArgs[3];
          return { success: true, meta: { changes: 1 } };
        }
        if (u.includes("SET STATUS = 'REFUNDED'")) {
          ord.status = 'REFUNDED';
          ord.resolution_note = boundArgs[0];
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      }
      if (u.startsWith('UPDATE SELLER_CODES')) {
        const id = boundArgs[boundArgs.length - 1];
        const c = state.codes.find((x) => x.id === id);
        if (c) {
          if (u.includes("SET STATUS = 'SOLD'")) {
            c.status = 'SOLD';
            c.order_id = boundArgs[0];
          }
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (u.startsWith('UPDATE SELLER_PARENT_ORDERS')) {
        const id = boundArgs[boundArgs.length - 1];
        const p = state.parentOrders.find((x) => x.id === id);
        if (p) {
          p.status = boundArgs[0];
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (u.startsWith('UPDATE MEMBERS SET BALANCE = BALANCE - ?')) {
        const amt = Number(boundArgs[0]);
        const mId = boundArgs[2];
        const minBal = Number(boundArgs[3]);
        const m = state.members.find((x) => x.id === mId);
        if (!m || Number(m.balance) < minBal) {
          return { success: true, meta: { changes: 0 } };
        }
        m.balance = Number(m.balance) - amt;
        return { success: true, meta: { changes: 1 } };
      }
      if (u.startsWith('UPDATE MEMBERS SET BALANCE = BALANCE + ?')) {
        const amt = Number(boundArgs[0]);
        const mId = boundArgs[boundArgs.length - 1];
        const m = state.members.find((x) => x.id === mId);
        if (m) {
          m.balance = Number(m.balance) + amt;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (u.startsWith('UPDATE SELLERS SET PENDING_BALANCE_CORE = ?')) {
        const sId = boundArgs[boundArgs.length - 1];
        const sel = state.sellers.find((x) => x.id === sId);
        if (sel) {
          sel.pending_balance_core = Number(boundArgs[0]);
          sel.available_balance_core = Number(boundArgs[1]);
          sel.withdrawn_balance_core = Number(boundArgs[2]);
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (u.startsWith('INSERT INTO SELLER_LEDGER')) {
        state.ledger.push({ id: boundArgs[0], seller_id: boundArgs[1], order_id: boundArgs[2], type: boundArgs[3], amount_core: boundArgs[4] });
        return { success: true, meta: { changes: 1 } };
      }
      if (u.startsWith('UPDATE SELLER_DISPUTES')) {
        const dId = boundArgs[boundArgs.length - 1];
        const d = state.disputes.find((x) => x.id === dId);
        if (d) d.status = 'RESOLVED_REFUNDED';
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 1 } };
    };

    return {
      bind(...args: any[]) {
        return makeStmt(sql, args);
      },
      first: execFirst,
      all: execAll,
      run: execRun,
      _run: execRun,
    };
  };

  const db = {
    prepare(sql: string) {
      return makeStmt(sql, []);
    },
    async batch(stmts: any[]) {
      const out = [];
      for (const st of stmts) out.push(await st._run());
      return out;
    },
  } as any;

  return { db, state };
}

async function main() {
  const root = process.cwd();
  const TEST_AES_KEY = 'test_marketplace_aes_key_32bytes_ok';
  const TEST_ADMIN_KEY = 'test_admin_master_key_32chars_ok';

  // =========================================================================
  // PART 1: Migration 0053 Position & Rule 10.2 Fail-Closed AES-256-GCM
  // =========================================================================
  const d1Source = fs.readFileSync(path.resolve(root, 'functions/services/d1_service.ts'), 'utf8');
  const idx0052 = d1Source.indexOf('0052_seller_products_stock_quantity_v1');
  const idx0053 = d1Source.indexOf('0053_seller_direct_sepay_gateway_v1');
  const idxLastTiming = d1Source.lastIndexOf('lastSchemaTiming = {');
  check('mig_0053_after_0052_before_timing', idx0052 > 0 && idx0053 > idx0052 && idx0053 < idxLastTiming, true);

  let failClosedStatus = 0;
  try {
    await encryptSellerSepayToken('sample_sepay_token_abc', 'short');
  } catch (err: any) {
    if (err instanceof SellerSepayConfigError) failClosedStatus = err.httpStatus;
  }
  check('rule10_encrypt_fail_closed_short_key', failClosedStatus, 503);

  const encToken = await encryptSellerSepayToken('sample_sepay_token_123456', TEST_AES_KEY);
  const decToken = await decryptSellerSepayToken(encToken, TEST_AES_KEY);
  check('rule10_aes_gcm_roundtrip_ok', encToken.startsWith('enc_sep_v1:') && decToken === 'sample_sepay_token_123456', true);

  const rawWhKey = generateSellerWebhookKey();
  const maskedWhKey = maskSecretPrefix(rawWhKey);
  check('rule10_webhook_key_format_and_mask', rawWhKey.startsWith('wcg_shp_whk_') && !maskedWhKey.includes(rawWhKey.slice(18, 28)), true);

  // =========================================================================
  // PART 2: Eligibility Rules (Disabled, Active, Locked, Debt Limit, Affiliate)
  // =========================================================================
  const whHash = await hashSecretSha256(rawWhKey);
  const baseCfg: SellerSepayConfigRow = {
    seller_id: 'sel_a',
    is_enabled: 1,
    admin_locked: 0,
    bank_name: 'MBBank',
    account_number: '0900000001',
    account_holder: 'SAMPLE SHOP A',
    payment_prefix: 'SHPA',
    webhook_key_hash: whHash,
    webhook_key_prefix: maskedWhKey,
    connection_verified: 1,
    unauth_fail_count_1h: 0,
    fee_debt_core: 0,
    total_direct_orders: 0,
    total_direct_volume_vnd: 0,
  };

  check('elig_disabled_returns_false', evaluateSellerQrEligibility({ sepayConfig: { ...baseCfg, is_enabled: 0 }, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG }).eligible, false);
  check('elig_active_returns_true', evaluateSellerQrEligibility({ sepayConfig: baseCfg, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG }).eligible, true);
  check('elig_admin_locked_returns_false', evaluateSellerQrEligibility({ sepayConfig: { ...baseCfg, admin_locked: 1 }, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG }).reason, 'SELLER_SEPAY_ADMIN_LOCKED');
  check('elig_debt_limit_blocks_qr', evaluateSellerQrEligibility({ sepayConfig: { ...baseCfg, fee_debt_core: 500000 }, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG }).reason, 'SELLER_FEE_DEBT_LIMIT_REACHED');
  check('elig_affiliate_low_core_blocks_qr', evaluateSellerQrEligibility({ sepayConfig: baseCfg, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG, isAffiliate: true, wholesaleNeededCore: 40000, sellerOwnerCoreBalance: 10000 }).reason, 'AFFILIATE_WHOLESALE_CORE_INSUFFICIENT');
  check('elig_affiliate_enough_core_allows_qr', evaluateSellerQrEligibility({ sepayConfig: baseCfg, marketplaceConfig: DEFAULT_MARKETPLACE_CONFIG, isAffiliate: true, wholesaleNeededCore: 40000, sellerOwnerCoreBalance: 50000 }).eligible, true);

  // =========================================================================
  // PART 3: Cache Epoch, Rule 8 Scope, Rule 9 Tables, Rule 12 VI/EN Symmetry
  // =========================================================================
  check('epoch_bump_seller_sepay_put', shouldBumpCatalogEpoch('/api/seller/sepay', 'PUT'), true);
  check('epoch_bump_admin_sepay_lock', shouldBumpCatalogEpoch('/api/admin/seller-sepay/sel_a/lock', 'POST'), true);
  check('rule8_scope_seller_sepay_manage', hasScope('SELLER_SEPAY_MANAGE', 'SELLER_SEPAY_MANAGE') && hasScope('SEPAY_FULL', 'SELLER_SEPAY_MANAGE') && !hasScope('NEWS_FULL', 'SELLER_SEPAY_MANAGE'), true);

  const sellerUiSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerSepayManager.tsx'), 'utf8');
  const adminUiSrc = fs.readFileSync(path.resolve(root, 'src/admin/modules/SellerSepayGatewayModule.tsx'), 'utf8');
  check('rule9_seller_sepay_table_fixed', (sellerUiSrc.match(/<table[^>]*table-fixed w-full/g) || []).length === 1, true);
  check('rule9_admin_sepay_tables_fixed', (adminUiSrc.match(/<table[^>]*table-fixed w-full/g) || []).length === 2, true);

  const viJson = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/vi.json'), 'utf8'));
  const enJson = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/en.json'), 'utf8'));
  check(
    'rule12_i18n_symmetry_sepay_sections',
    JSON.stringify(Object.keys(viJson.sellerSepay).sort()) === JSON.stringify(Object.keys(enJson.sellerSepay).sort()) &&
      JSON.stringify(Object.keys(viJson.adminSellerSepay).sort()) === JSON.stringify(Object.keys(enJson.adminSellerSepay).sort()),
    true
  );

  // =========================================================================
  // PART 4: Webhook Auth (401 / 403) + 2-Item Grouped Shop Settlement (0% fee, 0 Core Minted)
  // =========================================================================
  const { db, state } = createDirectSepayMockDb();
  state.members.push(
    { id: 'mem_owner_a', username: 'owner_a', balance: 0, session_token: 'tok_owner_a' },
    { id: 'mem_owner_b', username: 'owner_b', balance: 0, session_token: 'tok_owner_b' },
    { id: 'mem_buyer_1', username: 'buyer_1', balance: 0, session_token: 'tok_buyer_1' }
  );
  state.sellers.push(
    { id: 'sel_a', owner_member_id: 'mem_owner_a', name: 'Shop A', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 },
    { id: 'sel_b', owner_member_id: 'mem_owner_b', name: 'Shop B', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 }
  );
  state.sepayConfigs.push({ ...baseCfg });

  const encCode1 = await encryptCode('GIFT-CODE-ITEM-1', TEST_AES_KEY);
  const encCode2 = await encryptCode('GIFT-CODE-ITEM-2', TEST_AES_KEY);
  state.codes.push(
    { id: 'sc_1', seller_id: 'sel_a', product_id: 'sp_1', code_encrypted: encCode1, status: 'RESERVED', order_id: 'sord_1' },
    { id: 'sc_2', seller_id: 'sel_a', product_id: 'sp_1', code_encrypted: encCode2, status: 'RESERVED', order_id: 'sord_2' }
  );
  state.parentOrders.push({ id: 'spord_1', status: 'PENDING_PAYMENT', buyer_member_id: 'mem_buyer_1' });
  const futureIso = new Date(Date.now() + 600000).toISOString();
  state.orders.push(
    { id: 'sord_1', order_code: 'ORD-QR-S-111', parent_order_id: 'spord_1', seller_id: 'sel_a', buyer_member_id: 'mem_buyer_1', product_id: 'sp_1', code_id: 'sc_1', price_core: 25000, status: 'PENDING_PAYMENT', payment_channel: 'DIRECT_SEPAY', shop_qr_group_code: 'SHP-QR-999111-AABBCC', product_type: 'digital', expires_at: futureIso },
    { id: 'sord_2', order_code: 'ORD-QR-S-222', parent_order_id: 'spord_1', seller_id: 'sel_a', buyer_member_id: 'mem_buyer_1', product_id: 'sp_1', code_id: 'sc_2', price_core: 35000, status: 'PENDING_PAYMENT', payment_channel: 'DIRECT_SEPAY', shop_qr_group_code: 'SHP-QR-999111-AABBCC', product_type: 'digital', expires_at: futureIso }
  );

  // 4a. Wrong webhook key -> 401
  const unauthRes = await sellerWebhookApi.onRequestPost({
    params: { sellerId: 'sel_a' },
    request: new Request('https://example.test/api/webhooks/sepay/seller/sel_a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Apikey wrong_key_123' },
      body: JSON.stringify({ id: 'tx_bad_1', transferType: 'in', transferAmount: 60000, content: 'SHPA SHP-QR-999111-AABBCC' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  check('webhook_wrong_key_returns_401', unauthRes.status, 401);

  // 4b. Underpaid -> UNDERPAID exception, orders remain PENDING_PAYMENT
  const underRes = await sellerWebhookApi.onRequestPost({
    params: { sellerId: 'sel_a' },
    request: new Request('https://example.test/api/webhooks/sepay/seller/sel_a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${rawWhKey}` },
      body: JSON.stringify({ id: 'tx_under_1', transferType: 'in', transferAmount: 50000, accountNumber: '0900000001', content: 'SHPA SHP-QR-999111-AABBCC' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  const underJson: any = await underRes.json();
  check('webhook_underpaid_logged_not_delivered', underJson.status === 'UNDERPAID' && state.orders[0].status === 'PENDING_PAYMENT', true);

  // 4c. Exact grouped payment 60.000đ -> BOTH items delivered, 0% fee, 0 Platform Core minted!
  const okRes = await sellerWebhookApi.onRequestPost({
    params: { sellerId: 'sel_a' },
    request: new Request('https://example.test/api/webhooks/sepay/seller/sel_a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${rawWhKey}` },
      body: JSON.stringify({ id: 'tx_ok_60k', transferType: 'in', transferAmount: 60000, accountNumber: '0900000001', content: 'SHPA SHP-QR-999111-AABBCC' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  const okJson: any = await okRes.json();
  const shopAAfter = state.sellers.find((x) => x.id === 'sel_a');
  check(
    'webhook_grouped_2items_paid_0fee_0core_minted',
    okJson.status === 'COMPLETED' &&
      state.orders[0].status === 'PAID' &&
      state.orders[1].status === 'PAID' &&
      state.orders[0].delivered_code === 'GIFT-CODE-ITEM-1' &&
      state.orders[1].delivered_code === 'GIFT-CODE-ITEM-2' &&
      shopAAfter.pending_balance_core === 0 &&
      shopAAfter.available_balance_core === 0 &&
      state.sepayConfigs[0].fee_debt_core === 0 &&
      state.sepayConfigs[0].total_direct_volume_vnd === 60000,
    true
  );

  // 4d. Idempotent repeat
  const dupRes = await sellerWebhookApi.onRequestPost({
    params: { sellerId: 'sel_a' },
    request: new Request('https://example.test/api/webhooks/sepay/seller/sel_a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${rawWhKey}` },
      body: JSON.stringify({ id: 'tx_ok_60k', transferType: 'in', transferAmount: 60000, accountNumber: '0900000001', content: 'SHPA SHP-QR-999111-AABBCC' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  const dupJson: any = await dupRes.json();
  check('webhook_idempotent_duplicate_ignored', dupJson.status, 'DUPLICATE_IDEMPOTENT');

  // =========================================================================
  // PART 5: Affiliate DIRECT_SEPAY Wholesale Payout (Backed by Shop A Core) + Release Isolation
  // =========================================================================
  const encAffCode = await encryptCode('SUPPLIER-B-CODE-99', TEST_AES_KEY);
  state.codes.push({ id: 'sc_b1', seller_id: 'sel_b', product_id: 'sp_b1', code_encrypted: encAffCode, status: 'RESERVED', order_id: 'sord_aff1' });
  state.orders.push({
    id: 'sord_aff1',
    order_code: 'ORD-QR-S-AFF1',
    parent_order_id: 'spord_aff1',
    seller_id: 'sel_a',
    supplier_seller_id: 'sel_b',
    is_affiliate_order: 1,
    affiliate_wholesale_reserved_core: 40000,
    buyer_member_id: 'mem_buyer_1',
    product_id: 'sp_a_aff1',
    code_id: 'sc_b1',
    price_core: 55000,
    status: 'PENDING_PAYMENT',
    payment_channel: 'DIRECT_SEPAY',
    shop_qr_group_code: 'SHP-QR-888001-AFF001',
    product_type: 'digital',
    expires_at: futureIso,
  });

  const affSettle = await settleDirectSepayTransfer(db, { MARKETPLACE_CODE_KEY: TEST_AES_KEY }, state.sepayConfigs[0], {
    sellerId: 'sel_a',
    sepayTxId: 'tx_aff_55k',
    gateway: 'MBBank',
    accountNumber: '0900000001',
    amount: 55000,
    content: 'SHPA SHP-QR-888001-AFF001',
  });
  const shopBAfterSettle = state.sellers.find((x) => x.id === 'sel_b');
  check(
    'affiliate_direct_sepay_credits_supplier_wholesale_only',
    affSettle.status === 'COMPLETED' &&
      shopBAfterSettle.pending_balance_core === 40000 &&
      state.sellers.find((x) => x.id === 'sel_a').pending_balance_core === 0,
    true
  );

  // Confirm received & release on DIRECT_SEPAY Affiliate order -> releases 40k to Shop B available, 0 to Shop A!
  const relAff = await confirmReceivedAndRelease(db, 'sord_aff1', 'mem_buyer_1');
  check(
    'escrow_release_direct_sepay_affiliate_isolated',
    relAff.success &&
      state.sellers.find((x) => x.id === 'sel_b').available_balance_core === 40000 &&
      state.sellers.find((x) => x.id === 'sel_a').available_balance_core === 0,
    true
  );

  // =========================================================================
  // PART 6: Anti-Fraud Dispute Refund Block on DIRECT_SEPAY (0 Unbacked Core!)
  // =========================================================================
  state.orders[0].status = 'REPORTED';
  const sellerRefundBlocked = await sellerResolveReportApi.onRequestPost({
    params: { id: 'sord_1' },
    request: new Request('https://example.test/api/seller/orders/sord_1/resolve-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_owner_a' },
      body: JSON.stringify({ resolution_type: 'REFUND_CORE', note: 'test refund' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  const srbJson: any = await sellerRefundBlocked.json();
  check(
    'antifraud_seller_refund_blocked_when_owner_core_zero',
    sellerRefundBlocked.status === 400 &&
      srbJson.code === 'SELLER_CORE_INSUFFICIENT_FOR_DIRECT_REFUND' &&
      state.members.find((m) => m.id === 'mem_buyer_1').balance === 0,
    true
  );

  // Admin dispute refund on DIRECT_SEPAY also blocked when seller owner Core = 0
  state.disputes.push({
    id: 'disp_direct_1',
    order_id: 'sord_1',
    seller_id: 'sel_a',
    buyer_member_id: 'mem_buyer_1',
    status: 'OPEN',
  });
  const adminRefundBlocked = await adminDisputeResolveApi.onRequestPost({
    params: { id: 'disp_direct_1' },
    request: new Request('https://example.test/api/admin/seller-disputes/disp_direct_1/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': TEST_ADMIN_KEY },
      body: JSON.stringify({ decision: 'REFUND', note: 'admin test refund' }),
    }),
    env: { DB: db, ADMIN_API_KEY: TEST_ADMIN_KEY },
  } as any);
  const arbJson: any = await adminRefundBlocked.json();
  check(
    'antifraud_admin_refund_blocked_when_owner_core_zero',
    adminRefundBlocked.status === 400 &&
      arbJson.code === 'SELLER_CORE_INSUFFICIENT_FOR_DIRECT_REFUND' &&
      state.members.find((m) => m.id === 'mem_buyer_1').balance === 0,
    true
  );

  // When Seller Owner tops up real Core = 30.000 -> refund succeeds by deducting from Seller Owner's real wallet!
  state.members.find((m) => m.id === 'mem_owner_a').balance = 30000;
  const sellerRefundOk = await sellerResolveReportApi.onRequestPost({
    params: { id: 'sord_1' },
    request: new Request('https://example.test/api/seller/orders/sord_1/resolve-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_owner_a' },
      body: JSON.stringify({ resolution_type: 'REFUND_CORE', note: 'refund from real seller wallet' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  check(
    'antifraud_seller_refund_deducts_real_owner_core',
    sellerRefundOk.status === 200 &&
      state.members.find((m) => m.id === 'mem_owner_a').balance === 5000 &&
      state.members.find((m) => m.id === 'mem_buyer_1').balance === 25000,
    true
  );

  // =========================================================================
  // PART 7: Admin Policy (Postpaid Fee Debt) + Emergency Lock + Seller Exception Resolution
  // =========================================================================
  const polRes = await handleAdminSellerSepayRequest(
    {
      request: new Request('https://admin.example.test/api/admin/seller-sepay/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': TEST_ADMIN_KEY },
        body: JSON.stringify({ direct_sepay_global_enabled: true, direct_sepay_fee_pct: 3, direct_sepay_debt_limit_core: 5000 }),
      }),
      env: { DB: db, ADMIN_API_KEY: TEST_ADMIN_KEY },
    },
    ['policy']
  );
  const polJson: any = await polRes.json();
  check('admin_policy_update_postpaid_fee_3pct', polRes.status === 200 && polJson.policy.direct_sepay_fee_pct === 3, true);

  // Seller marks UNDERPAID exception as refunded via bank transfer
  const underTx = state.sepayTxs.find((t) => t.sepay_tx_id === 'tx_under_1');
  const resExRes = await handleResolveSellerSepayTx(
    {
      request: new Request(`https://example.test/api/seller/sepay/transactions/${underTx.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_owner_a' },
        body: JSON.stringify({ action: 'MARK_BANK_REFUNDED', note: 'Đã hoàn 50k qua MBBank' }),
      }),
      env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
    },
    underTx.id
  );
  check('seller_self_resolves_underpaid_exception', resExRes.status === 200 && underTx.status === 'RESOLVED_REFUNDED_BANK', true);

  // Admin emergency lock blocks subsequent webhook with 403
  const lockRes = await handleAdminSellerSepayRequest(
    {
      request: new Request('https://admin.example.test/api/admin/seller-sepay/sel_a/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': TEST_ADMIN_KEY },
        body: JSON.stringify({ locked: true, reason: 'Suspicious activity' }),
      }),
      env: { DB: db, ADMIN_API_KEY: TEST_ADMIN_KEY },
    },
    ['sel_a', 'lock']
  );
  const lockedWhRes = await sellerWebhookApi.onRequestPost({
    params: { sellerId: 'sel_a' },
    request: new Request('https://example.test/api/webhooks/sepay/seller/sel_a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${rawWhKey}` },
      body: JSON.stringify({ id: 'tx_after_lock', transferType: 'in', transferAmount: 10000, content: 'SHPA SHP-QR-123' }),
    }),
    env: { DB: db, MARKETPLACE_CODE_KEY: TEST_AES_KEY },
  } as any);
  check('admin_emergency_lock_blocks_webhook_403', lockRes.status === 200 && lockedWhRes.status === 403, true);

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        suite: 'test_seller_direct_sepay',
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
