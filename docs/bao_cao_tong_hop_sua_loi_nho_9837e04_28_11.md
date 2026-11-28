# Báo Cáo Nghiệm Thu Đợt Sửa Tổng Hợp Lỗi Nhỏ Tạm Hoãn & Đính Chính Kiểm Chứng (`8ce261d` + `9837e04`)

> **Bản Đính Chính Chính Thức Trong Repo (28/11/2026):** Tệp báo cáo này đã cập nhật đầy đủ **6 mục sửa bắt buộc (Việc 1–6)** và các ghi chú phạm vi/Backlog theo kết quả kiểm chứng độc lập, đồng thời được commit trực tiếp vào [`docs/bao_cao_tong_hop_sua_loi_nho_9837e04_28_11.md`](./bao_cao_tong_hop_sua_loi_nho_9837e04_28_11.md) (cùng [`docs/bao_cao_sua_not_shopee_7770896_27_11.md`](./bao_cao_sua_not_shopee_7770896_27_11.md)) trên nhánh `main`. Không thay đổi bất kỳ tệp mã nguồn nào và không deploy lại để giữ nguyên `X-Build-Id: 9837e04` đang chạy live.

## §1. Chuỗi Commit, Phạm Vi, Giải Trình `8ce261d` & Môi Trường Triển Khai Live

