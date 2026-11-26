import assert from 'node:assert/strict';
import {
  DEFAULT_MARKETPLACE_CONFIG,
  encryptCode,
  getMarketplaceConfig,
} from '../../functions/services/marketplace_service';
import {
  calculate3WaySplit,
  syncAffiliatePriceAndStock,
} from '../../functions/services/seller_affiliate_service';
import { onRequestPut as updateSellerConfig } from '../../functions/api/admin/seller-config';
import { onRequestPut as updateResellParams } from '../../functions/api/seller/products/[id]/resell';
import { onRequestPost as createAffiliateRequest } from '../../functions/api/seller/affiliate/requests';
import { onRequestPost as approveAffiliateRequest } from '../../functions/api/seller/affiliate/requests/[id]/approve';
import { onRequestPost as createSingleOrder } from '../../functions/api/seller-orders/index';
import { onRequestPost as createMultiOrder } from '../../functions/api/seller-orders/multi';
import { onRequestPost as createSellerProduct } from '../../functions/api/seller/products/index';
import { onRequestPut as updateSellerProduct } from '../../functions/api/seller/products/[id]';
import { confirmReceivedAndRelease } from '../../functions/services/escrow_service';
import { checkAndExpireSellerOrdersD1 } from '../../functions/services/d1_service';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
  }
}

interface MockState {
  settings: Map<string, string>;
  sellers: Map<string, any>;
  members: Map<string, any>;
  sessions: Map<string, any>;
  products: Map<string, any>;
  codes: Map<string, any>;
  partnerships: Map<string, any>;
  listings: Map<string, any>;
  orders: Map<string, any>;
  parentOrders: Map<string, any>;
  syncLogs: any[];
  ledger: any[];
  onBeforeDebitMember?: (buyerId: string, price: number) => void;
  onBeforeStockReserve?: (productId: string) => void;
}

