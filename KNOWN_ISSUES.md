# KNOWN_ISSUES.md — Danh Mục Lỗi Đã Biết, Bẫy Cần Tránh & Quy Trình Kiểm Thử

> **CẢNH BÁO BẮT BUỘC DÀNH CHO AI AGENT VÀ DEVELOPER**:
> Trước khi thực hiện bất kỳ thao tác sửa đổi nào:
> 1. **BẮT BUỘC ĐỌC** danh mục lỗi dưới đây để không bao giờ lặp lại các cách sửa đã thất bại.
> 2. Nếu vấn đề chưa rõ nguyên nhân: **ĐIỀU TRA & THU THẬP THÔNG TIN TRƯỚC**, tuyệt đối không sửa mò hoặc tự ý viết lại mã nguồn không liên quan.
> 3. Sau khi sửa: Thực hiện đầy đủ các bước trong **Post-flight Checklist** trước khi báo cáo hoàn thành.

---

## 1. DANH MỤC LỖI & CÁC BẪY ĐÃ THẤT BẠI (DO NOT REPEAT)

### ISSUE-347: Vòng Lặp Tử Thần Mount–Unmount Gây Đơ Trình Duyệt Tại `/seller`, Dội Vòng Đa Tab `WALLET_UPDATED`, Nhãn `{COUNT}` Trên `/gian-hang/*`, Thiếu Xử Lý HTTP `404` & Cold-Isolate D1 Column Guard (28/11/2026)
- **Nguyên nhân gốc rễ (Root Cause — Mục 495)**:
  1. *Vòng lặp Mount–Unmount gây đơ trình duyệt trên `/seller`*: Trước Mục 495, `SellerPortalApp.tsx` gắn `<SellerCenterView>` bên trong nhánh `<SellerOnboardingLanding>` khi `isApprovedWorkspace === false`. Khi `GET /api/seller` trả `has_seller: true`, `SellerPortalApp` đổi nhánh JSX sang không gian làm việc toàn màn hình → React gỡ bỏ bản thể #1 và gắn mới bản thể #2 với state mặc định `sellerData = null, loading = true`. Ngay tại commit `0ms`, `useEffect` của bản thể #2 gọi `onPortalContextChange({ hasSeller: false, seller: null })` → `isApprovedWorkspace` sập lại về `false` → lặp vô hạn 20–30 FPS kèm bão request `GET /api/seller` làm treo cứng trình duyệt.
  2. *Xử lý thiếu HTTP `404` cho thành viên chưa mở shop*: Khi thành viên đã đăng nhập nhưng chưa có gian hàng, `GET /api/seller` trả HTTP `404` (không phải `200 { has_seller: false }`). Bootstrap trong `SellerPortalApp.tsx` bắt buộc xử lý rõ `else if (res.status === 404)` chuyển sang `hasSeller: false` mà không hiện lỗi mạng.
  3. *Bẫy dội vòng đa tab `WALLET_UPDATED` trong `App.tsx`*: `handleUpdateUser` trước đây luôn gọi `broadcastCrossTabEvent('WALLET_UPDATED')` kể cả khi được kích hoạt bị động từ `pine_user_updated` hoặc `subscribeCrossTabEvents`, gây bóng bàn đồng bộ liên tục khi mở song song tab `/seller` và `/gian-hang/*`.
  4. *Hiển thị `{COUNT}` thô, thương hiệu cũ `CodeGame.Shop` và icon 404 trên `/gian-hang/:slug`*: `UniversalMallView.tsx:2791` đọc Proxy `t.mall?.breadcrumb?.store` thiếu `{ count }` → hiển thị `CỬA HÀNG ĐA NGÀNH ({COUNT} SẢN PHẨM)`; `public/sw.js` (`v10`) pre-cache tĩnh `'/'` và `'/logo.png'`; `functions/_worker.ts` chưa có `/gian-hang/*` trong `isDynamicShellPath`; và ảnh game 404 không có fallback monogram.
  5. *Bẫy fast-path `ensureMarketplaceSchema` trên isolate lạnh*: Nếu isolate Cloudflare Worker lạnh nhận request trực tiếp vào `/api/stores/:slug` trước khi chạy `ensureSchemaUpgrades`, fast-path trả sớm khi bảng `seller_disputes` đã tồn tại sẽ bỏ qua cột mới `banner_preset`/`pinned_notice` trên bảng `sellers`.
- **Giải pháp chuẩn (Đã khóa hồi quy trong `test_seller_portal_standalone.ts` — `39/39 PASS`)**:
  - **Single-Source Bootstrap**: Chỉ `SellerPortalApp.tsx` gọi duy nhất 1 lần `GET /api/seller` theo chuỗi nguyên thủy `currentUserId` (có `AbortController` + timeout 10s + xử lý `404`/`401`), hiển thị khung skeleton sạch khi đang tải và truyền `initialBootstrap={sellerSnapshot}` xuống `SellerCenterView.tsx` (kèm chốt chặn `if (loading && !sellerData) return;` và `if (snapshot.loading && !snapshot.hasSeller && prev.hasSeller) return prev;`).
  - **Opt-In Broadcast**: `handleUpdateUser(usr, { broadcast?: boolean })` chỉ phát `WALLET_UPDATED` khi `options?.broadcast === true` (các listener bị động truyền `{ broadcast: false }`).
  - **Storefront SSR + SW v11 + Cold Guard**: Đổi breadcrumb sang `t('mall.breadcrumb.partnerStore')`, thêm `/gian-hang/*` & `/en/gian-hang/*` vào SSR `_worker.ts`, nâng `sw.js` lên `codegame-pwa-v11`, thêm kiểm tra `pragma_table_info('sellers')` ngay trong `ensureMarketplaceSchema`, và dùng `resolveProductCoverImage` + `onError` monogram fallback trên `PublicStoreView.tsx`.