- **Chuỗi Commit Tách Bạch Trên `origin/main`:**
  1. **Commit 1 (Hoàn tất log `--all` của vòng `7770896`):** [`8ce261d`](https://github.com/trduck19-netizen/47-web/commit/8ce261dfd91b0f2005bc431af61250cafdbe7f13) (`8ce261dfd91b0f2005bc431af61250cafdbe7f13`, parent `7770896d7e669610033957883c958be4267e1972`)
     - Nội dung trong Git diff `8ce261d`: Chạy mới `node scripts/check-hardcoded-i18n.cjs --all` bằng script đã nâng cấp lookback ternary tách dòng, lưu `docs/check_hardcoded_i18n_all.log` (`119` file, `2.959` vi phạm tại thời điểm `7770896`, `502.273 B` LF) kèm `docs/build_success.log` (`18.966 B` LF, `Injected Build ID: 7770896`).
     - **Đính chính minh bạch Việc 6 (3 trích dẫn vòng `7770896`/`8ce261d`):** Tại thời điểm `8ce261d`, bản báo cáo `bao_cao_sua_not_shopee_7770896_27_11.md` mới chỉ được sửa ở thư mục Artifact cục bộ ngoài Git nên không kiểm tra được từ repo. Nay bản đã đính chính đủ 3 trích dẫn — gồm (i) đường dẫn đúng `src/components/ProductDetailModal.tsx`, (ii) dòng in danh sách 23 file quét trong `scripts/check-hardcoded-i18n.cjs` là `L234`, và (iii) kích thước UTF-8 đo thật của 2 chunk live vòng `7770896` là `96.095 B` (`ProductCheckoutModal-DnwYdIyt.js`) / `75.305 B` (`ProductDetailModal-DQaUjQFt.js`) — đã được commit trực tiếp vào repo tại [`docs/bao_cao_sua_not_shopee_7770896_27_11.md`](./bao_cao_sua_not_shopee_7770896_27_11.md).
  2. **Commit 2 (Hợp nhất 4 nhánh Swarm xử lý toàn bộ 43 mục / 44 hạng mục con lỗi nhỏ `47-web`):** [`9837e04`](https://github.com/trduck19-netizen/47-web/commit/9837e04351f537497c1a4e4f1854ccd0000cdbd0) (`9837e04351f537497c1a4e4f1854ccd0000cdbd0`, parent `8ce261dfd91b0f2005bc431af61250cafdbe7f13`)
     - Diff stats: **`41 files changed, 4250 insertions(+), 1901 deletions(-)`** (gộp đầy đủ 33 tệp code/từ điển + `CHANGELOG.md` `#490` + `CHANGELOG_ARCHIVE_2026.md` + `KNOWN_ISSUES.md` `ISSUE-342` + các file log chuẩn LF trong 1 commit duy nhất theo Phương án A).
  3. **Commit 3 (Chỉ bổ sung 2 tệp báo cáo đã đính chính vào `docs/`):** Commit tài liệu ngay trên đầu `9837e04` (0 thay đổi mã nguồn, không deploy lại).
- **Giải trình nguồn gốc số liệu hồi quy `"partners 220/5"` (Việc 6):**
  - Endpoint trả ra cặp số **`220 / 5`** là **`GET /api/seller/affiliate/partners`** (`functions/api/seller/affiliate/partners/index.ts:16-80`) — tuyến API dành riêng cho **Chủ gian hàng nguồn (Supplier Store Owner, Shop B)** xác thực qua `verifyStoreApiAccess(request, env, { requiredRole: 'OWNER' })` bằng Bearer session token hoặc Store API key của chủ Shop B.
  - Trên dòng quan hệ đối tác `APPROVED` `sap_mwug5g1i_7cixz`, câu truy vấn SQL tổng hợp trực tiếp từ bảng `seller_orders` (`is_affiliate_order = 1 AND deleted_at IS NULL`) trả về 2 trường JSON:
    - `total_revenue_core: 220` (`SELECT COALESCE(SUM(o.price_core), 0) FROM seller_orders o WHERE ... AND o.status = 'COMPLETED'`).
    - `total_orders_count: 5` (`SELECT COUNT(*) FROM seller_orders o WHERE ... AND o.is_affiliate_order = 1 AND o.deleted_at IS NULL` — gồm 3 đơn hoàn tất + 2 đơn đã hoàn tiền).
  - Các endpoint `GET /api/admin/affiliate` (chỉ trả 3 dòng `partnerships` và thẻ KPI `3/1/0/1/0`), `/api/sync` và `/api/sync-lite` không tính 2 subquery này, do đó truy vấn từ bên ngoài không có token chủ Shop B sẽ không xuất hiện chuỗi `220`.
- **URL Triển Khai Live (`X-Build-Id: 9837e04`, HTTP `200` trên toàn bộ các endpoint kiểm tra):**
  - Web Khách: `https://universal-mall-shop.pages.dev/` (`/`, `/en/`, `/store`, `/en/store`, `/news`, `/en/news`, `/ban-hang`, `/en/ban-hang`) — preview: `https://62a90c0b.universal-mall-shop.pages.dev`
  - Cổng Quản trị: `https://admin-universal-mall.pages.dev/admin` — preview: `https://efffde5b.admin-universal-mall.pages.dev`

---

## §2. Phân Loại Đầy Đủ 82 Mục & Chi Tiết 43 Mục (44 Hạng Mục Con) Đã Sửa Tại `9837e04`

> **Đính chính phép đếm §2 (Việc 1):** Hồ sơ `LỖI NHỎ TẠM HOÃN` gốc có **`82` mục** (`grep -c "^## "` = `82`; trong đó số hiệu `#4` xuất hiện 2 lần: `#4-ticker` GNN + `#4-toast` mall; số hiệu `#5` xuất hiện 2 lần: `#5-Monbiot` GNN + `#5-HeroBanner` mall). Loại trừ **`39` mục** (`26` mục thuộc dự án báo chí GNN + `13` mục ghi chú thông tin / chủ ý / đã đóng) còn **`43` mục đã sửa tại `9837e04`**, tương ứng **`44` hạng mục con** (do `#33` tách thành `#33-sw` ở Nhóm 3 và `#33-d1` ở Nhóm 4; tổng theo nhóm: **`12 + 10 + 11 + 11 = 44` hạng mục con**).

### 2.1. Nhóm 39 Mục Không Thuộc Repo `47-web` Hoặc Đã Đóng Trước Đó (`26` GNN + `13` Ghi Chú / Đã Đóng)
- **`26` mục thuộc dự án báo chí độc lập `global-news-network.pages.dev` / `admin-news-network.pages.dev` (ngoài repo này):** `#2`, `#3`, `#4 (ticker Reuters)`, `#5 (avatar Monbiot)`, `#6 (/api/v1/images)`, `#7`, `#8`, `#9`, `#11`, `#12`, `#13`, `#24`, `#25`, `#26`, `#31`, `#36`, `#37`, `#38`, `#39`, `#40`, `#41`, `#42`, `#55`, `#57`, `#58`, `#59`.
- **`13` mục ghi chú thông tin / hành vi thiết kế có chủ ý / đã đóng từ các đợt trước:** `#5 (HeroBanner scrim — đã xử lý tại a779653)`, `#14` (quy ước trích số dòng sau sửa), `#17` (ghi nhận `baseline_unconditional_ddl_v1`), `#23` (preset thoáng hiện trước `sync-lite`), `#49` (`partial-update` có chủ ý), `#51` (`OUT_OF_STOCK` hợp lệ), `#52` (`events_json` + `events`), `#53` (summary loại đơn hoàn tiền), `#62` (`/en/ban-hang` — đã đóng ở `8e5f4b0`), `#63` (`AdminLayout` `sm:hidden` — đã đóng ở `8e5f4b0`), `#64` (`kB` vs `KB`), `#70` (quy trình log LF 1 commit — đã áp dụng), `#73` (`StoreView` banner contrast — đã đóng ở `a779653`).

### 2.2. Nhóm 1 (`mall-ui`) — Shell, Cửa Hàng, Tin Tức, Auth, Toast & Package Utils (12 Hạng Mục Con)
1. **`#1` (`src/components/AuthModal.tsx`):** Chuyển cảnh báo thiếu sitekey Turnstile ở cả 2 tab Đăng nhập/Đăng ký và toàn bộ ternary `isEn ?` còn lại sang khóa đối xứng `t('auth.*')`.
2. **`#4-toast` (`src/components/MarketingNotificationToast.tsx`):** Đưa toàn bộ mẫu toast hoạt động (`STATS_COPY`, `COPY_CODE`, `BUY_PRODUCT`, `DEPOSIT_WALLET`, `CLAIM_GIVEAWAY`, `RESTOCK_PRODUCT`), tiền tố vai trò, đơn vị `VND` và mốc thời gian qua `t('mall.socialToast.*')`.
3. **`#22` (`src/utils/productPackageUtils.ts`):** Dịch động các ghi chú/nhãn gói mặc định (`'Xử lý tiêu chuẩn'` → `'Standard processing'`, `'Chính hãng'` → `'Official'`, `'Gói nạp game'`, `'Giao tài khoản tự động trong 0 giây'`...) qua `productPackage.*` theo ngôn ngữ hiện hành.
4. **`#32` (`src/App.tsx`, `src/components/StoreView.tsx`, `src/components/mall/UniversalMallView.tsx`, `src/components/NewsDetailModal.tsx`):** Thay toàn bộ biểu thức dựng URL trần `` `/game_icons/${...}.webp` `` bằng `safeGameIconUrl` / `resolveProductCoverImage` (**`0` hit trần trong 4 file thuộc phạm vi sửa**; `70` hit trần còn lại ngoài helper ở các file `src/` khác được ghi nhận vào §5 Backlog — Việc 2).
5. **`#67` (`src/App.tsx` + `src/context/LanguageContext.tsx` — hàm `syncUrlWithLanguage` tại `L185`):** Bổ sung `stripLangPrefix` / `withLangPrefix` và đồng bộ `syncUrlWithLanguage` giúp đổi ngôn ngữ VI ↔ EN từ cả topbar lẫn footer giữ nguyên đường dẫn con hiện tại (`/store` ↔ `/en/store`, `/ban-hang` ↔ `/en/ban-hang`, `/news` ↔ `/en/news`) *(đính chính trích dẫn Việc 3: `NewsView.tsx` không chứa các helper này)*.
6. **`#69` (`src/App.tsx`):** Đưa tiêu đề `'Seller Center & Store Management | Pine Universal Mall'` và các sub-route vào `t('mall.pageTitles.*')` (`14` khóa đối xứng), chặn `useEffect` trang chủ ghi đè tiêu đề trang con.
7. **`#72` (`src/components/NewsDetailModal.tsx`, `src/components/NewsView.tsx`):** Sửa lỗi tiêu đề bài tin chữ tối trên nền tối ở Light theme (`bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100`, thẻ bài nền trắng chữ `#0f172a`).
8. **`#74` (`src/components/StoreView.tsx:271`, `src/components/mall/UniversalMallView.tsx`):** Nối `onFilteredCountChange?.(filtered.length)` để tiêu đề breadcrumb `"CỬA HÀNG ĐA NGÀNH (X SẢN PHẨM)"` cập nhật tức thời theo bộ lọc và từ khóa tìm kiếm (kể cả `0 SẢN PHẨM`) *(đính chính trích dẫn Việc 3: truyền `filtered.length` tại `StoreView.tsx:271`, không phải `groupedProducts.length`)*.
9. **`#75` (`src/components/mall/UniversalMallView.tsx`):** Tăng độ đậm nền rãnh thanh tiến độ `FLASH SALE` (`bg-[#b33012]/90`) + `drop-shadow` giúp chữ trắng `🔥 ĐANG BÁN CHẠY / SELLING FAST` rõ nét toàn dải.
10. **`#76` (`src/components/mall/UniversalMallView.tsx`):** Tinh chỉnh khẩu hiệu EN `"Multi-Industry & Digital Marketplace"` kèm `whitespace-nowrap` để không bị cắt cụt trên desktop.
11. **`#77` (`src/App.tsx`):** Giới hạn `<FloatingAnnouncement>` chỉ tự mở trên `mallSubView === 'home'`, chấm dứt tình trạng che bộ lọc khi vào `/store` lần đầu.
12. **`#78` (`src/components/StoreView.tsx`):** Mở rộng ô tìm kiếm (`sm:w-64 md:w-72`) và gọn hóa placeholder EN `"Search codes & packages..."` không còn bị cắt chữ cuối.

### 2.3. Nhóm 2 (`modals-ui`) — Chi Tiết, Thanh Toán, Chia Sẻ & Giỏ Hàng (10 Hạng Mục Con / 9 Cụm Sửa)
1. **`#18` & `#19` (`src/components/ProductCheckoutModal.tsx` — 2 hạng mục):** Gate màn hình yêu cầu đăng nhập theo `isPhysical` (`#18`: đơn vật lý hiển thị đặt giao vận & theo dõi vận đơn thay vì nhận mã quà tặng) và đưa toàn bộ chuỗi JS/ternary còn lại vào `t('checkoutModal.*')` (`#19`: `169` lần gọi `t('checkoutModal.*')`, `0` ternary `isEn ?`).
2. **`#20` (`src/components/ProductDetailModal.tsx`):** Thêm `aspect-square max-w-[360px] max-h-[360px] sm:max-w-[420px] sm:max-h-[420px]` cho khung ảnh sản phẩm → khung vuông chuẩn trên desktop.
3. **`#21` (`src/components/ProductDetailModal.tsx`):** Gate thẻ bảo chứng thứ 2 theo `isPhysicalProduct` (`GIAO HÀNG TOÀN QUỐC` / `1–3 ngày làm việc` với icon `Truck` cho hàng vật lý).
4. **`#27` (`src/components/ProductDetailModal.tsx`, `src/components/ProductCheckoutModal.tsx`):** Thống nhất đơn vị tiền hàng vật lý qua `formatCurrency` (`đ` ở VI / `VND` ở EN), xóa bỏ tình trạng lẫn `"100 đ"` và `"100 Core"`.
5. **`#28` (`src/components/ProductCheckoutModal.tsx`):** Hiển thị rõ kho gửi (`warehouse_address` / `origin`) và tổng khối lượng (`weight_grams × số lượng`) ngay trong khối chọn đơn vị vận chuyển.
6. **`#29` (`src/locales/en.json`):** Thay ký hiệu `"₫"` bị lẫn trong 3 khóa tiếng Anh (`shippingDelayVoucher`, `freeShippingLabel`, `sandboxTopupBtn`) sang chuẩn `"VND"`.
7. **`#30` (`src/components/PackageShareModal.tsx`):** Gate nhãn loại sản phẩm (`Sản Phẩm Vật Lý` / `Physical Item`) và giá (`formatCurrency`) cho hàng vật lý thay vì `"GÓI CODE"` + `Core`.
8. **`#79` (`src/components/cart/CartDrawerModal.tsx`):** Sửa chia số ít/nhiều bản EN (`"1 item"` / `"Total (1 item):"` khi số lượng = 1).
9. **`#80` (`src/components/cart/CartDrawerModal.tsx`):** Tính đồng bộ `totalItemCount`, `totalCore`, `groupedStores` bằng `useMemo` từ cùng 1 snapshot `cartItems` và chỉ gọi `syncWithServer()` khi giỏ local rỗng kèm khóa nút `isSyncingCart`, ngăn nhân đôi số lượng thoáng qua.

### 2.4. Nhóm 3 (`seller-admin`) — Seller Center, Admin, Cache Tĩnh & Kiểm Thử Liên Shop (11 Hạng Mục Con / 7 Cụm Sửa)
1. **`#10` (`AGENTS.md`):** Cập nhật dòng 70–71 phản ánh đúng cơ chế Turnstile `siteverify` Fail-Closed thực tế (bỏ mô tả placeholder `'cf_turnstile_verified'` cũ).
2. **`#33-sw` (`public/sw.js`) & `#34` (`public/_headers`) — 2 hạng mục con:** Nâng `codegame-pwa-v10`, kiểm tra MIME bằng `isValidStaticAssetResponse` trước khi `cache.put` ở nhánh SWR chung (`#33-sw`); đổi 8 file gốc đặt tên cố định (`/logo.webp`, `/og-image-thumb.webp`...) sang `max-age=86400, stale-while-revalidate=604800`, chỉ giữ `immutable` cho `/assets/*` có hash (`#34`).
3. **`#54`, `#60`, `#61` (`scripts/tests/test_intershop_affiliate.ts`) — 3 hạng mục:** Trả bản sao nông `{ ...row }` ở toàn bộ nhánh `SELECT` của mock D1 (`#54`); mở rộng Test 19 kiểm tra ép sàn `locked_price < MAP`, lưu `show_supplier === 0`, `GET /webhooks`, `POST /:id/test` và `POST .../retry` (`#60`); thêm Test 21 kiểm tra mã nguồn `partners/index.ts` bắt buộc có `>= 2` truy vấn `FROM seller_orders` và `0` `FROM orders` (`#61`, nâng suite liên shop `20 → 21` bài).
4. **`#56` (`src/admin/modules/InterShopAffiliateModule.tsx`):** Gắn `cache: 'no-store'` và hiển thị trạng thái đang tải cho 5 thẻ KPI tới khi lần tải đầu hoàn tất.
5. **`#65` (`src/locales/vi.json`):** Dịch `sellerAffiliate.whPingBtn` sang `"Kiểm tra Ping"` ở tiếng Việt.
6. **`#68` & `#71` (`src/components/seller/SellerCenterView.tsx`) — 2 hạng mục:** Đưa thông báo lỗi 404 không có gian hàng vào `t('sellerCenter.noStoreAccessError')` (`#68`); bổ sung ô nhập `stock_quantity` cho form tạo/sửa Hàng Vật Lý (`#71a`), nạp phân trang `/api/games?page=1..totalPages&limit=100&sort=name_asc` với trần an toàn `15` trang / `1.500` game (đủ trọn `593` game hiện tại kèm ô lọc nhanh — `#71b`), và nối nút Xóa sản phẩm (`DELETE /api/seller/products/:id`) giữ chuẩn bảng 1 màn hình Rule 9 (`#71c`).
7. **`#43` (`src/admin/modules/ApiKeysModule.tsx`):** Song ngữ hóa khung tiêu đề, thanh preset, tab, bộ lọc, header bảng và các nút thao tác chính qua `t('apiKeys.*')` (`91` lần gọi; phần chuỗi modal/toast còn lại ghi nhận ở §5 Backlog).

### 2.5. Nhóm 4 (`edge-backend`) — Cloudflare Edge Worker & Dịch Vụ D1 (11 Hạng Mục Con / 9 Cụm Sửa)
1. **`#15` (`functions/services/d1_service.ts`):** Cập nhật `lastSchemaTiming` ngay trước khi resolve `schemaUpgradesPromise` và trả `Promise<SchemaTiming>` để các request đồng thời không đọc nhầm số đo cũ (thêm `1` check đa dòng `d1_concurrent_schema_timing_shared_run` tại `test_supplier_connectors.ts:352`).
2. **`#16` (`functions/api/sync-lite.ts`):** Đưa `() => getMultipleSettingsD1(...)` trực tiếp vào trong `timed(...)` để `settings;dur` đo từ đúng thời điểm khởi chạy truy vấn D1 (`1` check đa dòng `reg16_sync_lite_server_timing_settings`).
3. **`#33-d1` (`functions/game_icons/[file].ts`, `functions/_worker.ts`) & `#35` (`functions/api/products/index.ts`) — 2 hạng mục con:** Kiểm tra `row.content_type` khớp `^image/` kèm `X-Content-Type-Options: nosniff` (`#33-d1`: `4` check `reg33d1_*`); chuẩn hóa fallback ảnh vật lý ở cả 3 nhánh thành `'/game_icons/physical-default.webp?v=2'` (`#35`: `1` check đa dòng `reg35_products_physical_cover_v2`).
4. **`#44` (`functions/services/supplier_connector_service.ts`):** Phân tách rõ 4 lý do (`SUPPLIER_NOT_FOUND`, `SUPPLIER_INACTIVE`, `SUPPLIER_NOT_POSTPAID_MODE`, `CREDIT_LIMIT_EXCEEDED`) trong `reserveSupplierCreditAtomic` *(đính chính Việc 5: riêng `#44` có **`3` check `reg44_*`** tại `test_supplier_connectors.ts:1044,1054,1073`; toàn suite `test_supplier_connectors.ts` tăng `112 → 118` = `+6` check do cộng thêm `2` check `reg66_*` của `#66` và `1` check đa dòng `d1_concurrent_schema_timing_shared_run` của `#15`)*.
5. **`#45` & `#48` (`functions/_worker.ts`, `functions/services/d1_service.ts`) — 2 hạng mục:** Gắn đủ `ETag` và `X-Catalog-Epoch` cho mọi nhánh `/api/sync` kể cả `?nocache=1` (`#45`: `1` check đa dòng `reg45_*`), đồng nhất trường `icon_verified`/`icon_source` của `upcomingGames` và clone memory cache cả chiều đọc lẫn chiều ghi tránh đột biến chéo (`#48`: `1` check đa dòng `reg48_*`).
6. **`#46` (`functions/api/giveaways/claim.ts`, `simulate.ts`, `functions/_worker.ts`):** Chặn double-bump catalog epoch bằng `WeakSet bumpedRequests` ở 2 tuyến giveaways và không bump khi `simulate` trả lỗi hoặc `0` bản ghi *(đính chính Việc 5: riêng `#46` có **`3` check `reg46_*`** tại `test_catalog_epoch_sync.ts:540,551,561`; toàn suite `test_catalog_epoch_sync.ts` tăng `71 → 85` = `+14` check trong PART 6 do dùng chung cho 8 mục: `1` `#16` + `4` `#33-d1` + `1` `#35` + `1` `#45` + `1` `#48` + `3` `#46` + `1` `#47` + `2` `#50`, gồm `4` lời gọi `check(...)` đa dòng)*.
7. **`#47` (`functions/api/orders/status.ts`, `functions/services/d1_service.ts`):** Tự động bump catalog epoch khi `checkAndExpireOrdersD1` / `checkAndExpireSellerOrdersD1` thu hồi ≥ 1 đơn quá hạn về kho (`1` check `reg47_order_expiry_bumps_catalog_epoch_once`; lưu ý cơ chế hết hạn chạy lazy khi có trigger đọc/kiểm trạng thái).
8. **`#50` (`functions/api/admin/affiliate/index.ts`):** Chỉ ghi `revoked_at = nowIso` khi trạng thái là `'REVOKED'`, giữ nguyên bằng `COALESCE` khi `'SUSPENDED'` (`2` check `reg50_*`).
9. **`#66` (`functions/services/supplier_connector_service.ts`):** Thực thi `webhook.retry_max` (tối đa `1..3` lần thử trên lỗi mạng/timeout/HTTP `>= 500` hoặc `429`, dừng ngay ở lần 1 với `4xx` như `404`/`405` để không treo Ping) và ghi đúng số `attempts` thực tế (`2` check `reg66_*`).

---

## §3. Bằng Chứng 6 File Log Chuẩn LF Trong Repo (`9837e04` — `disk` == `git cat-file -s`) & Đo Độc Lập Từ Điển

| Hạng mục | Kết quả đo trực tiếp từ chính file log | File log trong repo | Kích thước (`fs.statSync` == `git cat-file -s`) |
|---|---|---|---|
| **Bộ test (`npm test`)** | Tổng cộng **`246/246` PASS** qua 5 suite (`12` icons + `10` products + `118` suppliers + `85` sync-epoch + `21` intershop; mỗi suite in `passed == total`) | `docs/test_full_check.log` | **`7.016` B** (`7016 == 7016`) |
| **I18N Guard (`check:i18n`)** | **`23/23` PASS (`0` vi phạm)**, timestamp `2026-11-27T18:15:54.134Z` *(log không in tổng số khóa từ điển — xem dòng đo độc lập bên dưới)* | `docs/i18n_full_check.log` | **`1.521` B** (`1521 == 1521`) |
| **Audit `--all` 119 file** | Quét **`119` file `.tsx`**, tổng vi phạm giảm từ `2.959` (`8ce261d`) xuống **`2.895` (`-64` vi phạm)** | `docs/check_hardcoded_i18n_all.log` | **`493.009` B** (`493009 == 493009`) |
| **TypeScript (`tsc`)** | `homepage_exit=0` (`HOMEPAGE_TSC_OK`); `full_tsc_exit=2`, tổng lỗi giảm xuống **`1.692`** (`-25` so với `1.717` ở `7770896`, `0` lỗi mới); `TS6133 = 467` (`-16` so với `483`, `0` mới vs `75fa59b`) | `docs/tsc_full_check.log` | **`243.068` B** (`243068 == 243068`) |
| **Bảo mật Rule 10** | `ZERO_RULE10_VIOLATIONS` (`0` khóa `wcg_*`, `0` Telegram token, `0` private key; nội dung không đổi so với `7770896`) | `docs/rule10_scan.log` | **`78` B** (`78 == 78`) |
| **Build & Lean Guard** | Pre **`5/5`** + Post **`4/4` PASS**; `Injected Build ID: 8ce261d` *(hash cha theo Phương án A; bản deploy live mang `X-Build-Id: 9837e04`)*; `AdminApp`: **`567.02 KB`**; `UniversalMallView`: **`591.23 kB`**; `_worker.js`: **`6.75 MB`**; `dist/`: **`68.74 MB`** | `docs/build_success.log` | **`18.965` B** (`18965 == 18965`) |

- **Đo độc lập đối xứng từ điển (đính chính nguồn Việc 4):** Đếm flatten trực tiếp các khóa lá trong 2 tệp `src/locales/vi.json` và `src/locales/en.json` đạt **`2.498 / 2.498` khóa lá (`0` thiếu ở cả 2 chiều `vi → en` và `en → vi`)** — con số này đo trực tiếp trên 2 file JSON từ điển, không phải trích từ `docs/i18n_full_check.log`.

---

## §4. Kiểm Chứng Live Trình Duyệt Thật & API (`X-Build-Id: 9837e04`)

- **Header & Hợp đồng API live:**
  - `GET /api/sync?nocache=1` → `200`, `X-Build-Id: 9837e04`, `ETag: W/"sync-1795798936409_cmrl"`, `X-Catalog-Epoch: 1795798936409_cmrl`, `upcomingGames` (`37` mục) khớp `icon_verified`/`icon_source` với `/api/sync`.
  - `GET /logo.webp` → `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` (đã bỏ `immutable` 1 năm).
- **Trình duyệt thật (Light theme, `consoleErrors = 0`, `overflowX = false`):**
  - Đã kiểm trực tiếp bộ đếm động `/store` (`4 → 1 → 0 → 4`, không popup chắn — `#74, #77`), tiêu đề bài tin `/news` nền trắng chữ `#0f172a` (`#72`), phụ đề EN & ô tìm kiếm `/en/store` không cắt chữ (`#76, #78`), đổi ngôn ngữ footer giữ nguyên `/en/store` & `/en/ban-hang` (`#67`), thanh tiến độ Flash Sale cam đậm rõ nét (`#75`), khung ảnh sản phẩm số vuông & nhãn `"Standard processing"` (`#20, #22`), và giỏ EN `"1 item"` / `"Total (1 item):"` (`#79, #80`, đã xóa sạch giỏ về `0` sau kiểm thử).
  - **Giới hạn kiểm chứng bằng mắt đối với hàng vật lý:** Kệ live hiện tại có `0` sản phẩm vật lý đang mở bán (`Physical Goods (Ship) 0`), nên các nhánh gate hàng vật lý của `#18, #20, #21, #28, #30` trong đợt này mới xác minh ở cấp mã nguồn; kiểm bằng mắt cần có 1 sản phẩm vật lý thật trên kệ (ngoài phạm vi đợt này).

---

## §5. Backlog Còn Lại (Không Sửa Code Đợt Này), Blocked & Khôi Phục An Toàn

- **Backlog đã ghi nhận rõ phạm vi:**
  1. **Đường dẫn ảnh `` `/game_icons/${...}` `` trần ngoài 4 file phạm vi `#32` (Việc 2):** Quét `git grep -n "/game_icons/\${" -- src/` trên toàn `src/` còn **`72` hit** trên `21` file (`41` hit trong `src/admin/` trên `10` file + `31` hit ngoài `src/admin/` trên `11` file — nhiều nhất ở `GiveawaysView.tsx` `10` hit, `AdminView.tsx` `4` hit, `newsService.ts` `3` hit); trừ `2` hit hợp lệ trong chính helper `src/utils/safeImageUrl.ts:38,50` còn **`70` hit trần thực tế trên `20` file trong `src/`** cần chuyển sang `safeGameIconUrl` ở đợt sau. Ngoài ra phía `functions/` còn `70` hit trên `14` file (dựng chuỗi đường dẫn phía server).
  2. **Chuỗi ghi cứng còn lại trong `ApiKeysModule.tsx` ngoài phần khung `#43`:** Tiêu đề bên trong modal `"Danh sách quyền có thể cấp (... quyền đã chọn)"` (`src/admin/modules/ApiKeysModule.tsx:3733`), mô tả chi tiết từng scope và một số chuỗi toast/confirm vẫn ghi cứng tiếng Việt (nằm trong `2.895` vi phạm của `docs/check_hardcoded_i18n_all.log`).
  3. **Ternary ghi cứng ở nhánh `catch` của `SellerCenterView.tsx` (`#71c`):** Các nhánh `catch` (`L201, L416, L470, L494, L629, L662...`) vẫn dùng ternary trực tiếp `isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.'` thay vì qua khóa `t()`.
  4. **Trần phân trang `#71b` (`SellerCenterView.tsx:228`):** Đang nạp tối đa `15` trang (`1.500` game) — đủ cho catalog hiện tại (`593` game), sẽ cần nâng trần hoặc tìm kiếm server-side nếu catalog vượt `1.500` game trong tương lai.
  5. **Chuỗi lỗi phía server & Đợt 2 NCC ngoài:** Một số `data.error` trả trực tiếp từ API backend (`/api/seller-orders/multi`) vẫn viết bằng tiếng Việt phía server; Đợt 2 kết nối nhà cung cấp ngoài vẫn chờ thông tin API đối tác.
- **Blocked:** Không có.
- **Khôi phục an toàn (khi cần):**
  ```bash
  git revert 9837e04 8ce261d --no-edit && git push origin main && npm run deploy:all
  ```