function createMockDb(seed?: Partial<MockState>) {
  const state: MockState = {
    settings: new Map(),
    sellers: new Map(),
    members: new Map(),
    sessions: new Map(),
    products: new Map(),
    codes: new Map(),
    partnerships: new Map(),
    listings: new Map(),
    orders: new Map(),
    parentOrders: new Map(),
    syncLogs: [],
    ledger: [],
    ...seed,
  };

  function runStatement(sqlRaw: string, args: any[]): { rows: any[]; changes: number } {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('SELECT id FROM schema_migrations')) {
      return {
        rows: [
          { id: '0035_purge_hardcoded_test_ids_and_restore_seller_v1' },
          { id: '0036_split_order_engine_v1' },
          { id: '0050_supplier_connectors_v1' },
          { id: '0051_fix_approved_partnership_revoked_at_v1' },
          { id: '0052_seller_products_stock_quantity_v1' },
        ],
        changes: 0,
      };
    }

    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX') || sql.startsWith('ALTER TABLE') || sql.startsWith('INSERT OR IGNORE INTO schema_migrations')) {
      return { rows: [], changes: 0 };
    }

    // system_settings
    if (sql.startsWith("SELECT value FROM system_settings WHERE key = 'wcg_marketplace_config_v1'")) {
      const val = state.settings.get('wcg_marketplace_config_v1');
      return { rows: val ? [{ value: val }] : [], changes: 0 };
    }
    if (sql.startsWith("SELECT value FROM system_settings WHERE key = 'wcg_admin_sepay_v4'")) {
      const val = state.settings.get('wcg_admin_sepay_v4');
      return { rows: val ? [{ value: val }] : [], changes: 0 };
    }
    if (sql.startsWith("SELECT value FROM system_settings WHERE key = 'wcg_admin_sepay_private_v1'")) {
      return { rows: [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO system_settings (key, value, updated_at)')) {
      if (sql.includes("'wcg_marketplace_config_v1'")) {
        state.settings.set('wcg_marketplace_config_v1', String(args[0]));
      } else if (args.length >= 2) {
        state.settings.set(String(args[0]), String(args[1]));
      }
      return { rows: [], changes: 1 };
    }

    // Auth: members by session_token / member_sessions
    if (sql.startsWith('SELECT * FROM members WHERE session_token = ?')) {
      const token = args[0];
      const sess = state.sessions.get(token);
      if (!sess) return { rows: [], changes: 0 };
      const member = state.members.get(sess.member_id);
      return { rows: member ? [member] : [], changes: 0 };
    }
    if (sql.includes('FROM member_sessions') && sql.includes('JOIN members')) {
      const token = args[0];
      const sess = state.sessions.get(token);
      if (!sess) return { rows: [], changes: 0 };
      const member = state.members.get(sess.member_id);
      if (!member) return { rows: [], changes: 0 };
      return { rows: [{ ...member, session_id: sess.id }], changes: 0 };
    }
    if (sql.startsWith('SELECT id, balance, email, username FROM members WHERE id = ?')) {
      const m = state.members.get(args[0]);
      return { rows: m ? [m] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM members WHERE id = ?')) {
      const m = state.members.get(args[0]);
      return { rows: m ? [m] : [], changes: 0 };
    }
    if (sql.startsWith('UPDATE members SET balance = balance - ?')) {
      const [price, , buyerId, minBalance] = args;
      if (state.onBeforeDebitMember) {
        state.onBeforeDebitMember(buyerId, Number(price));
      }
      const m = state.members.get(buyerId);
      if (!m || Number(m.balance) < Number(minBalance)) return { rows: [], changes: 0 };
      m.balance = Number(m.balance) - Number(price);
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE members SET balance = balance + ?')) {
      const [price, , buyerId] = args;
      const m = state.members.get(buyerId);
      if (!m) return { rows: [], changes: 0 };
      m.balance = Number(m.balance) + Number(price);
      return { rows: [], changes: 1 };
    }

    // Sellers
    if (sql.startsWith('SELECT * FROM sellers WHERE id = ?') || sql.startsWith('SELECT id, pending_balance_core, available_balance_core, withdrawn_balance_core FROM sellers WHERE id = ?')) {
      const s = state.sellers.get(args[0]);
      return { rows: s && !s.deleted_at ? [s] : [], changes: 0 };
    }
    if (sql.includes('FROM sellers WHERE owner_member_id = ?')) {
      const ownerId = args[0];
      const found = Array.from(state.sellers.values()).filter((s) => s.owner_member_id === ownerId && !s.deleted_at);
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('SELECT id, name FROM sellers WHERE (id = ? OR slug = ?)')) {
      const found = Array.from(state.sellers.values()).filter(
        (s) => (s.id === args[0] || s.slug === args[1]) && s.status === 'ACTIVE'
      );
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('UPDATE sellers SET pending_balance_core = pending_balance_core + ?')) {
      const [amount, , sellerId] = args;
      const s = state.sellers.get(sellerId);
      if (!s) return { rows: [], changes: 0 };
      s.pending_balance_core = (Number(s.pending_balance_core) || 0) + Number(amount);
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE sellers SET pending_balance_core = ?, available_balance_core = ?, withdrawn_balance_core = ?')) {
      const [held, avail, withdrawn, updatedAt, sellerId] = args;
      const s = state.sellers.get(sellerId);
      if (!s) return { rows: [], changes: 0 };
      s.pending_balance_core = Number(held);
      s.available_balance_core = Number(avail);
      s.withdrawn_balance_core = Number(withdrawn);
      s.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }

    // seller_products queries
    if (sql.includes('FROM seller_products sp JOIN sellers s ON sp.seller_id = s.id WHERE sp.id = ?')) {
      const p = state.products.get(args[0]);
      if (!p || p.deleted_at) return { rows: [], changes: 0 };
      const s = state.sellers.get(p.seller_id);
      if (!s || s.deleted_at) return { rows: [], changes: 0 };
      return {
        rows: [
          {
            ...p,
            seller_name: s.name,
            seller_status: s.status,
            is_vacation: s.is_vacation || 0,
            owner_member_id: s.owner_member_id,
            seller_deleted_at: s.deleted_at || null,
            pending_balance_core: s.pending_balance_core || 0,
            available_balance_core: s.available_balance_core || 0,
            withdrawn_balance_core: s.withdrawn_balance_core || 0,
          },
        ],
        changes: 0,
      };
    }
    if (sql.startsWith('SELECT id, seller_id, is_affiliate, origin_product_id, price_core, product_type FROM seller_products WHERE id = ?')) {
      const p = state.products.get(args[0]);
      return { rows: p && !p.deleted_at ? [p] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT id, seller_id, price_core, resell_enabled')) {
      const p = state.products.get(args[0]);
      return { rows: p ? [p] : [], changes: 0 };
    }
    if (sql.startsWith('UPDATE seller_products SET resell_enabled = ?')) {
      const [resellEnabled, discountPct, commissionPct, mapPrice, productId] = args;
      const p = state.products.get(productId);
      if (!p) return { rows: [], changes: 0 };
      p.resell_enabled = resellEnabled;
      p.resell_discount_pct = discountPct;
      p.resell_commission_pct = commissionPct;
      p.resell_map_price = mapPrice;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_products SET price_core = ?, updated_at = ? WHERE id = ?')) {
      const [price, updatedAt, id] = args;
      const p = state.products.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.price_core = price;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_products SET status = 'PAUSED'")) {
      const [updatedAt, id] = args;
      const p = state.products.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'PAUSED';
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_products SET stock_quantity = stock_quantity - 1')) {
      const [updatedAt, id] = args;
      if (state.onBeforeStockReserve) {
        state.onBeforeStockReserve(id);
      }
      const p = state.products.get(id);
      if (!p || Number(p.stock_quantity || 0) < 1) return { rows: [], changes: 0 };
      p.stock_quantity = Number(p.stock_quantity) - 1;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_products SET stock_quantity = stock_quantity + 1')) {
      const id = args.length >= 2 ? args[1] : args[0];
      const p = state.products.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.stock_quantity = Number(p.stock_quantity || 0) + 1;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('INSERT INTO seller_products (')) {
      const [
        id, seller_id, game_slug, game_name, name, cover_url, description,
        price_core, original_price_core, warranty_type, warranty_hours,
        delivery_type, low_stock_threshold, product_type, stock_quantity,
        weight_grams, warehouse_address, status, created_at, updated_at,
      ] = args;
      state.products.set(id, {
        id, seller_id, game_slug, game_name, name, cover_url, description,
        price_core, original_price_core, warranty_type, warranty_hours,
        delivery_type, low_stock_threshold, product_type, stock_quantity,
        weight_grams, warehouse_address, status, created_at, updated_at,
        resell_enabled: 0, resell_discount_pct: 0, resell_commission_pct: 0, resell_map_price: 0,
        is_affiliate: 0, origin_seller_id: null, origin_product_id: null, deleted_at: null,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_products SET name = COALESCE(?, name)')) {
      const [
        name, description, newPrice, original_price_core, warranty_type, warranty_hours,
        delivery_type, low_stock_threshold, resolvedProductType, parsedStockQty,
        parsedWeight, cleanWarehouse, newStatus, nowIso, productId,
      ] = args;
      const p = state.products.get(productId);
      if (!p) return { rows: [], changes: 0 };
      if (name !== null) p.name = name;
      if (description !== null) p.description = description;
      p.price_core = newPrice;
      if (original_price_core !== null) p.original_price_core = original_price_core;
      if (warranty_type !== null) p.warranty_type = warranty_type;
      if (warranty_hours !== null) p.warranty_hours = warranty_hours;
      if (delivery_type !== null) p.delivery_type = delivery_type;
      if (low_stock_threshold !== null) p.low_stock_threshold = low_stock_threshold;
      if (resolvedProductType !== null) p.product_type = resolvedProductType;
      if (parsedStockQty !== null) p.stock_quantity = parsedStockQty;
      if (parsedWeight !== null) p.weight_grams = parsedWeight;
      if (cleanWarehouse !== null) p.warehouse_address = cleanWarehouse;
      p.status = newStatus;
      p.updated_at = nowIso;
      return { rows: [], changes: 1 };
    }

    // seller_affiliate_partnerships
    if (sql.startsWith('SELECT id, status FROM seller_affiliate_partnerships WHERE supplier_seller_id = ? AND reseller_seller_id = ?')) {
      const found = Array.from(state.partnerships.values()).filter(
        (p) => p.supplier_seller_id === args[0] && p.reseller_seller_id === args[1]
      );
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('INSERT INTO seller_affiliate_partnerships')) {
      const [id, supplierId, resellerId] = args;
      state.partnerships.set(id, {
        id,
        supplier_seller_id: supplierId,
        reseller_seller_id: resellerId,
        status: 'PENDING',
        api_key_hash: '',
        api_key_prefix: '',
        one_time_raw_key: null,
        revoked_at: null,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.includes('FROM seller_affiliate_partnerships sap JOIN sellers s_res')) {
      const p = state.partnerships.get(args[0]);
      if (!p) return { rows: [], changes: 0 };
      const resSeller = state.sellers.get(p.reseller_seller_id);
      return { rows: [{ ...p, reseller_name: resSeller?.name || 'Reseller' }], changes: 0 };
    }
    if (sql.startsWith('SELECT status FROM seller_affiliate_partnerships WHERE id = ?')) {
      const p = state.partnerships.get(args[0]);
      return { rows: p ? [{ status: p.status }] : [], changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'PENDING_ADMIN'")) {
      const p = state.partnerships.get(args[0]);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'PENDING_ADMIN';
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'APPROVED'")) {
      const [keyHash, keyPrefix, rawKey, id] = args;
      const p = state.partnerships.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'APPROVED';
      p.api_key_hash = keyHash;
      p.api_key_prefix = keyPrefix;
      p.one_time_raw_key = rawKey;
      p.revoked_at = null;
      return { rows: [], changes: 1 };
    }

    // seller_affiliate_listings
    if (sql.includes('FROM seller_affiliate_listings sal JOIN seller_products sp_orig')) {
      const supplierProdId = args[0];
      const orig = state.products.get(supplierProdId);
      const rows = Array.from(state.listings.values())
        .filter((l) => l.supplier_product_id === supplierProdId)
        .map((l) => ({
          ...l,
          origin_price: orig?.price_core,
          origin_map: orig?.resell_map_price,
          origin_discount_pct: orig?.resell_discount_pct,
          origin_commission_pct: orig?.resell_commission_pct,
          origin_product_type: orig?.product_type,
        }));
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT id, partnership_id, markup_type, markup_value, price_mode, locked_price, status, price_warning FROM seller_affiliate_listings WHERE reseller_product_id = ?')) {
      const found = Array.from(state.listings.values()).filter((l) => l.reseller_product_id === args[0]);
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('UPDATE seller_affiliate_listings SET status = ?, price_warning = ?, updated_at = ? WHERE id = ?')) {
      const [status, warning, updatedAt, id] = args;
      const l = state.listings.get(id);
      if (!l) return { rows: [], changes: 0 };
      l.status = status;
      l.price_warning = warning;
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_affiliate_listings SET status = ?, updated_at = ? WHERE id = ?')) {
      const [status, updatedAt, id] = args;
      const l = state.listings.get(id);
      if (!l || l.status === 'SUPPLIER_DISABLED' || l.price_warning === 'ANTI_LOSS_PAUSED') return { rows: [], changes: 0 };
      l.status = status;
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_listings SET status = 'SUPPLIER_DISABLED'")) {
      const [updatedAt, id] = args;
      const l = state.listings.get(id);
      if (!l) return { rows: [], changes: 0 };
      l.status = 'SUPPLIER_DISABLED';
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }

    // seller_affiliate_sync_logs
    if (sql.startsWith('INSERT INTO seller_affiliate_sync_logs')) {
      state.syncLogs.push({
        id: args[0],
        supplier_product_id: args[1],
        change_type: args[2],
        new_value: args[4],
        affected_resellers_count: args[5],
      });
      return { rows: [], changes: 1 };
    }

    // seller_codes
    if (sql.startsWith('SELECT id, code_encrypted FROM seller_codes') || sql.startsWith('SELECT id FROM seller_codes')) {
      const prodId = args[0];
      const found = Array.from(state.codes.values()).filter(
        (c) => c.product_id === prodId && c.status === 'IN_STOCK' && !c.deleted_at
      );
      return { rows: found.slice(0, 1), changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_codes SET status = 'SOLD'")) {
      const [orderId, soldAt, updatedAt, codeId, expectedOrderId] = args;
      const c = state.codes.get(codeId);
      if (!c) return { rows: [], changes: 0 };
      if (sql.includes("status = 'RESERVED'")) {
        if (c.status !== 'RESERVED' || c.order_id !== expectedOrderId) return { rows: [], changes: 0 };
      } else if (c.status !== 'IN_STOCK') {
        return { rows: [], changes: 0 };
      }
      c.status = 'SOLD';
      c.order_id = orderId;
      c.sold_at = soldAt;
      c.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_codes SET status = 'RESERVED'")) {
      const [orderId, updatedAt, codeId] = args;
      const c = state.codes.get(codeId);
      if (!c || c.status !== 'IN_STOCK') return { rows: [], changes: 0 };
      c.status = 'RESERVED';
      c.order_id = orderId;
      c.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_codes SET status = 'IN_STOCK', order_id = NULL")) {
      if (sql.includes('WHERE id = ?')) {
        const [, codeId, orderId] = args;
        const c = state.codes.get(codeId);
        if (!c || c.status !== 'RESERVED' || c.order_id !== orderId) return { rows: [], changes: 0 };
        c.status = 'IN_STOCK';
        c.order_id = null;
        return { rows: [], changes: 1 };
      }
      const [orderId] = args;
      let changed = 0;
      for (const c of state.codes.values()) {
        if (c.order_id === orderId && c.status === 'RESERVED') {
          c.status = 'IN_STOCK';
          c.order_id = null;
          changed++;
        }
      }
      return { rows: [], changes: changed };
    }

    // seller_orders queries for escrow & expiry
    if (sql.startsWith('SELECT so.id, so.order_code, so.product_id')) {
      const nowIso = String(args[0]);
      const targetOrderId = args.length >= 4 ? String(args[1]) : null;
      const rows = Array.from(state.orders.values())
        .filter((o) => {
          if (o.status !== 'PENDING_PAYMENT') return false;
          if (o.expires_at && String(o.expires_at) > nowIso) return false;
          if (targetOrderId && o.id !== targetOrderId && o.order_code !== targetOrderId && o.parent_order_id !== targetOrderId) return false;
          return true;
        })
        .map((o) => {
          const sp = state.products.get(o.product_id);
          return {
            ...o,
            product_type: o.product_type || 'digital',
            listing_is_affiliate: sp?.is_affiliate || 0,
            listing_origin_product_id: sp?.origin_product_id || null,
          };
        });
      return { rows, changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_orders SET status = 'EXPIRED'")) {
      const o = state.orders.get(args[0]);
      if (!o || o.status !== 'PENDING_PAYMENT') return { rows: [], changes: 0 };
      o.status = 'EXPIRED';
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT COUNT(*) as pending_count FROM seller_orders')) {
      const parentId = args[0];
      const cnt = Array.from(state.orders.values()).filter((o) => o.parent_order_id === parentId && o.status === 'PENDING_PAYMENT').length;
      return { rows: [{ pending_count: cnt }], changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_parent_orders SET status = 'EXPIRED'")) {
      const p = state.parentOrders.get(args[0]);
      if (!p || p.status !== 'PENDING_PAYMENT') return { rows: [], changes: 0 };
      p.status = 'EXPIRED';
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT * FROM seller_orders WHERE (id = ? OR order_code = ?)') || sql.startsWith('SELECT * FROM seller_orders WHERE id = ?')) {
      const o = state.orders.get(args[0]) || Array.from(state.orders.values()).find((x) => x.order_code === args[1]);
      return { rows: o ? [o] : [], changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_orders SET status = 'COMPLETED'")) {
      const [releasedAt, updatedAt, orderId] = args;
      const o = state.orders.get(orderId);
      if (!o || o.status === 'COMPLETED' || o.released_at) return { rows: [], changes: 0 };
      o.status = 'COMPLETED';
      o.released_at = releasedAt;
      o.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_orders SET fee_core = ? WHERE id = ?')) {
      const o = state.orders.get(args[1]);
      if (!o) return { rows: [], changes: 0 };
      o.fee_core = args[0];
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT * FROM orders WHERE id = ?')) {
      return { rows: [], changes: 0 };
    }

    // seller_parent_orders / seller_orders / seller_ledger / audit
    if (sql.startsWith('SELECT COUNT(*) as count FROM seller_parent_orders')) {
      return { rows: [{ count: 0 }], changes: 0 };
    }
    if (sql.startsWith('SELECT id FROM seller_parent_orders WHERE status =')) {
      return { rows: [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO seller_parent_orders')) {
      state.parentOrders.set(args[0], { id: args[0], parent_order_code: args[1], total_amount: args[4], status: 'PENDING_PAYMENT', expires_at: args[5] });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('INSERT INTO seller_orders')) {
      if (sql.includes('parent_order_id')) {
        state.orders.set(args[0], {
          id: args[0],
          order_code: args[1],
          parent_order_id: args[2],
          seller_id: args[6],
          product_id: args[7],
          product_type: args[12],
          status: 'PENDING_PAYMENT',
          expires_at: args[13],
          is_affiliate_order: args[16],
          affiliate_breakdown: args[17],
          supplier_seller_id: args[18],
        });
      } else {
        state.orders.set(args[0], {
          id: args[0],
          order_code: args[1],
          seller_id: args[5],
          product_id: args[6],
          code_id: args[9],
          delivered_code: args[10],
          price_core: args[11],
          product_type: args[12],
          status: 'PAID',
          supplier_seller_id: args[14],
          is_affiliate_order: args[15],
          affiliate_breakdown: args[16],
        });
      }
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('INSERT INTO seller_ledger')) {
      if (sql.includes("'HOLD'")) {
        state.ledger.push({ id: args[0], seller_id: args[1], order_id: args[2], type: 'HOLD', amount_core: args[3], reason: args[8] });
      } else {
        state.ledger.push({ id: args[0], seller_id: args[1], order_id: args[2], type: args[3], amount_core: args[4], reason: args[9] });
      }
      return { rows: [], changes: 1 };
    }
    if (sql.includes('FROM supplier_webhooks') || sql.startsWith('INSERT INTO admin_audit_logs') || sql.startsWith('SELECT * FROM seller_orders WHERE status =')) {
      return { rows: [], changes: 0 };
    }

    return { rows: [], changes: 0 };
  }

  const db = {
    state,
    prepare(sql: string) {
      let boundArgs: any[] = [];
      const stmt: any = {
        sql,
        get args() {
          return boundArgs;
        },
        bind(...args: any[]) {
          boundArgs = args;
          return stmt;
        },
        async first<T = any>() {
          const res = runStatement(sql, boundArgs);
          return (res.rows[0] ?? null) as T | null;
        },
        async all<T = any>() {
          const res = runStatement(sql, boundArgs);
          return { results: res.rows as T[], success: true, meta: { changes: res.changes } };
        },
        async run() {
          const res = runStatement(sql, boundArgs);
          return { success: true, meta: { changes: res.changes } };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const results: any[] = [];
      for (const s of stmts) {
        const res = runStatement(s.sql, s.args || []);
        results.push({ success: true, results: res.rows, meta: { changes: res.changes } });
      }
      return results;
    },
  };

  return db as any;
}

async function main() {
  console.log('\n[Inter-Shop Affiliate Mảnh 1 Test Suite]');

  await test('1. DEFAULT_MARKETPLACE_CONFIG enables inter-shop affiliate & requires Admin approval by default', async () => {
    const db = createMockDb();
    const cfg = await getMarketplaceConfig(db);
    assert.equal(cfg.affiliate_enabled, true);
    assert.equal(cfg.affiliate_digital_fee_pct, 5);
    assert.equal(cfg.affiliate_physical_fee_pct, 2);
    assert.equal(cfg.affiliate_auto_pause_on_loss, true);
    assert.equal(cfg.affiliate_require_admin_approval, true);
    assert.equal(cfg.affiliate_max_markup_pct, 500);
    assert.equal(cfg.affiliate_rate_limit_rpm, 600);
    assert.equal(DEFAULT_MARKETPLACE_CONFIG.affiliate_require_admin_approval, true);
  });

  await test('2. PUT /api/admin/seller-config updates affiliate params freely & preserves false/0 values', async () => {
    const db = createMockDb();
    const env = { DB: db, ADMIN_API_KEY: 'test-admin-secret-123456' };
    const req = new Request('https://example.com/api/admin/seller-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'test-admin-secret-123456' },
      body: JSON.stringify({
        affiliate_enabled: false,
        affiliate_digital_fee_pct: 0,
        affiliate_physical_fee_pct: 1.5,
        affiliate_auto_pause_on_loss: false,
        affiliate_require_admin_approval: false,
        affiliate_max_markup_pct: 250,
        affiliate_rate_limit_rpm: 120,
      }),
    });
    const res = await updateSellerConfig({ request: req, env } as any);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.success, true);

    const loaded = await getMarketplaceConfig(db);
    assert.equal(loaded.affiliate_enabled, false);
    assert.equal(loaded.affiliate_digital_fee_pct, 0);
    assert.equal(loaded.affiliate_physical_fee_pct, 1.5);
    assert.equal(loaded.affiliate_auto_pause_on_loss, false);
    assert.equal(loaded.affiliate_require_admin_approval, false);
    assert.equal(loaded.affiliate_max_markup_pct, 250);
    assert.equal(loaded.affiliate_rate_limit_rpm, 120);
    // Untouched fields preserved from default
    assert.equal(loaded.hold_hours, 168);
  });

  await test('3. calculate3WaySplit uses dynamic Admin digital/physical fee rates & sums 100% to sellingPrice', () => {
    const defaultDigital = calculate3WaySplit({
      basePrice: 1000,
      markupType: 'PERCENT',
      markupValue: 10,
      discountPct: 5,
      commissionPct: 5,
      isPhysical: false,
    });
    assert.equal(defaultDigital.feeRatePct, 5);
    assert.equal(defaultDigital.platformFee, 50);
    assert.equal(defaultDigital.supplierPayout + defaultDigital.resellerPayout + defaultDigital.platformFee, defaultDigital.sellingPrice);

    const customDigital = calculate3WaySplit({
      basePrice: 1000,
      markupType: 'PERCENT',
      markupValue: 10,
      discountPct: 5,
      commissionPct: 5,
      isPhysical: false,
      digitalFeePct: 3,
      physicalFeePct: 1,
    });
    assert.equal(customDigital.feeRatePct, 3);
    assert.equal(customDigital.platformFee, 30);
    assert.equal(customDigital.supplierPayout, 870);
    assert.equal(customDigital.resellerPayout, 200);
    assert.equal(customDigital.supplierPayout + customDigital.resellerPayout + customDigital.platformFee, 1100);

    const customPhysical = calculate3WaySplit({
      basePrice: 1000,
      markupType: 'FIXED',
      markupValue: 150,
      discountPct: 0,
      commissionPct: 4,
      isPhysical: true,
      digitalFeePct: 3,
      physicalFeePct: 1,
    });
    assert.equal(customPhysical.feeRatePct, 1);
    assert.equal(customPhysical.platformFee, 10);
    assert.equal(customPhysical.supplierPayout, 950);
    assert.equal(customPhysical.resellerPayout, 190);
    assert.equal(customPhysical.supplierPayout + customPhysical.resellerPayout + customPhysical.platformFee, 1150);
  });

  await test('4. syncAffiliatePriceAndStock handles RESELL_PARAM_CHANGE (MAP update + ANTI_LOSS_PAUSED + recovery)', async () => {
    const db = createMockDb();
    db.state.products.set('prod_sup_1', {
      id: 'prod_sup_1',
      seller_id: 'sel_a',
      price_core: 100,
      resell_map_price: 150,
      resell_discount_pct: 0,
      resell_commission_pct: 0,
      product_type: 'digital',
    });
    db.state.products.set('prod_res_formula', { id: 'prod_res_formula', seller_id: 'sel_b', price_core: 110 });
    db.state.products.set('prod_res_locked', { id: 'prod_res_locked', seller_id: 'sel_c', price_core: 120 });

    db.state.listings.set('sal_1', {
      id: 'sal_1',
      supplier_product_id: 'prod_sup_1',
      reseller_product_id: 'prod_res_formula',
      markup_type: 'PERCENT',
      markup_value: 10,
      price_mode: 'FORMULA',
      locked_price: null,
      status: 'ACTIVE',
      price_warning: null,
    });
    db.state.listings.set('sal_2', {
      id: 'sal_2',
      supplier_product_id: 'prod_sup_1',
      reseller_product_id: 'prod_res_locked',
      markup_type: 'FIXED',
      markup_value: 20,
      price_mode: 'LOCKED',
      locked_price: 120,
      status: 'ACTIVE',
      price_warning: null,
    });

    // MAP raised to 150 -> FORMULA listing auto-lifts from 110 to 150
    const resMap = await syncAffiliatePriceAndStock(db, 'prod_sup_1', 'RESELL_PARAM_CHANGE', {
      newBasePrice: 100,
      newMapPrice: 150,
    });
    assert.equal(resMap.affectedCount, 2);
    assert.equal(db.state.products.get('prod_res_formula').price_core, 150);
    assert.equal(db.state.products.get('prod_res_locked').price_core, 150);
    assert.equal(db.state.syncLogs[0].change_type, 'RESELL_PARAM_CHANGE');

    // Supplier base price rises to 130 (> locked_price 120) -> LOCKED listing auto-pauses ANTI_LOSS_PAUSED
    db.state.products.get('prod_sup_1').price_core = 130;
    const resLoss = await syncAffiliatePriceAndStock(db, 'prod_sup_1', 'PRICE_CHANGE', {
      newBasePrice: 130,
      autoPauseOnLoss: true,
    });
    assert.equal(resLoss.antiLossPausedCount, 1);
    assert.equal(db.state.listings.get('sal_2').status, 'HIDDEN');
    assert.equal(db.state.listings.get('sal_2').price_warning, 'ANTI_LOSS_PAUSED');

    // Supplier base price drops back to 90 -> LOCKED listing recovers to ACTIVE
    db.state.products.get('prod_sup_1').price_core = 90;
    db.state.products.get('prod_sup_1').resell_map_price = 0;
    await syncAffiliatePriceAndStock(db, 'prod_sup_1', 'PRICE_CHANGE', {
      newBasePrice: 90,
      newMapPrice: 0,
      autoPauseOnLoss: true,
    });
    assert.equal(db.state.listings.get('sal_2').status, 'ACTIVE');
    assert.equal(db.state.listings.get('sal_2').price_warning, null);
  });

  await test('5. PUT /api/seller/products/:id/resell recognizes lowercase "physical" & uses dynamic Admin fee', async () => {
    const db = createMockDb();
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_physical_fee_pct: 1,
      affiliate_digital_fee_pct: 5,
    }));
    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 's_a', member_id: 'mem_a' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.products.set('prod_phys_1', {
      id: 'prod_phys_1',
      seller_id: 'sel_a',
      is_affiliate: 0,
      origin_product_id: null,
      price_core: 200,
      product_type: 'physical', // lowercase!
    });

    // 50% + 49% + 1% physical fee = 100% -> MUST PASS (previously failed because 'physical' fell back to 5% digital!)
    const okReq = new Request('https://example.com/api/seller/products/prod_phys_1/resell', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({
        resell_enabled: true,
        resell_discount_pct: 50,
        resell_commission_pct: 49,
        resell_map_price: 250,
      }),
    });
    const okRes = await updateResellParams({ request: okReq, params: { id: 'prod_phys_1' }, env: { DB: db } });
    assert.equal(okRes.status, 200);

    // 50% + 50% + 1% = 101% -> MUST FAIL with EXCEEDS_100_PERCENT
    const badReq = new Request('https://example.com/api/seller/products/prod_phys_1/resell', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({
        resell_enabled: true,
        resell_discount_pct: 50,
        resell_commission_pct: 50,
        resell_map_price: 250,
      }),
    });
    const badRes = await updateResellParams({ request: badReq, params: { id: 'prod_phys_1' }, env: { DB: db } });
    assert.equal(badRes.status, 400);
    const badBody: any = await badRes.json();
    assert.equal(badBody.code, 'EXCEEDS_100_PERCENT');
  });

  await test('6. Partnership approval enforces PENDING_ADMIN when affiliate_require_admin_approval=true (default)', async () => {
    const db = createMockDb();
    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.members.set('mem_b', { id: 'mem_b', username: 'shopb', email: 'b@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 'sa', member_id: 'mem_a' });
    db.state.sessions.set('tok_b', { id: 'sb', member_id: 'mem_b' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });

    // Shop B requests partnership with Shop A
    const reqPost = new Request('https://example.com/api/seller/affiliate/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b' },
      body: JSON.stringify({ supplier_seller_id: 'sel_a' }),
    });
    const resPost = await createAffiliateRequest({ request: reqPost, env: { DB: db } });
    assert.equal(resPost.status, 201);
    const created: any = await resPost.json();
    const requestId = created.request_id;
    assert.equal(db.state.partnerships.get(requestId).status, 'PENDING');

    // Shop A approves -> must move to PENDING_ADMIN (no pair key generated!)
    const reqApprove = new Request(`https://example.com/api/seller/affiliate/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_a' },
    });
    const resApprove = await approveAffiliateRequest({ request: reqApprove, params: { id: requestId }, env: { DB: db } });
    assert.equal(resApprove.status, 200);
    const approveData: any = await resApprove.json();
    assert.equal(approveData.status, 'PENDING_ADMIN');
    assert.equal(approveData.requires_admin_approval, true);
    assert.equal(db.state.partnerships.get(requestId).status, 'PENDING_ADMIN');
    assert.equal(db.state.partnerships.get(requestId).api_key_hash, '');
    assert.equal(db.state.partnerships.get(requestId).one_time_raw_key, null);

    // Duplicate request while PENDING_ADMIN must be rejected with 400
    const dupRes = await createAffiliateRequest({
      request: new Request('https://example.com/api/seller/affiliate/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b' },
        body: JSON.stringify({ supplier_seller_id: 'sel_a' }),
      }),
      env: { DB: db },
    });
    assert.equal(dupRes.status, 400);

    // If Admin turns off affiliate_require_admin_approval -> Shop A approval of a fresh PENDING request immediately activates APPROVED + Pair Key
    db.state.members.set('mem_c', { id: 'mem_c', username: 'shopc', email: 'c@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_c', { id: 'sc', member_id: 'mem_c' });
    db.state.sellers.set('sel_c', { id: 'sel_c', owner_member_id: 'mem_c', name: 'Shop C', slug: 'shop-c', status: 'ACTIVE' });
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_require_admin_approval: false,
    }));
    const reqPostC = await createAffiliateRequest({
      request: new Request('https://example.com/api/seller/affiliate/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_c' },
        body: JSON.stringify({ supplier_seller_id: 'sel_a' }),
      }),
      env: { DB: db },
    });
    assert.equal(reqPostC.status, 201);
    const requestIdC = ((await reqPostC.json()) as any).request_id;
    const resDirect = await approveAffiliateRequest({
      request: new Request(`https://example.com/api/seller/affiliate/requests/${requestIdC}/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok_a' },
      }),
      params: { id: requestIdC },
      env: { DB: db },
    });
    assert.equal(resDirect.status, 200);
    const directData: any = await resDirect.json();
    assert.equal(directData.status, 'APPROVED');
    assert.equal(directData.requires_admin_approval, false);
    assert.ok(db.state.partnerships.get(requestIdC).api_key_hash.length === 64);
    assert.ok(String(db.state.partnerships.get(requestIdC).one_time_raw_key).startsWith('wcg_shop_'));
  });

  await test('7. POST /api/seller-orders blocks ANTI_LOSS_PAUSED & fulfills both digital and physical inter-shop orders with dynamic fees', async () => {
    const codeKey = 'test_marketplace_code_key_32bytes!!';
    const encryptedCode = await encryptCode('GIFT-INTERSHOP-9999', codeKey);

    const db = createMockDb();
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_digital_fee_pct: 3,
      affiliate_physical_fee_pct: 1,
    }));

    db.state.members.set('mem_buyer', { id: 'mem_buyer', username: 'buyer1', email: 'buyer@example.com', balance: 5000, status: 'ACTIVE' });
    db.state.sessions.set('tok_buyer', { id: 's_buyer', member_id: 'mem_buyer' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });

    db.state.partnerships.set('sap_1', { id: 'sap_1', supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b', status: 'APPROVED' });

    // Digital affiliate product
    db.state.products.set('prod_dig_a', { id: 'prod_dig_a', seller_id: 'sel_a', name: 'Digital Key', game_slug: 'g1', price_core: 1000, resell_enabled: 1, resell_discount_pct: 5, resell_commission_pct: 5, resell_map_price: 0, product_type: 'digital', status: 'APPROVED' });
    db.state.products.set('prod_dig_b', { id: 'prod_dig_b', seller_id: 'sel_b', name: 'Digital Key', game_slug: 'g1', price_core: 1100, is_affiliate: 1, origin_seller_id: 'sel_a', origin_product_id: 'prod_dig_a', product_type: 'digital', status: 'APPROVED' });
    db.state.codes.set('code_1', { id: 'code_1', product_id: 'prod_dig_a', code_encrypted: encryptedCode, status: 'IN_STOCK' });
    db.state.listings.set('sal_dig', { id: 'sal_dig', partnership_id: 'sap_1', supplier_product_id: 'prod_dig_a', reseller_product_id: 'prod_dig_b', markup_type: 'PERCENT', markup_value: 10, price_mode: 'FORMULA', locked_price: null, status: 'HIDDEN', price_warning: 'ANTI_LOSS_PAUSED' });

    // Case 7a: ANTI_LOSS_PAUSED must be blocked
    const blockedRes = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_dig_b' }),
      }),
      env: { DB: db, MARKETPLACE_CODE_KEY: codeKey },
    } as any);
    assert.equal(blockedRes.status, 400);
    const blockedJson: any = await blockedRes.json();
    assert.equal(blockedJson.code, 'ANTI_LOSS_PAUSED');
    assert.equal(db.state.members.get('mem_buyer').balance, 5000);

    // Case 7b: Unpause listing -> digital order succeeds with dynamic 3% fee & delivers Shop A code
    db.state.listings.get('sal_dig').status = 'ACTIVE';
    db.state.listings.get('sal_dig').price_warning = null;
    const digRes = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_dig_b' }),
      }),
      env: { DB: db, MARKETPLACE_CODE_KEY: codeKey },
    } as any);
    assert.equal(digRes.status, 201);
    const digJson: any = await digRes.json();
    assert.equal(digJson.order.delivered_code, 'GIFT-INTERSHOP-9999');
    assert.equal(db.state.codes.get('code_1').status, 'SOLD');
    const savedDigOrder = db.state.orders.get(digJson.order.id);
    const digSplit = JSON.parse(savedDigOrder.affiliate_breakdown);
    assert.equal(digSplit.feeRatePct, 3);
    assert.equal(digSplit.platformFee, 30);

    // Case 7c: Physical inter-shop product (no seller_codes, no MARKETPLACE_CODE_KEY required) -> decrements origin stock_quantity 2 -> 1
    db.state.products.set('prod_phy_a', { id: 'prod_phy_a', seller_id: 'sel_a', name: 'Gaming Mouse', game_slug: 'gear', price_core: 1000, resell_enabled: 1, resell_discount_pct: 0, resell_commission_pct: 4, resell_map_price: 0, product_type: 'physical', stock_quantity: 2, status: 'APPROVED' });
    db.state.products.set('prod_phy_b', { id: 'prod_phy_b', seller_id: 'sel_b', name: 'Gaming Mouse', game_slug: 'gear', price_core: 1200, is_affiliate: 1, origin_seller_id: 'sel_a', origin_product_id: 'prod_phy_a', product_type: 'physical', stock_quantity: 0, status: 'APPROVED' });
    db.state.listings.set('sal_phy', { id: 'sal_phy', partnership_id: 'sap_1', supplier_product_id: 'prod_phy_a', reseller_product_id: 'prod_phy_b', markup_type: 'FIXED', markup_value: 200, price_mode: 'FORMULA', locked_price: null, status: 'ACTIVE', price_warning: null });

    const phyRes = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_phy_b' }),
      }),
      env: { DB: db }, // deliberately omit MARKETPLACE_CODE_KEY
    } as any);
    assert.equal(phyRes.status, 201);
    const phyJson: any = await phyRes.json();
    assert.equal(phyJson.order.product_type, 'physical');
    assert.equal(phyJson.order.delivered_code, null);
    assert.equal(db.state.products.get('prod_phy_a').stock_quantity, 1);
    const phySplit = JSON.parse(db.state.orders.get(phyJson.order.id).affiliate_breakdown);
    assert.equal(phySplit.feeRatePct, 1);
    assert.equal(phySplit.platformFee, 10);

    // Case 7d: Multi-order QR checkout also decrements physical affiliate stock 1 -> 0 and blocks when 0
    const multiRes = await createMultiOrder({
      request: new Request('https://example.com/api/seller-orders/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ items: [{ product_id: 'prod_phy_b' }] }),
      }),
      env: { DB: db, SEPAY_API_KEY: 'sepay_test_key' },
    } as any);
    assert.equal(multiRes.status, 200);
    assert.equal(db.state.products.get('prod_phy_a').stock_quantity, 0);

    const oosRes = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_phy_b' }),
      }),
      env: { DB: db },
    } as any);
    assert.equal(oosRes.status, 400);
    const oosJson: any = await oosRes.json();
    assert.equal(oosJson.code, 'OUT_OF_STOCK');
  });

  await test('8. Concurrent stock race (2 buyers, stock=1) & mid-flight wallet race rollback in seller-orders/index.ts', async () => {
    const db = createMockDb();
    db.state.members.set('mem_b1', { id: 'mem_b1', username: 'buyer1', email: 'b1@example.com', balance: 2000, status: 'ACTIVE' });
    db.state.members.set('mem_b2', { id: 'mem_b2', username: 'buyer2', email: 'b2@example.com', balance: 2000, status: 'ACTIVE' });
    db.state.sessions.set('tok_b1', { id: 'sb1', member_id: 'mem_b1' });
    db.state.sessions.set('tok_b2', { id: 'sb2', member_id: 'mem_b2' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.partnerships.set('sap_1', { id: 'sap_1', supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b', status: 'APPROVED' });
    db.state.products.set('prod_phy_a', { id: 'prod_phy_a', seller_id: 'sel_a', name: 'Keyboard', game_slug: 'gear', price_core: 1000, resell_enabled: 1, resell_discount_pct: 0, resell_commission_pct: 5, resell_map_price: 0, product_type: 'physical', stock_quantity: 1, status: 'APPROVED' });
    db.state.products.set('prod_phy_b', { id: 'prod_phy_b', seller_id: 'sel_b', name: 'Keyboard', game_slug: 'gear', price_core: 1200, is_affiliate: 1, origin_seller_id: 'sel_a', origin_product_id: 'prod_phy_a', product_type: 'physical', stock_quantity: 0, status: 'APPROVED' });
    db.state.listings.set('sal_phy', { id: 'sal_phy', partnership_id: 'sap_1', supplier_product_id: 'prod_phy_a', reseller_product_id: 'prod_phy_b', markup_type: 'FIXED', markup_value: 200, price_mode: 'FORMULA', locked_price: null, status: 'ACTIVE', price_warning: null });

    // 8a. 2 buyers race simultaneously for stock_quantity = 1
    const bgTasks: Promise<any>[] = [];
    const waitUntil = (p: Promise<any>) => { bgTasks.push(p); };
    const [res1, res2] = await Promise.all([
      createSingleOrder({
        request: new Request('https://example.com/api/seller-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b1' },
          body: JSON.stringify({ product_id: 'prod_phy_b' }),
        }),
        env: { DB: db },
        waitUntil,
      } as any),
      createSingleOrder({
        request: new Request('https://example.com/api/seller-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b2' },
          body: JSON.stringify({ product_id: 'prod_phy_b' }),
        }),
        env: { DB: db },
        waitUntil,
      } as any),
    ]);
    await Promise.all(bgTasks);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);
    assert.equal(db.state.products.get('prod_phy_a').stock_quantity, 0);
    assert.equal(db.state.orders.size, 1);
    assert.equal(db.state.ledger.length, 1);
    assert.equal(db.state.sellers.get('sel_b').pending_balance_core, 1200);
    const balances = [db.state.members.get('mem_b1').balance, db.state.members.get('mem_b2').balance].sort((a, b) => a - b);
    assert.deepEqual(balances, [800, 2000]); // Loser's balance strictly untouched!

    // 8b. Mid-flight wallet race: balance drops to 0 AFTER pre-read guard, right before Phase 2 debit -> must return 409 AND rollback stock back to 1
    db.state.products.get('prod_phy_a').stock_quantity = 1;
    db.state.listings.get('sal_phy').status = 'ACTIVE';
    db.state.members.get('mem_b2').balance = 2000;
    db.state.onBeforeDebitMember = (buyerId: string) => {
      if (buyerId === 'mem_b2') {
        db.state.members.get('mem_b2').balance = 100; // Drained concurrently by another tx
      }
    };
    const raceWalletRes = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b2' },
        body: JSON.stringify({ product_id: 'prod_phy_b' }),
      }),
      env: { DB: db },
    } as any);
    db.state.onBeforeDebitMember = undefined;
    assert.equal(raceWalletRes.status, 409);
    const rwJson: any = await raceWalletRes.json();
    assert.equal(rwJson.code, 'BALANCE_RACE_CONFLICT');
    assert.equal(db.state.products.get('prod_phy_a').stock_quantity, 1); // Stock cleanly rolled back!
    assert.equal(db.state.orders.size, 1); // Still only 1 order from 8a
    assert.equal(db.state.ledger.length, 1);
    assert.equal(db.state.sellers.get('sel_b').pending_balance_core, 1200);
  });

  await test('9. multi.ts fails with 409 & rolls back prior item on stock no-op + checkAndExpireSellerOrdersD1 restores origin stock', async () => {
    const db = createMockDb();
    db.state.members.set('mem_buyer', { id: 'mem_buyer', username: 'buyer1', email: 'buyer@example.com', balance: 5000, status: 'ACTIVE' });
    db.state.sessions.set('tok_buyer', { id: 's_buyer', member_id: 'mem_buyer' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });
    db.state.partnerships.set('sap_1', { id: 'sap_1', supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b', status: 'APPROVED' });

    db.state.products.set('prod_phy_1', { id: 'prod_phy_1', seller_id: 'sel_a', name: 'Item 1', game_slug: 'gear', price_core: 500, resell_enabled: 1, product_type: 'physical', stock_quantity: 2, status: 'APPROVED' });
    db.state.products.set('prod_phy_2', { id: 'prod_phy_2', seller_id: 'sel_a', name: 'Item 2', game_slug: 'gear', price_core: 600, resell_enabled: 1, product_type: 'physical', stock_quantity: 1, status: 'APPROVED' });
    db.state.products.set('prod_phy_2_res', { id: 'prod_phy_2_res', seller_id: 'sel_b', name: 'Item 2', game_slug: 'gear', price_core: 700, is_affiliate: 1, origin_seller_id: 'sel_a', origin_product_id: 'prod_phy_2', product_type: 'physical', stock_quantity: 0, status: 'APPROVED' });
    db.state.listings.set('sal_2', { id: 'sal_2', partnership_id: 'sap_1', supplier_product_id: 'prod_phy_2', reseller_product_id: 'prod_phy_2_res', markup_type: 'FIXED', markup_value: 100, price_mode: 'FORMULA', locked_price: null, status: 'ACTIVE', price_warning: null });

    // 9a. Simulate stock of Item 2 dropping to 0 right before its reservation (after Item 1 was reserved)
    db.state.onBeforeStockReserve = (prodId: string) => {
      if (prodId === 'prod_phy_2') {
        db.state.products.get('prod_phy_2').stock_quantity = 0;
      }
    };
    const multiFailRes = await createMultiOrder({
      request: new Request('https://example.com/api/seller-orders/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ items: [{ product_id: 'prod_phy_1' }, { product_id: 'prod_phy_2_res' }] }),
      }),
      env: { DB: db, SEPAY_API_KEY: 'sepay_test_key' },
    } as any);
    db.state.onBeforeStockReserve = undefined;
    assert.equal(multiFailRes.status, 409);
    const mfJson: any = await multiFailRes.json();
    assert.equal(mfJson.success, false);
    assert.equal(mfJson.code, 'STOCK_RACE_CONFLICT');
    assert.equal(db.state.parentOrders.size, 0);
    assert.equal(db.state.orders.size, 0);
    assert.equal(db.state.products.get('prod_phy_1').stock_quantity, 2); // Item 1 cleanly rolled back!

    // 9b. Valid multi order for affiliate physical item -> expires -> checkAndExpireSellerOrdersD1 restores ORIGIN prod_phy_2 (NOT listing prod_phy_2_res!)
    db.state.products.get('prod_phy_2').stock_quantity = 1;
    const multiOkRes = await createMultiOrder({
      request: new Request('https://example.com/api/seller-orders/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ items: [{ product_id: 'prod_phy_2_res' }] }),
      }),
      env: { DB: db, SEPAY_API_KEY: 'sepay_test_key' },
    } as any);
    assert.equal(multiOkRes.status, 200);
    assert.equal(db.state.products.get('prod_phy_2').stock_quantity, 0);
    const childOrder = Array.from(db.state.orders.values())[0];
    childOrder.expires_at = '2020-01-01T00:00:00.000Z';

    const expiredCount = await checkAndExpireSellerOrdersD1(db, childOrder.id);
    assert.equal(expiredCount, 1);
    assert.equal(db.state.products.get('prod_phy_2').stock_quantity, 1); // Restored to origin!
    assert.equal(db.state.products.get('prod_phy_2_res').stock_quantity, 0); // Listing untouched!
    // Re-running expiry must NOT double-restore
    const expiredAgain = await checkAndExpireSellerOrdersD1(db, childOrder.id);
    assert.equal(expiredAgain, 0);
    assert.equal(db.state.products.get('prod_phy_2').stock_quantity, 1);
  });

  await test('10. Official POST/PUT /api/seller/products writes stock_quantity -> fulfills physical inter-shop order (1 -> 0) & blocks 2nd buyer', async () => {
    const db = createMockDb();
    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.members.set('mem_buyer', { id: 'mem_buyer', username: 'buyer', email: 'buyer@example.com', balance: 5000, status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 'sa', member_id: 'mem_a' });
    db.state.sessions.set('tok_buyer', { id: 'sb', member_id: 'mem_buyer' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.partnerships.set('sap_1', { id: 'sap_1', supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b', status: 'APPROVED' });

    // 10a. POST creates physical product with default stock_quantity = 0
    const createRes = await createSellerProduct({
      request: new Request('https://example.com/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          product_type: 'physical',
          name: 'Pro Gaming Headset',
          price_core: 800,
          weight_grams: 450,
          warehouse_address: 'Kho Cầu Giấy, Hà Nội',
        }),
      }),
      env: { DB: db },
    } as any);
    assert.equal(createRes.status, 201);
    const createdProduct = Array.from(db.state.products.values())[0];
    assert.equal(createdProduct.stock_quantity, 0);

    // 10b. PUT updates stock_quantity = 1 & enable resell + attach listing on Shop B
    const putRes = await updateSellerProduct({
      request: new Request(`https://example.com/api/seller/products/${createdProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({ stock_quantity: 1 }),
      }),
      params: { id: createdProduct.id },
      env: { DB: db },
    } as any);
    assert.equal(putRes.status, 200);
    assert.equal(db.state.products.get(createdProduct.id).stock_quantity, 1);

    createdProduct.resell_enabled = 1;
    db.state.products.set('prod_headset_b', {
      id: 'prod_headset_b',
      seller_id: 'sel_b',
      name: createdProduct.name,
      game_slug: createdProduct.game_slug,
      price_core: 950,
      is_affiliate: 1,
      origin_seller_id: 'sel_a',
      origin_product_id: createdProduct.id,
      product_type: 'physical',
      stock_quantity: 0,
      status: 'APPROVED',
    });
    db.state.listings.set('sal_headset', {
      id: 'sal_headset',
      partnership_id: 'sap_1',
      supplier_product_id: createdProduct.id,
      reseller_product_id: 'prod_headset_b',
      markup_type: 'FIXED',
      markup_value: 150,
      price_mode: 'FORMULA',
      locked_price: null,
      status: 'ACTIVE',
      price_warning: null,
    });

    // 10c. 1st buyer succeeds (stock 1 -> 0); 2nd buyer blocked 400 OUT_OF_STOCK
    const firstBuy = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_headset_b' }),
      }),
      env: { DB: db },
    } as any);
    assert.equal(firstBuy.status, 201);
    assert.equal(db.state.products.get(createdProduct.id).stock_quantity, 0);

    const secondBuy = await createSingleOrder({
      request: new Request('https://example.com/api/seller-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_buyer' },
        body: JSON.stringify({ product_id: 'prod_headset_b' }),
      }),
      env: { DB: db },
    } as any);
    assert.equal(secondBuy.status, 400);
    assert.equal(((await secondBuy.json()) as any).code, 'OUT_OF_STOCK');
  });

  await test('11. escrow_service handles uppercase PHYSICAL without shipping_address with 2% default & dynamic Admin fee', async () => {
    const db = createMockDb();
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE', pending_balance_core: 2000, available_balance_core: 0, withdrawn_balance_core: 0 });
    db.state.orders.set('ord_phys_upper_1', {
      id: 'ord_phys_upper_1',
      buyer_member_id: 'mem_buyer',
      seller_id: 'sel_a',
      price_core: 1000,
      product_type: 'PHYSICAL', // uppercase, NO shipping_address!
      status: 'PAID',
      is_affiliate_order: 0,
      released_at: null,
    });

    // Default config: physical = 2% -> feeCore = 20
    const resDefault = await confirmReceivedAndRelease(db, 'ord_phys_upper_1', undefined, 'test', true);
    assert.equal(resDefault.success, true);
    const feeEntry1 = db.state.ledger.find((l) => l.order_id === 'ord_phys_upper_1' && l.type === 'FEE');
    assert.ok(feeEntry1);
    assert.equal(feeEntry1.amount_core, 20);

    // Dynamic Admin override: physical = 1% -> feeCore = 10
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_physical_fee_pct: 1,
    }));
    db.state.orders.set('ord_phys_upper_2', {
      id: 'ord_phys_upper_2',
      buyer_member_id: 'mem_buyer',
      seller_id: 'sel_a',
      price_core: 1000,
      product_type: 'PHYSICAL',
      status: 'PAID',
      is_affiliate_order: 0,
      released_at: null,
    });
    const resDynamic = await confirmReceivedAndRelease(db, 'ord_phys_upper_2', undefined, 'test', true);
    assert.equal(resDynamic.success, true);
    const feeEntry2 = db.state.ledger.find((l) => l.order_id === 'ord_phys_upper_2' && l.type === 'FEE');
    assert.ok(feeEntry2);
    assert.equal(feeEntry2.amount_core, 10);
  });

  await test('12. approve.ts rejects REJECTED, REVOKED, SUSPENDED & PENDING_ADMIN (no resurrection)', async () => {
    const db = createMockDb();
    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 'sa', member_id: 'mem_a' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });

    for (const status of ['REJECTED', 'REVOKED', 'SUSPENDED', 'PENDING_ADMIN'] as const) {
      const pid = `sap_${status.toLowerCase()}`;
      db.state.partnerships.set(pid, {
        id: pid,
        supplier_seller_id: 'sel_a',
        reseller_seller_id: 'sel_b',
        status,
        api_key_hash: '',
        api_key_prefix: '',
        one_time_raw_key: null,
      });
      const res = await approveAffiliateRequest({
        request: new Request(`https://example.com/api/seller/affiliate/requests/${pid}/approve`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_a' },
        }),
        params: { id: pid },
        env: { DB: db },
      });
      assert.equal(res.status, 400);
      const data: any = await res.json();
      assert.equal(data.success, false);
      assert.equal(db.state.partnerships.get(pid).status, status); // Status unchanged
      assert.equal(db.state.partnerships.get(pid).api_key_hash, ''); // No key generated
    }
  });

  console.log(`\n[Inter-Shop Affiliate Mảnh 1 Summary] Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