### ISSUE-346: Bẫy Xung Đột Prefix `wcg_*` Với `storageMigration.ts`, Ghim Edge Cache `s-maxage=3600` Ở SSR HTML & Bảo Vệ Tính Từ Tiếng Anh `"6 Core Pillars"` Khi Đổi Đơn Vị Tiền `coreUnitName` (28/11/2026)
- **Nguyên tắc & Bẫy cần tránh (Mục 494)**:
  1. *Xung đột tên khóa `localStorage` với cơ chế tự động đổi tên `wcg_* -> pine_*`*: Script khởi động trong `index.html` và `src/utils/storageMigration.ts` quét và di trú toàn bộ khóa `localStorage` bắt đầu bằng `wcg_` sang `pine_*`. Vì vậy khóa cache thương hiệu phía trình duyệt **bắt buộc dùng tên `pine_brand_identity_cache_v1`** (trong khi khóa SSOT trong D1 `system_settings` giữ chuẩn hệ thống `wcg_brand_identity_v1`).
  2. *Ghim cache SSR HTML làm chậm cập nhật tên sàn trên `<title>`/OG/JSON-LD*: Trước Mục 494, `renderSeoHtml` trong `functions/_worker.ts` trả `Cache-Control: public, max-age=300, s-maxage=3600` khiến đổi tên sàn trong Admin có thể bị kẹt tới 1 giờ ở CDN PoP. Đã đổi sang `Cache-Control: public, max-age=0, must-revalidate` + `CDN-Cache-Control: no-store` + `X-Catalog-Epoch` kèm tiêm tức thì `window.__WCG_BRAND__` (Zero-FOUC) cho cả trang khách và `/admin`.
  3. *Bảo vệ tuyệt đối tính từ tiếng Anh `"Core"` và tên cột/route/enum kỹ thuật*: Khi người dùng đổi đơn vị tiền tệ ví từ `"Core"` sang `"Xu"`/`"Point"`/`"Coin"`, chỉ nội suy khóa hiển thị qua `{coreUnit}` và `formatCore()`. Tuyệt đối giữ nguyên cột D1 (`price_core`, `fee_debt_core`), đường dẫn API (`/pay-core`), giá trị enum (`currencyMode: 'VND' | 'CORE'`), và chuỗi tiếng Anh `en.solutions.pillarsTitle = "6 Core Pillars of Our Architecture"` (đã khóa hồi quy bởi bộ test `scripts/tests/test_brand_identity_sync.ts`).
  4. *Loại trừ tĩnh `/manifest.json` trong `public/_routes.json` & Bản ghi kế thừa `CodeGame.Shop` trên D1 live*: Nếu giữ `"/manifest.json"` trong danh sách `exclude` của `public/_routes.json`, Cloudflare Pages phục vụ file tĩnh `dist/manifest.json` và bỏ qua `_worker.ts`; tương tự nếu `wcg_brand_identity_v1` chưa từng được lưu, `extractBrandFromSettingsMap` phải lọc các tiêu đề kế thừa cũ (`CodeGame.Shop`, `/logo.png`) trong `wcg_admin_content_v4` để không làm hồi sinh thương hiệu cũ. Đã khóa hồi quy bằng test #10 & #11 trong `test_brand_identity_sync.ts`.
  5. *Bẫy `ETag` trùng giữa 2 bản deploy khác nhau khi `CatalogEpoch` không đổi*: Nếu `/api/brand` và `/api/sync-lite` chỉ tạo `ETag` từ `${epoch}` mà không gắn `${__BUILD_ID__}`, trình duyệt cũ sẽ gửi `If-None-Match` khớp với bản build cũ → nhận `304 Not Modified` và dùng lại JSON thương hiệu cũ dù bản build mới đã đổi logic đọc. Đã gắn `__BUILD_ID__` vào cả `ETag` lẫn `epochCacheKey` (`&_b=...`) khi build production (khóa hồi quy bằng test #12).

### ISSUE-345: Lỗi `D1_TYPE_ERROR` Ở `POST /api/seller/subaccounts`, Chặn Báo Lỗi Đơn `PAID` Ở `/report` & Thiếu `PATCH /api/seller` Trong `shouldBumpCatalogEpoch` (28/11/2026)
- **Triệu chứng & Nguyên nhân (Bắt được qua E2E Worker + SQLite D1 thật — Mục 493)**:
  1. `functions/api/seller/subaccounts/index.ts:106` đọc `storeAuth.seller.member_id` (thuộc tính không tồn tại, cột thật là `owner_member_id`) nên `currentMemberId` bị `undefined` khi `storeAuth.member` vắng mặt → `INSERT INTO seller_subaccounts` ném `HTTP 500 D1_TYPE_ERROR: Type 'undefined'`.
  2. `functions/api/seller-orders/[id]/report.ts:69` chỉ cho phép `order.status === 'DELIVERED'`, trong khi đơn mua qua Ví Core giao mã tức thì (`POST /api/seller-orders`) có trạng thái `'PAID'` → khách hàng không thể gửi báo lỗi (`HTTP 400`).
  3. `functions/services/cache_service.ts` chưa nhận diện `PUT/PATCH /api/seller` trong `shouldBumpCatalogEpoch`, khiến thao tác bật/tắt **Nghỉ Bán 1 Chạm (`is_vacation`)** không làm mới `X-Catalog-Epoch` cho `/api/sync-lite`.
- **Giải pháp chuẩn (Đã khóa hồi quy trong `test_seller_portal_standalone.ts`)**:
  - Dùng `storeAuth.member?.id || storeAuth.memberId || storeAuth.seller.owner_member_id || null` tại `subaccounts/index.ts`.
  - Cho phép cả `'PAID'` và `'DELIVERED'` trong `seller-orders/[id]/report.ts`.
  - Bật `shouldBumpCatalogEpoch` cho `PUT`/`PATCH` trên `/api/seller`.

### ISSUE-344: Bẫy Va Chạm `ADMIN_HASH_PREFIXES` Với Hash `/seller#/dashboard`, `/seller#/orders`, `/seller#/sepay` & Phình Bundle Trang Chủ Khi Import Tĩnh `SellerCenterView` (28/11/2026)
- **Nguyên tắc & Bẫy cần tránh (Mục 492)**:
  1. *Va chạm hash giữa Cổng Người Bán (`/seller`) và `AdminApp`*: Trong `src/App.tsx`, `ADMIN_HASH_PREFIXES` chứa `#/dashboard`, `#/orders`, `#/sepay`, `#/profile` tại **3 vị trí độc lập** (khởi tạo `useState`, `loadInitialData -> parseHash`, và `handlePopState`). Nếu bỏ sót bất kỳ vị trí nào trong 3 chỗ này, `/seller#/sepay` sẽ bị định tuyến nhầm sang `AdminApp` và `/seller` sẽ bị `parseHash` đẩy về `/` hoặc `/en/`. **Bắt buộc** luôn kiểm tra `!isAdminDomain && isSellerPortalPathname(path)` TRƯỚC mọi lần gọi `ADMIN_HASH_PREFIXES.some(...)` ở cả 3 vị trí (đã khóa hồi quy bởi kiểm tra vết quét toàn bộ file `app_guards_all_admin_hash_sites_with_seller_path` trong `test_seller_portal_standalone.ts`).
  2. *Cấm import tĩnh `SellerCenterView` / `SellerPortalApp` vào `UniversalMallView.tsx`*: Import tĩnh khiến gói JS trang chủ khách mua phình lên `619.10 KB` (sát trần `650 KB` Lean Guard). Tách qua `React.lazy(() => import('./components/seller/SellerPortalApp'))` trong `src/App.tsx` giúp giảm tức thì `-204.29 KB` (`619.10 KB -> 414.81 KB`) cho trang chủ khách mua.
  3. *Đồng bộ đa tab khi mở `/seller` ở tab mới (`target="_blank"`)*: Mọi thay đổi đăng nhập, đăng xuất, nạp Ví Core hoặc đổi Sáng/Tối phải gọi `broadcastCrossTabEvent` (`src/utils/crossTabSync.ts`) để đồng bộ tức thì giữa tab `/` và tab `/seller` trên cùng origin mà không vi phạm Single-Domain Auth.

### ISSUE-343: Cách Ly Tài Chính `DIRECT_SEPAY` (Cấm Phát Hành Core Sàn), Fail-Closed AES-256-GCM Token SePay, Tạm Giữ Vốn Sỉ Affiliate & Bẫy Chữ Ký `invalidateCatalogEdgeCache` (28/11/2026)
- **Nguyên tắc & Bẫy cần tránh (Mục 491)**:
  1. *Nguy cơ phát hành Core ảo trên đơn chuyển thẳng về STK Gian hàng (`payment_channel = 'DIRECT_SEPAY'`)*: Vì khách chuyển tiền thẳng vào tài khoản ngân hàng của chủ gian hàng (không đi qua STK Sàn), sàn **TUYỆT ĐỐI KHÔNG** cộng `pending_balance_core`/`available_balance_core` cho shop bán (chỉ cộng giá sỉ cho Shop B khi đã trích trước `affiliate_wholesale_reserved_core` từ Ví Core thật của chủ Shop A), đồng thời khóa cứng `resolve-report.ts` và `admin/seller-disputes/[id]/resolve.ts` chỉ cho `REFUND_CORE`/`REFUND` khi trừ nguyên tử thành công từ Ví Core thật của chủ shop (`WHERE balance >= ?`, `changes === 1`); nếu không đủ phải trả HTTP `400 SELLER_CORE_INSUFFICIENT_FOR_DIRECT_REFUND`.
  2. *Fail-Closed cho `api_token_encrypted` (Rule 10.2)*: `encryptSellerSepayToken` / `decryptSellerSepayToken` trong `functions/services/seller_sepay_service.ts` bắt buộc dùng `env.MARKETPLACE_CODE_KEY` (`>= 16` ký tự), ném `SellerSepayConfigError(503)` nếu thiếu hoặc quá ngắn, tuyệt đối không fallback chuỗi tĩnh.
  3. *Hoàn trả nguyên tử `affiliate_wholesale_reserved_core`*: Khi tạo đơn Liên Shop `DIRECT_SEPAY` trong `multi.ts`, vốn sỉ được trừ nguyên tử khỏi Ví Core chủ Shop A. Bắt buộc hoàn lại đầy đủ tại cả 3 điểm thoát: `rollbackReservedItems()` (khi `STOCK_RACE_CONFLICT` / lỗi batch), `checkAndExpireSellerOrdersD1` (khi đơn quá hạn 15 phút), và `pay-core.ts` (khi khách chuyển sang trả bằng Ví Core).
  4. *Chữ ký tham số thứ 4 của `invalidateCatalogEdgeCache` & phá hủy `request` ở `multi/[id].ts`*: `invalidateCatalogEdgeCache(ctx, request, env, extraUrls: string[] = [])` nhận mảng `string[]` (không phải chuỗi nhãn lý do); đồng thời `multi/[id].ts` trước Mục 491 từng bỏ sót `request` khi destructure `context`, đã sửa triệt để và khóa bằng `tsc` (`0` lỗi mới).

### ISSUE-342: Giới Hạn Phân Trang 100 Game/Trang Ở `/api/games`, Lệch Tổng Số Lượng vs Số Dòng Giỏ Hàng Ở `CartDrawerModal`, Thiếu `ETag`/Clone RAM Cache Ở `/api/sync?nocache=1` & Mã Lỗi Chi Tiết `reserveSupplierCreditAtomic` (27/11/2026)
- **Triệu chứng & Nguyên nhân**:
  1. *Giới hạn 100 bản ghi mỗi trang trên `/api/games`*: `GET /api/games` giới hạn cứng tối đa `100` game/trang ở phía server, nên nếu `SellerCenterView.tsx` chỉ gọi 1 lần `/api/games?limit=1000` thì danh mục chọn game khi đăng sản phẩm số vẫn bị cắt ở 100 game đầu thay vì nạp đủ toàn bộ `593` game.
  2. *Đếm `cartItems.length` thay vì tổng `quantity` & nhân đôi số lượng khi mở `CartDrawerModal`*: Dùng `cartItems.length` khiến giỏ có 1 mặt hàng với `quantity > 1` hiển thị sai tổng số món (kèm ngữ pháp `"1 items"`), đồng thời gọi `cartService.syncWithServer()` vô điều kiện mỗi lần mở ngăn kéo khiến `POST /api/cart/sync` cộng dồn lặp lại số lượng local đã đồng bộ.
  3. *Bất đối xứng `ETag` và đột biến in-place bộ nhớ đệm ở `/api/sync?nocache=1`*: Nhánh bypass `?nocache=1` trước đó chưa đính kèm `ETag` (`W/"sync-<epoch>"`) / `X-Catalog-Epoch` và chưa chuẩn hóa đồng nhất `icon_verified`/`icon_source` của `upcomingGames`; ngoài ra `settingMemoryCache` và `getCanonicalSettingFallback` trả trực tiếp tham chiếu object trong RAM isolate nên sửa đổi in-place ở một request có thể rò rỉ sang request kế tiếp.
  4. *Gộp chung mã lỗi ở `reserveSupplierCreditAtomic` & retry thừa trên HTTP `4xx`*: Khi câu lệnh batch giữ hạn mức không chèn được dòng sổ cái, trả cứng `CREDIT_LIMIT_EXCEEDED` làm che khuất trường hợp NCC không tồn tại, đang tạm tắt hoặc đang ở chế độ trả trước; đồng thời webhook fulfillment không nên retry trên lỗi cấu hình phía nhận `4xx` (`404`/`405`).
- **Giải pháp chuẩn đã kiểm chứng (Mục 490)**:
  - Phân trang tuần tự trang 1 rồi `Promise.all` các trang `2..totalPages` (`/api/games?page=1..totalPages&limit=100&sort=name_asc`, trần an toàn `15` trang, khóa `catalogFetchedRef`) tại `SellerCenterView.tsx:215-252` để hợp nhất đủ `593` game.
  - Tính nguyên tử `totalItemCount` (tổng `item.quantity`), `totalCore` và `groupedStores` qua `useMemo` từ cùng một snapshot `cartItems`, tách khóa số ít/số nhiều (`cart.*Singular`/`cart.*Plural`), và chỉ gọi `cartService.syncWithServer()` khi `cartService.getCart().length === 0` (`CartDrawerModal.tsx:52-123`).
  - Trả đầy đủ `ETag: W/"sync-<epoch>"` và `X-Catalog-Epoch` trên `/api/sync?nocache=1` (giữ nguyên `Cache-Control: no-cache, no-store, must-revalidate`), chuẩn hóa `normalizeSyncUpcomingGamesJson`, gắn `&_b=<buildTag>` vào Edge Cache key (`functions/_worker.ts:320-353, 726-818`), và nhân bản sâu bằng `cloneSettingValue` tại `settingMemoryCache` / `getCanonicalSettingFallback` (`functions/services/d1_service.ts:4652-4681, 4736-4784, 4817-4849`).
  - Phân biệt tường minh `SUPPLIER_NOT_FOUND`, `SUPPLIER_INACTIVE`, `SUPPLIER_NOT_POSTPAID_MODE` với `CREDIT_LIMIT_EXCEEDED` trong `reserveSupplierCreditAtomic`, và chỉ retry webhook (`1..3` lần) khi lỗi mạng/timeout hoặc HTTP `>= 500` / `429` (`functions/services/supplier_connector_service.ts:760-858, 1269-1293`).

### ISSUE-341: Chi Tiết Cơ Chế `createRecursiveProxy` (`LanguageContext.tsx`), Đính Chính Dương Tính Giả `sellerApiKeys.noKeys`, Lookback Ternary Tách Dòng & Giới Hạn Guard I18N (27/11/2026)
- **Bài học kỹ thuật & Đính chính**:
  - Tại `src/context/LanguageContext.tsx:305-321`, `createRecursiveProxy` dùng `const finalVal = val !== undefined ? val : prop;` — khi khóa vắng mặt trong từ điển, Proxy trả về chính tên thuộc tính (chuỗi khác rỗng / truthy) nên mọi biểu thức fallback kiểu `t.nav.notifications || 'Thông Báo'` đều không bao giờ chạy tới vế phải. Bắt buộc luôn khai báo khóa thật đối xứng trong `vi.json` & `en.json` (lưu ý đính chính: khóa `sellerApiKeys.noKeys` từng nghi ngờ ở vòng trước thực tế ĐÃ CÓ đủ trong cả 2 từ điển, là dương tính giả).
  - Trong `scripts/check-hardcoded-i18n.cjs`, lookback 4 dòng kiểu từng dòng riêng lẻ sẽ bỏ sót ternary `isEn` tách dòng (`isEn` ở dòng trên, `?` ở dòng dưới, `:` ở dòng thứ 3 như `CartDrawerModal.tsx:616-618`); cần nối cửa sổ 4 dòng trước (`lines.slice(Math.max(0, idx - 4), idx).join(' ')`) trước khi kiểm regex. Đồng thời lưu ý giới hạn đã biết: guard chỉ quét 3 mẫu JSX (text, attr, template literal), không quét chuỗi thuần truyền vào hàm JS (`throw new Error(...)`, `setCheckoutError(...)`), và `data.error` trả về từ `/api/seller-orders/multi` hiện vẫn là tiếng Việt phía server.
  - Để kích thước file log trên đĩa (`ls -l` / `fs.statSync`) trùng khớp tuyệt đối với Git blob (`git cat-file -s`), cấu hình `docs/*.log text eol=lf` trong `.gitattributes` và ghi log chuẩn LF.

### ISSUE-340: Bẫy Proxy `LanguageContext` Trả Key Thô (`||` Fallback Vô Hiệu), CSS Mobile Ghi Đè `.scrollbar-none`, Cắt Header 390px, Tương Phản Nền Sáng & 404 `/game_icons/test-game.webp` (27/11/2026)
- **Triệu chứng & Nguyên nhân**:
  - `LanguageContext` dùng `Proxy` trả về chính tên thuộc tính (truthy string) khi thiếu khóa trong `vi.json`/`en.json`, khiến biểu thức `t.nav.notifications || 'Thông Báo'` hiển thị nguyên chữ `"notifications"`, `"support"`, `"login"` trên topbar live.
  - `@media (max-width: 768px) { .overflow-x-auto { scrollbar-width: thin; } }` trong `src/index.css` ghi đè `.scrollbar-none`, làm lộ thanh cuộn xám trên thanh danh mục mobile.
  - Trên viewport `390px`, cụm logo + tìm kiếm + yêu thích + giỏ hàng nằm chung 1 hàng thiếu `min-w-0` khiến ô tìm kiếm bị bóp còn `24px` và biểu tượng giỏ hàng tràn ra `x=388..416px`; thanh thông báo đầu trang thiếu `min-w-0 flex-1` gây tràn `754px`.
  - Nhiều class thiết kế chỉ cho dark-mode (`text-slate-300`, `text-amber-300`, `text-indigo-300`, `text-rose-300`, `text-primary-light`, `bg-slate-900/80`) trong `StoreView`, `ProductDetailModal`, `ProductCheckoutModal` bị chìm chữ hoàn toàn khi chạy giao diện nền sáng mặc định.
  - Bản ghi sản phẩm chứa ảnh bìa `/game_icons/test-game.webp` không tồn tại gây 6 lỗi HTTP 404 mỗi lần tải trang chủ.
- **Giải pháp chuẩn đã kiểm chứng (Mục 488)**:
  - Khai báo đầy đủ khóa đối xứng trong `vi.json` & `en.json` (`2.093 / 2.093`, tuyệt đối không dựa vào `||` sau Proxy `t.x.y`).
  - Đổi selector trong `src/index.css` thành `.overflow-x-auto:not(.scrollbar-none)` và khóa `.scrollbar-none { scrollbar-width: none !important; }`.
  - Bố cục header mobile 2 tầng trong `UniversalMallView.tsx`, phân tầng z-index (`z-30` cho sticky header/theme switcher, `z-[110]` cho modals), lọc `/game_icons/test-game.webp` sang `/package-placeholder.svg` kèm `onError`, và bổ sung cặp màu chuẩn nền sáng/tối (`text-amber-700 dark:text-amber-300`, `bg-amber-50 dark:bg-amber-500/10`, ...) trên toàn bộ cụm thương mại.

### ISSUE-339: Stale `selectedCategory` Khi Đồng Bộ 1 Chiều Từ `App.tsx` Xuống `UniversalMallView` & `StoreView` (27/11/2026)
- **Triệu chứng & Nguyên nhân**:
  - `App.tsx` giữ `storeCategoryFilter` và đẩy xuống `UniversalMallView` qua `controlledStoreCategory`, nhưng khi người dùng thao tác nội bộ (`handleFilterGameToStore`, xóa chip `#game ✕` trong `StoreView`, reset/chọn category pill) thì `UniversalMallView` chỉ đổi state cục bộ `selectedCategory` mà không báo ngược về `App.tsx`. Hệ quả: chuỗi bấm `A (modal tầng App) → B (nội bộ sàn) → A (lại từ modal)` bị React bỏ qua `useEffect([controlledStoreCategory])` do `A === A`, giữ stale game B trên kệ.
- **Giải pháp chuẩn đã kiểm chứng (Mục 487)**:
  - Mở rộng `extra` của `onSubViewChange` (`UniversalMallView.tsx`) & `handleSelectMallView` (`App.tsx`) thêm `storeCategory?: string`; `handleFilterGameToStore` gọi `setSubView('store', { storeCategory: nextCategory })`, và đồng bộ các thao tác đổi/xóa category nội bộ + nút `✕` trong `StoreView.tsx` qua `onStoreCategoryChange` (khai báo rõ kiểu `(cat: string)` tránh `TS7006`).
  - Gỡ import thừa `isCodeExpired` ở `functions/_worker.ts:264` (`0` `TS6133` mới so với `75fa59b`), xuất `docs/tsc_full_check.log` kèm đủ marker `homepage_exit=0` / `HOMEPAGE_TSC_OK` / `full_tsc_exit=2` ngay trong commit code.

### ISSUE-338: Hợp Nhất Sàn `UniversalMallView` — Chặn Hồi Sinh `Game Zone` Từ D1 Cũ & Bẫy Chuyển Đổi Component Legacy (27/11/2026)
- **Triệu chứng & Bẫy cần tránh**:
  - Sau khi xóa nhánh `'game-zone'` khỏi code giao diện (`013718d`), dữ liệu bảng D1 `homepage_sections` cũ vẫn có thể chứa `nav_game_zone: true` / `shortcut_game_zone: true`, và `PUT /api/admin/homepage-sections` yêu cầu gửi trọn payload JSON `sections` mới cập nhật sạch.
  - Khi gộp toàn bộ trang độc lập vào `UniversalMallView` và xóa `src/components/*` cũ (`GameDetailModal.tsx`, `Header.tsx`, `Footer.tsx`, `src/i18n/translations.ts`), `WishlistDrawerModal` vẫn còn callback `handleOpenStoreProduct` dễ dính `TS2304` nếu không nối về `handleSelectProductById` + `handleFilterStoreByGame`.
- **Giải pháp chuẩn đã kiểm chứng (`013718d`)**:
  - Đặt bộ lọc phòng thủ `sub.id !== 'nav_game_zone' && sub.id !== 'shortcut_game_zone'` tại cả 2 mảng cấu hình, `renderShortcutItem` và `renderNavButton` trong `src/components/mall/UniversalMallView.tsx`, đồng thời tắt cả 2 mục trong Admin `#/homepage-sections` (`PUT` `200`).
  - Xử lý HTTP `301` (cả `GET` và `HEAD`) ở `functions/_worker.ts` trước SEO gate cho `/test1*`, `/game/*`, `/g/*`, `/?game=`, `/?g=` → `${url.origin}/`, và giữ thống nhất khóa `localStorage` `wcg_shopee_theme`.

### ISSUE-337: Truyền Hàm `getHeaders()` Không Memoize Vào `SellerAffiliateManager` Gây Vòng Lặp Refetch, Tải Chậm & Chết Nút Xóa Webhook Qua UI (27/11/2026)
- **Triệu chứng & Nguyên nhân**:
  - `SellerCenterView.tsx:165` tạo hàm `getHeaders` mới mỗi lần render; `SellerAffiliateManager.tsx` đưa `[getHeaders]` vào `useCallback` của 4 hàm fetch và `useEffect` mount, khiến mỗi lần component cha re-render đều tái kích hoạt 4 request + đặt `loadingWebhooks = true`, tháo bỏ bảng `<table>` thay bằng `"Đang tải dữ liệu..."` → bấm Xóa webhook rơi vào DOM stale (`0` `window.confirm` trong 10 lần bấm) và kẹt tải `13,4s–19,5s`.
- **Giải pháp chuẩn đã kiểm chứng (`8e5f4b0` + `9360d21`)**:
  - Memoize `getHeaders` bằng `useCallback(..., [])` tại `SellerCenterView.tsx`, giữ `getHeadersRef = useRef(getHeaders)` trong `SellerAffiliateManager.tsx` (và `ResellSettingsModal`) để `useEffect` mount không phụ thuộc `[getHeaders]`, giữ DOM bảng khi `list.length > 0`, và khóa cả 4 nút dòng Webhook + nút Retry theo `loadingWebhooks`.

### ISSUE-336: Đua Tranh Trừ Kho/Mã Trong Batch Checkout Không Hoàn Tác, Thiếu Đường Ghi `stock_quantity` & Chữ Hoa/Thường `escrow_service.ts` (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - Gộp `UPDATE members` + `UPDATE seller_products/seller_codes` + `INSERT seller_orders` vào chung 1 `db.batch` rồi kiểm `meta.changes === 0` sau khi commit khiến buyer thua đua tranh nhận `409` nhưng tiền/pending/HOLD/đơn `PAID` vẫn đã ghi; `multi.ts` bỏ qua kết quả `batch` nên có thể tạo đơn QR vượt kho.
  - `seller_products` có cột `stock_quantity` nhưng `POST/PUT /api/seller/products` chưa nhận ghi cột này; `escrow_service.ts` còn so khớp strict `=== 'physical'` và phí cứng `0.02`/`0.05`; `approve.ts` chưa chặn trạng thái `REJECTED`/`REVOKED`/`SUSPENDED`.
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 481)**:
  - Áp dụng mô hình Reserve-First có hoàn tác rõ ràng trên cả `seller-orders/index.ts` (3 pha) và `seller-orders/multi.ts` (giữ từng món + `rollbackReservedItems`), bổ sung hoàn kho đúng về `origin_product_id` qua `LEFT JOIN seller_products` trong `checkAndExpireSellerOrdersD1`, thêm đường ghi `stock_quantity` trên `POST/PUT /api/seller/products`, bỏ hẳn `=== 'physical'` strict & `0.02`/`0.05` trong `escrow_service.ts`, chặn `approve.ts` chỉ nhận `PENDING`, và khóa hồi quy bằng 5 test case mới (`test:intershop` `12/12`, `npm test` `215/215`).

