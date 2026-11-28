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
import {
  onRequestGet as getAffiliateRequests,
  onRequestPost as createAffiliateRequest,
} from '../../functions/api/seller/affiliate/requests';
import { onRequestPost as approveAffiliateRequest } from '../../functions/api/seller/affiliate/requests/[id]/approve';
import { onRequestGet as getAffiliatePartners } from '../../functions/api/seller/affiliate/partners/index';
import { onRequestGet as getAffiliateCatalog } from '../../functions/api/seller/affiliate/catalog';
import {
  onRequestGet as getAffiliateListings,
  onRequestPost as createAffiliateListing,
} from '../../functions/api/seller/affiliate/listings/index';
import { onRequestPut as updateAffiliateListing } from '../../functions/api/seller/affiliate/listings/[id]';
import { onRequestPost as createSingleOrder } from '../../functions/api/seller-orders/index';
import { onRequestPost as createMultiOrder } from '../../functions/api/seller-orders/multi';
import { onRequestPost as createSellerProduct } from '../../functions/api/seller/products/index';
import { onRequestPut as updateSellerProduct } from '../../functions/api/seller/products/[id]';
import { confirmReceivedAndRelease } from '../../functions/services/escrow_service';
import { checkAndExpireSellerOrdersD1 } from '../../functions/services/d1_service';
import {
  ADMIN_SUSPENDED_WARNING,
  PARTNERSHIP_REVOKED_WARNING,
  handleAdminAffiliateRequest,
} from '../../functions/api/admin/affiliate/index';
import { handleSellerWebhooksRequest } from '../../functions/api/seller/webhooks/index';
import { onRequestGet as getSellerAffiliateOrders } from '../../functions/api/seller/affiliate/orders';
import { hasScope } from '../../functions/services/mission_service';
import { shouldBumpCatalogEpoch } from '../../functions/services/cache_service';

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
  webhooks: Map<string, any>;
  deliveries: Map<string, any>;
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
    webhooks: new Map(),
    deliveries: new Map(),
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
      return { rows: member ? [{ ...member }] : [], changes: 0 };
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
      return { rows: m ? [{ ...m }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM members WHERE id = ?')) {
      const m = state.members.get(args[0]);
      return { rows: m ? [{ ...m }] : [], changes: 0 };
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
      return { rows: s && !s.deleted_at ? [{ ...s }] : [], changes: 0 };
    }
    if (sql.includes('FROM sellers WHERE owner_member_id = ?')) {
      const ownerId = args[0];
      const found = Array.from(state.sellers.values())
        .filter((s) => s.owner_member_id === ownerId && !s.deleted_at)
        .map((s) => ({ ...s }));
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('SELECT id, name FROM sellers WHERE (id = ? OR slug = ?)')) {
      const found = Array.from(state.sellers.values())
        .filter((s) => (s.id === args[0] || s.slug === args[1]) && s.status === 'ACTIVE')
        .map((s) => ({ ...s }));
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('SELECT id, name, slug FROM sellers WHERE id = ? AND status = "ACTIVE"')) {
      const s = state.sellers.get(args[0]);
      return { rows: s && s.status === 'ACTIVE' && !s.deleted_at ? [{ id: s.id, name: s.name, slug: s.slug }] : [], changes: 0 };
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
      return { rows: p && !p.deleted_at ? [{ ...p }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT id, seller_id, price_core, resell_enabled')) {
      const p = state.products.get(args[0]);
      return { rows: p ? [{ ...p }] : [], changes: 0 };
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
    if (sql.startsWith("UPDATE seller_products SET status = 'PAUSED'") && sql.includes('WHERE id = ?')) {
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
    if (sql.startsWith('INSERT INTO seller_products (') && sql.includes('origin_product_id')) {
      const [
        id, seller_id, game_slug, game_name, name, cover_url, description,
        price_core, original_price_core, ceiling_price_core, warranty_type, warranty_hours,
        delivery_type, low_stock_threshold, product_type, weight_grams, warehouse_address,
        origin_seller_id, origin_product_id, created_at, updated_at,
      ] = args;
      state.products.set(id, {
        id, seller_id, game_slug, game_name, name, cover_url, description,
        price_core, original_price_core, ceiling_price_core, warranty_type, warranty_hours,
        delivery_type, low_stock_threshold, product_type, stock_quantity: 0,
        weight_grams, warehouse_address, status: 'APPROVED',
        is_affiliate: 1, origin_seller_id, origin_product_id,
        resell_enabled: 0, resell_discount_pct: 0, resell_commission_pct: 0, resell_map_price: 0,
        created_at, updated_at, deleted_at: null,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('INSERT INTO seller_products (')) {
      if (sql.includes('industry_id')) {
        const [
          id, seller_id, game_slug, game_name, industry_id, category_name, shop_category, sku,
          name, cover_url, images_json, specs_json, variants_json,
          fulfillment_mode, buyer_note_prompt, is_paused, is_featured,
          description, price_core, original_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, product_type, stock_quantity,
          weight_grams, warehouse_address, status, created_at, updated_at,
        ] = args;
        state.products.set(id, {
          id, seller_id, game_slug, game_name, industry_id, category_name, shop_category, sku,
          name, cover_url, images_json, specs_json, variants_json,
          fulfillment_mode, buyer_note_prompt, is_paused, is_featured,
          description, price_core, original_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, product_type, stock_quantity,
          weight_grams, warehouse_address, status, created_at, updated_at,
          resell_enabled: 0, resell_discount_pct: 0, resell_commission_pct: 0, resell_map_price: 0,
          is_affiliate: 0, origin_seller_id: null, origin_product_id: null, deleted_at: null,
        });
        return { rows: [], changes: 1 };
      }
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
      if (sql.includes('industry_id = ?')) {
        const [
          name, nextIndustryId, nextGameName, nextCategoryName, nextShopCategory, nextSku,
          nextCoverUrl, nextImagesJson, nextSpecsJson, nextVariantsJson,
          resolvedFulfillmentMode, nextBuyerPrompt, nextPaused, nextFeatured,
          description, newPrice, original_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, resolvedProductType, parsedStockQty,
          parsedWeight, cleanWarehouse, newStatus, nowIso, productId,
        ] = args;
        const p = state.products.get(productId);
        if (!p) return { rows: [], changes: 0 };
        if (name !== null) p.name = name;
        p.industry_id = nextIndustryId;
        p.game_name = nextGameName;
        p.category_name = nextCategoryName;
        p.shop_category = nextShopCategory;
        p.sku = nextSku;
        p.cover_url = nextCoverUrl;
        p.images_json = nextImagesJson;
        p.specs_json = nextSpecsJson;
        p.variants_json = nextVariantsJson;
        p.fulfillment_mode = resolvedFulfillmentMode;
        p.buyer_note_prompt = nextBuyerPrompt;
        p.is_paused = nextPaused;
        p.is_featured = nextFeatured;
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
      const found = Array.from(state.partnerships.values())
        .filter((p) => p.supplier_seller_id === args[0] && p.reseller_seller_id === args[1])
        .map((p) => ({ ...p }));
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
    if (sql.includes('FROM seller_affiliate_partnerships sap JOIN sellers s_res ON sap.reseller_seller_id = s_res.id WHERE sap.supplier_seller_id = ?')) {
      const supId = args[0];
      const rows = Array.from(state.partnerships.values())
        .filter((p) => p.supplier_seller_id === supId)
        .map((p) => {
          const resSeller = state.sellers.get(p.reseller_seller_id);
          const activeListingsCount = Array.from(state.listings.values()).filter(
            (l) => l.partnership_id === p.id && l.status === 'ACTIVE'
          ).length;
          return {
            ...p,
            partnership_id: p.id,
            partnership_status: p.status,
            connected_at: p.created_at || '2026-11-27T00:00:00Z',
            reseller_name: resSeller?.name || 'Reseller',
            reseller_slug: resSeller?.slug || p.reseller_seller_id,
            active_listings_count: activeListingsCount,
            total_revenue_core: Array.from(state.orders.values())
              .filter(
                (o) =>
                  o.supplier_seller_id === p.supplier_seller_id &&
                  o.seller_id === p.reseller_seller_id &&
                  Number(o.is_affiliate_order) === 1 &&
                  !o.deleted_at &&
                  o.status === 'COMPLETED'
              )
              .reduce((acc, o) => acc + Number(o.price_core || 0), 0),
            total_orders_count: Array.from(state.orders.values()).filter(
              (o) =>
                o.supplier_seller_id === p.supplier_seller_id &&
                o.seller_id === p.reseller_seller_id &&
                Number(o.is_affiliate_order) === 1 &&
                !o.deleted_at
            ).length,
          };
        });
      return { rows, changes: 0 };
    }
    if (sql.includes('FROM seller_affiliate_partnerships sap JOIN sellers s_sup ON sap.supplier_seller_id = s_sup.id WHERE sap.reseller_seller_id = ?')) {
      const resId = args[0];
      const rows = Array.from(state.partnerships.values())
        .filter((p) => p.reseller_seller_id === resId)
        .map((p) => {
          const supSeller = state.sellers.get(p.supplier_seller_id);
          const activeListingsCount = Array.from(state.listings.values()).filter(
            (l) => l.partnership_id === p.id && l.status === 'ACTIVE'
          ).length;
          return {
            ...p,
            supplier_name: supSeller?.name || 'Supplier',
            supplier_slug: supSeller?.slug || p.supplier_seller_id,
            active_listings_count: activeListingsCount,
          };
        });
      return { rows, changes: 0 };
    }
    if (sql.startsWith('UPDATE seller_affiliate_partnerships SET one_time_raw_key = NULL WHERE id = ?')) {
      const p = state.partnerships.get(args[0]);
      if (p) p.one_time_raw_key = null;
      return { rows: [], changes: p ? 1 : 0 };
    }
    if (sql.startsWith('SELECT supplier_seller_id, status FROM seller_affiliate_partnerships WHERE id = ? AND reseller_seller_id = ?') || sql.startsWith('SELECT id, supplier_seller_id, reseller_seller_id, status FROM seller_affiliate_partnerships WHERE id = ? AND reseller_seller_id = ?')) {
      const p = state.partnerships.get(args[0]);
      return { rows: p && p.reseller_seller_id === args[1] ? [{ ...p }] : [], changes: 0 };
    }
    if (sql.includes('FROM seller_products sp WHERE sp.seller_id = ? AND sp.resell_enabled = 1')) {
      const [resellerSellerId, supplierSellerId] = args;
      const rows = Array.from(state.products.values())
        .filter(
          (sp) =>
            sp.seller_id === supplierSellerId &&
            Number(sp.resell_enabled) === 1 &&
            !sp.is_affiliate &&
            !sp.origin_product_id &&
            sp.status === 'APPROVED' &&
            !sp.deleted_at
        )
        .map((sp) => {
          const digitalCount = Array.from(state.codes.values()).filter(
            (c) => c.product_id === sp.id && c.status === 'IN_STOCK' && !c.deleted_at
          ).length;
          const listed = Array.from(state.listings.values()).find(
            (l) => l.supplier_product_id === sp.id && l.reseller_seller_id === resellerSellerId && l.status === 'ACTIVE'
          );
          return {
            ...sp,
            base_price: sp.price_core,
            digital_stock_count: digitalCount,
            already_listed_id: listed?.id || null,
          };
        });
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM seller_products WHERE id = ? AND seller_id = ? AND resell_enabled = 1')) {
      const p = state.products.get(args[0]);
      return { rows: p && p.seller_id === args[1] && Number(p.resell_enabled) === 1 && !p.deleted_at ? [{ ...p }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT id FROM seller_affiliate_listings WHERE partnership_id = ? AND supplier_product_id = ? AND reseller_seller_id = ?')) {
      const found = Array.from(state.listings.values())
        .filter((l) => l.partnership_id === args[0] && l.supplier_product_id === args[1] && l.reseller_seller_id === args[2] && l.status !== 'HIDDEN')
        .map((l) => ({ ...l }));
      return { rows: found, changes: 0 };
    }
    if (sql.startsWith('INSERT INTO seller_affiliate_listings (')) {
      const [
        id, partnership_id, supplier_seller_id, reseller_seller_id, supplier_product_id,
        reseller_product_id, markup_type, markup_value, price_mode, locked_price,
        show_supplier, created_at, updated_at,
      ] = args;
      state.listings.set(id, {
        id, partnership_id, supplier_seller_id, reseller_seller_id, supplier_product_id,
        reseller_product_id, markup_type, markup_value, price_mode, locked_price,
        show_supplier, status: 'ACTIVE', price_warning: null, created_at, updated_at,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.includes('FROM seller_affiliate_listings sal JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id JOIN seller_products sp_res ON sal.reseller_product_id = sp_res.id WHERE sal.reseller_seller_id = ?') || (sql.includes('FROM seller_affiliate_listings sal JOIN seller_products sp_orig') && sql.includes('WHERE sal.reseller_seller_id = ?'))) {
      const resId = args[0];
      const rows = Array.from(state.listings.values())
        .filter((l) => l.reseller_seller_id === resId && !state.products.get(l.reseller_product_id)?.deleted_at)
        .map((l) => {
          const orig = state.products.get(l.supplier_product_id);
          const resP = state.products.get(l.reseller_product_id);
          const supS = state.sellers.get(l.supplier_seller_id);
          return {
            ...l,
            product_name: orig?.name || '',
            cover_url: orig?.cover_url || '',
            origin_price: orig?.price_core || 0,
            origin_map_price: orig?.resell_map_price || 0,
            resell_discount_pct: orig?.resell_discount_pct || 0,
            resell_commission_pct: orig?.resell_commission_pct || 0,
            my_selling_price: resP?.price_core || 0,
            product_status: resP?.status || 'APPROVED',
            supplier_name: supS?.name || '',
            supplier_slug: supS?.slug || '',
          };
        });
      return { rows, changes: 0 };
    }
    if (sql.includes('FROM seller_affiliate_listings sal JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id WHERE sal.id = ?')) {
      const l = state.listings.get(args[0]);
      if (!l) return { rows: [], changes: 0 };
      const orig = state.products.get(l.supplier_product_id);
      return {
        rows: [
          {
            ...l,
            origin_price: orig?.price_core || 0,
            resell_discount_pct: orig?.resell_discount_pct || 0,
            resell_commission_pct: orig?.resell_commission_pct || 0,
            resell_map_price: orig?.resell_map_price || 0,
            product_type: orig?.product_type || 'digital',
          },
        ],
        changes: 0,
      };
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
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'APPROVED', api_key_hash = ?")) {
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
    if (sql.includes('FROM seller_affiliate_listings sal JOIN seller_products sp_orig') && sql.includes('WHERE sal.supplier_product_id = ?')) {
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
      const found = Array.from(state.listings.values())
        .filter((l) => l.reseller_product_id === args[0])
        .map((l) => ({ ...l }));
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
    if (sql.startsWith("UPDATE seller_affiliate_listings SET status = 'SUPPLIER_DISABLED', updated_at = ? WHERE id = ?")) {
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
      return { rows: found.slice(0, 1).map((c) => ({ ...c })), changes: 0 };
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
      return { rows: o ? [{ ...o }] : [], changes: 0 };
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
        if (sql.includes('shop_qr_group_code')) {
          state.orders.set(args[0], {
            id: args[0],
            order_code: args[1],
            parent_order_id: args[2],
            seller_id: args[6],
            product_id: args[7],
            price_core: args[11],
            payment_method: args[12],
            payment_channel: args[13],
            shop_qr_group_code: args[14],
            product_type: args[15],
            status: 'PENDING_PAYMENT',
            expires_at: args[16],
            is_affiliate_order: args[19],
            affiliate_breakdown: args[20],
            supplier_seller_id: args[21],
            affiliate_wholesale_reserved_core: args[22] || 0,
          });
        } else {
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
        }
      } else if (sql.includes('discount_core')) {
        state.orders.set(args[0], {
          id: args[0],
          order_code: args[1],
          seller_id: args[5],
          product_id: args[6],
          code_id: args[9],
          delivered_code: args[10],
          price_core: args[11],
          discount_core: args[12],
          voucher_code: args[13],
          product_type: args[14],
          status: 'PAID',
          selected_variant_json: args[16],
          buyer_note: args[17],
          supplier_seller_id: args[18],
          is_affiliate_order: args[19],
          affiliate_breakdown: args[20],
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

    // --- Mảnh 2 Mock Handlers: Admin Affiliate, Seller Webhooks & Seller Affiliate Orders ---
    // Active sellers list for Admin GET /api/admin/affiliate
    if (sql.startsWith("SELECT id, name, slug, status FROM sellers WHERE deleted_at IS NULL AND status IN ('ACTIVE', 'TRIAL')")) {
      const rows = Array.from(state.sellers.values())
        .filter((s) => !s.deleted_at && (s.status === 'ACTIVE' || s.status === 'TRIAL'))
        .map((s) => ({ id: s.id, name: s.name, slug: s.slug, status: s.status }));
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT id, name, status FROM sellers WHERE id = ? AND deleted_at IS NULL')) {
      const s = state.sellers.get(args[0]);
      return { rows: s && !s.deleted_at ? [{ id: s.id, name: s.name, status: s.status }] : [], changes: 0 };
    }

    // Admin GET partnerships (selective projection)
    if (sql.startsWith('SELECT sap.id, sap.supplier_seller_id, sap.reseller_seller_id, sap.status')) {
      const rows = Array.from(state.partnerships.values()).map((p) => {
        const sup = state.sellers.get(p.supplier_seller_id);
        const res = state.sellers.get(p.reseller_seller_id);
        const activeListings = Array.from(state.listings.values()).filter(
          (l) => l.partnership_id === p.id && l.status === 'ACTIVE'
        ).length;
        return {
          id: p.id,
          supplier_seller_id: p.supplier_seller_id,
          reseller_seller_id: p.reseller_seller_id,
          status: p.status,
          api_key_prefix: p.api_key_prefix || '',
          created_at: p.created_at || '2026-11-26T00:00:00Z',
          updated_at: p.updated_at || '2026-11-26T00:00:00Z',
          revoked_at: p.revoked_at ?? null,
          supplier_name: sup?.name || '',
          supplier_slug: sup?.slug || '',
          reseller_name: res?.name || '',
          reseller_slug: res?.slug || '',
          active_listings_count: activeListings,
        };
      });
      return { rows, changes: 0 };
    }

    // Admin GET listings
    if (sql.startsWith('SELECT sal.id, sal.partnership_id, sal.supplier_seller_id')) {
      const rows = Array.from(state.listings.values()).map((l) => {
        const orig = state.products.get(l.supplier_product_id);
        const resProd = state.products.get(l.reseller_product_id);
        const sup = state.sellers.get(l.supplier_seller_id);
        const res = state.sellers.get(l.reseller_seller_id);
        return {
          ...l,
          product_name: orig?.name || '',
          cover_url: orig?.cover_url || '',
          product_type: orig?.product_type || 'digital',
          origin_price: orig?.price_core || 0,
          origin_stock_quantity: orig?.stock_quantity || 0,
          resell_map_price: orig?.resell_map_price || 0,
          resell_discount_pct: orig?.resell_discount_pct || 0,
          resell_commission_pct: orig?.resell_commission_pct || 0,
          selling_price: resProd?.price_core || 0,
          reseller_product_status: resProd?.status || 'APPROVED',
          supplier_name: sup?.name || '',
          reseller_name: res?.name || '',
        };
      });
      return { rows, changes: 0 };
    }

    // Admin PATCH partnership lookup & updates
    if (sql.startsWith('SELECT id, supplier_seller_id, reseller_seller_id, status, api_key_hash, api_key_prefix FROM seller_affiliate_partnerships WHERE id = ?')) {
      const p = state.partnerships.get(args[0]);
      return { rows: p ? [{ ...p }] : [], changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'APPROVED', revoked_at = NULL")) {
      const [updatedAt, id] = args;
      const p = state.partnerships.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'APPROVED';
      p.revoked_at = null;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'SUSPENDED'")) {
      const id = args[args.length - 1];
      const updatedAt = args[args.length - 2];
      const revokedAt = args.length >= 3 ? args[0] : null;
      const p = state.partnerships.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'SUSPENDED';
      p.revoked_at = sql.includes('COALESCE') ? (p.revoked_at ?? revokedAt ?? null) : revokedAt;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'REVOKED'")) {
      const [revokedAt, updatedAt, id] = args;
      const p = state.partnerships.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'REVOKED';
      p.api_key_hash = '';
      p.one_time_raw_key = null;
      p.revoked_at = revokedAt;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_partnerships SET status = 'REJECTED'")) {
      const [updatedAt, id] = args;
      const p = state.partnerships.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.status = 'REJECTED';
      p.one_time_raw_key = null;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }

    // Admin cascade listings & products on SUSPEND / REVOKE / RESTORE
    if (sql.startsWith("SELECT id, reseller_product_id FROM seller_affiliate_listings WHERE partnership_id = ? AND status = 'SUPPLIER_DISABLED' AND price_warning = ?")) {
      const [partnershipId, warning] = args;
      const rows = Array.from(state.listings.values())
        .filter((l) => l.partnership_id === partnershipId && l.status === 'SUPPLIER_DISABLED' && l.price_warning === warning)
        .map((l) => ({ id: l.id, reseller_product_id: l.reseller_product_id }));
      return { rows, changes: 0 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_listings SET status = 'ACTIVE', price_warning = NULL")) {
      const [updatedAt, id, partnershipId, warning] = args;
      const l = state.listings.get(id);
      if (!l || l.partnership_id !== partnershipId || l.price_warning !== warning) return { rows: [], changes: 0 };
      l.status = 'ACTIVE';
      l.price_warning = null;
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_products SET status = 'APPROVED', updated_at = ? WHERE id = ? AND status = 'PAUSED'")) {
      const [updatedAt, id] = args;
      const p = state.products.get(id);
      if (!p || p.status !== 'PAUSED') return { rows: [], changes: 0 };
      p.status = 'APPROVED';
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith("UPDATE seller_affiliate_listings SET status = 'SUPPLIER_DISABLED', price_warning = ?")) {
      const [warning, updatedAt, partnershipId] = args;
      let changed = 0;
      for (const l of state.listings.values()) {
        if (l.partnership_id === partnershipId && l.status !== 'HIDDEN') {
          l.status = 'SUPPLIER_DISABLED';
          l.price_warning = warning;
          l.updated_at = updatedAt;
          changed++;
        }
      }
      return { rows: [], changes: changed };
    }
    if (sql.startsWith("UPDATE seller_products SET status = 'PAUSED', updated_at = ? WHERE id IN ( SELECT reseller_product_id FROM seller_affiliate_listings WHERE partnership_id = ? )")) {
      const [updatedAt, partnershipId] = args;
      const targetIds = new Set(
        Array.from(state.listings.values())
          .filter((l) => l.partnership_id === partnershipId)
          .map((l) => l.reseller_product_id)
      );
      let changed = 0;
      for (const p of state.products.values()) {
        if (targetIds.has(p.id) && p.status === 'APPROVED') {
          p.status = 'PAUSED';
          p.updated_at = updatedAt;
          changed++;
        }
      }
      return { rows: [], changes: changed };
    }

    // Admin PATCH listing lookup & updates
    if (sql.startsWith('SELECT sal.*, sp_orig.price_core AS origin_price')) {
      const l = state.listings.get(args[0]);
      if (!l) return { rows: [], changes: 0 };
      const orig = state.products.get(l.supplier_product_id);
      if (!orig) return { rows: [], changes: 0 };
      return {
        rows: [
          {
            ...l,
            origin_price: orig.price_core,
            resell_discount_pct: orig.resell_discount_pct,
            resell_commission_pct: orig.resell_commission_pct,
            resell_map_price: orig.resell_map_price,
            product_type: orig.product_type,
          },
        ],
        changes: 0,
      };
    }
    if (sql.startsWith('UPDATE seller_affiliate_listings SET markup_type = ?') && sql.includes('price_warning = NULL')) {
      const [markupType, markupValue, priceMode, lockedPrice, showSupplier, updatedAt, id] = args;
      const l = state.listings.get(id);
      if (!l) return { rows: [], changes: 0 };
      l.markup_type = markupType;
      l.markup_value = markupValue;
      l.price_mode = priceMode;
      l.locked_price = lockedPrice;
      l.show_supplier = showSupplier;
      l.price_warning = null;
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_affiliate_listings SET markup_type = ?')) {
      const [markupType, markupValue, priceMode, lockedPrice, showSupplier, status, priceWarning, updatedAt, id] = args;
      const l = state.listings.get(id);
      if (!l) return { rows: [], changes: 0 };
      l.markup_type = markupType;
      l.markup_value = markupValue;
      l.price_mode = priceMode;
      l.locked_price = lockedPrice;
      l.show_supplier = showSupplier;
      l.status = status;
      l.price_warning = priceWarning;
      l.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE seller_products SET price_core = ?, status = ?, updated_at = ? WHERE id = ?')) {
      const [priceCore, status, updatedAt, id] = args;
      const p = state.products.get(id);
      if (!p) return { rows: [], changes: 0 };
      p.price_core = priceCore;
      p.status = status;
      p.updated_at = updatedAt;
      return { rows: [], changes: 1 };
    }

    // Seller Webhooks (supplier_fulfillment_webhooks & supplier_fulfillment_deliveries)
    if (sql.startsWith('INSERT INTO supplier_fulfillment_webhooks')) {
      const [id, seller_id, name, webhook_url, encrypted_hmac_secret, secret_prefix, events_json, is_active, timeout_ms, retry_max, created_at, updated_at] = args;
      state.webhooks.set(id, {
        id, seller_id, name, webhook_url, encrypted_hmac_secret, secret_prefix,
        events_json, is_active, timeout_ms, retry_max, created_at, updated_at,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.includes('FROM supplier_fulfillment_webhooks WHERE id = ? AND seller_id = ?')) {
      const w = state.webhooks.get(args[0]);
      if (!w || w.seller_id !== args[1]) return { rows: [], changes: 0 };
      const { encrypted_hmac_secret: _enc, ...safe } = w;
      return { rows: [safe], changes: 0 };
    }
    if (sql.startsWith('SELECT id, seller_id, name FROM supplier_fulfillment_webhooks WHERE id = ?') || sql.startsWith('SELECT id, seller_id FROM supplier_fulfillment_webhooks WHERE id = ?')) {
      const w = state.webhooks.get(args[0]);
      return { rows: w ? [{ id: w.id, seller_id: w.seller_id, name: w.name }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM supplier_fulfillment_webhooks WHERE id = ?')) {
      const w = state.webhooks.get(args[0]);
      return { rows: w ? [{ ...w }] : [], changes: 0 };
    }
    if (sql.includes('FROM supplier_fulfillment_webhooks WHERE seller_id = ?')) {
      const rows = Array.from(state.webhooks.values())
        .filter((w) => w.seller_id === args[0])
        .map((w) => {
          const { encrypted_hmac_secret: _enc, ...safe } = w;
          return safe;
        });
      return { rows, changes: 0 };
    }
    if (sql.includes('FROM supplier_fulfillment_webhooks WHERE seller_id IN')) {
      if (sql.includes('AND id = ?')) {
        const targetWebhookId = args[args.length - 1];
        const sellerSet = new Set(args.slice(0, -1));
        const rows = Array.from(state.webhooks.values())
          .filter((w) => sellerSet.has(w.seller_id) && w.id === targetWebhookId)
          .map((w) => ({ ...w }));
        return { rows, changes: 0 };
      }
      const sellerSet = new Set(args);
      const rows = Array.from(state.webhooks.values())
        .filter((w) => sellerSet.has(w.seller_id) && Number(w.is_active) === 1)
        .map((w) => ({ ...w }));
      return { rows, changes: 0 };
    }
    if (sql.startsWith('UPDATE supplier_fulfillment_webhooks SET')) {
      const id = args[args.length - 2];
      const sellerId = args[args.length - 1];
      const w = state.webhooks.get(id);
      if (!w || w.seller_id !== sellerId) return { rows: [], changes: 0 };
      const setClause = sql.slice('UPDATE supplier_fulfillment_webhooks SET '.length, sql.indexOf(' WHERE '));
      const cols = setClause.split(',').map((part) => part.trim().split('=')[0].trim());
      cols.forEach((col, idx) => {
        w[col] = args[idx];
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('DELETE FROM supplier_fulfillment_webhooks WHERE id = ? AND seller_id = ?')) {
      const w = state.webhooks.get(args[0]);
      if (!w || w.seller_id !== args[1]) return { rows: [], changes: 0 };
      state.webhooks.delete(args[0]);
      return { rows: [], changes: 1 };
    }

    // supplier_fulfillment_deliveries
    if (sql.startsWith('INSERT INTO supplier_fulfillment_deliveries')) {
      let id: any, webhook_id: any, seller_id: any, order_id: any, order_code: any, event_type: any,
        request_payload_json: any, http_status: any, response_snippet: any, attempts: any,
        delivery_status: any, external_fulfillment_ref: any, error_message: any, created_at: any, delivered_at: any;
      if (args.length >= 15) {
        [id, webhook_id, seller_id, order_id, order_code, event_type, request_payload_json, http_status, response_snippet, attempts, delivery_status, external_fulfillment_ref, error_message, created_at, delivered_at] = args;
      } else {
        [id, webhook_id, seller_id, order_id, order_code, event_type, request_payload_json, http_status, response_snippet, delivery_status, external_fulfillment_ref, error_message, created_at, delivered_at] = args;
        attempts = 1;
      }
      state.deliveries.set(id, {
        id, webhook_id, seller_id, order_id, order_code, event_type, request_payload_json,
        http_status, response_snippet, attempts, delivery_status, external_fulfillment_ref,
        error_message, created_at, delivered_at,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT id, seller_id FROM supplier_fulfillment_deliveries WHERE id = ?')) {
      const d = state.deliveries.get(args[0]);
      return { rows: d ? [{ id: d.id, seller_id: d.seller_id }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM supplier_fulfillment_deliveries WHERE id = ?')) {
      const d = state.deliveries.get(args[0]);
      return { rows: d ? [{ ...d }] : [], changes: 0 };
    }
    if (sql.includes('FROM supplier_fulfillment_deliveries d')) {
      const sellerId = args[0];
      const webhookIdFilter = sql.includes('AND d.webhook_id = ?') ? args[1] : null;
      const rows = Array.from(state.deliveries.values())
        .filter((d) => d.seller_id === sellerId && (!webhookIdFilter || d.webhook_id === webhookIdFilter))
        .map((d) => {
          const w = state.webhooks.get(d.webhook_id);
          return { ...d, webhook_name: w?.name || '', webhook_url: w?.webhook_url || '' };
        });
      return { rows, changes: 0 };
    }
    if (sql.startsWith('UPDATE supplier_fulfillment_deliveries SET')) {
      const deliveryId = args[args.length - 1];
      const d = state.deliveries.get(deliveryId);
      if (!d) return { rows: [], changes: 0 };
      d.http_status = args[0];
      d.response_snippet = args[1];
      d.delivery_status = args[2];
      d.error_message = args[3];
      if (args.length >= 6) d.delivered_at = args[4];
      d.attempts = (Number(d.attempts) || 0) + 1;
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('DELETE FROM supplier_fulfillment_deliveries WHERE webhook_id = ? AND seller_id = ?')) {
      let deleted = 0;
      for (const [k, d] of state.deliveries.entries()) {
        if (d.webhook_id === args[0] && d.seller_id === args[1]) {
          state.deliveries.delete(k);
          deleted++;
        }
      }
      return { rows: [], changes: deleted };
    }

    // Seller Affiliate Orders Ledger (GET /api/seller/affiliate/orders)
    if (sql.startsWith('SELECT so.id, so.order_code, so.seller_id, so.supplier_seller_id')) {
      let rows = Array.from(state.orders.values()).filter(
        (o) => Number(o.is_affiliate_order) === 1 && !o.deleted_at
      );
      let argIdx = 0;
      if (sql.includes('AND so.supplier_seller_id = ?')) {
        const sid = args[argIdx++];
        rows = rows.filter((o) => o.supplier_seller_id === sid);
      } else if (sql.includes('AND so.seller_id = ?')) {
        const sid = args[argIdx++];
        rows = rows.filter((o) => o.seller_id === sid);
      } else if (sql.includes('AND (so.supplier_seller_id = ? OR so.seller_id = ?)')) {
        const s1 = args[argIdx++];
        const s2 = args[argIdx++];
        rows = rows.filter((o) => o.supplier_seller_id === s1 || o.seller_id === s2);
      }
      if (sql.includes('AND so.status = ?')) {
        const st = args[argIdx++];
        rows = rows.filter((o) => o.status === st);
      }
      const mapped = rows.map((o) => {
        const sup = state.sellers.get(o.supplier_seller_id);
        const res = state.sellers.get(o.seller_id);
        return {
          id: o.id,
          order_code: o.order_code,
          seller_id: o.seller_id,
          supplier_seller_id: o.supplier_seller_id,
          product_id: o.product_id,
          product_name: o.product_name || 'Product',
          product_type: o.product_type || 'digital',
          price_core: o.price_core || 0,
          payment_method: o.payment_method || 'CORE',
          status: o.status,
          hold_until: o.hold_until || null,
          released_at: o.released_at || null,
          fee_core: o.fee_core || 0,
          refund_core: o.refund_core || 0,
          affiliate_breakdown: o.affiliate_breakdown || null,
          created_at: o.created_at || '2026-11-26T00:00:00Z',
          updated_at: o.updated_at || '2026-11-26T00:00:00Z',
          supplier_name: sup?.name || '',
          reseller_name: res?.name || '',
        };
      });
      return { rows: mapped, changes: 0 };
    }
    if (sql.includes('FROM supplier_webhooks') || sql.startsWith('INSERT INTO admin_audit_logs') || sql.startsWith('SELECT * FROM seller_orders WHERE status =')) {
      return { rows: [], changes: 0 };
    }

    return { rows: [], changes: 0 };
  }

  const cloneRows = (rows: any[]) =>
    rows.map((r) => (r && typeof r === 'object' ? { ...r } : r));

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
          const cloned = cloneRows(res.rows);
          return (cloned[0] ?? null) as T | null;
        },
        async all<T = any>() {
          const res = runStatement(sql, boundArgs);
          return { results: cloneRows(res.rows) as T[], success: true, meta: { changes: res.changes } };
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
        results.push({ success: true, results: cloneRows(res.rows), meta: { changes: res.changes } });
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

  await test('13. Admin GET /api/admin/affiliate (selective projection & KPI) & PATCH PENDING_ADMIN -> APPROVED (issues wcg_shop_ key + affiliate_enabled guard)', async () => {
    const db = createMockDb();
    const adminEnv = { DB: db, ADMIN_API_KEY: 'admin_master_test_key_2026_secure' };

    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });
    db.state.partnerships.set('sap_wait', {
      id: 'sap_wait',
      supplier_seller_id: 'sel_a',
      reseller_seller_id: 'sel_b',
      status: 'PENDING_ADMIN',
      api_key_hash: 'secret_hash_must_never_leak',
      api_key_prefix: '',
      one_time_raw_key: 'wcg_shop_must_never_leak_raw',
      revoked_at: '2026-01-01T00:00:00Z',
    });

    // Unauthenticated must return 401
    const unauthRes = await handleAdminAffiliateRequest({
      request: new Request('https://admin.example.com/api/admin/affiliate', { method: 'GET' }),
      env: adminEnv,
    });
    assert.equal(unauthRes.status, 401);

    // Authenticated GET returns KPIs & strips api_key_hash / one_time_raw_key
    const getRes = await handleAdminAffiliateRequest({
      request: new Request('https://admin.example.com/api/admin/affiliate', {
        method: 'GET',
        headers: { 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
      }),
      env: adminEnv,
    });
    assert.equal(getRes.status, 200);
    const getData: any = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.kpis.pending_admin_count, 1);
    assert.equal(getData.partnerships.length, 1);
    assert.equal('api_key_hash' in getData.partnerships[0], false);
    assert.equal('one_time_raw_key' in getData.partnerships[0], false);

    // If affiliate_enabled=false -> Admin PATCH APPROVED blocked with 403 AFFILIATE_DISABLED
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_enabled: false,
    }));
    const disabledRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships/sap_wait', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ status: 'APPROVED' }),
        }),
        env: adminEnv,
      },
      ['partnerships', 'sap_wait']
    );
    assert.equal(disabledRes.status, 403);
    assert.equal(((await disabledRes.json()) as any).code, 'AFFILIATE_DISABLED');

    // Re-enable affiliate -> Admin approves PENDING_ADMIN -> APPROVED & rotates/issues Pair Key
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({ ...DEFAULT_MARKETPLACE_CONFIG, affiliate_enabled: true }));
    db.state.partnerships.get('sap_wait').api_key_hash = '';
    const approveRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships/sap_wait', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ status: 'APPROVED' }),
        }),
        env: adminEnv,
      },
      ['partnerships', 'sap_wait']
    );
    assert.equal(approveRes.status, 200);
    const saved = db.state.partnerships.get('sap_wait');
    assert.equal(saved.status, 'APPROVED');
    assert.equal(saved.revoked_at, null);
    assert.equal(saved.api_key_hash.length, 64);
    assert.ok(String(saved.one_time_raw_key).startsWith('wcg_shop_'));
  });

  await test('14. Admin SUSPENDED/REVOKED cascades listings with ADMIN_SUSPENDED/PARTNERSHIP_REVOKED & APPROVED restores only matching partnership', async () => {
    const db = createMockDb();
    const adminEnv = { DB: db, ADMIN_API_KEY: 'admin_master_test_key_2026_secure' };

    db.state.partnerships.set('sap_live', {
      id: 'sap_live',
      supplier_seller_id: 'sel_a',
      reseller_seller_id: 'sel_b',
      status: 'APPROVED',
      api_key_hash: 'a'.repeat(64),
      api_key_prefix: 'wcg_shop_aaaa••••bbbb',
      one_time_raw_key: null,
      revoked_at: null,
    });
    db.state.products.set('prod_res_1', { id: 'prod_res_1', seller_id: 'sel_b', status: 'APPROVED', price_core: 200 });
    db.state.products.set('prod_unrelated_paused', { id: 'prod_unrelated_paused', seller_id: 'sel_b', status: 'PAUSED', price_core: 300 });
    db.state.listings.set('sal_live', {
      id: 'sal_live',
      partnership_id: 'sap_live',
      supplier_seller_id: 'sel_a',
      reseller_seller_id: 'sel_b',
      supplier_product_id: 'prod_orig_1',
      reseller_product_id: 'prod_res_1',
      status: 'ACTIVE',
      price_warning: null,
    });

    // 14a. SUSPEND -> cascades ADMIN_SUSPENDED + PAUSED
    const suspRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships/sap_live', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ status: 'SUSPENDED' }),
        }),
        env: adminEnv,
      },
      ['partnerships', 'sap_live']
    );
    assert.equal(suspRes.status, 200);
    assert.equal(db.state.partnerships.get('sap_live').status, 'SUSPENDED');
    assert.equal(db.state.listings.get('sal_live').status, 'SUPPLIER_DISABLED');
    assert.equal(db.state.listings.get('sal_live').price_warning, ADMIN_SUSPENDED_WARNING);
    assert.equal(db.state.products.get('prod_res_1').status, 'PAUSED');

    // 14b. Re-APPROVE -> restores sal_live & prod_res_1 ONLY, keeps unrelated PAUSED product untouched
    const restoreRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships/sap_live', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ status: 'APPROVED' }),
        }),
        env: adminEnv,
      },
      ['partnerships', 'sap_live']
    );
    assert.equal(restoreRes.status, 200);
    assert.equal(db.state.partnerships.get('sap_live').status, 'APPROVED');
    assert.equal(db.state.partnerships.get('sap_live').revoked_at, null);
    assert.equal(db.state.listings.get('sal_live').status, 'ACTIVE');
    assert.equal(db.state.listings.get('sal_live').price_warning, null);
    assert.equal(db.state.products.get('prod_res_1').status, 'APPROVED');
    assert.equal(db.state.products.get('prod_unrelated_paused').status, 'PAUSED');

    // 14c. REVOKE -> wipes key hash & sets PARTNERSHIP_REVOKED
    const revRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships/sap_live', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ status: 'REVOKED' }),
        }),
        env: adminEnv,
      },
      ['partnerships', 'sap_live']
    );
    assert.equal(revRes.status, 200);
    assert.equal(db.state.partnerships.get('sap_live').status, 'REVOKED');
    assert.equal(db.state.partnerships.get('sap_live').api_key_hash, '');
    assert.equal(db.state.listings.get('sal_live').status, 'SUPPLIER_DISABLED');
    assert.equal(db.state.listings.get('sal_live').price_warning, PARTNERSHIP_REVOKED_WARNING);
    assert.equal(db.state.products.get('prod_res_1').status, 'PAUSED');
  });

  await test('15. Admin POST /api/admin/affiliate/partnerships & PATCH /api/admin/affiliate/listings/:id', async () => {
    const db = createMockDb();
    const adminEnv = { DB: db, ADMIN_API_KEY: 'admin_master_test_key_2026_secure' };
    db.state.sellers.set('sel_a', { id: 'sel_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });

    // Disabled global affiliate_enabled=false -> POST blocked 403 AFFILIATE_DISABLED
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_enabled: false,
    }));
    const disabledCreateRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b' }),
        }),
        env: adminEnv,
      },
      ['partnerships']
    );
    assert.equal(disabledCreateRes.status, 403);
    assert.equal(((await disabledCreateRes.json()) as any).code, 'AFFILIATE_DISABLED');
    // Restore affiliate_enabled=true for remaining cases in Test 15
    db.state.settings.set('wcg_marketplace_config_v1', JSON.stringify({
      ...DEFAULT_MARKETPLACE_CONFIG,
      affiliate_enabled: true,
    }));

    // Self-loop blocked 400
    const selfRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_a' }),
        }),
        env: adminEnv,
      },
      ['partnerships']
    );
    assert.equal(selfRes.status, 400);

    // Valid direct creation -> 201 APPROVED
    const okCreate = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b' }),
        }),
        env: adminEnv,
      },
      ['partnerships']
    );
    assert.equal(okCreate.status, 201);

    // Duplicate APPROVED blocked 409
    const dupRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/partnerships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ supplier_seller_id: 'sel_a', reseller_seller_id: 'sel_b' }),
        }),
        env: adminEnv,
      },
      ['partnerships']
    );
    assert.equal(dupRes.status, 409);

    // PATCH listing updates markup, enforces MAP, clears ANTI_LOSS_PAUSED & restores seller_products
    db.state.products.set('prod_sup', { id: 'prod_sup', seller_id: 'sel_a', price_core: 1000, resell_map_price: 1250, resell_discount_pct: 5, resell_commission_pct: 5, product_type: 'digital' });
    db.state.products.set('prod_res', { id: 'prod_res', seller_id: 'sel_b', price_core: 900, status: 'PAUSED' });
    db.state.listings.set('sal_edit', {
      id: 'sal_edit',
      partnership_id: 'sap_any',
      supplier_seller_id: 'sel_a',
      reseller_seller_id: 'sel_b',
      supplier_product_id: 'prod_sup',
      reseller_product_id: 'prod_res',
      markup_type: 'PERCENT',
      markup_value: 5,
      price_mode: 'FORMULA',
      locked_price: null,
      show_supplier: 1,
      status: 'HIDDEN',
      price_warning: 'ANTI_LOSS_PAUSED',
    });

    const patchListRes = await handleAdminAffiliateRequest(
      {
        request: new Request('https://admin.example.com/api/admin/affiliate/listings/sal_edit', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminEnv.ADMIN_API_KEY },
          body: JSON.stringify({ markup_type: 'PERCENT', markup_value: 10, status: 'ACTIVE', clear_warning: true }),
        }),
        env: adminEnv,
      },
      ['listings', 'sal_edit']
    );
    assert.equal(patchListRes.status, 200);
    const patchListJson: any = await patchListRes.json();
    // Base 1000 + 10% = 1100 < MAP 1250 -> MAP enforces 1250!
    assert.equal(patchListJson.listing.selling_price, 1250);
    assert.equal(patchListJson.listing.is_map_enforced, true);
    assert.equal(db.state.products.get('prod_res').price_core, 1250);
    assert.equal(db.state.products.get('prod_res').status, 'APPROVED');
    assert.equal(db.state.listings.get('sal_edit').price_warning, null);
  });

  await test('16. Seller Self-Service Webhooks: tenant isolation (403 cross-shop), SSRF, fail-closed, events mapping & webhookId test', async () => {
    const db = createMockDb();
    const envWithKey = { DB: db, MARKETPLACE_CODE_KEY: 'seller_webhook_aes_key_32bytes_ok!' };
    const envNoKey = { DB: db };

    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.members.set('mem_b', { id: 'mem_b', username: 'shopb', email: 'b@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 'sa', member_id: 'mem_a' });
    db.state.sessions.set('tok_b', { id: 'sb', member_id: 'mem_b' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });

    // SSRF blocked 400
    for (const badUrl of ['http://hooks.example.com/cb', 'https://127.0.0.1/cb', 'https://169.254.169.254/latest']) {
      const ssrfRes = await handleSellerWebhooksRequest({
        request: new Request('https://shop.example.com/api/seller/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
          body: JSON.stringify({ name: 'Bad', webhook_url: badUrl }),
        }),
        env: envWithKey,
      });
      assert.equal(ssrfRes.status, 400);
    }

    // Fail-closed 500 when encryption key missing
    const noKeyRes = await handleSellerWebhooksRequest({
      request: new Request('https://shop.example.com/api/seller/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({ name: 'NoKey', webhook_url: 'https://hooks.example.com/order' }),
      }),
      env: envNoKey,
    });
    assert.equal(noKeyRes.status, 500);

    // Shop A creates disabled webhook (is_active: false) trying to spoof seller_id: 'sel_b' -> forced to 'sel_a'!
    const createRes = await handleSellerWebhooksRequest({
      request: new Request('https://shop.example.com/api/seller/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          seller_id: 'sel_b',
          name: 'Shop A Inactive Hook',
          webhook_url: 'https://hooks.example.com/shop-a',
          events: ['order.paid', 'order.refunded'],
          is_active: false,
        }),
      }),
      env: envWithKey,
    });
    assert.equal(createRes.status, 201);
    const createdJson: any = await createRes.json();
    const hookId = createdJson.webhook.id;
    assert.equal(createdJson.webhook.seller_id, 'sel_a');
    assert.deepEqual(createdJson.webhook.events, ['order.paid', 'order.refunded']);
    assert.equal('encrypted_hmac_secret' in createdJson.webhook, false);
    assert.ok(String(createdJson.raw_hmac_secret).length >= 16);

    // Shop A also creates a second active sibling hook -> testing hookId must ONLY call hookId (even though is_active=0!)
    const createRes2 = await handleSellerWebhooksRequest({
      request: new Request('https://shop.example.com/api/seller/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          name: 'Shop A Active Sibling',
          webhook_url: 'https://hooks.example.com/sibling',
          is_active: true,
        }),
      }),
      env: envWithKey,
    });
    assert.equal(createRes2.status, 201);

    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = async (input: any) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const pingRes = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${hookId}/test`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_a' },
        }),
        env: envWithKey,
        fetchImpl: mockFetch,
      },
      [hookId, 'test']
    );
    assert.equal(pingRes.status, 200);
    const pingJson: any = await pingRes.json();
    assert.equal(pingJson.totalMatched, 1);
    assert.equal(pingJson.delivered, 1);
    assert.deepEqual(calledUrls, ['https://hooks.example.com/shop-a']); // ONLY targeted inactive webhook fired, NOT sibling!

    const deliveryId = pingJson.deliveryIds[0];

    // Cross-tenant isolation: Shop B CANNOT list, patch, delete, test, or retry Shop A's webhook/delivery
    const getB = await handleSellerWebhooksRequest({
      request: new Request('https://shop.example.com/api/seller/webhooks', {
        method: 'GET',
        headers: { Authorization: 'Bearer tok_b' },
      }),
      env: envWithKey,
    });
    assert.equal(getB.status, 200);
    const getBJson: any = await getB.json();
    assert.equal(getBJson.webhooks.length, 0);
    assert.equal(getBJson.deliveries.length, 0);

    const patchB = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${hookId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_b' },
          body: JSON.stringify({ name: 'Hijacked' }),
        }),
        env: envWithKey,
      },
      [hookId]
    );
    assert.equal(patchB.status, 403);

    const testB = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${hookId}/test`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_b' },
        }),
        env: envWithKey,
        fetchImpl: mockFetch,
      },
      [hookId, 'test']
    );
    assert.equal(testB.status, 403);

    const retryB = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/deliveries/${deliveryId}/retry`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_b' },
        }),
        env: envWithKey,
        fetchImpl: mockFetch,
      },
      ['deliveries', deliveryId, 'retry']
    );
    assert.equal(retryB.status, 403);

    const delB = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${hookId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer tok_b' },
        }),
        env: envWithKey,
      },
      [hookId]
    );
    assert.equal(delB.status, 403);
    assert.ok(db.state.webhooks.has(hookId));
  });

  await test('17. GET /api/seller/affiliate/orders: 3-way payout breakdown, full escrow_status mapping & zero code/email leakage', async () => {
    const db = createMockDb();
    db.state.members.set('mem_a', { id: 'mem_a', username: 'shopa', email: 'a@example.com', status: 'ACTIVE' });
    db.state.members.set('mem_b', { id: 'mem_b', username: 'shopb', email: 'b@example.com', status: 'ACTIVE' });
    db.state.members.set('mem_c', { id: 'mem_c', username: 'shopc', email: 'c@example.com', status: 'ACTIVE' });
    db.state.sessions.set('tok_a', { id: 'sa', member_id: 'mem_a' });
    db.state.sessions.set('tok_b', { id: 'sb', member_id: 'mem_b' });
    db.state.sessions.set('tok_c', { id: 'sc', member_id: 'mem_c' });
    db.state.sellers.set('sel_a', { id: 'sel_a', owner_member_id: 'mem_a', name: 'Shop A', slug: 'shop-a', status: 'ACTIVE' });
    db.state.sellers.set('sel_b', { id: 'sel_b', owner_member_id: 'mem_b', name: 'Shop B', slug: 'shop-b', status: 'ACTIVE' });
    db.state.sellers.set('sel_c', { id: 'sel_c', owner_member_id: 'mem_c', name: 'Shop C', slug: 'shop-c', status: 'ACTIVE' });

    const splitJson = JSON.stringify({
      basePrice: 1000,
      sellingPrice: 1200,
      markupAmount: 200,
      discountAmount: 50,
      commissionAmount: 50,
      platformFee: 30,
      feeRatePct: 3,
      supplierPayout: 870,
      resellerPayout: 300,
      shippingFee: 0,
    });

    db.state.orders.set('sord_held', {
      id: 'sord_held',
      order_code: 'CGM-HELD',
      seller_id: 'sel_b',
      supplier_seller_id: 'sel_a',
      product_id: 'p_res',
      product_name: 'Pack Held',
      product_type: 'digital',
      price_core: 1200,
      status: 'PAID',
      released_at: null,
      delivered_code: 'SECRET-CODE-DO-NOT-LEAK',
      buyer_email: 'buyer@secret.com',
      is_affiliate_order: 1,
      affiliate_breakdown: splitJson,
    });
    db.state.orders.set('sord_rel', {
      id: 'sord_rel',
      order_code: 'CGM-REL',
      seller_id: 'sel_b',
      supplier_seller_id: 'sel_a',
      product_id: 'p_res',
      product_name: 'Pack Released',
      product_type: 'digital',
      price_core: 1200,
      status: 'COMPLETED',
      released_at: '2026-11-26T10:00:00Z',
      delivered_code: 'SECRET-CODE-2',
      buyer_email: 'buyer2@secret.com',
      is_affiliate_order: 1,
      affiliate_breakdown: splitJson,
    });
    db.state.orders.set('sord_disp', {
      id: 'sord_disp',
      order_code: 'CGM-DISP',
      seller_id: 'sel_b',
      supplier_seller_id: 'sel_a',
      product_id: 'p_res',
      product_name: 'Pack Disputed',
      product_type: 'digital',
      price_core: 1200,
      status: 'REPORTED',
      released_at: null,
      is_affiliate_order: 1,
      affiliate_breakdown: splitJson,
    });
    db.state.orders.set('sord_ref', {
      id: 'sord_ref',
      order_code: 'CGM-REF',
      seller_id: 'sel_b',
      supplier_seller_id: 'sel_a',
      product_id: 'p_res',
      product_name: 'Pack Refunded',
      product_type: 'digital',
      price_core: 1200,
      status: 'RESOLVED_BUYER_REFUND',
      released_at: null,
      is_affiliate_order: 1,
      affiliate_breakdown: splitJson,
    });

    // Shop A (supplier)
    const resSup = await getSellerAffiliateOrders({
      request: new Request('https://shop.example.com/api/seller/affiliate/orders?role=supplier', {
        headers: { Authorization: 'Bearer tok_a' },
      }),
      env: { DB: db },
    });
    assert.equal(resSup.status, 200);
    const dataSup: any = await resSup.json();
    assert.equal(dataSup.orders.length, 4);
    assert.equal(dataSup.orders.every((o: any) => o.my_role === 'SUPPLIER' && o.my_payout_core === 870), true);
    assert.equal(dataSup.orders.every((o: any) => !('delivered_code' in o) && !('buyer_email' in o)), true);
    const byCode = Object.fromEntries(dataSup.orders.map((o: any) => [o.order_code, o.escrow_status]));
    assert.equal(byCode['CGM-HELD'], 'HELD');
    assert.equal(byCode['CGM-REL'], 'RELEASED');
    assert.equal(byCode['CGM-DISP'], 'DISPUTED');
    assert.equal(byCode['CGM-REF'], 'REFUNDED');

    // Shop B (reseller)
    const resRes = await getSellerAffiliateOrders({
      request: new Request('https://shop.example.com/api/seller/affiliate/orders?role=reseller', {
        headers: { Authorization: 'Bearer tok_b' },
      }),
      env: { DB: db },
    });
    const dataRes: any = await resRes.json();
    assert.equal(dataRes.orders.length, 4);
    assert.equal(dataRes.orders.every((o: any) => o.my_role === 'RESELLER' && o.my_payout_core === 300), true);

    // Shop C (unrelated) -> 0 orders
    const resC = await getSellerAffiliateOrders({
      request: new Request('https://shop.example.com/api/seller/affiliate/orders', {
        headers: { Authorization: 'Bearer tok_c' },
      }),
      env: { DB: db },
    });
    const dataC: any = await resC.json();
    assert.equal(dataC.orders.length, 0);
  });

  await test('18. Rule 8 hasScope(INTERSHOP_AFFILIATE_MANAGE) & PA1 shouldBumpCatalogEpoch for Mảnh 2 routes', () => {
    assert.equal(hasScope('INTERSHOP_AFFILIATE_MANAGE', 'INTERSHOP_AFFILIATE_MANAGE'), true);
    assert.equal(hasScope('MARKETPLACE_MANAGE', 'INTERSHOP_AFFILIATE_MANAGE'), true);
    assert.equal(hasScope('STORE_FULL', 'INTERSHOP_AFFILIATE_MANAGE'), true);
    assert.equal(hasScope('UNIVERSAL_MALL_FULL', 'INTERSHOP_AFFILIATE_MANAGE'), true);
    assert.equal(hasScope('ADMIN_FULL', 'INTERSHOP_AFFILIATE_MANAGE'), true);
    assert.equal(hasScope('NEWS_FULL', 'INTERSHOP_AFFILIATE_MANAGE'), false);

    assert.equal(shouldBumpCatalogEpoch('/api/admin/affiliate/partnerships/sap_1', 'PATCH'), true);
    assert.equal(shouldBumpCatalogEpoch('/api/admin/affiliate/listings/sal_1', 'PATCH'), true);
    assert.equal(shouldBumpCatalogEpoch('/api/admin/affiliate', 'GET'), false);
    assert.equal(shouldBumpCatalogEpoch('/api/seller/webhooks', 'POST'), false);
    assert.equal(shouldBumpCatalogEpoch('/api/seller/webhooks/whk_1/test', 'POST'), false);
  });

  await test('19. Mảnh 4 E2E 2-shop full lifecycle: request -> PENDING_ADMIN -> Admin APPROVED -> 1-time rawKey -> catalog -> assign -> PUT edit -> webhook -> checkout -> 3-way orders & partners seller_orders revenue', async () => {
    const db = createMockDb();
    db.state.members.set('m_sup', { id: 'm_sup', username: 'sup_u', email: 'sup@e2e.test', balance: 0, role: 'MEMBER', status: 'ACTIVE', session_token: 'tok_sup' });
    db.state.members.set('m_res', { id: 'm_res', username: 'res_u', email: 'res@e2e.test', balance: 0, role: 'MEMBER', status: 'ACTIVE', session_token: 'tok_res' });
    db.state.members.set('m_buyer', { id: 'm_buyer', username: 'buy_u', email: 'buy@e2e.test', balance: 5000, role: 'MEMBER', status: 'ACTIVE', session_token: 'tok_buyer' });
    db.state.sessions.set('tok_sup', { id: 'ssup', member_id: 'm_sup' });
    db.state.sessions.set('tok_res', { id: 'sres', member_id: 'm_res' });
    db.state.sessions.set('tok_buyer', { id: 'sbuy', member_id: 'm_buyer' });
    db.state.sellers.set('sel_sup', { id: 'sel_sup', name: 'E2E Supplier Shop', slug: 'e2e-supplier', owner_member_id: 'm_sup', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0 });
    db.state.sellers.set('sel_res', { id: 'sel_res', name: 'E2E Reseller Shop', slug: 'e2e-reseller', owner_member_id: 'm_res', status: 'ACTIVE', pending_balance_core: 0, available_balance_core: 0 });
    db.state.products.set('prd_orig', {
      id: 'prd_orig',
      seller_id: 'sel_sup',
      game_slug: 'test-game',
      game_name: 'Test Game',
      name: 'Origin Pack 100',
      cover_url: '/game_icons/physical-default.webp',
      description: 'Origin digital pack',
      price_core: 100,
      original_price_core: 100,
      ceiling_price_core: 0,
      warranty_type: '24H',
      warranty_hours: 24,
      delivery_type: 'AUTO_CODE',
      low_stock_threshold: 1,
      product_type: 'digital',
      stock_quantity: 0,
      resell_enabled: 1,
      resell_discount_pct: 10,
      resell_commission_pct: 5,
      resell_map_price: 110,
      status: 'APPROVED',
      is_affiliate: 0,
      origin_seller_id: null,
      origin_product_id: null,
      deleted_at: null,
    });
    const encCode = await encryptCode('E2E-M4-CODE-001', 'test-secret-key-min-16-chars');
    db.state.codes.set('cd_1', { id: 'cd_1', product_id: 'prd_orig', code_encrypted: encCode, status: 'IN_STOCK', deleted_at: null });

    // 1. Shop B sends partnership request using supplier_seller_id (slug)
    const reqCreate = await createAffiliateRequest({
      request: new Request('https://shop.example.com/api/seller/affiliate/requests', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok_res', 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_seller_id: 'e2e-supplier' }),
      }),
      env: { DB: db },
    });
    assert.equal(reqCreate.status, 201);
    const reqData: any = await reqCreate.json();
    const partnershipId = reqData.request_id;
    assert.ok(partnershipId);

    // 2. Shop A reads ?role=supplier -> incoming_requests contains Shop B PENDING
    const resSupIn = await getAffiliateRequests({
      request: new Request('https://shop.example.com/api/seller/affiliate/requests?role=supplier', {
        headers: { Authorization: 'Bearer tok_sup' },
      }),
      env: { DB: db },
    });
    const dataSupIn: any = await resSupIn.json();
    assert.equal(dataSupIn.incoming_requests.length, 1);
    assert.equal(dataSupIn.incoming_requests[0].status, 'PENDING');
    assert.equal(dataSupIn.incoming_requests[0].reseller_name, 'E2E Reseller Shop');

    // 3. Shop A approves -> PENDING_ADMIN (affiliate_require_admin_approval defaults true)
    const resSupApp = await approveAffiliateRequest({
      request: new Request(`https://shop.example.com/api/seller/affiliate/requests/${partnershipId}/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok_sup' },
      }),
      params: { id: partnershipId },
      env: { DB: db },
    });
    assert.equal(resSupApp.status, 200);
    const dataSupApp: any = await resSupApp.json();
    assert.equal(dataSupApp.status, 'PENDING_ADMIN');
    assert.equal(dataSupApp.requires_admin_approval, true);

    // 4. Admin approves -> APPROVED (no raw key returned to admin API, only api_key_prefix)
    const resAdmApp = await handleAdminAffiliateRequest(
      {
        request: new Request(`https://shop.example.com/api/admin/affiliate/partnerships/${partnershipId}`, {
          method: 'PATCH',
          headers: { 'X-Admin-Key': 'adm_test_secret_1234', 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'APPROVED' }),
        }),
        env: { DB: db, ADMIN_API_KEY: 'adm_test_secret_1234' },
      },
      ['partnerships', partnershipId]
    );
    assert.equal(resAdmApp.status, 200);
    const dataAdmApp: any = await resAdmApp.json();
    assert.equal(dataAdmApp.partnership.status, 'APPROVED');
    assert.ok(String(dataAdmApp.partnership.api_key_prefix || '').startsWith('wcg_shop_'));
    assert.equal('one_time_raw_key' in dataAdmApp.partnership, false);

    // 5. Shop B reads ?role=reseller -> receives one_time_raw_key ONCE, second read has null
    const resResOut1 = await getAffiliateRequests({
      request: new Request('https://shop.example.com/api/seller/affiliate/requests?role=reseller', {
        headers: { Authorization: 'Bearer tok_res' },
      }),
      env: { DB: db },
    });
    const dataResOut1: any = await resResOut1.json();
    assert.equal(dataResOut1.outgoing_requests[0].status, 'APPROVED');
    assert.ok(String(dataResOut1.outgoing_requests[0].one_time_raw_key || '').startsWith('wcg_shop_'));

    const resResOut2 = await getAffiliateRequests({
      request: new Request('https://shop.example.com/api/seller/affiliate/requests?role=reseller', {
        headers: { Authorization: 'Bearer tok_res' },
      }),
      env: { DB: db },
    });
    const dataResOut2: any = await resResOut2.json();
    assert.equal(dataResOut2.outgoing_requests[0].one_time_raw_key, null);

    // 6. Shop B opens Supplier catalog (base_price returned) & assigns listing
    const resCat = await getAffiliateCatalog({
      request: new Request(`https://shop.example.com/api/seller/affiliate/catalog?partnership_id=${partnershipId}`, {
        headers: { Authorization: 'Bearer tok_res' },
      }),
      env: { DB: db },
    });
    assert.equal(resCat.status, 200);
    const dataCat: any = await resCat.json();
    assert.equal(dataCat.products.length, 1);
    assert.equal(dataCat.products[0].base_price, 100);

    const resAssign = await createAffiliateListing({
      request: new Request('https://shop.example.com/api/seller/affiliate/listings', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok_res', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          supplier_product_id: 'prd_orig',
          markup_type: 'PERCENT',
          markup_value: 20,
          price_mode: 'FORMULA',
          show_supplier: 1,
        }),
      }),
      env: { DB: db },
    });
    assert.equal(resAssign.status, 201);

    const resList1 = await getAffiliateListings({
      request: new Request('https://shop.example.com/api/seller/affiliate/listings', {
        headers: { Authorization: 'Bearer tok_res' },
      }),
      env: { DB: db },
    });
    const dataList1: any = await resList1.json();
    assert.equal(dataList1.listings.length, 1);
    const listingId = dataList1.listings[0].id;
    const resellerProductId = dataList1.listings[0].reseller_product_id;
    assert.equal(dataList1.listings[0].my_selling_price, 120);

    // Verify mock SELECT shallow-clone isolation (#54): mutating returned row never mutates MockState
    const mClone = await db.prepare('SELECT * FROM members WHERE id = ?').bind('m_buyer').first();
    mClone.balance = 999999;
    assert.equal(db.state.members.get('m_buyer').balance, 5000);

    // 7a. Test locked_price < MAP floor enforcement (#60: locked_price 95 < resell_map_price 110 -> clamped to 110)
    const resMapFloor = await updateAffiliateListing({
      request: new Request(`https://shop.example.com/api/seller/affiliate/listings/${listingId}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer tok_res', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markup_type: 'FIXED',
          markup_value: 0,
          price_mode: 'LOCKED',
          locked_price: 95,
          show_supplier: 0,
        }),
      }),
      params: { id: listingId },
      env: { DB: db },
    });
    assert.equal(resMapFloor.status, 200);
    const dataMapFloor: any = await resMapFloor.json();
    assert.equal(dataMapFloor.is_map_enforced, true);
    assert.equal(dataMapFloor.new_selling_price, 110);
    assert.equal(db.state.listings.get(listingId).locked_price, 110);
    assert.equal(db.state.listings.get(listingId).show_supplier, 0);

    // 7b. Shop B edits listing via PUT /listings/:id (unconditionally clears price_warning, persists show_supplier === 0 & updates price)
    db.state.listings.get(listingId).price_warning = 'ANTI_LOSS_PAUSED';
    const resEdit = await updateAffiliateListing({
      request: new Request(`https://shop.example.com/api/seller/affiliate/listings/${listingId}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer tok_res', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markup_type: 'FIXED',
          markup_value: 30,
          price_mode: 'LOCKED',
          locked_price: 130,
          show_supplier: 0,
        }),
      }),
      params: { id: listingId },
      env: { DB: db },
    });
    assert.equal(resEdit.status, 200);
    const dataEdit: any = await resEdit.json();
    assert.equal(dataEdit.new_selling_price, 130);
    assert.equal(dataEdit.is_map_enforced, false);
    assert.equal(db.state.listings.get(listingId).price_warning, null);
    assert.equal(db.state.listings.get(listingId).show_supplier, 0);

    const resListAfterPut = await getAffiliateListings({
      request: new Request('https://shop.example.com/api/seller/affiliate/listings', {
        headers: { Authorization: 'Bearer tok_res' },
      }),
      env: { DB: db },
    });
    const dataListAfterPut: any = await resListAfterPut.json();
    assert.equal(dataListAfterPut.listings[0].show_supplier, 0);
    assert.equal(dataListAfterPut.listings[0].my_selling_price, 130);

    // 8. Shop A creates, lists (GET), pings (POST /:id/test), retries failed delivery (POST .../retry) & deletes Webhook cleanly (#60)
    const whEnv = { DB: db, MARKETPLACE_CODE_KEY: 'test-secret-key-min-16-chars', JWT_SECRET: 'test-secret-key-min-16-chars' };
    const resWhCreate = await handleSellerWebhooksRequest(
      {
        request: new Request('https://shop.example.com/api/seller/webhooks', {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_sup', 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'M4 Hook', webhook_url: 'https://example.com/hook', events: ['order.paid'], retry_max: 0 }),
        }),
        env: whEnv,
      },
      []
    );
    assert.equal(resWhCreate.status, 201);
    const whData: any = await resWhCreate.json();
    const whId = whData.webhook.id;
    assert.ok(String(whData.raw_hmac_secret || '').startsWith('whsec_'));

    // 8a. GET /api/seller/webhooks list
    const resWhGet = await handleSellerWebhooksRequest(
      {
        request: new Request('https://shop.example.com/api/seller/webhooks', {
          method: 'GET',
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: whEnv,
      },
      []
    );
    assert.equal(resWhGet.status, 200);
    const whGetData: any = await resWhGet.json();
    assert.equal(whGetData.webhooks.length, 1);
    assert.equal(whGetData.webhooks[0].id, whId);
    assert.equal('encrypted_hmac_secret' in whGetData.webhooks[0], false);

    // 8b. POST /api/seller/webhooks/:id/test (first fails with 502, then retry succeeds with 200)
    const resWhFailPing = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${whId}/test`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: whEnv,
        fetchImpl: async () => new Response('upstream bad gateway', { status: 502 }),
      },
      [whId, 'test']
    );
    assert.equal(resWhFailPing.status, 200);
    const whFailPingData: any = await resWhFailPing.json();
    assert.equal(whFailPingData.success, false);
    assert.equal(whFailPingData.failed, 1);
    assert.equal(whFailPingData.deliveryIds.length, 1);
    const failedDelId = whFailPingData.deliveryIds[0];
    assert.equal(db.state.deliveries.get(failedDelId).delivery_status, 'FAILED');

    // 8c. POST /api/seller/webhooks/deliveries/:deliveryId/retry
    const resWhRetry = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/deliveries/${failedDelId}/retry`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: whEnv,
        fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      },
      ['deliveries', failedDelId, 'retry']
    );
    assert.equal(resWhRetry.status, 200);
    const whRetryData: any = await resWhRetry.json();
    assert.equal(whRetryData.success, true);
    assert.equal(whRetryData.ok, true);
    assert.equal(whRetryData.httpStatus, 200);
    assert.equal(db.state.deliveries.get(failedDelId).delivery_status, 'DELIVERED');

    // 8d. POST /api/seller/webhooks/:id/test direct 200 OK ping
    const resWhOkPing = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${whId}/test`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: whEnv,
        fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      },
      [whId, 'test']
    );
    assert.equal(resWhOkPing.status, 200);
    const whOkPingData: any = await resWhOkPing.json();
    assert.equal(whOkPingData.success, true);
    assert.equal(whOkPingData.delivered, 1);

    // 8e. DELETE /api/seller/webhooks/:id
    const resWhDel = await handleSellerWebhooksRequest(
      {
        request: new Request(`https://shop.example.com/api/seller/webhooks/${whId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: whEnv,
      },
      [whId]
    );
    assert.equal(resWhDel.status, 200);

    // 9. Buyer purchases reseller product (130 Core) -> COMPLETED -> 3-way orders & partners seller_orders revenue
    const resBuy = await createSingleOrder({
      request: new Request('https://shop.example.com/api/seller-orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok_buyer', 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: resellerProductId, payment_method: 'CORE' }),
      }),
      env: { DB: db, MARKETPLACE_CODE_KEY: 'test-secret-key-min-16-chars', JWT_SECRET: 'test-secret-key-min-16-chars' },
    });
    assert.equal(resBuy.status, 201);
    const buyData: any = await resBuy.json();
    const orderId = buyData.order.id;
    db.state.orders.get(orderId).status = 'COMPLETED';
    db.state.orders.get(orderId).released_at = new Date().toISOString();

    // Check 3-way orders for Shop A and Shop B
    const [ordSupRes, ordResRes, partnersRes] = await Promise.all([
      getSellerAffiliateOrders({
        request: new Request('https://shop.example.com/api/seller/affiliate/orders?role=supplier', {
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: { DB: db },
      }),
      getSellerAffiliateOrders({
        request: new Request('https://shop.example.com/api/seller/affiliate/orders?role=reseller', {
          headers: { Authorization: 'Bearer tok_res' },
        }),
        env: { DB: db },
      }),
      getAffiliatePartners({
        request: new Request('https://shop.example.com/api/seller/affiliate/partners', {
          headers: { Authorization: 'Bearer tok_sup' },
        }),
        env: { DB: db },
      }),
    ]);

    const ordSupData: any = await ordSupRes.json();
    const ordResData: any = await ordResRes.json();
    const partnersData: any = await partnersRes.json();

    assert.equal(ordSupData.orders.length, 1);
    assert.equal(ordSupData.orders[0].escrow_status, 'RELEASED');
    assert.equal(ordResData.orders.length, 1);
    assert.equal(
      ordSupData.orders[0].split.supplierPayout +
        ordResData.orders[0].split.resellerPayout +
        ordSupData.orders[0].split.platformFee,
      130
    );
    assert.equal(partnersData.partners.length, 1);
    assert.equal(partnersData.partners[0].partnership_status, 'APPROVED');
    assert.equal(partnersData.partners[0].total_orders_count, 1);
    assert.equal(partnersData.partners[0].total_revenue_core, 130);
  });

  await test('20. Rule 12 Dictionary Symmetry for sellerAffiliate, intershopAffiliate, sellerCenter & apiKeys (vi.json == en.json)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const vi = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/locales/vi.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/locales/en.json'), 'utf8'));

    for (const section of ['sellerAffiliate', 'intershopAffiliate', 'sellerCenter', 'apiKeys']) {
      const viKeys = Object.keys(vi[section] || {}).sort();
      const enKeys = Object.keys(en[section] || {}).sort();
      assert.ok(viKeys.length > 0, `${section} missing in vi.json`);
      assert.deepEqual(viKeys, enKeys, `Key mismatch in ${section}`);
    }
    assert.equal(vi.sellerAffiliate.whPingBtn, 'Kiểm tra Ping');
    assert.equal(en.sellerAffiliate.whPingBtn, 'Ping Test');
  });

  await test('21. Regression guard (#61): functions/api/seller/affiliate/partners/index.ts queries FROM seller_orders (never FROM orders)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'functions/api/seller/affiliate/partners/index.ts'),
      'utf8'
    );
    const sellerOrdersMatches = src.match(/\bFROM\s+seller_orders\b/gi) || [];
    const legacyOrdersMatches = src.match(/\bFROM\s+orders\b/gi) || [];
    assert.ok(
      sellerOrdersMatches.length >= 2,
      `Expected >= 2 FROM seller_orders subqueries in partners/index.ts, got ${sellerOrdersMatches.length}`
    );
    assert.equal(
      legacyOrdersMatches.length,
      0,
      'partners/index.ts must NEVER regress back to querying FROM orders'
    );
  });

  console.log(`\n[Inter-Shop Affiliate Mảnh 1+2+4 Summary] Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
