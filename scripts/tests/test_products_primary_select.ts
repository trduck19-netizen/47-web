import { onRequestGet as productsGet } from '../../functions/api/products/index';

async function main() {
  const sampleRow = {
    id: 'prd_mock_step5',
    title: '[MOCK] Step 5 Physical Product',
    slug: 'mock-step5-physical',
    industry_id: 'tech',
    category_id: 'tech',
    product_type: 'physical',
    original_price: 200,
    current_price: 100,
    discount_percent: 50,
    stock_quantity: 10,
    thumbnail_url: '/game_icons/physical-default.webp',
    images_json: JSON.stringify(['/game_icons/physical-default.webp']),
    description: 'Mock product in primary products table',
    specifications_json: JSON.stringify({ warranty_hours: 12, origin: 'Kho Mock Step5' }),
    brand_name: 'Brand Mock Step5',
    weight_grams: 350,
    warehouse_address: 'Kho Mock Step5, HCM',
    rating_avg: 5,
    rating_count: 1,
    sold_count: 0,
    is_active: 1,
    created_at: '2026-11-26T07:00:00Z',
    updated_at: '2026-11-26T07:00:00Z',
  };

  const mockDb = {
    prepare(sql: string) {
      const upper = sql.toUpperCase();
      const exec = {
        async first() {
          if (upper.includes('SELECT COUNT(*)')) return { total: 1 };
          return null;
        },
        async all() {
          if (upper.includes('FROM SCHEMA_MIGRATIONS')) {
            return {
              results: [
                { id: 'baseline_unconditional_ddl_v1' },
                { id: 'schema_v5_full_upgrades' },
                { id: 'wcg_virtual_layer_tables_v1' },
                { id: 'deleted_records_history_v1' },
                { id: 'core_subschemas_v1' },
              ],
            };
          }
          if (upper.includes('FROM PRODUCTS')) return { results: [sampleRow] };
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
        bind() {
          return exec;
        },
      };
      return exec;
    },
    async batch() {
      return [];
    },
  };

  const res = await productsGet({
    request: new Request('https://example.test/api/products?limit=100'),
    env: { DB: mockDb },
  } as any);
  const json: any = await res.json();
  const item = json.data?.[0];

  const required = [
    'game_slug',
    'cover_image_url',
    'game_icon_url',
    'product_images',
    'weight_grams',
    'warehouse_address',
    'warranty_hours',
    'seller_name',
    'brand',
    'origin',
  ];
  const missing = item
    ? required.filter((k) => item[k] === undefined || item[k] === null || item[k] === '')
    : required;

  console.log(JSON.stringify({ status: res.status, item, missing }, null, 2));
  if (res.status !== 200 || missing.length > 0) {
    console.error('FAILED missing fields:', missing);
    process.exit(1);
  }
  console.log(`ALL ${required.length}/${required.length} PRIMARY /api/products FIELDS VERIFIED VIA REAL HANDLER`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