### ISSUE-335: 3 Lỗi Ẩn Trong Lõi Liên Shop Nội Bộ & Thiếu Cột `stock_quantity` Trên `seller_products` (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - `calculate3WaySplit` ghi cứng `isPhysical ? 0.02 : 0.05` bỏ qua cấu hình Admin; `resell.ts` so khớp `'PHYSICAL'` viết hoa trong khi D1 lưu `'physical'` viết thường; `resell.ts` gọi `syncAffiliatePriceAndStock(..., 'RESELL_PARAM_CHANGE', ...)` nhưng hàm đồng bộ không có nhánh xử lý `'RESELL_PARAM_CHANGE'` nên thay đổi MAP/hoa hồng bị bỏ qua âm thầm.
  - `seller_products` thiếu cột `stock_quantity` và `seller-orders/index.ts` chỉ lấy mã trong `seller_codes` (chưa chặn `ANTI_LOSS_PAUSED` và chưa trừ tồn kho gốc cho hàng vật lý liên shop).
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 480)**:
  - Mở rộng `wcg_marketplace_config_v1` thêm 7 tham số liên shop động (mặc định `affiliate_require_admin_approval: true`), nối phí sàn động vào `calculate3WaySplit` + `escrow_service.ts`, sửa lowercase `'physical'`, xử lý đầy đủ `'RESELL_PARAM_CHANGE'` (kèm tự khóa/phục hồi `ANTI_LOSS_PAUSED`), thêm migration `0052_seller_products_stock_quantity_v1` và bảo vệ checkout + trừ kho vật lý nguyên tử trong `seller-orders/index.ts` & `multi.ts`. Khóa hồi quy bằng `scripts/tests/test_intershop_affiliate.ts`.

### ISSUE-334: Bằng Chứng `tsc` / Test / Build Lưu Ở `scratch/` Ngoài Repo Hoặc File Log 0 Byte (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - `tsc --noEmit` khi pass xuất 0 byte (làm `docs/tsc_check_success.log` trống), còn file log full `tsc` và 2 file test được đặt trong thư mục `scratch/` ngoài Git (lặp 3 đợt `6b8c654`, `4f90677`, `4a6235b`), khiến bên kiểm chứng độc lập không thể tải qua `raw.githubusercontent.com` hoặc chạy lại test.
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 474)**:
  - Đưa test thật vào `scripts/tests/` kèm `tsx` + `npm test` trong `package.json`.
  - Dùng tên file duy nhất `docs/tsc_full_check.log` với `--listFiles` cho `tsconfig.homepage.json` và raw output đầy đủ cho `tsconfig.json` (kèm timestamp UTC + `exit=`).
  - Cập nhật `docs/build_success.log` bằng output build khớp `X-Build-Id` live và khóa quy tắc bắt buộc trong `AGENTS.md` (Chốt Chặn 3).

### ISSUE-333: Bẫy Đầu Độc Cache 3 Tầng Cho `/game_icons/*` (SPA Fallback `200 text/html` + `_headers` `immutable` 1 Năm + `sw.js` Cache-First Không Kiểm `image/*`) (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - Khi một icon mới chưa tồn tại ở đợt deploy trước (như `/game_icons/physical-default.webp` trước `6b8c654`), `env.ASSETS.fetch` trong `functions/game_icons/[file].ts` trả SPA `index.html` với `HTTP 200` + `text/html`, lại bị `public/_headers` gắn `Cache-Control: public, max-age=31536000, immutable` và bị `public/sw.js` (`codegame-pwa-v8`) lưu vĩnh viễn vào Cache Storage vì chỉ check `status === 200`.
  - Sau khi thêm file ảnh thật, các trình duyệt cũ vẫn bị SW và HTTP `immutable` trả về HTML → `<img>` lỗi giải mã → `onError` rơi sang `/game_icons/physical_goods.webp` (cũng trả `200 text/html`) hoặc `/og-image.jpg` / `/package-placeholder.svg`.
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 473)**:
  - Bắt buộc kiểm `content-type` bắt đầu bằng `image/` ở cả `functions/game_icons/[file].ts` (trả `404` + `no-store` nếu không phải ảnh) lẫn `public/sw.js` (nâng `codegame-pwa-v9` xóa sạch `v8`).
  - Bỏ `immutable` 1 năm trên `/game_icons/*` trong `public/_headers`, gắn `?v=2` cho `/game_icons/physical-default.webp` trong `safeImageUrl.ts`, và bỏ hẳn fallback dựng từ `gameSlug` trong `onError` của modal.

### ISSUE-332: Race Condition `ShopeeTestView` Gọi `/api/products` Ghi Đè `/api/sync-lite` Gây `/game_icons/undefined.webp` & Mất Thông Số Vật Lý Khi Chưa Đăng Nhập + `setErrorMessaget` + Fallback `: 2000` Ở `PackageShareModal` (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - `ShopeeTestView.tsx:388–398` gọi `GET /api/products?limit=100&_t=...` (không cache, về sau `/api/sync-lite`) rồi ghi đè `currentStoreProducts` và `localStorage['pine_admin_store_products_v4']` bằng object thiếu `cover_image_url`, `game_slug`, `weight_grams`, `warehouse_address`, `warranty_hours`. Khi render tiếp, `dataService.ts:3083–3084` dựng `/game_icons/undefined.webp` (404), kệ chính rơi về `📦`, modal khi chưa đăng nhập mất `500g`/`24 giờ`/kho gửi thật.
  - `PackageShareModal.tsx:232` dùng fallback ternary `: 2000` lọt qua regex chỉ quét `??`/`||`.
  - `AuthModal.tsx` còn 13 lời gọi `setErrorMessaget('authStrict.kX')` gây `ReferenceError` tại runtime khi guard submit kích hoạt (đặc biệt khi bật lại `GUEST_TURNSTILE_ENABLED=true`).
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 472)**:
  - Gỡ hẳn ghi đè `/api/products` khỏi `ShopeeTestView.tsx`, dùng chung 1 nguồn chuẩn `/api/sync-lite` cho cả Kệ chính & Flash Sale, đồng thời bổ sung đủ field vật lý vào `functions/api/products/index.ts`.
  - Tạo `src/utils/safeImageUrl.ts` (`sanitizeImageUrl`, `safeGameIconUrl`, `resolveProductCoverImage`), tự chữa lành cache bẩn trong `dataService.getStoreProducts()` và thay toàn bộ đường dựng `/game_icons/${slug}.webp` không kiểm tra slug.
  - Chặn badge `PackageShareModal` bằng `firstPurchaseOfferPrice > 0 && firstPurchaseOfferPrice < currentPrice` (xóa `: 2000`) và sửa 13 chỗ `setErrorMessaget(...)` thành `setErrorMessage(t(...))`.

### ISSUE-331: Ưu Đãi Mua Lần Đầu Đẩy Giá Thấp (`100đ`) Lên `2.000đ`, Ảnh `/game_icons/physical-default.webp` 404 & Cờ Tạm Tắt Turnstile Đăng Nhập Khách (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - `GET /api/store/my-offer` chỉ đọc `store_products` nên các sản phẩm từ `seller_products` có `selectedOffer === undefined`, rơi vào `defaultEligible = true` và lấy `offer_price: 2000` dù chiến dịch `wcg_first_purchase_config_v1` đang `enabled: false`, làm sản phẩm 100đ bị hiển thị thành `2.000đ` trong `ProductDetailModal`.
  - `functions/api/seller/products/index.ts` dùng fallback `/game_icons/physical-default.webp` nhưng tệp chưa tồn tại trong `public/game_icons/`, gây HTTP 404.
  - Bật/tắt Turnstile chung làm ảnh hưởng cả form đăng ký; khi cần tạm mở khóa đăng nhập khách để test nhưng vẫn bảo vệ đăng ký chống bot, bắt buộc tách cờ riêng.
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 471)**:
  - Chặn bắt buộc `candidateOfferPrice > 0 && candidateOfferPrice < currentPrice` và gỡ fallback cứng `2000` khỏi `ProductDetailModal.tsx`, `ProductCheckoutModal.tsx` (giữ `minQrAmount || 2000`), `ShopeeTestView.tsx`.
  - Bổ sung ảnh `public/game_icons/physical-default.webp` (`512×512`, `3.198 bytes`, chỉ có `.webp`).
  - Tách cờ `GUEST_TURNSTILE_ENABLED` (mặc định `false`) riêng cho đăng nhập khách trong `turnstile_service.ts`, `turnstile-config.ts`, `login.ts`, `AuthModal.tsx`; giữ nguyên Turnstile bắt buộc trên `register.ts` và tab Đăng ký. **Bắt buộc bật `GUEST_TURNSTILE_ENABLED=true` trên Cloudflare Pages Environment Variables và kiểm chứng live trước khi mở bán chính thức.**

### ISSUE-330: `sync-lite.ts` Lược Bỏ `product_type` Khi `.map()` & `ProductCheckoutModal.tsx` Sót 5 Chỗ VietQR "Giao Mã" + Ngoài Phạm Vi I18N Guard (26/11/2026)
- **Triệu chứng & Rủi ro**:
  - Kệ hàng live dùng nguồn `GET /api/sync-lite`, nhưng `.map()` tường minh trong `functions/api/sync-lite.ts` thiếu `product_type`, `weight_grams`, `warehouse_address`, `warranty_hours`, `seller_name`, khiến `isPhysical` luôn `false` trên kệ hàng, `ProductDetailModal` và `ProductCheckoutModal`.
  - 5 vị trí trong luồng VietQR/ví của `ProductCheckoutModal.tsx` chưa gate theo `isPhysical`, và file chưa nằm trong `IN_SCOPE_UI_FILES` của `check-hardcoded-i18n.cjs` (64 violations tiếng Việt ghi cứng).
- **Giải pháp chuẩn đã kiểm chứng (26/11/2026 - Mục 470)**:
  - Bổ sung 5 field nguồn + 2 field dẫn xuất (`brand`, `origin`) vào `sync-lite.ts` (không thêm field thừa/`shipping_fee`).
  - Gate đủ 5 chỗ VietQR/ví theo `isPhysical`, bổ sung 77 khóa `checkoutModal` song ngữ VI/EN, dọn sạch 64 violations và thêm `ProductCheckoutModal.tsx` vào `IN_SCOPE_UI_FILES` (20 file, 0 lỗi).

### ISSUE-329: ~110 Lệnh DDL Vô Điều Kiện Trong `ensureSchemaUpgrades` Chạy Lại Trên Mọi Isolate Lạnh (17–28s Ngoài HKG) (25/11/2026)
- **Triệu chứng & Rủi ro**:
  - Dù `appliedMigSet` đã bỏ qua các migration cũ và 5 hàm `ensure*Schema`, `ensureSchemaUpgrades` vẫn chứa ~110 lệnh DDL/seed nằm trực tiếp trong executor (4 vị trí không có guard `appliedMigSet.has()`), khiến mọi isolate lạnh của `search`, `automation/status`, `automation/config`, `/api/auth/me` chạy lại ~110 round-trip tuần tự (17–28 giây ở các POP Mỹ, gây abort timeout 3,5 giây ở lần đăng nhập admin đầu tiên nếu rơi vào isolate lạnh).
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 468)**:
  - Bọc đủ 4 vị trí bằng guard `appliedMigSet.has(...)` (`baseline_unconditional_ddl_v1`, `schema_v5_full_upgrades`, `wcg_virtual_layer_tables_v1`, `deleted_records_history_v1`), ghi ledger ở câu cuối cùng kèm `console.warn`.
  - Xuất `schema_mig_select` / `schema_ddl` vào `Server-Timing`, nối dây `preloadedMetaSettingPromise` không tuần tự hóa, sửa nhãn `probe`/`settings` trong `status.ts`, và bypass 16 key có điều kiện `isNoCache` trong `sync-lite.ts`.

### ISSUE-328: Độ Trễ `loadAllStoreProductsD1` Tuần Tự, `X-Timing-D1-Ms` Không Đồng Nhất & Fail-Open `AdminLoginGuard` (25/11/2026)
- **Triệu chứng & Rủi ro**:
  - `Server-Timing` trên isolate lạnh (`e31773c`) cho thấy nhánh `products` (`loadAllStoreProductsD1`) tốn `1.540 ms` trong khi `tombstones` (`43 ms`) và `settings` (`42 ms`) rất nhanh, do gọi lặp `ensureSchemaUpgrades` + `getSettingD1` và chạy tuần tự `store_products` rồi `seller_products`.
  - `status.ts` trước đó chỉ đo `SELECT 1` vào `X-Timing-D1-Ms` và chạy 5 bước D1 tuần tự; `search` & `config` chưa có timing headers.
  - `AdminLoginGuard.tsx` dùng `.catch(() => setIsTurnstileEnabled(false))` (fail-open khi lỗi mạng).
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 467)**:
  - Chuẩn hóa `X-Timing-D1-Ms` (tổng thời gian D1 trong handler), `X-Timing-Total-Ms`, và `Server-Timing` kèm `colo` trên cả 4 endpoint.
  - Chạy song song `Promise.all` trong `loadAllStoreProductsD1` (với `skipSchemaCheck`), `status.ts` (gộp `WHERE key IN`), và `search_service.ts` (`products` + `games`), giữ `?nocache=1` luôn bypass mọi tầng cache.
  - Đổi `AdminLoginGuard.tsx` `.catch()` sang `setIsTurnstileEnabled(true)` (fail-closed).

### ISSUE-327: Chặn Hồi Sinh Phiên Qua `pine_explicit_logout`, Bắt Buộc Role Admin Khi Bỏ Turnstile Admin & Đọc `metadata` Trong `toggleWishlistItem` (25/11/2026)
- **Triệu chứng & Rủi ro**:
  - Người dùng đăng xuất nhưng session vẫn có thể bị ghi lại bởi `persistUserMultiTier`/`saveCurrentUser`/`refreshCurrentUserBalance` nếu có tab khác hoặc event ngầm kích hoạt.
  - `toggleWishlistItem()` nhận dữ liệu từ `params.metadata` của client nhưng chỉ đọc top-level `params.item_title`/`params.price_core`, gây lưu `0 Core` và fallback ID thô trong D1.
  - Mở khóa Admin Login không cần Turnstile có thể bị client thường lạm dụng nếu backend không xác minh `member.role` là `ADMIN`/`SUPER_ADMIN`.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 466)**:
  - Dùng chốt `localStorage['pine_explicit_logout'] = '1'` tại `clearUserMultiTier()`, chỉ xóa tại `authService.saveSession()`.
  - Tách riêng `ADMIN_TURNSTILE_ENABLED` (mặc định `false`) và `/api/auth/turnstile-config?scope=admin`; backend chỉ bỏ qua Turnstile khi `isAdminLogin` và tài khoản thực tế có role `ADMIN` hoặc `SUPER_ADMIN`.
  - Cập nhật `toggleWishlistItem()` đọc fallback từ `params.metadata`, bổ sung RAM cache cho `ensureCodeReportsSchema`/`ensureGameCommentsSchema` và header `X-Timing-D1-Ms`/`X-Timing-Total-Ms`.

