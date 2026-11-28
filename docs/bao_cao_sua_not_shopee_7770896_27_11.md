# Báo Cáo Nghiệm Thu Sửa Nốt Đợt Chuẩn Hóa Giao Diện Shopee — 3 Việc (`7770896` + `8ce261d`)

> **Ghi chú lưu trữ trong Repo (Việc 6 — 28/11/2026):** Bản báo cáo đã đính chính đầy đủ 3 trích dẫn này trước đó chỉ nằm ở thư mục Artifact cục bộ ngoài Git tại thời điểm `8ce261d`; nay được commit chính thức vào [`docs/bao_cao_sua_not_shopee_7770896_27_11.md`](./bao_cao_sua_not_shopee_7770896_27_11.md) để đối chiếu trực tiếp trên repository (đã lược bỏ khối carousel đường dẫn ảnh cục bộ trên máy dev).

## §1. Chuỗi Commit & Diff Stats

- **Commit code & log gốc (`C_code`):** [`7770896`](https://github.com/trduck19-netizen/47-web/commit/7770896d7e669610033957883c958be4267e1972)
  - **SHA đầy đủ:** `7770896d7e669610033957883c958be4267e1972`
  - **Parent SHA đầy đủ:** `ec548342c12a06bbfe42ce72988289bfdb952382` (`ec54834`)
  - **Thông điệp:** `fix(ui): resolve light-theme bare classes, localize CartDrawerModal errors with 23-file i18n guard, and enforce LF logs`
  - **Diff stats:** **`13 files changed, 191 insertions(+), 148 deletions(-)`** (tạo mới `.gitattributes`, gộp chung toàn bộ code + tài liệu + `docs/build_success.log` + `docs/i18n_full_check.log` + `docs/tsc_full_check.log`; 2 file `docs/test_full_check.log` và `docs/rule10_scan.log` đã chạy lại mới và có nội dung trùng khớp byte với `ec54834`).
- **Commit bổ sung log `--all` tách biệt:** [`8ce261d`](https://github.com/trduck19-netizen/47-web/commit/8ce261dfd91b0f2005bc431af61250cafdbe7f13) (`8ce261dfd91b0f2005bc431af61250cafdbe7f13`, parent `7770896`)
  - **Nội dung:** Chạy mới `node scripts/check-hardcoded-i18n.cjs --all` với lookback ternary tách dòng, lưu `docs/check_hardcoded_i18n_all.log` (`119` file, `2.959` vi phạm tại thời điểm `7770896`, `502.273 B` LF) kèm `docs/build_success.log` (`18.966 B` LF, `Injected Build ID: 7770896`).
- **Triển khai Live tại thời điểm vòng `7770896` (`X-Build-Id: 7770896`, HTTP `200`):**
  - Web Khách VI & EN: `https://universal-mall-shop.pages.dev/` & `https://universal-mall-shop.pages.dev/en/` (preview: `https://5a2b8f67.universal-mall-shop.pages.dev`)
  - Cổng Quản trị: `https://admin-universal-mall.pages.dev/admin` (preview: `https://fe57edfd.admin-universal-mall.pages.dev`)
- **Tuân thủ phạm vi cấm (tại vòng `7770896`):** `0` thay đổi trên `functions/`, Admin, Mảnh 4 (`SellerCenterView`, `SellerAffiliateManager`), PA1, Game Zone, D1, và không chạm mục 74 (`StoreView.tsx`).

---

## §2. Chi Tiết Từng Việc 1–3 & Kết Quả Đo Sau Sửa (Đã Đính Chính Đủ 3 Trích Dẫn)

### Việc 1 — Gỡ toàn bộ class tối cứng dạng trần (`ProductCheckoutModal` + `ProductDetailModal`)
- **Vị trí đã sửa (đủ 33 dòng bắt buộc + 10 dòng icon/khung phụ trợ = 43 dòng, giữ nguyên `border` / `border-t`):**
  1. `src/components/ProductDetailModal.tsx` *(đính chính trích dẫn 1: đường dẫn thực tế nằm tại `src/components/ProductDetailModal.tsx`, không phải `src/components/mall/`)*:
     - **3 dòng bắt buộc:** `L903` (`text-emerald-700 dark:text-emerald-500`), `L909` (`text-emerald-700 dark:text-emerald-500`), `L927` (`text-emerald-700 dark:text-emerald-400`).
     - **4 dòng icon phụ trợ:** `L858` (`BadgeCheck`), `L917` (`ShieldCheck`), `L1059` (`Star` `text-amber-500 dark:text-amber-400`), `L1100` (`MapPin` `text-slate-500 dark:text-slate-400`).
  2. `src/components/ProductCheckoutModal.tsx`:
     - **30 dòng bắt buộc:** `L1421` (giữ `border`), `L1437`, `L1439`, `L1448`, `L1513`, `L1832`, `L2192`, `L2202`, `L2213`, `L2224` (đồng bộ cả `border border-emerald-200 dark:border-emerald-500/30`), `L2239`, `L2315`, `L2327`, `L2332` (giữ `border`), `L2333`, `L2339` (giữ `border-t`), `L2346`, `L2350`, `L2356`, `L2414`, `L2425`, `L2433` (giữ `border`), `L2434`, `L2446`, `L2470`, `L2483`, `L2492`, `L2509`, `L2516`, `L2559` (kèm viền `L2211`, `L2222`, `L2323`, `L2349`, `L2440`).
     - **6 dòng icon/khung expired phụ trợ:** `L1465`, `L1975`, `L1996`, `L2019` (`text-rose-600 dark:text-rose-400`), `L2535`, `L2536` (`bg-rose-50/100` + `text-rose-700 dark:text-rose-400`).
     - **Miễn trừ có chủ đích:** hộp thông báo lỗi ảnh QR nền tối `L2283–L2295` (`bg-slate-900`, giữ `L2284 text-amber-400`, `L2285 text-amber-200`, `L2294 text-emerald-300` đúng ngữ cảnh tối).
- **Kết quả đo sau sửa:**
  - Chạy regex mở rộng `(?<!dark:)\b(text-slate-300|text-amber-300|text-indigo-300|text-rose-300|text-emerald-400|text-primary-light|bg-slate-900/80|text-amber-200|text-amber-400|text-slate-400|text-emerald-500|text-rose-400)\b`:
    - `src/components/ProductDetailModal.tsx`: **`0` khớp**.
    - `src/components/ProductCheckoutModal.tsx`: **`0` khớp class trần nền sáng ngoài vùng miễn trừ `L2283–L2295`** (chỉ còn `L2284, L2285` trong hộp tối `bg-slate-900` và 2 chuỗi `dark:hover:text-slate-300` ở `L2327, L2425` là biến thể `dark:` hợp lệ).
  - Kiểm chunk live trên CDN tại vòng `7770896` (`HTTP 200`): `assets/ProductCheckoutModal-DnwYdIyt.js` (**`96.095 B`** UTF-8, đo thật qua `arrayBuffer().byteLength` / `Buffer.byteLength`) và `assets/ProductDetailModal-DQaUjQFt.js` (**`75.305 B`** UTF-8, đo thật qua `arrayBuffer().byteLength` / `Buffer.byteLength`) *(đính chính trích dẫn 3: thay cho số đếm `text.length` UTF-16 cũ `94.827` / `75.276`)*.
  - **Kiểm bằng mắt trình duyệt thật (`1280×800`, chế độ sáng):** Mở `ProductDetailModal` trên `Gói Nạp Test Idempotency` xác nhận pill `Còn hàng` (`text-emerald-700`), sao đánh giá, 3 thẻ bảo chứng (`ShieldCheck`) sắc nét trên nền trắng. *(Phiên trình duyệt ở trạng thái khách vãng lai để không tạo thêm tài khoản test vào D1 `members = 18`, nên `ProductCheckoutModal` ở vòng đó xác minh qua regex tĩnh + bundle live).*

### Việc 2 — Việt/Anh hóa 8 chuỗi lỗi `CartDrawerModal` + mở rộng `check:i18n` lên 23 file
- **Vị trí đã sửa:**
  1. `src/locales/vi.json` (`L251–260`) & `src/locales/en.json` (`L251–260`): thêm 8 khóa đối xứng `cart.errors.*` → đối xứng từ điển tại `7770896` đạt **`2.101 / 2.101`** khóa (đếm flatten trực tiếp 2 từ điển, `0` lệch).
  2. `src/components/cart/CartDrawerModal.tsx` (`L270, L274, L286, L288, L323, L327, L348, L350`): chuyển cả 8 chuỗi sang `t('cart.errors.*')`.
  3. `scripts/check-hardcoded-i18n.cjs`: thêm `'src/components/cart/CartDrawerModal.tsx'` vào `IN_SCOPE_UI_FILES` (`L38`, nâng từ 22 → **23 file**), nâng cấp lookback 4 dòng nối chuỗi (`L156–161`) nhận diện đúng ternary `isEn` tách dòng, và in danh sách 23 file quét ra log tại **`L234`** *(đính chính trích dẫn 2: dòng lệnh `console.log` in danh sách file là `L234`, không phải `L233`)*.
- **Kết quả đo sau sửa:**
  - Grep trực tiếp 8 chuỗi tiếng Việt cũ trong `CartDrawerModal.tsx`: **`0` khớp (`old8_hits: 0`)**.
  - `npm run check:i18n`: **`23/23 PASSED`**, log ghi rõ `src/components/cart/CartDrawerModal.tsx` trong `[DANH SÁCH FILE QUÉT]`.
  - **Ghi nhận giới hạn đã biết:** Guard `check-hardcoded-i18n.cjs` chỉ quét 3 mẫu JSX (text, attr, template literal), không quét chuỗi thuần truyền vào hàm JS (`throw new Error(...)`, `setCheckoutError(...)`); lỗi HTTP từ `/api/seller-orders/multi` & `pay-core` vẫn ưu tiên `data.error` tiếng Việt trả về từ server.

### Việc 3 — Đính chính số liệu, thêm `.gitattributes` & giải trình nguồn số liệu hồi quy `"partners 220/5"`
- `.gitattributes` (`L1`): `docs/*.log text eol=lf` → ép chuẩn LF cho toàn bộ file `.log`.
- `CHANGELOG.md` & `KNOWN_ISSUES.md`: sửa câu phân trang ở mục `488` (`pageSize=24` giữ nguyên từ `a1c39a3`), thêm mục `489` & `ISSUE-341`; đính chính kích thước `docs/tsc_full_check.log` tại `a779653` đo bằng `git cat-file -s` là **`246.343 B`**.
- **Giải trình rõ endpoint cho con số hồi quy `"partners 220/5"`:**
  - Cặp số **`220 / 5`** đến từ endpoint dành riêng cho Chủ gian hàng nguồn (Supplier Store Owner): **`GET /api/seller/affiliate/partners`** (`functions/api/seller/affiliate/partners/index.ts:16-80`), xác thực qua `verifyStoreApiAccess(request, env, { requiredRole: 'OWNER' })` bằng Bearer session token hoặc Store API key của chủ Shop B.
  - Trên dòng đối tác `APPROVED` `sap_mwug5g1i_7cixz`, SQL subquery trên bảng `seller_orders` (`is_affiliate_order = 1 AND deleted_at IS NULL`) trả về:
    - `total_revenue_core: 220` (`COALESCE(SUM(o.price_core), 0)` với `o.status = 'COMPLETED'`).
    - `total_orders_count: 5` (`COUNT(*)` tổng đơn liên shop của cặp đối tác, gồm 3 đơn hoàn tất + 2 đơn hoàn tiền).
  - Các tuyến `GET /api/admin/affiliate` (chỉ trả 3 dòng `partnerships` và thẻ KPI `3/1/0/1/0`), `/api/sync` và `/api/sync-lite` không chứa 2 trường tổng hợp này nên kiểm từ ngoài không dùng token chủ Shop B sẽ không thấy chuỗi `220`.

---

## §3. Bằng Chứng Log Tại Vòng `7770896` + `8ce261d`

| Hạng mục | Kết quả đo trực tiếp từ file log tại `7770896` / `8ce261d` | File log trong repo | Kích thước tại thời điểm đó (`disk` == `git cat-file -s`) |
|---|---|---|---|
| **Bộ test (`npm test`)** | **`225/225` PASS**, `exit 0` (`12` icons + `10` products + `112` suppliers + `71` sync-epoch + `20` intershop) | `docs/test_full_check.log` | **`6.776` B** (`7770896`) |
| **I18N Guard (`check:i18n`)** | **`23/23` PASS (`0` vi phạm)**, in rõ `src/components/cart/CartDrawerModal.tsx` | `docs/i18n_full_check.log` | **`1.521` B** (`7770896`) |
| **Audit `--all` 119 file** | Quét **`119` file**, **`2.959` vi phạm** (chạy mới với lookback ternary tách dòng) | `docs/check_hardcoded_i18n_all.log` | **`502.273` B** (`8ce261d`) |
| **TypeScript (`tsc`)** | `homepage_exit=0` (`HOMEPAGE_TSC_OK`); `full_tsc_exit=2`, tổng **`1.717`** lỗi (`TS6133 = 483`) | `docs/tsc_full_check.log` | **`246.337` B** (`7770896`) |
| **Bảo mật Rule 10** | `ZERO_RULE10_VIOLATIONS` | `docs/rule10_scan.log` | **`78` B** (`7770896`) |
| **Build & Lean Guard** | Pre **`5/5`** + Post **`4/4` PASS**; `Injected Build ID: 7770896` | `docs/build_success.log` | **`18.966` B** (`8ce261d`) |

*(Lưu ý: Tại commit `9837e04` kế tiếp, các file log trên đã được cập nhật lên số đo mới của vòng sửa lỗi nhỏ — xem [`docs/bao_cao_tong_hop_sua_loi_nho_9837e04_28_11.md`](./bao_cao_tong_hop_sua_loi_nho_9837e04_28_11.md)).*

---

## §4. Khôi Phục An Toàn

```bash
git revert 8ce261d 7770896 --no-edit && git push origin main && npm run deploy:all
```