### ISSUE-326: Bẫy Race Condition `/api/auth/me` Hồi Sinh Phiên Đã Đăng Xuất, 5 Hàm `ensure*Schema` Chạy Trước `appliedMigSet` & Magic-String Turnstile
- **Triệu chứng & Rủi ro**:
  - Sau khi bấm Đăng xuất, nếu request `/api/auth/me` đang chạy ngầm trả về muộn thì `persistUserMultiTier(user)` hồi sinh lại toàn bộ 4 tầng session + 2 cookie, đồng thời `pine_admin_members_v4` còn sót `session_token`.
  - `WishlistDrawerModal` chỉ đọc `record.metadata` trong khi D1 trả cột phẳng (`item_title`, `price_core`), làm tiêu đề bị mất và hiện `"0 Core"`.
  - 5 hàm `ensure*Schema` (~109 lệnh DDL) chạy trước `appliedMigSet` gây độ trễ cold start 23–37 giây.
  - Magic-string `cf_turnstile_verified` và cờ `TURNSTILE_ENABLED=false` cho phép vượt qua xác minh chống bot khi đăng ký.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 465)**:
  - Dùng `logoutEpoch` trong `dataService`, xóa `session_token` ở `pine_admin_members_v4`, và kiểm tra token (gồm cả `user.session_token`) trong `getCurrentUser()`.
  - Chuẩn hóa đọc cột phẳng D1 và trạng thái loading `t('wishlist.loading')` trong `WishlistDrawerModal`.
  - Nạp `appliedMigSet` lên đầu `ensureSchemaUpgrades` và bọc 5 hàm `ensure*Schema` bằng `core_subschemas_v1`.
  - Xóa hẳn `cf_turnstile_verified` và nhánh bypass `TURNSTILE_ENABLED` khỏi `turnstile_service.ts`.

### ISSUE-325: Bẫy Lệch Key Đồng Bộ `pine_admin_sepay_v4` vs `wcg_admin_sepay_v4`, `totalProducts` Tính Trên Lát Cắt Phân Trang & Chưa Phát Sự Kiện Đăng Xuất Cho Wishlist
- **Triệu chứng & Rủi ro**:
  - `saveSePay()` gửi `{ key: 'pine_admin_sepay_v4' }` lên `/api/sync` trong khi `status.ts` đọc `wcg_admin_sepay_v4`; đồng thời `executeSaveConfig` tự đặt `isConnected: Boolean(apiKey.trim())` không qua test.
  - `search_service.ts` gán `totalProducts = results.products.length` sau khi đã `LIMIT/OFFSET` khi có `rating`, làm `totalPages` bị kẹt ở 1.
  - `authService.logout()` không xóa `pine_user_wishlist_local` và không phát `pine_auth_state_changed` sau khi xóa token.
  - `ensureSchemaUpgrades` chạy ~42 truy vấn `SELECT 1 FROM schema_migrations` tuần tự làm cold start mất 33–48s.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 464)**:
  - `saveSePay()` đồng bộ đúng key `wcg_admin_sepay_v4`; chỉ set `isConnected: true` sau khi test thành công.
  - `totalProducts` tính bằng `COUNT(*)` có điều kiện `AVG(product_reviews)` (`status = 'approved'`) trước phân trang.
  - `logout()` xóa sạch token + `pine_user_wishlist_local` rồi phát `pine_auth_state_changed`.
  - Gộp 1 câu `SELECT id FROM schema_migrations` vào `appliedMigSet` trong RAM và thêm Migration `0049` bổ sung `seller_id` + `idx_store_products_seller_v2`.

### ISSUE-324: Bẫy Checkpoint Early-Return 1 Key Cứng Nuốt Migration Mới & Trùng Lặp Sản Phẩm Khi Merge 2 Bảng (`store_products` + `seller_products`)
- **Triệu chứng & Rủi ro**:
  - Checkpoint thoát sớm ở `d1_service.ts` kiểm tra 1 key đơn lẻ (`0047_google_oauth_and_wishlist_v1`) khiến mọi migration bổ sung phía sau (`0048`) không bao giờ chạy trên D1 live, làm `POST /api/admin/automation/config` lỗi `500 no such table: admin_settings`.
  - `loadAllStoreProductsD1` nối thẳng `[...mappedLegacy, ...sellerProductsList]` không khử trùng lặp `id`, làm 7 sản phẩm của seller bị nhân đôi thành 14 phần tử (tổng 15) và khiến React reconciliation nhân đôi DOM node trong `.grid` lên 28 thẻ.
  - `isValidApiKey()` chỉ kiểm tra độ dài và thiếu blocklist không phân biệt hoa/thường nên chuỗi giữ chỗ `SEPAY_KEY_MUSE_ACTIVE` gây báo `connected` giả.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 463)**:
  - Gỡ bỏ hoàn toàn early-return 1 key cứng ở `d1_service.ts`; để từng migration tự kiểm tra key của chính nó trong `schema_migrations`.
  - Khử trùng lặp theo `id` bằng `Map` trong `loadAllStoreProductsD1` và `ShopeeTestView.tsx`.
  - Chặn chuỗi giữ chỗ không phân biệt hoa/thường (`active`, `api_key`, ...) và yêu cầu cờ `isConnected === true` cho `sepayConnected`.

### ISSUE-323: Bẫy Ghi Vào Bảng Chưa Tạo (`admin_settings`), Đọc Nhầm Bảng Cấu Hình (`sepay_config`), Độ Trễ Giả Lập & Lệch Bộ Đếm Tìm Kiếm UI
- **Triệu chứng & Rủi ro**:
  - Bấm công tắc Bật/Tắt trong Automation Center gọi `POST /api/admin/automation/config` bị lỗi 500 do bảng `admin_settings` chưa tồn tại trong D1.
  - `status.ts` và `test.ts` truy vấn `sepay_config` / `telegram_config` không tồn tại, đồng thời trả về độ trễ ghi cứng (`42, 68, 55, 80, 38`) gây sai lệch thông tin giám sát thực tế.
  - Trên Web Khách, nhấn Enter tìm kiếm không reset `selectedProductType` dẫn tới dòng `paginationSummary` hiển thị `"Trang 1 / 1 • Tổng 0 gói"` dù lưới vẫn có kết quả.
  - `removeVietnameseTones` được khai báo nhưng không nối vào truy vấn tìm kiếm; `idx_store_products_search` tạo bằng tên cột sai (`status, price_core`).
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Để `.catch(() => null)` hoặc `.catch(() => {})` nuốt im lỗi thiếu bảng/thiếu cột trong migration và API, dẫn đến lỗi âm thầm không phát hiện khi kiểm thử bề mặt.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 462)**:
  - Tạo bảng `admin_settings` và index đúng cột (`is_active, current_price, created_at`) trong Migration `0048_admin_settings_and_search_indexes_v1`.
  - Đọc đúng cấu hình từ `system_settings` (`wcg_admin_sepay_v4`, `telegram_settings_v1`), xóa bỏ hoàn toàn độ trễ giả lập, chỉ báo số đo thực tế.
  - Reset `selectedProductType` & `selectedCategory` về `'all'` khi submit tìm kiếm trên `ShopeeTestView.tsx` và nối `removeVietnameseTones` vào `search_service.ts`.

### ISSUE-322: Bẫy Đăng Nhập Mạng Xã Hội Thiếu Cơ Chế Fail-Closed JWT Secret & Tìm Kiếm / Danh Sách Yêu Thích Không Đồng Bộ Đám Mây
- **Triệu chứng & Rủi ro**:
  - Khi tích hợp đăng nhập Google OAuth2, nếu code backend fallback về khóa bí mật mặc định dạng tĩnh khi thiếu `JWT_SECRET` sẽ vi phạm nghiêm trọng Rule 10 bảo mật Cloudflare Edge.
  - Tìm kiếm sản phẩm chỉ thực hiện phía client-side trên mảng tĩnh khiến người dùng không tìm được sản phẩm mới nhập trong CSDL D1.
  - Danh sách yêu thích chỉ lưu ở bộ nhớ trình duyệt khiến khách hàng mất hết sản phẩm đã lưu khi xóa cookie hoặc chuyển thiết bị.
- **Nguyên nhân gốc rễ (Root Cause)**:
  1. Thiếu bảng D1 `user_wishlist` và các route API đồng bộ `/api/user/wishlist/*`.
  2. Thiếu endpoint server-side search `/api/search` hỗ trợ tìm kiếm đa tầng và lọc trực tiếp trên CSDL D1 `store_products` và `games`.
  3. Thiếu endpoint xác thực Google ID Token `/api/auth/oauth/google`.
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Sử dụng khóa bí mật fallback tĩnh `wcg_edge_sec_salt_2026`: Vi phạm Rule 10 Fail-Closed. Đã loại bỏ hoàn toàn, bắt buộc kiểm tra `JWT_SECRET` từ Cloudflare Environment.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 461)**:
  - Triển khai Migration 0035 tạo bảng `user_wishlist`, mở rộng cột `auth_provider` và `google_id` trên `members`.
  - Xây dựng `google_auth_service.ts` kết nối với Google tokeninfo endpoint, sinh JWT token an toàn chuẩn Fail-Closed.
  - Xây dựng `search_service.ts` tìm kiếm D1 không dấu và có dấu, phân trang linh hoạt.
  - Xây dựng `wishlist_service.ts` và `wishlistService.ts` kết hợp `WishlistDrawerModal.tsx` đồng bộ 2 chiều localStorage & D1.

### ISSUE-321: Bẫy Giỏ Hàng & Sổ Địa Chỉ Chỉ Lưu Trình Duyệt Cục Bộ (LocalStorage Isolation) Khi Khách Đổi Thiết Bị & Khuyết Tuyến Route Public Cho Đánh Giá Sản Phẩm D1
- **Triệu chứng & Rủi ro**:
  - Khách hàng thêm sản phẩm vào giỏ hoặc nhập địa chỉ giao hàng trên điện thoại, khi chuyển sang máy tính hoặc đổi trình duyệt thì giỏ hàng trống trơn và phải nhập lại toàn bộ địa chỉ.
  - Bảng D1 `product_reviews` và service `review_service.ts` đã viết sẵn từ trước nhưng thiếu các route API public `/api/products/[id]/reviews` và admin `/api/admin/reviews`, khiến giao diện Web Khách gọi API bị 404.
- **Nguyên nhân gốc rễ (Root Cause)**:
  1. `cartService.ts` và form thanh toán chỉ đọc/ghi trực tiếp vào `localStorage` (`pine_marketplace_cart_v1`, `pine_shipping_info`), chưa có cơ chế đồng bộ lên CSDL D1.
  2. Chưa khai báo các Pages Function route file tương ứng trong `functions/api/` để đón nhận request từ client.
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Chỉ lưu giỏ hàng trên D1 mà không lưu fallback ở localStorage: Làm gián đoạn trải nghiệm của khách vãng lai khi chưa đăng nhập.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 460)**:
  - Áp dụng kiến trúc Hybrid Offline-First / Cloud-Synced: Giỏ hàng lưu trữ đồng thời ở cả localStorage và CSDL D1 (`cart_items`). Khi khách đăng nhập, tự động kích hoạt `/api/cart/sync` gộp toàn bộ sản phẩm khách đã chọn vào tài khoản D1.
  - Bổ sung bảng D1 `user_addresses` và phân hệ API CRUD sổ địa chỉ hoàn chỉnh. Tích hợp picker chọn địa chỉ 1-chạm vào modal thanh toán.
  - Mở toàn bộ 5 route API cho Đánh Giá Sản Phẩm (`functions/api/products/[id]/reviews/` và `functions/api/admin/reviews/`), kết nối với `review_service.ts` và bảo vệ bằng điều kiện đã mua hàng thành công.

### ISSUE-320: Bẫy Ghi Cứng Số Liệu Catalog/Pending Codes Trong Kiểm Tra Toàn Vẹn Tầng Dữ Liệu & Nhầm Lẫn Substring Automation
- **Triệu chứng & Rủi ro**:
  - Trang Crawler (`#/crawler`) liên tục báo động đỏ `🚨 LỆCH TẦNG DỮ LIỆU` dù hệ thống và kết nối hoàn toàn khỏe mạnh.
  - Trang SePay (`#/sepay`) mâu thuẫn hiển thị giữa banner đầu trang và kết quả kiểm tra API key.
  - Bộ quét kiểm thử tự động báo sai rằng nút "Ảo" trong Tiện ích chuyển tab sang "Nhật Ký Bảo Mật".
  - Nút "Làm Mới" trang Telegram bị disabled vĩnh viễn khi mạng chậm.
  - Nút nguy hiểm "Reset Ví & Doanh Thu" nằm sát nút "Điều Chỉnh Ví" có nguy cơ bấm nhầm.
- **Nguyên nhân gốc rễ (Root Cause)**:
  1. Trong `CrawlerModule.tsx` và `functions/api/sync.ts`, cờ `isMismatch` so khớp với **số ghi cứng** `pendingGames.length !== 63 || pendingCodes.length !== 22`. Khi số game chờ thực tế thay đổi (ví dụ: duyệt 1 game còn 62), cờ lập tức kích hoạt báo động sai.
  2. Top Banner SePay ban đầu không liên kết với `apiTestResult`, trong khi nếu chỉ kiểm tra `apiKey.length >= 6` thì gõ ký tự bừa cũng làm banner xanh trong khi chưa có key thật.
  3. Script automation tìm nút theo substring `ảo` đã vô tình khớp vào menu "Nhật Ký B**ảo** Mật" trên sidebar, và `Kho` khớp vào "Kho Mã & Gói Bán".
  4. Hàm `loadTelegramData` gọi API thiếu `AbortController` timeout, khiến request treo thì khối `finally` không chạy, kẹt `isLoading = true`.
  5. Nút Reset ví thiếu khu vực cách ly và thiếu chốt chặn gõ xác nhận bắt buộc.
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Chỉ sửa câu chữ cảnh báo mà không xóa số ghi cứng 63/22 trong `isMismatch`: Cờ báo động vẫn bị bật.
  - Cho phép banner SePay xanh khi `apiKey.length >= 6`: Gây mâu thuẫn hiển thị xanh ảo khi người dùng mới chỉ gõ text vào ô input.
- **Giải pháp chuẩn đã kiểm chứng (25/11/2026 - Mục 459)**:
  - Bỏ hoàn toàn số ghi cứng khỏi `isMismatch` và `authoritativeBaseline`. Cờ chỉ bật khi có alert thực sự từ server hoặc offline fallback lỗi.
  - Banner SePay chỉ xanh khi đã lưu (`isConnected`) hoặc test thành công (`apiTestResult.success`). Tự động lưu `isConnected: true` khi test pass.
  - Đổi nhãn `Ảo` → `Số ảo`, `Kho` → `Kho mã` và gắn `data-testid` chuyên biệt, loại bỏ 100% rủi ro khớp nhầm substring.
  - Bổ sung `AbortController` timeout 8s cho cả Telegram và Crawler.
  - Cách ly nút Reset ví vào Danger Zone có viền nét đứt cảnh báo và yêu cầu gõ chính xác `RESET_ZERO` trước khi mở modal 2FA.

### ISSUE-319: Bẫy Tái Phình To Tài Nguyên Media & Bundle Do Thiếu Rào Chắn Ngân Sách Kích Thước Tự Động (Asset Budgets)
- **Triệu chứng & Rủi ro**:
  - Sau các chiến dịch tinh gọn, nếu thiếu công cụ kiểm tra kích thước tự động trong quy trình build, các đợt phát triển tiếp theo rất dễ vô tình nạp thêm file JSON nặng hàng MB, ảnh uncompressed > 500 KB, hoặc import tĩnh module Admin khiến hệ thống phình to trở lại.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Hệ thống trước đây chỉ có máy kiểm i18n và tsc, hoàn toàn thiếu chốt chặn tự động đo lường và cưỡng chế ngân sách kích thước tài nguyên (Asset Budgets).
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Chỉ viết tài liệu hướng dẫn chay bằng lời nhắc: Dễ bị bỏ sót hoặc vi phạm trong tương lai.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 5 Tinh Gọn)**:
  - Xây dựng công cụ kiểm tra tự động `scripts/check-lean-budgets.cjs` tích hợp trực tiếp 2 chốt chặn vào `scripts/build.cjs` (Pre-build ở Bước 0.6 và Post-build ở Bước 4).
  - Tự động cưỡng chế 8 ngân sách cứng: Kho media <= 32 MB, không trùng lặp tên ảnh, icon <= 200 KB, ảnh thường <= 350 KB, AdminApp <= 600 KB, component chunks <= 650 KB, worker bundle <= 22 MB, thư mục dist <= 85 MB. Vi phạm bất kỳ chỉ số nào sẽ dừng build lập tức với exit code 1.

### ISSUE-318: Bẫy Tệp Tĩnh Cũ Tồn Đọng Trong dist/game_icons Khi Vite Build Không Tự Dọn Dẹp Thư Mục Con Ngoại Trừ dist/assets
- **Triệu chứng & Rủi ro**:
  - Sau khi dọn dẹp 801 tệp ảnh legacy trong public/game_icons/, chạy lệnh npm run build nhưng dung lượng dist/ vẫn giữ nguyên 104 MB và số file trong dist/game_icons vẫn là 3.186 files.
  - Các tệp đã bị xóa khỏi mã nguồn vẫn bị đóng gói và tải lên Cloudflare Pages trong lượt deploy tiếp theo.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - File scripts/build.cjs chỉ chủ động xóa dist/assets (fs.rmSync(distAssets, { recursive: true })) trước khi chạy Vite build.
  - Vite khi build mặc định sao chép đè các tệp từ public/ sang dist/, nhưng không bao giờ tự động xóa các tệp đã có sẵn trong dist/ nhưng không còn trong public/.
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Chỉ xóa file trong public/ rồi chạy ngay lệnh deploy: Khiến dist/ vẫn chứa đầy đủ các file rác cũ.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 20 - Bước 3 Tinh Gọn)**:
  - Cập nhật scripts/build.cjs: Thêm bước dọn dẹp sạch sẽ cả dist/game_icons (fs.rmSync(distIcons, { recursive: true, force: true })) cùng với dist/assets trước khi chạy npx vite build.
  - Kết quả: dist/game_icons luôn đồng bộ 1:1 chính xác tuyệt đối với public/game_icons (đúng 2.385 files, 28.42 MB).


### ISSUE-316: Lỗi Endpoint Probe Chậm 10–16 Giây Do Tự Chạy Schema Migration D1 (`ensureSchemaUpgrades`) Trên Endpoint Đọc Thường Xuyên
- **Triệu chứng & Rủi ro**:
  - Giao diện Quản trị (`/admin`) bị treo đơ từ 10 đến 16 giây mỗi lần mở trang cấu hình hoặc kiểm tra trạng thái ảnh.
  - Các script kiểm thử tự động, probe giám sát hoặc browser subagent đều phải chờ đợi lâu, làm tắc nghẽn toàn bộ quy trình kiểm chứng.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - File `functions/api/homepage-images/probe.ts` gọi `await ensureSchemaUpgrades(env.DB)`. Hàm này chạy tuần tự qua hơn 40 migrations của D1 với hàng loạt câu lệnh `CREATE TABLE`, `ALTER TABLE`, `UPDATE` và `INSERT INTO schema_migrations`.
  - Endpoint Probe là endpoint kiểm tra tình trạng nhanh được gọi liên tục mỗi khi tải trang; việc đặt logic migration D1 vào đây gây overhead khổng lồ.
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Đặt timeout hoặc cờ cache cho probe nhưng vẫn giữ lệnh gọi `ensureSchemaUpgrades`: Vẫn bị nghẽn 10-16s mỗi khi cache hết hạn hoặc gặp cold start.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 11)**:
  - Loại bỏ hoàn toàn `ensureSchemaUpgrades` khỏi `probe.ts`.
  - Endpoint probe chỉ thực thi duy nhất 1 câu truy vấn `SELECT COUNT(*) AS total_images FROM homepage_section_images` siêu nhẹ.
  - Kết quả: Độ trễ phản hồi giảm triệt để từ 10–16 giây xuống dưới 50ms (warm) và ~500ms (cold/TLS), triệt tiêu hoàn toàn hiện tượng treo trang.

### ISSUE-317: Bẫy Race Condition Rollback Cả Hai Request Khi Upload Ảnh Thứ 10 Song Song & Giải Pháp Phân Định Thứ Tự Top 10 Bằng SQLite C-Engine Thật (`LIMIT 10`)
- **Triệu chứng & Rủi ro**:
  - Khi CSDL đang có 9 ảnh (còn đúng 1 slot trống cho hạn mức 10 ảnh), nếu có 2 upload diễn ra đồng thời (song song), cả hai đều vượt qua vòng kiểm tra trước (Pre-check đếm thấy 9 ảnh).
  - Cả hai request cùng chèn vào DB khiến tổng số ảnh tăng lên 11.
  - Nếu áp dụng cơ chế rollback đơn giản `if (count > 10) rollback()` thì cả 2 request đều phát hiện tổng ảnh là 11 và CẢ HAI CÙNG ROLLBACK xóa chính mình. Hậu quả: CSDL trở về 9 ảnh, cả 2 người dùng đều bị báo lỗi từ chối dù hệ thống còn 1 slot trống!
- **Cạm bẫy đã thất bại (Failed Attempts)**:
  - Rollback mù quáng dựa trên điều kiện `count > 10`: Khiến toàn bộ các request đồng thời bị từ chối oan uổng.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 11)**:
  - Sử dụng truy vấn phân định thứ tự thời gian nguyên tử:
    `SELECT id FROM homepage_section_images WHERE section_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 10`.
  - Bản ghi đến trước (nằm trong Top 10 hợp lệ) được giữ lại an toàn và trả về HTTP 200.
  - Bản ghi đến sau (nằm ngoài Top 10) bị tự động rollback xóa khỏi DB và trả về HTTP 400 kèm thông báo rõ ràng.
  - Đã kiểm chứng trên SQLite C-Engine nhúng của Node.js v24 (`node:sqlite`) với kịch bản `Promise.all` 2 request đồng thời khi DB có 9 ảnh: **19/19 PASSED (0 FAILED)** trong 8ms (log tại `docs/test_upload_11_images.txt`).

### ISSUE-318: Bẫy Nút `/store` Trên Giao Diện Khách Chỉ Cuộn Trang Thay Vì Chuyển SubView Sang `StoreView` Thực Tế
- **Triệu chứng & Rủi ro**:
  - Khi người dùng hoặc quản trị viên click vào nút điều hướng hoặc banner có liên kết `/store`, trang web chỉ cuộn xuống `#shopee-products-grid` ở chân trang chủ thay vì mở giao diện Cửa Hàng thực sự.
  - Bị đánh giá là điều hướng giả (fake navigation) trong các báo cáo kiểm chứng độc lập.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Trong `src/components/shopee/ShopeeTestView.tsx`, hàm `handleNavigation` xử lý nhánh `url === '/store'` bằng cách gọi `setSubView('home')` và `scrollIntoView({ behavior: 'smooth' })`.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 11)**:
  - Đổi nhánh xử lý thành `setSubView('store')` kết hợp cuộn lên đầu trang (`window.scrollTo({ top: 0, behavior: 'smooth' })`).
  - Giao diện chuyển mượt sang component `StoreView` (Cửa Hàng chuyên biệt với đầy đủ 10 gói dịch vụ, bộ lọc, chi tiết sản phẩm và giỏ hàng).

### ISSUE-314: Cửa Sổ TOCTOU (Time-of-Check to Time-of-Use) Trong Cloudflare Workers & Giới Hạn Tự Nhiên Khi Kiểm Tra DNS Over HTTPS (DoH) Trước Khi Fetch URL Ngoài
- **Bản chất kỹ thuật & Giới hạn nền tảng (Known Platform Limitation)**:
  - Khi tải ảnh từ link ngoài (Mirror URL), ứng dụng giải quyết bài toán chống tấn công SSRF / DNS Rebinding bằng cách gọi Cloudflare DNS-over-HTTPS (`https://cloudflare-dns.com/dns-query`) để thẩm định trước các địa chỉ IP phân giải được (cả bản ghi A và AAAA).
  - Tuy nhiên, trong môi trường serverless Cloudflare Workers, hàm chuẩn `fetch(url)` của Edge runtime V8 tự động thực hiện tầng DNS lookup riêng khi khởi tạo kết nối TLS/HTTP và không cung cấp API socket cấp thấp để ép buộc `fetch` tới địa chỉ IP cụ thể đã phân giải trước.
  - Do đó, luôn tồn tại một cửa sổ thời gian TOCTOU (khoảng 50–150ms) giữa thời điểm kiểm tra DNS (Check) và thời điểm thực thi `fetch()` (Use). Kẻ tấn công có máy chủ DNS tùy biến có thể thay đổi bản ghi từ IP công khai sang IP nội bộ (ví dụ: `127.0.0.1` hoặc `::1`) ngay trong tích tắc này.
  - Đây là **giới hạn kiến trúc đã biết** của toàn bộ hệ sinh thái Serverless Edge Worker (không phải lỗi mã nguồn chưa sửa).
- **Hệ thống phòng vệ đa tầng giảm thiểu rủi ro (Mitigation Stack)**:
  1. *Timeout cực ngắn*: AbortSignal timeout 3.5s cho bước DoH, 4s cho HEAD probe, 8s cho GET tải ảnh.
  2. *Thẩm định kép A + AAAA + CNAME recursion*: Đệ quy theo dõi tối đa 3 hops CNAME, kiểm tra toàn bộ IPv4 và IPv6 thuộc dải private/loopback/link-local/metadata/documentation.
  3. *Kiểm tra HEAD probe an toàn*: Kiểm tra trước `Content-Type` phải là `image/*` và `Content-Length` không quá 10MB trước khi GET.
  4. *Kiểm định Magic Bytes nhị phân*: Sau khi tải về, kiểm tra trực tiếp magic bytes của mảng byte thật (chỉ nhận JPEG, PNG, WebP, GIF, AVIF; chặn 100% SVG, HTML và file thực thi).
  5. *Nén lại WebP độc lập*: Mọi ảnh tải về đều được giải mã và tái mã hóa thành WebP mới hoàn toàn qua ImageScript, triệt tiêu mọi payload mã độc nhúng trong metadata ảnh.

### ISSUE-319: Cạm Bẫy Hồi Quy Song Ngữ Khi Dùng Hàm Dịch Động t(...) Gán Cả 2 Trường Vi/En & Bẫy Regex Ngoặc Kép Đo 0 Giả
- **Triệu chứng & Rủi ro**:
  1. *Hồi quy song ngữ HSM (Đợt 15)*: Khi gán `groupNameVi` và `groupNameEn` bằng cùng 1 hàm dịch động `t(...)` (ví dụ: `groupNameVi: t('homepageSectionsModule.groups.shortcutsShort')`, `groupNameEn: t('homepageSectionsModule.groups.shortcutsShort')`), chuỗi trả về phụ thuộc hoàn toàn vào ngôn ngữ giao diện của Quản trị viên tại thời điểm đó:
     - Nếu Admin bật Tiếng Việt: cả `groupNameVi` VÀ `groupNameEn` đều bị gán chuỗi Tiếng Việt (`"Hàng Lối Tắt Dịch Vụ"`). Khách xem giao diện Tiếng Anh `/en/` bị hiển thị Tiếng Việt.
     - Nếu Admin bật Tiếng Anh: cả `groupNameVi` VÀ `groupNameEn` đều bị gán chuỗi Tiếng Anh. Khách xem Tiếng Việt bị hiển thị Tiếng Anh.
  2. *Bẫy regex ngoặc kép đo 0 giả*: Khi quét kiểm tra literal trong mã nguồn TypeScript vốn dùng nháy đơn `'` (ví dụ `groupNameVi: 'Thanh Điều Hướng'`), nếu viết regex kiểm tra Chốt 4 bằng nháy kép `"` (`groupNameVi:\s*\"Thanh Điều Hướng\"`), lệnh trả về 0 hit giả tạo, làm suy giảm giá trị kiểm chứng thực tế.
- **Cạm bẫy đã thất bại**:
  - Dùng hàm `t(...)` ngữ cảnh người dùng đang đăng nhập để gán dữ liệu đa ngôn ngữ lưu trữ vào database/config.
  - Viết lệnh regex kiểm tra với dấu ngoặc cứng `"` không bao hàm dấu ngoặc đơn `'` của mã nguồn.
- **Giải pháp chuẩn đã kiểm chứng (Đợt 16)**:
  - Khởi tạo và xuất hằng số `SUBSECTION_GROUP_NAMES` trong `src/config/homepageSections.ts` đọc trực tiếp từ JSON từ điển `viLocale` và `enLocale`.
  - Mọi vị trí khởi tạo form hoặc gán fallback luôn trỏ sang thuộc tính ghim cứng ngôn ngữ độc lập: `.vi` cho trường tiếng Việt và `.en` cho trường tiếng Anh.
  - Lệnh kiểm tra Chốt 4 chuyển sang kiểm tra lớp ký tự `['"]` hoặc nháy đơn `'` của mã nguồn, đảm bảo bắt đúng 100% literal tồn đọng.

### ISSUE-315: Bảng Phân Loại Toàn Bộ 3.217 Lỗi Chuỗi Tiếng Việt Ghi Cứng Toàn Sàn (i18n Backlog Audit) & Kế Hoạch Xử Lý Từng Cụm
- **Bối cảnh & Nguyên nhân gốc rễ**:
  - Khi chạy máy quét tự động ở chế độ mở rộng toàn sàn (`node scripts/check-hardcoded-i18n.cjs --all`), phát hiện tổng cộng **3.217 lỗi** trên **91 file** (giảm 15 lỗi so với mức 3.232 lỗi / 92 file nhờ hoàn thiện song ngữ cho StoreView ở Đợt 13; đã lưu log kiểm chứng đầy đủ tại `docs/check_hardcoded_i18n_all.log`).
  - *Đính chính nguyên nhân tăng số lỗi:* Mức tăng từ 1.222 lỗi (ở các lần kiểm trước) lên 3.236 lỗi đến từ việc phát triển mở rộng tính năng mới và thêm chuỗi cứng trong mã nguồn theo thời gian, hoàn toàn không phải do thay đổi phạm vi quét (script `check-hardcoded-i18n.cjs` có cấu hình `ALL_SCAN_PATHS` không đổi).
  - *Đính chính số liệu & Phương pháp đếm chuỗi:*
    * **Phương pháp đếm chuẩn xác (Dual Verification AST & Regex):**
      - *Cách 1 (AST Traversal):* Sử dụng parser AST TypeScript Compiler API (`ts.createSourceFile`, `ts.isCallExpression`) duyệt toàn bộ cây cú pháp trong `scripts/count_homepage_i18n.cjs`. AST tự động loại bỏ 100% comment (chứng minh qua test fixture `tests/fixtures/i18n_comment_fixture.tsx`).
      - *Cách 2 (Regex sau khi tước comment):* Tước sạch comments (`.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')`) rồi quét bằng biểu thức chuẩn `\bt\(\s*['"]([^'"]+)['"]`.
      - Kết quả cả 2 phương pháp trùng khớp 100%: **179 lần gọi `t(...)` (call sites)** và **148 khóa duy nhất (unique keys)**.
    * **Rút lại toàn bộ các suy diễn trước đó về cặp số 86/82:** Các số liệu trước đây ghi trong báo cáo đợt 9 ("82 khóa duy nhất / 86 lần xuất hiện do 4 khóa lặp / 14 ternary") là con số sai lầm, không thể tái tạo được bằng bất kỳ phương pháp đếm nào (đếm độc lập trên commit `1e11cdc` cho 135 lần gọi, 111 khóa duy nhất). Nhóm phát triển rút lại toàn bộ diễn giải trước đó về con số 86/82 và đính chính chính thức theo kết quả đếm chuẩn xác có thể tái tạo (179 call sites / 148 unique keys trên mã nguồn hiện tại).
    * **Hiện trạng thực tế Đợt 14:** Trong `HomepageSectionsModule.tsx`, toàn bộ các chuỗi giao diện, 13 thông báo toast lỗi và các nhãn điều hướng đã được đưa vào từ điển `vi.json` và `en.json`, đạt **179 lần gọi `t(...)` (call sites)** với **148 khóa duy nhất (unique keys)** theo script AST `scripts/count_homepage_i18n.cjs` (bỏ qua 100% comment). Đã thay thế chuỗi cứng `'No link' : 'Chưa gắn link'` bằng `t('homepageSectionsModule.noLink')`. Hiện có đúng **20 toán tử ba ngôi (12 lần `isEn ?` + 8 lần `isSecEn ?`)** đóng vai trò bộ chọn trường mô hình dữ liệu (`title_en : title_vi`, `nameEn : nameVi`, `description_en : description_vi`, `labelEn : labelVi`), hoàn toàn không chứa chuỗi UI cứng nào. Lệnh kiểm chứng: `git grep -n "isEn ?"` (12 kết quả) và `git grep -n "isSecEn"` (8 toán tử tại dòng 1889, 1890, 1891, 1968, 1969).
- **Bảng phân loại chi tiết theo cụm tính năng**:

| STT | Cụm tính năng | Số lỗi | Số file | Top Module vi phạm nhiều nhất | Kế hoạch xử lý & Mốc thời gian |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | **Admin Modules** (Quản Trị Chuyên Sâu: `src/admin/modules/`) | **2.153** | 28 | `CrawlerModule.tsx` (255), `NewsModule.tsx` (188), `MarketingModule.tsx` (171), `PrivateCodesModule.tsx` (147), `CodeInventoryModule.tsx` (128), `UpcomingGamesSection.tsx` (113) | **Kế hoạch Đợt 14**: Trích xuất Top 3 modules thực tế trong repo (`CrawlerModule`, `NewsModule`, `MarketingModule` - tổng 614 chuỗi) sang `vi.json`/`en.json`, thay bằng hook `useLanguage()`, bảo đảm Rule 9 không tràn khung. |
| 2 | **Client Components** (Khách & Modals Mua Hàng: `src/components/`, `src/App.tsx`) | **910** | 52 | `UserProfileModal.tsx` (69), `GiveawaysView.tsx` (67), `ProductCheckoutModal.tsx` (67), `ProductDetailModal.tsx` (48), `MyReceivedCodesModal.tsx` (44) | **Kế hoạch Đợt 15**: Trích xuất chuỗi của Top 3 modules (`UserProfileModal`, `GiveawaysView`, `ProductCheckoutModal` - tổng 203 chuỗi) phục vụ người mua quốc tế, thanh toán và giỏ hàng chuẩn song ngữ. |
| 3 | **Admin Components** (Widgets & Modals Phụ: `src/admin/components/`, `src/admin/AdminApp.tsx`) | **154** | 11 | `UniversalTemplateModal.tsx` (46), `QuickFomoAdjustModal.tsx` (31), `LuckyWheelAdminManager.tsx` (20), `TemporaryAuditTokenManager.tsx` (17), `ProductGalleryUpload.tsx` (10) | **Kế hoạch Đợt 16**: Trích xuất chuỗi của Top 3 modules (`UniversalTemplateModal`, `QuickFomoAdjustModal`, `LuckyWheelAdminManager` - tổng 97 chuỗi) cho các hộp thoại cấu hình nhanh và vòng quay may mắn. |
| **Tổng** | **Toàn sàn (3 Cụm)** | **3.217** | **91** | *(Giảm 19 lỗi và 4 files so với mức đỉnh 3.236 lỗi / 95 files)* | **Phân kỳ xử lý rõ ràng:** 914 chuỗi (Top 3 của 3 cụm) dự kiến xử lý trong Đợt 14–16. Còn lại **2.303 chuỗi trên 82 file** là **Backlog dài hạn chưa ấn định ngày** của ISSUE-315. Tuyệt đối không tuyên bố "Backlog 0" khi còn 3.217 chuỗi mở. |

- **Chi tiết lộ trình xử lý dứt điểm Top 3 Modules mỗi cụm**:
  1. **Cụm 1 - Admin Modules (Mốc: Đợt 14)**:
     - `CrawlerModule.tsx` (255 chuỗi): Gom nhóm từ vựng quét tự động, cấu hình nguồn ABEI/GameVN, trạng thái crawler và thông báo log.
     - `NewsModule.tsx` (188 chuỗi): Trích xuất danh mục tin tức, form tạo bài viết, SEO metadata editor và bảng quản lý bài đăng.
     - `MarketingModule.tsx` (171 chuỗi): Chuyển hóa banner marketing, popup khuyến mãi, flash sale countdown và cấu hình voucher.
  2. **Cụm 2 - Client Components (Mốc: Đợt 15)**:
     - `UserProfileModal.tsx` (69 chuỗi): Thông tin cá nhân, bảo mật 2 lớp, lịch sử giao dịch và liên kết tài khoản mạng xã hội.
     - `GiveawaysView.tsx` (67 chuỗi): Danh sách sự kiện nhận code miễn phí, điều kiện tham gia, bộ đếm ngược và modal nhận thưởng.
     - `ProductCheckoutModal.tsx` (67 chuỗi): Form điền thông tin người nhận, chọn phương thức vận chuyển (GHTK/GHN/Viettel Post) và bảo chứng 168 giờ.
  3. **Cụm 3 - Admin Components (Mốc: Đợt 16)**:
     - `UniversalTemplateModal.tsx` (46 chuỗi): Modal áp dụng template mẫu giao diện, bộ lọc preset ngành hàng và nút xác nhận.
     - `QuickFomoAdjustModal.tsx` (31 chuỗi): Modal điều chỉnh nhanh thông báo đơn hàng ảo/thật, tần suất pop-up và thanh trượt độ trễ.
     - `LuckyWheelAdminManager.tsx` (20 chuỗi): Bảng tỉ lệ trúng thưởng vòng quay, cấu hình phần thưởng và lịch sử quay của khách.

### ISSUE-313: Cạm Bẫy Phân Tâm Bởi Tệp Đính Kèm Cũ Sau Nén Ngữ Cảnh Dẫn Đến Trả Lời Lạc Đề & Không Bám Sát Yêu Cầu Hiện Tại
- **Triệu chứng & Rủi ro**:
  - Khi ngữ cảnh hội thoại vượt quá giới hạn và kích hoạt tóm tắt/nén ngữ cảnh (context compaction), nền tảng tự động mang theo tệp hình ảnh đính kèm từ quá khứ (ví dụ: ảnh chụp màn hình lỗi đăng nhập cũ từ hôm trước).
  - Tác nhân AI nhìn vào tệp đính kèm cũ đó mà không đọc kỹ nội dung trong `<USER_REQUEST>`, dẫn đến việc trả lời hoàn toàn lạc đề (đi giải thích lỗi đăng nhập cũ trong khi người dùng yêu cầu sửa tính năng quản trị trang chủ).
  - Gây lãng phí thời gian của người dùng và làm gián đoạn tiến độ dự án.
- **Cạm bẫy đã thất bại**:
  - Tự suy diễn mục tiêu dựa trên ảnh đính kèm cũ mà bỏ qua nội dung văn bản trong yêu cầu người dùng.
- **Giải pháp chuẩn đã kiểm chứng (Rule 13)**:
  - Bắt buộc kiểm tra ngày giờ và đối chiếu: yêu cầu văn bản trong `<USER_REQUEST>` là mệnh lệnh tối thượng.
  - Phớt lờ mọi tệp đính kèm cũ không thuộc phạm vi yêu cầu hiện tại.
  - Luôn tập trung 100% vào việc giải quyết nhiệm vụ người dùng yêu cầu, không chuyển hướng, không sửa lan man.

### ISSUE-312: Cạm Bẫy Lưu Ảnh Trực Tiếp Base64 Vào Bảng Cấu Hình D1 (Database Ballooning), Lỗ Hổng SVG Stored XSS & Thiết Kế Fallback Đa Tầng Cho API Nén Ngoại Vi
- **Triệu chứng & Rủi ro**:
  - Lưu trực tiếp chuỗi base64 của ảnh vào trường cấu hình `system_settings` làm phình kích thước dữ liệu từ vài KB lên hàng chục MB, gây chậm hoặc sập Cloudflare Worker (Payload Too Large/CPU Time Exceeded) mỗi khi tải trang chủ.
  - Chấp nhận tệp ảnh SVG tải lên từ người dùng hoặc qua URL ngoài tiềm ẩn nguy cơ chứa mã JavaScript độc hại (`<svg onload="...">`, `<script>`), gây ra lỗ hổng Stored XSS ngay trong origin quản trị và web khách.
  - Phụ thuộc hoàn toàn vào dịch vụ nén ảnh bên ngoài (TinyPNG, Cloudinary) mà không có tầng nén dự phòng nội bộ sẽ khiến toàn bộ chức năng tải ảnh bị tê liệt khi hết hạn mức gói miễn phí (HTTP 429) hoặc khi dịch vụ ngoài bảo trì/chậm/lỗi mạng.
  - Tạo nút "Bỏ qua nén" để quản trị viên tự chọn: Khiến quản trị viên vô tình tải lên các file ảnh raw hàng chục MB, làm suy giảm nghiêm trọng chỉ số Core Web Vitals (LCP và CLS) của web khách.
- **Cạm bẫy đã thất bại**:
  - Ghép chuỗi base64 vào JSON của `system_settings`: Phình to CSDL D1 và tiêu tốn băng thông Worker vô ích.
  - Chỉ dựa vào phần mở rộng tệp `.png`/`.jpg`: Kẻ tấn công đổi đuôi file mã độc thành `.jpg` để qua mặt.
  - Chặn lưu mục khi API nén ngoài lỗi hoặc chưa có khóa API: Gây ức chế và làm gián đoạn toàn bộ hoạt động quản trị sàn.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Lưu trữ tách biệt vào bảng D1 chuyên biệt `homepage_section_images` và phục vụ qua Edge Worker streaming endpoint (`/api/homepage-images/:id`) với header cache bất biến (`public, max-age=31536000, immutable`). Cấu hình `system_settings` chỉ lưu đường dẫn URL nội bộ siêu nhẹ.
  - Kiểm định Magic Bytes nhị phân nghiêm ngặt (chỉ nhận JPEG, PNG, WebP, GIF, AVIF; chặn 100% SVG và các file thực thi). Chặn triệt để SSRF private IP khi tải bản sao URL ngoài.
  - Quy tắc Nén Đa Tầng & Không Bao Giờ Làm Mất Ảnh (Multi-Layer Fail-Safe Compression):
    1. *Tầng 1 (Client)*: Tự động nén WebP bằng HTML5 Canvas ngay trên trình duyệt (giảm quality 0.82 $\rightarrow$ 0.65 $\rightarrow$ 0.50 nếu vượt dung lượng).
    2. *Tầng 2 (External Optimizer)*: Thử nén qua TinyPNG API (nếu đã cấu hình `TINYPNG_API_KEY`, timeout 8s).
    3. *Tầng 3 (Server ImageScript)*: Máy chủ luôn giải mã và tái mã hóa chuẩn WebP đúng kích thước (banner 1200px/300KB, icon 400px/100KB).
    4. *Tầng 4 (Fail-Safe Fallback)*: Nếu mọi bước nén thất bại, máy chủ vẫn lưu bản gốc an toàn và đánh dấu `original_fallback` kèm lý do để quản trị viên có thể nhấn nút "Nén lại" sau. Không bao giờ chặn việc lưu mục của admin!
  - Giao diện AI & API ngoài: Xử lý trạng thái Chưa cấu hình (`unconfigured: true`) an toàn, cho phép toàn bộ form hoạt động bình thường kể cả khi chưa có khóa API.

### ISSUE-311: Lỗi Thiếu Cấu Hình Pepper Khi Triển Khai Mới (Fail-Closed Misconfiguration), Cơ Chế Pepper-Binding, Tàn Dư Math.random & Quy Trình Khôi Phục Secret Chuẩn 3 Bước
- **Triệu chứng & Rủi ro**:
  - Khi triển khai môi trường Cloudflare Pages mới (`universal-mall-shop` và `admin-universal-mall`), nếu chưa cấu hình `PASSWORD_PEPPER` hoặc cấu hình rỗng, máy chủ thực thi cơ chế Fail-Closed từ chối toàn bộ yêu cầu đăng nhập và trả về HTTP 500: *"Hệ thống bảo mật chưa sẵn sàng (Thiếu cấu hình pepper bảo mật). Vui lòng liên hệ quản trị viên."*
  - Nếu logic WebCrypto tạo salt hoặc random byte không kiểm tra `typeof crypto === 'undefined' || !crypto.getRandomValues` mà khởi tạo mảng `new Uint8Array(n)` mặc định chứa toàn byte `0x00`, salt sinh ra sẽ là chuỗi toàn số 0 cố định, làm mất hoàn toàn tính ngẫu nhiên và bảo mật của hàm băm mật khẩu.
  - Sử dụng `Math.random()` trong việc sinh mã thưởng, webhook secret, Telegram notify key, idempotency key hoặc tracking ID tạo ra giá trị có thể đoán trước (pseudorandom PRNG).
  - Khối define trong `vite.config.ts` fallback `PASSWORD_PEPPER` máy chủ vào `VITE_PASSWORD_PEPPER` có thể khiến secret bị inline vào bundle JavaScript phân phối tới mọi trình duyệt người dùng.
- **Cạm bẫy đã thất bại & Cơ chế Pepper-Binding**:
  - *Cơ chế Pepper-Binding*: Mã băm PBKDF2 gắn liền với pepper tại thời điểm băm. Nếu tạm thời đặt pepper cũ đã lộ lên Cloudflare Pages để người dùng đăng nhập nâng cấp rồi sau đó mới xoay pepper mới, mã băm PBKDF2 vừa tạo trong D1 vẫn gắn với pepper cũ. Khi đó, lần đăng nhập tiếp theo với pepper mới sẽ bị từ chối 100% (tài khoản bị khóa vĩnh viễn). **TUYỆT ĐỐI KHÔNG đặt tạm pepper cũ đã lộ rồi mới xoay**.
  - *Cạm bẫy hiểu nhầm việc nâng cấp hash tự động*: Việc tự động nâng cấp mã băm khi đăng nhập chỉ băm lại mật khẩu cũ hiện tại bằng PBKDF2 — nó KHÔNG sửa việc chuỗi hash SHA-256 cũ của chính mật khẩu đó đã bị lộ công khai trong lịch sử repo và vẫn có thể bị bẻ khóa offline bằng rainbow table/từ điển. **BẮT BUỘC Quản trị viên/Người dùng phải thực hiện ĐỔI MẬT KHẨU MỚI** để đóng hoàn toàn rủi ro lộ mật khẩu.
  - Sử dụng mảng byte 0x00 làm fallback khi thiếu WebCrypto: Khiến salt mật khẩu bị suy biến thành chuỗi cố định.
  - Client tính toán `passwordHash` hoặc `salt` rồi gửi lên máy chủ (hoặc qua trang quản trị): Cho phép client qua mặt các quy tắc băm và tạo hash yếu.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Quy trình khôi phục 3 bước chuẩn xác khi xoay secret:
    1. Cấu hình biến môi trường `PASSWORD_PEPPER` mới an toàn trên cả 2 Cloudflare Pages Projects.
    2. Người dùng sử dụng tính năng đặt lại mật khẩu bằng OTP (`/api/auth/reset-password`) để băm mật khẩu mới bằng PBKDF2 100.000 vòng lặp trực tiếp với pepper mới.
    3. Đăng nhập với mật khẩu mới để tạo phiên làm việc JWT hợp lệ.
  - Cầu nối di chuyển legacy một chiều (`LEGACY_PEPPER_MIGRATION_ONLY`): Chỉ áp dụng cho hash legacy SHA-256 64 ký tự hiện có trong D1, tự động nâng cấp tức thì lên PBKDF2 100.000 vòng lặp ngay khi người dùng đăng nhập lần đầu tiên thành công. Nếu nâng cấp thất bại, trả HTTP 500 fail-closed để ngăn chặn duy trì hash yếu.
  - WebCrypto Fail-Closed 100%: Mọi hàm sinh ngẫu nhiên mật mã bắt buộc ném ngoại lệ hoặc trả HTTP 500 nếu thiếu `crypto.getRandomValues`, tuyệt đối không dùng mảng byte 0 và không fallback Math.random.
  - Chuyển đổi đặt lại mật khẩu thành viên trong trang quản trị (`MembersModule.tsx`) sang endpoint máy chủ `POST /api/admin/members/:id/reset-password` băm PBKDF2 với pepper hệ thống.
  - Loại bỏ fallback `PASSWORD_PEPPER` máy chủ khỏi `vite.config.ts`, đảm bảo bundle client không bao giờ chứa secret máy chủ.

### ISSUE-310: Lỗ Hổng SSRF Proxy, Tràn Bộ Nhớ Payload Streaming (Memory Exhaustion DoS) & Thiếu Whitelist Content-Type Trong Proxy Ngoại Vi
- **Triệu chứng & Rủi ro**:
  - Endpoint crawler (`/api/crawl-article`) và proxy icon (`/api/game-icon`) nếu tự động đi theo redirect (`redirect: 'follow'`) sẽ bị kẻ tấn công dùng HTTP 301/302 chuyển hướng tới các IP nội bộ nguy hiểm (`127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`, `192.168.0.0/16`), vượt qua tầng kiểm tra IP ban đầu.
  - Tải toàn bộ response bằng `res.arrayBuffer()` hoặc `res.text()` mà không giới hạn kích thước theo dòng truyền (stream) cho phép máy chủ bên ngoài trả về dữ liệu khổng lồ (hàng trăm MB hoặc GB), làm kiệt quệ RAM của Cloudflare Worker và gây crash Worker process (DoS).
  - Proxy icon nếu trả về nguyên vẹn Content-Type từ máy chủ ngoài mà không có whitelist ảnh (`image/*`) và thiếu header bảo vệ (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`) có thể bị lợi dụng để phát tán mã độc HTML/SVG XSS hoặc đánh lừa trình duyệt thực thi mã độc trong origin của sàn.
  - Khi xác thực người dùng phụ thuộc vào CSDL D1: nếu CSDL chưa cấu hình hoặc gặp sự cố mà lại cho phép gọi proxy ngoại vi trước khi xác thực sẽ tạo ra lỗ hổng unauthenticated SSRF proxy cho kẻ tấn công bên ngoài lợi dụng làm proxy ẩn danh.
- **Cạm bẫy đã thất bại**:
  - Chỉ kiểm tra URL đầu vào một lần nhưng để `fetch` tự động chuyển hướng (`redirect: 'follow'`): Bị vượt qua dễ dàng bằng URL 302 chuyển tiếp sang IP nội bộ.
  - Đọc header `Content-Length` để kiểm tra dung lượng: Kẻ tấn công dùng `Transfer-Encoding: chunked` không gửi `Content-Length` và bơm dữ liệu vô hạn.
  - Cho phép tất cả Content-Type miễn là fetch thành công: Bị biến thành proxy trung chuyển file độc hại hoặc XSS qua SVG/HTML.
  - Cho phép fetch ngoại vi chạy trước khi kiểm tra auth khi DB unconfigured: Lộ endpoint proxy cho cả Internet.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Pre-auth Fail-Closed: Bắt buộc xác thực quyền người gọi trước khi thực hiện bất kỳ lệnh fetch nào. Khi thiếu thông tin xác thực hoặc DB chưa cấu hình, lập tức trả về 401/403/503.
  - Kiểm soát chuyển hướng thủ công (Manual Redirect Handling): Thiết lập `redirect: 'manual'`. Lặp tối đa 3 hops, ở mỗi hop trích xuất header `Location`, phân giải URL tuyệt đối và tái kiểm tra qua `isSafeCrawlUrl(nextUrl)` trước khi fetch tiếp.
  - Streaming limit với Web Streams API: Đọc body qua `res.body.getReader()`, tích lũy độ dài từng chunk; ngay khi vượt 1MB (1.048.576 bytes), gọi `reader.cancel()` và ném lỗi `PAYLOAD_TOO_LARGE` (HTTP 413), ngắt ngay kết nối socket TCP.
  - Whitelist Content-Type ảnh nghiêm ngặt: Chỉ chấp nhận `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/x-icon`. Luôn đính kèm `X-Content-Type-Options: nosniff` và `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.

### ISSUE-309: Race Condition & Lỗi Toàn Vẹn Sổ Cái (Ledger Integrity) Trong Escrow Release/Dispute & Bồi Hoàn (Compensatory Rollback)
- **Triệu chứng & Rủi ro**:
  - Trong dịch vụ ký quỹ (`escrow_service.ts`), nếu tiến hành ghi nhận lịch sử vào sổ cái (`ledger_transactions`) trước khi rào trạng thái giao dịch cọc (`UPDATE escrow_deposits SET status = 'RELEASED' WHERE id = ? AND status = 'HELD'`), hai request đồng thời có thể cùng ghi hai dòng giải ngân vào sổ cái và cộng tiền ví 2 lần.
  - Nếu câu lệnh cập nhật trạng thái cọc thành công nhưng câu lệnh ghi sổ cái (`db.prepare("INSERT INTO ledger_transactions...")`) bị lỗi mạng hoặc conflict SQL, hệ thống sẽ rơi vào trạng thái bất nhất: tiền cọc đã đổi trạng thái mà không có vết tích trong sổ cái tài chính.
  - Trong duyệt thưởng nhiệm vụ (`mission_service.ts`): cộng thưởng ví trước khi rào trạng thái đơn nộp `mission_submissions` cho phép người dùng click nhanh hoặc spam đồng thời nhận thưởng gấp nhiều lần.
- **Cạm bẫy đã thất bại**:
  - Gói các câu lệnh vào `db.batch()` nhưng câu lệnh `UPDATE` không kiểm tra `changes`: `db.batch` vẫn chạy tuần tự nhưng nếu câu lệnh UPDATE không khớp điều kiện (0 changes), batch không tự động rollback trừ khi có lỗi cú pháp, dẫn tới việc các câu lệnh cộng tiền tiếp theo vẫn được thực thi!
  - Đổi trạng thái sau khi đã ghi sổ cái: Gặp race condition ở khâu ghi sổ cái.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Rào trạng thái nguyên tử trước (State-Guard-First): Luôn chạy `UPDATE ... SET status = ? WHERE id = ? AND status = ?` trước tiên.
  - Kiểm tra `res.meta?.changes`: Nếu `changes === 0`, ném lỗi hoặc trả về `false` ngay lập tức, ngắt toàn bộ luồng xử lý tiếp theo.
  - Cơ chế bồi hoàn bù trừ (Compensatory Rollback): Nếu bước rào trạng thái thành công nhưng bước ghi sổ cái kế tiếp ném exception, khối `catch` bắt buộc phải thực thi câu lệnh bồi hoàn (khôi phục lại trạng thái ban đầu của bản ghi cọc) và ghi log kiểm toán trước khi ném lại lỗi ra ngoài.

### ISSUE-308: Race Condition Duyệt Thưởng Nhiệm Vụ (Double Reward) & Nhận Dữ Liệu Gốc Từ Máy Khách Khi Xóa Mềm
- **Triệu chứng & Rủi ro**:
  - Khi duyệt hồ sơ nhiệm vụ (`mission_submissions`), nếu câu lệnh cập nhật số dư ví thành viên và câu lệnh rào trạng thái hồ sơ (`WHERE status = 'PENDING'`) nằm trong cùng một lô giao dịch không kiểm tra `changes === 0`, hai phiên làm việc đồng thời có thể cùng cộng tiền thưởng vào ví của thành viên hai lần.
  - Khi xóa mềm bản ghi (`soft_delete`), nếu hệ thống nhận `originalData` do client gửi lên thay vì truy vấn dữ liệu gốc thực tế từ CSDL D1, kẻ tấn công có thể tiêm các payload độc hại vào bảng lịch sử và phục hồi (`restore`) lại dữ liệu giả mạo vào CSDL chính.
  - Khi áp dụng mã giảm giá (`redeem.ts`), nếu chỉ kiểm tra lượt dùng mà bỏ qua khoảng thời gian hiệu lực (`start_date`, `end_date`), voucher đã hết hạn hoặc chưa đến ngày phát hành vẫn có thể bị khai thác để giảm tiền đơn hàng.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Nguyên tắc rào trạng thái trước (State Guard First): Thực thi câu lệnh `UPDATE mission_submissions SET status = 'APPROVED' WHERE id = ? AND status = 'PENDING'` trước. Chỉ khi số dòng thay đổi `changes > 0`, hệ thống mới tiến hành cộng tiền vào ví thành viên hoặc trao mã code. Nếu `changes === 0`, từ chối ngay lập tức và hoàn tác mã trong kho.
  - Server-Side Original Data Capture: Khi quản trị viên yêu cầu xóa mềm, máy chủ D1 bắt buộc phải tự truy vấn dữ liệu gốc từ bảng tương ứng (`games`, `codes`, `giveaways`, `missions`, `news`, `utilities`...). Nếu không tìm thấy bản ghi thực tế, trả lỗi HTTP 404 và hủy thao tác, tuyệt đối không lưu dữ liệu do client gửi lên.
  - Rào hiệu lực thời gian nguyên tử: Thêm điều kiện `AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)` vào cùng câu lệnh atomic `UPDATE vouchers SET usage_count = usage_count + 1`.

### ISSUE-307: Lạm Dụng Single Master Secret Đa Quyền Hạn (Multi-Role), Fallback Chuỗi Ghi Cứng & Rate Limiting Fail-Open
- **Triệu chứng & Rủi ro**:
  - Dùng chung một bí mật duy nhất (`ADMIN_SYNC_SECRET`) cho cả đồng bộ dữ liệu, ký session token, xác thực admin và gọi cron job tạo ra rủi ro leo thang đặc quyền nghiêm trọng: lộ một secret sẽ làm sụp đổ toàn bộ hệ thống phân quyền.
  - Sử dụng chuỗi ghi cứng làm fallback khi biến môi trường chưa được đặt (như `'wcg_master_key_configured_in_env'`) vi phạm nguyên tắc bảo mật và Rule 10, khiến bất kỳ ai cũng có thể đoán được chuỗi xác thực.
  - Đọc giới hạn tần suất (rate limiting) có khối catch nuốt lỗi (`.catch(() => null)`) sẽ biến cơ chế phòng vệ thành fail-open: khi CSDL bị quá tải hoặc lỗi, kẻ tấn công có thể spam OTP hoặc brute-force không giới hạn.
  - Không reset bộ đếm số lần thử sau khi cửa sổ thời gian khóa (lockout) kết thúc sẽ dẫn tới hiện tượng người dùng vừa hết hạn khóa bị khóa lại ngay lập tức ở lần thử đầu tiên.
  - Sử dụng `Math.random()` trong việc sinh muối mật mã hoặc mã giao dịch nhạy cảm có tính giả ngẫu nhiên yếu, dễ bị tấn công suy đoán trạng thái PRNG.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Phân tách rõ ràng và độc lập các biến môi trường theo đúng mục đích: `ADMIN_API_KEY` cho quyền quản trị tối cao, `SYNC_SECRET` cho tiến trình đồng bộ dữ liệu, `CRON_SECRET` cho tác vụ định kỳ tự động, `JWT_SECRET` cho chữ ký HMAC-SHA256 phiên đăng nhập.
  - Tuyệt đối không để bất kỳ chuỗi fallback bí mật ghi cứng nào trong mã nguồn. Nếu biến môi trường chưa được cấu hình, hệ thống bắt buộc phải fail-closed (từ chối xác thực).
  - Rate limiting phải fail-closed: Khi truy vấn CSDL rate limit gặp sự cố, trả về HTTP 503 thay vì bỏ qua kiểm tra.
  - Khi `nowMs >= locked_until` hoặc thời gian cửa sổ đã trôi qua, bộ đếm `attempts` phải được reset về 1 để người dùng có thể thực hiện thao tác bình thường.
  - Chỉ sử dụng Web Crypto API (`crypto.getRandomValues`) cho mọi thao tác sinh salt, token hoặc ID giao dịch.

### ISSUE-306: Rò Rỉ Phiên Khác Domain Khi Xác Thực, Bypass Token Chuỗi Tĩnh & Sai Lệch Băm Mật Khẩu Admin
- **Triệu chứng & Rủi ro**:
  - Khi API quản trị gặp lỗi cấu hình (`JWT_SECRET` chưa đặt), việc client lặp qua danh sách fallback các domain cũ (`codegame.shop`, `web-code-game.pages.dev`, `admin-code-game-shop.pages.dev`) sẽ khiến client lưu trữ token được cấp bởi domain khác. Khi thực hiện các tác vụ nhạy cảm như đổi mật khẩu tại domain quản trị chính, yêu cầu sẽ bị từ chối với lỗi "Phiên đăng nhập không tồn tại hoặc đã hết hạn".
  - Cho phép bypass xác thực trên frontend bằng tiền tố chuỗi tĩnh (`wcg_tok_usr_admin_`, `admin290200`) hoặc cờ `cachedAdmin` trong `localStorage` sẽ khiến giao diện quản trị mở được mà không có phiên làm việc thực sự trên máy chủ D1, che giấu các lỗi cấu hình backend.
  - Băm mật khẩu người dùng bằng SHA-256 một vòng và sinh salt bằng `Math.random()` không đảm bảo độ an toàn trước tấn công từ điển / rainbow tables, đồng thời thiếu pepper sẽ khiến mật khẩu không đồng bộ với hàm xác thực đăng nhập.
  - Sau khi đổi mật khẩu, nếu không xóa bỏ `session_token` trong D1 thì các token phiên đăng nhập cũ vẫn tiếp tục có hiệu lực, vi phạm nguyên tắc bảo mật phiên làm việc.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Giới hạn xác thực Single-Domain: Client chỉ giao tiếp duy nhất với các endpoint nội bộ cùng domain (`/api/auth/login`, `/api/auth/register`, `/api/auth/me`). Dừng ngay lập tức và hiển thị mã lỗi khi máy chủ gặp sự cố, tuyệt đối không gửi thông tin đăng nhập sang domain khác.
  - Triệt tiêu 100% logic bypass chuỗi tĩnh trên frontend. Mọi phiên đăng trị bắt buộc phải được máy chủ xác nhận qua `GET /api/auth/me`. Khi phiên không hợp lệ, lập tức xóa sạch flags và tokens trong bộ nhớ trình duyệt, đưa người dùng về form đăng nhập.
  - Chuẩn hóa thuật toán băm mật khẩu: Sử dụng PBKDF2 100.000 vòng kèm pepper bí mật của hệ thống (`PASSWORD_PEPPER`). Sinh muối ngẫu nhiên bằng `crypto.getRandomValues(new Uint8Array(16))`.
  - Hủy phiên cũ tự động: Đặt `session_token = NULL` trong CSDL D1 ngay khi lệnh đổi mật khẩu thành công.
  - Bắt lỗi cấu hình fail-closed: Khi thiếu `JWT_SECRET` (dưới 16 ký tự), API trả về HTTP 503 `SERVER_MISCONFIGURED` kèm thông báo hướng dẫn quản trị viên cấu hình trên Cloudflare Dashboard.

### ISSUE-305: Cờ Bộ Nhớ Tạm Runtime Reset Trạng Thái D1, Biến isEn Chưa Khai Báo Trong Component & Nguồn Đếm Sản Phẩm Trang Chủ
- **Triệu chứng & Rủi ro**:
  - Dùng cờ trong bộ nhớ JavaScript (`let _flag = false`) để bảo vệ các câu lệnh `UPDATE sellers SET status = 'TRIAL'` khi khởi động máy chủ Worker sẽ khiến câu lệnh bị chạy lại sau mỗi lần deploy mới (vì Worker tái khởi động làm mất cờ trong RAM), ghi đè trạng thái `ACTIVE` của gian hàng người dùng.
  - Sử dụng biến `isEn` trong các nhánh render điều kiện JSX mà quên khai báo `const isEn = language === 'en'` ở đầu component sẽ làm sập hoàn toàn phân hệ khi người dùng bấm vào tab tương ứng với lỗi `isEn is not defined`.
  - Khóa dịch truy cập qua Proxy `t.cart.key` nếu không tồn tại trong từ điển sẽ trả về chính tên khóa (`key`), làm lộ các chuỗi thô như `multiStoreTitle` hay `clearAll` trên giao diện người dùng.
  - Trang chủ sàn TMĐT nếu chỉ đọc sản phẩm từ bảng cũ `store_products` thay vì liên kết với các sản phẩm đã được duyệt (`status = 'APPROVED'`) trong `seller_products` sẽ khiến bộ đếm trang chủ báo `0 sản phẩm` trong khi các gian hàng vẫn có sản phẩm đang bán.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Tuyệt đối không đặt bất kỳ câu lệnh nào tự ý cập nhật trạng thái dữ liệu người dùng (`status = 'TRIAL'`) trong các hàm chạy khi khởi động Worker (`ensureMarketplaceSchema`). Các tác vụ migration chỉ chạy 1 lần duy nhất và ghi nhận vào bảng `schema_migrations`.
  - Luôn khai báo tường minh `const isEn = language === 'en'` ngay dưới hook `const { t, language } = useLanguage()` trong component.
  - Bổ sung đầy đủ các khóa dịch song ngữ đối xứng trong `vi.json` và `en.json`.
  - Trong `loadAllStoreProductsD1`, tự động nạp kết hợp các sản phẩm đã duyệt từ `seller_products` của các gian hàng đang hoạt động (`status IN ('ACTIVE', 'TRIAL')`), đếm tồn kho khả dụng từ `seller_codes`.

### ISSUE-304: Vị Trí D1 Migration Fast-Path Cache, Thanh Toán Giỏ Hàng Hỗn Hợp (Multi-Item Mixed Carts) & Graceful Carrier Degrade
- **Triệu chứng & Rủi ro**:
  - Khi thêm migration schema mới trong `d1_service.ts`, nếu đặt bên dưới khối kiểm tra fast-path cache (`wcg_virtual_layer_tables_v1`), ứng dụng đang chạy sẽ bỏ qua migration mới và không thực thi các câu lệnh `ALTER TABLE` / `CREATE TABLE`, dẫn tới lỗi thiếu cột (`no column named product_type`) trên môi trường production.
  - Khi thanh toán giỏ hàng hỗn hợp (có cả hàng số và hàng vật lý) qua `/api/seller-orders/multi`, nếu logic máy chủ bắt buộc mọi mặt hàng đều phải có mã khả dụng trong `seller_codes`, giao dịch sẽ bị từ chối với lỗi `OUT_OF_STOCK` vì hàng vật lý quản lý theo số lượng tồn kho chứ không có mã số trong bảng `seller_codes`.
  - Khi gọi API tính phí vận chuyển bưu chính (`/api/shipping/calculate-fee`), nếu chưa cấu hình API token mà trả về HTTP 500 sẽ làm gián đoạn luồng đặt hàng trên giao diện giỏ hàng.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Đặt migration mới (như `0036_split_order_engine_v1`) trước khối kiểm tra cache fast-path trong `ensureSchemaUpgrades`, đảm bảo các lệnh `ALTER TABLE ADD COLUMN` chạy tự động ngay lần khởi chạy đầu tiên.
  - Phân tách nhánh kiểm tra tồn kho trong `functions/api/seller-orders/multi.ts`: Chỉ kiểm tra và giữ mã trong `seller_codes` đối với sản phẩm có `product_type !== 'physical'`, đối với hàng vật lý chỉ ghi nhận đơn hàng với trạng thái `PROCESSING` (Chờ lấy hàng).
  - API tính cước vận chuyển đối với hãng chưa cấu hình token (như Viettel Post `VIETTEL_POST_TOKEN`) phải trả về HTTP 200 kèm `configured: false`, thông báo hướng dẫn cấu hình và mức cước ước tính tiêu chuẩn (`standardEstimateFee: 28000`), không ném ngoại lệ 500.

### ISSUE-303: Xóa Vật Lý Sản Phẩm Test (Hard Delete vs Soft Delete), Deploy Sạch commit_dirty=false & Chuẩn Hóa Danh Mục Đa Ngành
- **Triệu chứng & Rủi ro**:
  - Khi xóa sản phẩm bằng lệnh `UPDATE products SET is_active = 0` (soft delete), các dòng dữ liệu thử nghiệm vẫn tồn tại trong CSDL D1. Báo cáo "đã xóa" sẽ bị kiểm toán độc lập đánh giá là chưa xóa vì số dòng trong bảng `products` không về 0.
  - Chạy lệnh triển khai Cloudflare Pages (`wrangler pages deploy`) khi trong thư mục dự án còn file sửa đổi chưa commit sẽ khiến bản build mang cờ `commit_dirty: True`, gây khó khăn cho việc truy vết phiên bản mã nguồn chính xác.
  - Cấu hình danh mục mặc định nếu fallback về `'gaming'` hoặc giữ cache `localStorage` cũ sẽ khiến trang chủ sàn TMĐT hiển thị các tab thể loại game (Kiếm Hiệp, Tiên Hiệp...) thay vì các ngành hàng đa ngành.
  - Tính phí ship bằng công thức ước lượng nội bộ mà không có endpoint backend gọi API mạng của hãng bưu chính (GHTK, GHN) hoặc ghi cứng token giả vào mã nguồn vi phạm bảo mật Rule 10.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Áp dụng lệnh vật lý `DELETE FROM products WHERE id = ?` trong `functions/api/products/[id].ts` và Migration 0031 trong `functions/services/d1_service.ts` để xóa sạch 100% dòng sản phẩm test trong D1 về đúng 0 dòng.
  - Tuân thủ quy trình Git chuyên nghiệp: Commit toàn bộ thay đổi với working tree sạch sẽ trước khi build và deploy với cờ `--commit-dirty=false`.
  - Thiết lập preset danh mục mặc định là `'universal'` với 6 ngành hàng đa ngành (`all`, `fashion`, `beauty`, `tech`, `services`, `gaming`), tự động ghi đè preset gaming cũ nếu phát hiện trong bộ nhớ trình duyệt.
  - Xây dựng endpoint backend `/api/shipping/calculate-fee` kết nối mạng trực tiếp tới bưu cục GHTK và GHN, quản lý token qua biến môi trường Cloudflare (`GHTK_API_TOKEN`, `GHN_API_TOKEN`), trả hướng dẫn rõ ràng khi chưa có token.

### ISSUE-302: Căn Chỉnh Schema Đơn Hàng D1 (orders table), Định Tuyến DELETE Edge Worker & Phân Tách Kho Hàng Đa Ngành
- **Triệu chứng & Rủi ro**:
  - Khi tạo đơn VietQR qua `POST /api/orders/create-qr` cho sản phẩm đa ngành (vật lý), nếu hàm xử lý giả định mọi sản phẩm đều có mã trong bảng `inventory_codes` sẽ dẫn đến lỗi trả về `400 OUT_OF_STOCK` hoặc lỗi máy chủ `500 table orders has no column named status: SQLITE_ERROR`.
  - Trong kiến trúc Edge Worker Pages (`_worker.ts`), nếu không khai báo ủy quyền cho phương thức `DELETE` của module `adminOrdersIdApi`, lệnh `DELETE /api/admin/orders/:id` sẽ bị chặn ở cấp độ Worker trả về mã lỗi `405 Method not allowed`, cản trở việc dọn dẹp đơn test tự động per Rule 7.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Viết hàm `ensureOrdersSchema(db)` kiểm tra `PRAGMA table_info(orders)` và tự động bổ sung mọi cột tương thích (`status`, `order_code`, `user_id`, `member_id`, `buyer_email`, `customer_email`, `customer_name`, `customer_phone`, `product_type`, `subtotal_amount`, v.v.) đảm bảo 100% không bao giờ gặp lỗi thiếu cột.
  - Phân tách logic kiểm tra kho trong `createQrOrderD1`: Nếu sản phẩm thuộc bảng `products` (đa ngành), kiểm tra trực tiếp `stock_quantity >= qty`, không bắt buộc `inventory_codes`. Hàng vật lý chỉ trừ tồn kho mà không yêu cầu mã số.
  - Khai báo xử lý method `DELETE` trong `_worker.ts` cho tuyến `/api/admin/orders/:id` kết nối tới `adminOrdersIdApi.onRequestDelete`.
  - Thực thi kiểm thử mua thật áp voucher thành công và dọn sạch 100% dữ liệu test trong D1 per Rule 7.

### ISSUE-301: Đồng Bộ Tuyệt Đối Số Đếm Catalog 593 Game, Ngày Hết Hạn WWM (587/55/642), Tab Tin Tức SSOT & Xóa Dữ Liệu Mẫu Đa Ngành
- **Triệu chứng & Rủi ro**:
  - Khi gộp hoặc đồng bộ dữ liệu nếu vô tình để ngày hết hạn `expires_at` về `null`, mã quá hạn sẽ bị tính thành còn hạn (WWM bị thành 601 còn hạn thay vì 587 còn hạn).
  - Sử dụng hai nguồn dữ liệu không đồng bộ (file JSON tĩnh 591 game vs D1 593 game) khiến mục lục A-Z và Hero trang chính lệch nhau (A-Z báo WWM 598, Honkai 185, Genshin 106 trong khi modal live báo WWM 587, Honkai 182, Genshin 105).
  - Thẻ đếm số bài viết (Tab Tin Tức) nếu vừa đọc API vừa lắng nghe event rồi fallback về `newsService.getPublishedArticles().length` (lưu cache cũ 274 bài) sẽ gây hiện tượng số nhảy giật cục (276 -> 274 -> 275) khi người dùng ở lại trang.
  - Tồn tại dữ liệu demo mẫu đa ngành `INDUSTRY_PRESET_PRODUCTS` với các số bán giả (3270, 2010...) trên trang `/store` gây nhầm lẫn với sản phẩm thật trong D1.
- **Giải pháp chuẩn đã kiểm chứng**:
  - Migration 0018: Khôi phục `expires_at = '2026-11-09'` cho 14 mã WWM; bổ sung `hai-tac-ti-hon` (5 mã) và `hiep-khach-hanh-joygames` (16 mã) nâng catalog lên đúng 593 game; tính toán lại số đếm D1 `total_codes_count` và `active_codes_count`.
  - Đồng bộ `games188.json` (src và public) với D1: đúng 593 game, WWM 587 active / 55 expired / 642 total, Honkai 182/8/190, Genshin 105/68/173.
  - Hero trang chính: Xóa hoàn toàn số ghi cứng `11,700+`, đếm động theo tổng mã thật D1 (~15.050 mã) và hiển thị đúng `593+ Tựa Game`.
  - Tab Tin Tức trên `/test1`: Thiết lập `/api/news?limit=1` làm SSOT duy nhất, loại bỏ việc đọc từ `newsService.getPublishedArticles()`, đảm bảo số tab luôn khớp 100% với API (277 bài) và ổn định tuyệt đối trong 90s+.
  - Xóa 100% dữ liệu mẫu demo trong `src/data/industryPresetProducts.ts` (mảng rỗng), trang `/store` chỉ hiển thị 10 gói thật Hiệp Khách Hành từ D1.

### ISSUE-300: Ngày Hết Hạn Thắng Trạng Thái D1 Trong isCodeExpired & Gộp Where Winds Meet SSOT
- **Triệu chứng & Rủi ro**:
  - Khi ưu tiên trạng thái `status: 'active'` của D1 trước `expires_at`, các mã đã quá hạn (Avatar Land 20/10, 31/10; Where Winds Meet 09/11...) vẫn bị tính là còn hạn làm lệch số lượng mã active so với thực tế và gây hiểu nhầm cho người dùng.
  - Việc duy trì nhiều slug cho cùng 1 game (`where-winds-meet`, `where-winds-meet-mobile`, `yen-van-thap-luc-thanh`) làm phân tán mã code, gây trùng lặp danh mục và buộc lập trình viên phải viết các nhánh kiểm tra ghi cứng (`isYenVan ? 579 : 41`).
  - Sử dụng số tĩnh cứng trong JSON offline fallback khác với D1 làm xuất hiện hiện tượng nhảy số lúc tải (185 -> 182 -> 185 ở Honkai Star Rail).
- **Giải pháp chuẩn đã kiểm chứng**:
  - Thứ tự ưu tiên bất biến trong `isCodeExpired`:
    1. Mã test `ATNGAY1` / `ATNGAY2` -> trả về hết hạn (`true`).
    2. Trạng thái đóng sớm từ NPH/D1 (`expired`, `hết hạn`, `inactive`, `disabled`, `is_active === 0`) -> trả về hết hạn (`true`).
    3. Ngày hết hạn đọc được: nếu `parsed.isExpired` -> trả về hết hạn (`true`) BẤT KỂ status D1 ghi gì; nếu `parsed.dateObj` và chưa qua -> trả về còn hạn (`false`), giữ nguyên quy tắc mã hết hạn hôm nay vẫn dùng được đến 23:59:59 hết ngày.
    4. Chỉ khi mã không có ngày hết hạn mới dùng status D1 (`active`, `còn hạn`, `is_active === 1` -> trả về `false`).
  - Gộp toàn bộ mã và thông tin của 3 bản WWM thành 1 bản chính duy nhất `where-winds-meet` (642 mã: 598 active + 44 expired), loại bỏ 2 slug alias khỏi bảng `games` D1 và `games188.json`.
  - Bỏ 100% số ghi cứng trong codebase.
  - Đồng bộ `games188.json` (Honkai 185/190, Genshin 106/173, WWM 598/642) triệt tiêu hoàn toàn hiện tượng nhảy số lúc tải trang.


---

> [!NOTE] Lưu trữ lỗi lịch sử (Historical Archive)
> Các mục lỗi và bẫy đã thất bại từ ISSUE-01 đến ISSUE-299 (hơn 5.700 dòng) đã được lưu trữ an toàn tại [docs/archive/KNOWN_ISSUES_ARCHIVE_2026.md](file:///c:/4%20Antigravity%20all/47%20web%20da%20nganh/docs/archive/KNOWN_ISSUES_ARCHIVE_2026.md) theo chuẩn **Lean Framework**.

---

## 2. QUY TRÌNH BẮT BUỘC TRƯỚC KHI SỬA CODE (PRE-FLIGHT CHECKLIST)

Mọi nhà phát triển hoặc AI Agent khi nhận yêu cầu sửa đổi mã nguồn **PHẢI** thực hiện đủ 4 bước sau:

1. **[ ] Đọc tài liệu ghi nhớ**:
   - Mở và đọc `PROJECT_MEMORY.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`.
2. **[ ] Phân tích nguyên nhân gốc rễ (Root Cause)**:
   - Xác định chính xác file, hàm, dòng mã gây lỗi.
   - Không đoán mò. Nếu cần, in log hoặc tạo script test nhỏ để kiểm chứng giả thuyết trước khi sửa code chính.
3. **[ ] Đánh giá phạm vi ảnh hưởng (Impact Scope)**:
   - Thay đổi này ảnh hưởng đến những component, service hay API nào?
   - Có vi phạm **Quy tắc vàng kho hàng** hoặc **Quy tắc đồng bộ nguyên tử 1 - 1** không?
4. **[ ] Kiểm tra danh mục giải pháp thất bại**:
   - Đối chiếu giải pháp định làm với danh mục `⛔ CÁCH SỬA ĐÃ THẤT BẠI` ở trên. Nếu trùng, phải dừng lại và tìm giải pháp khác.

---

## 3. QUY TRÌNH BẮT BUỘC SAU KHI SỬA CODE (POST-FLIGHT CHECKLIST)

Sau khi hoàn tất chỉnh sửa mã nguồn:

1. **[ ] Kiểm thử hồi quy chức năng (Regression Testing)**:
   - Kiểm tra chức năng vừa sửa có hoạt động đúng kỳ vọng không.
   - Kiểm tra các chức năng liên quan (ví dụ: sửa kho hàng $\rightarrow$ kiểm tra cả Tiện ích, Cửa hàng, và Modal thanh toán).
2. **[ ] Kiểm tra TypeScript / Build**:
   - Đảm bảo mã nguồn không phát sinh lỗi biên dịch hoặc lỗi linting.
3. **[ ] Cập nhật tài liệu ghi nhớ**:
   - Ghi lại thay đổi vào `CHANGELOG.md`.
   - Nếu phát hiện lỗi mới hoặc bẫy mới, cập nhật ngay vào `KNOWN_ISSUES.md`.
4. **[ ] Báo cáo súc tích**:
   - Báo cáo rõ: Nguyên nhân gốc rễ, Cách đã sửa, Kết quả kiểm thử hồi quy.
