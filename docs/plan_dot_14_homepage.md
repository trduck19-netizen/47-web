# KẾ HOẠCH TRIỂN KHAI CHI TIẾT (BẢN MỚI) — SỬA NỐT ĐỢT 14 TRANG CHỦ

> **Dự án:** Universal Mall (`universal-mall-shop.pages.dev` & `admin-universal-mall.pages.dev`)  
> **Mốc đối chiếu:** Commit `e3aabc1` (Đợt 13)  
> **Nguyên tắc cốt lõi:** Tốc độ không phải ưu tiên — Quan trọng là hoạt động chính xác, minh bạch, trung thực và dứt điểm từng mục.

---

## I. PHÂN ĐỊNH RÕ RÀNG TRÁCH NHIỆM & TRẠNG THÁI CÁC MỤC

### 1. Nhóm 4 mục E2E Admin (N1.1 – N1.4)
- **N1.1, N1.2, N1.3 — ĐÃ HOÀN TẤT (MUSE ĐÃ LÀM XONG, KHÔNG ĐƯA VÀO BACKLOG):**
  - Chiều 23/11, Muse đã sử dụng phiên Quản trị viên thật (được User ủy quyền) để thực hiện trực tiếp:
    * **N1.1:** Lưu 1 trường mô tả lúc 17:41 $\rightarrow$ D1 `updated_at` đã đổi sang `2026-11-23T10:41:05.016Z`.
    * **N1.2:** Tải ảnh banner thật lúc 17:58 $\rightarrow$ Sinh file ảnh mới `sec_main_hero_banner_1795431494580_1eex0n84.webp`, ảnh E2E gốc `sec_main_hero_banner_real_e2e_v1.webp` vẫn bảo lưu nguyên vẹn 100% trong D1.
    * **N1.3:** Kiểm tra bằng mắt cả 3 hành vi trên giao diện Admin thật (xác nhận cảnh báo AI chưa hiện khi mở khung sửa $\rightarrow$ xử lý tại Nhóm 4; dòng giờ lưu hiển thị chuẩn xác sau lưu 17:58; toast thông báo "chưa gắn link" hoạt động chuẩn cả tiếng Việt lẫn tiếng Anh).
  - **Trách nhiệm của Anti:** KHÔNG làm lại N1.1, N1.2, N1.3; ghi nhận trạng thái **ĐÃ XONG (FIXED)** trong báo cáo Đợt 14.
- **N1.4 — Hồi quy E2E:** Anti kiểm tra lại 1 lượt sau khi hoàn thành sửa code các nhóm 1–4 để bảo đảm toàn bộ luồng hiển thị không bị lỗi. Tuyệt đối không seed bằng migration để đối phó.

### 2. Test đồng thời trên D1 thật (Nhóm 1 mục 1 & 2)
- **Muse đã tự kiểm chứng thành công lúc 17:47:46.767 trên live endpoint + D1 thật:**
  - 9 ảnh tải tuần tự đều HTTP 200.
  - 2 request song song gửi cùng mili-giây $\rightarrow$ Kết quả đúng kỳ vọng: 1 request HTTP 200 + 1 request HTTP 400.
  - Mục test dừng đúng 10 ảnh (không tràn sang ảnh 11), sau đó đã dọn sạch ảnh test và đưa bảng ảnh về đúng dữ liệu E2E.
- **Ghi nhận chuẩn mực:** Request thua bị chặn ở bước kiểm tra đầu (Pre-check) do request kia đã chèn xong trước, đường rollback sau-chèn chưa bị ép chạy trong lần kiểm này $\rightarrow$ Không tuyên bố "100% cho cả cơ chế rollback". Anti ghi nhận kết quả đã được chứng minh trên live, KHÔNG cần làm lại test này.

### 3. Danh mục Blocked (Chỉ User cấu hình)
- **Khóa bí mật bên thứ ba (`GEMINI_API_KEY`, `TINYPNG_API_KEY`):** Ghi nhận vào mục **Blocked** do cần cấu hình trên Cloudflare Pages Secret bởi User.

---

## II. KỸ THUẬT SỬA ĐỔI CHI TIẾT 4 NHÓM VIỆC CỦA ANTI

### NHÓM 1: SSRF CNAME & ĐÍNH CHÍNH ĐƠN VỊ THỜI GIAN
1. **File `scripts/test_ssrf_doh_regression.ts`:**
   - Đổi tên Case 09 thành:
     ```typescript
     name: 'DoH Mock CNAME: Chuỗi CNAME mô phỏng (JSON response tự tạo, domain giả cname-pure.internal) kích hoạt nhánh !hasValidIp & cnamesToFollow recursion dòng 356-362',
     ```
   - Chạy lại test suite và cập nhật artifact `docs/test_ssrf_doh_regression.txt` (49/49 PASS).
2. **File `CHANGELOG.md`:**
   - Mục §439: Đổi `1.127ms` $\rightarrow$ `1127ms`.
   - Mục §440: Đổi `1.064ms–1.276ms` $\rightarrow$ `1064–1276ms`.

---

### NHÓM 2: SỐ LIỆU & TÀI LIỆU CHUẨN XÁC
1. **Đính chính số lượng toán tử ba ngôi (Ternary):**
   - Đếm thực tế trong `src/admin/modules/HomepageSectionsModule.tsx`:
     * `isEn ?`: Đúng **12 lần** (dòng 204, 218, 1345, 1349, 1352, 1353, 1355, 1619, 1627, 2301, 2747, 2876).
     * `isSecEn ?`: Xuất hiện trên 5 dòng nhưng có 3 dòng lặp đôi (dòng 1889 [2], 1890 [2], 1891 [1], 1968 [2], 1969 [1]) $\rightarrow$ Đúng **8 toán tử**.
     * **Tổng cộng: Đúng 20 toán tử ba ngôi.** Cả 20 toán tử đều là selector data model `_en/_vi`, 0 chuỗi UI cứng.
   - Sửa con số "12" thành "20" ở cả `CHANGELOG.md` (§440) và `KNOWN_ISSUES.md` (ISSUE-315), đính kèm lệnh đếm `git grep` và output.
2. **Bổ sung output lệnh `git diff` vào `docs/regression_batch6_audit.md`:**
   - `git diff --stat f99757a -- src/locales/`
   - `git diff --stat e27f7cb -- src/locales/`
3. **Chạy lại TypeScript TypeCheck và lưu log mới có timestamp Đợt 14:**
   - Chạy `npx tsc -p tsconfig.homepage.json --noEmit`.
   - Lưu vào `docs/tsc_check_success.txt` và `docs/tsc_check_success.log` mang timestamp wall-clock Đợt 14.
4. **Đối chiếu Top 3 vi phạm i18n từ log toàn sàn:**
   - Đọc trực tiếp từ `docs/check_hardcoded_i18n_all.log`: `CrawlerModule.tsx` (255), `NewsModule.tsx` (188), `MarketingModule.tsx` (171) $\rightarrow$ Tổng 614 lỗi. Đối chiếu và xác nhận số liệu trong báo cáo.

---

### NHÓM 3: STOREVIEW — THỐNG NHẤT CÁCH ĐẾM & CHIA SỐ ÍT/NHIỀU TIẾNG ANH
1. **Sửa ngữ pháp số ít/số nhiều ở Breadcrumb tiếng Anh:**
   - Trong `src/locales/en.json`:
     ```json
     "store_singular": "Multi-Industry Store (1 Product)",
     "store_plural": "Multi-Industry Store ({count} Products)",
     ```
   - Trong `src/components/shopee/ShopeeTestView.tsx`: Cập nhật logic render breadcrumb khi `subView === 'store'`: nếu tiếng Anh và `count === 1` thì hiển thị `store_singular`, nếu `count > 1` hiển thị `store_plural`.
2. **Thống nhất nhãn đếm trên StoreView:**
   - Breadcrumb đếm theo Game đại diện: `1 Sản Phẩm` / `1 Product`.
   - Tab bộ lọc và danh sách đếm theo gói: Hiển thị rõ ràng `Tất Cả (5 Gói)` / `All (5 Packages)` hoặc `Tổng 5 Gói` (thay vì chữ "Sản Phẩm") để người dùng phân biệt rõ giữa "Game đại diện" và "Gói dịch vụ con bên trong".
3. **Ghi chú dữ liệu sản phẩm trong D1 vào Backlog:**
   - Đưa vào Backlog: Các gói Liên Quân Mobile trong D1 hiện có tiêu đề và mô tả tiếng Việt. Chờ User quyết định phương án: (1) Bổ sung trường `title_en`/`description_en` trong schema D1, hoặc (2) Giữ nguyên vì là dữ liệu test.

---

### NHÓM 4: CẢNH BÁO API KEY AI TRONG MODAL SỬA BANNER
1. **Xác minh nguyên nhân gốc rễ (Root Cause):**
   - Đã kiểm tra code `src/admin/modules/HomepageSectionsModule.tsx`:
     * Cờ `aiImageUnconfigured` vẫn được khởi tạo `true` và khi gọi probe trả về `external_gemini_configured: false` thì cờ vẫn được gán `setAiImageUnconfigured(true)`. **Cờ không bị ghi đè thành false**.
     * **Nguyên nhân thật sự:** Khối JSX hiển thị cảnh báo `{(aiImageUnconfigured || aiConfigured !== true) && (...)}` (dòng 2635) đang bị đặt **bên trong tab `{imageTab === 'ai_image' && (...)}`**.
     * Trong khi đó, hàm `handleEditSection` khi mở modal luôn reset `setImageTab('upload')` (dòng 673). Do đó, khi người dùng vừa mở modal sửa Banner, tab đang hiển thị là `upload`, khiến khối cảnh báo bên trong tab `ai_image` không bao giờ được render ra màn hình nếu chưa bấm chuyển tab!
2. **Phương án khắc phục dứt điểm:**
   - Di chuyển khối cảnh báo ra ngoài tab `ai_image`, đưa lên vị trí tổng quan của khu vực **Nguồn Ảnh** (ngay trước thanh chuyển tab `Upload / Mirror / AI`):
     ```tsx
     {/* Cảnh báo API Key AI luôn hiển thị ngay khi mở modal sửa nếu chưa cấu hình */}
     {(aiImageUnconfigured || aiConfigured !== true) && (
       <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
         <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
         <div>
           <div className="font-bold">{t('homepageSectionsModule.aiImageUnconfigured')}</div>
           <div className="text-[11px] opacity-90">{t('homepageSectionsModule.aiImageUnconfiguredDesc')}</div>
         </div>
       </div>
     )}
     ```
   - Nhờ vậy, ngay khi mở modal sửa Banner, cảnh báo màu vàng hiển thị đập vào mắt ngay lập tức, hỗ trợ chuẩn cả tiếng Việt và tiếng Anh.
3. **Bằng chứng nghiệm thu:**
   - Chụp ảnh màn hình modal sửa Banner vừa mở (thấy rõ cảnh báo màu vàng) lưu vào thư mục `docs/`.

---

## III. QUY TRÌNH KIỂM CHỨNG & TRIỂN KHAI 6 BƯỚC

1. **TypeCheck TypeScript:** Chạy `npx tsc -p tsconfig.homepage.json --noEmit` $\rightarrow$ Exit Code 0, xuất log mới Đợt 14.
2. **Kiểm tra Rule 10 Zero Secrets:** Quét 3 lệnh regex $\rightarrow$ 0 vi phạm.
3. **Chạy các bộ test tự động:**
   - `npx tsx scripts/test_ssrf_doh_regression.ts` $\rightarrow$ 49/49 PASS.
   - `node scripts/count_homepage_i18n.cjs` $\rightarrow$ Fixture = 1, Module = 179 keys / 20 ternaries.
4. **Kiểm tra hồi quy N1.4:** Xác nhận giao diện Admin và Web Khách hiển thị trọn vẹn, không lỗi.
5. **Commit sạch & Build sạch:** Commit mã nguồn, chạy `npm run build` đảm bảo `commit_dirty: false`.
6. **Triển khai tự động (Rule 6):** Deploy cả 2 trang Pages qua Wrangler, `git push origin main`, kiểm tra live endpoints HTTP 200 OK.

---

## IV. BẢNG DỰ KIẾN KẾT QUẢ ĐỢT 14

| Nhóm việc | Hạng mục | Dự kiến Trạng thái | Minh chứng nộp kèm |
| :--- | :--- | :---: | :--- |
| **N1.1 – N1.3** | E2E Admin Thao Tác Thật | **ĐÃ XONG (FIXED)** | Muse đã hoàn tất chiều 23/11 (D1 `updated_at` 10:41:05Z, ảnh mới 17:58) |
| **N1.4** | Hồi quy E2E giao diện | **HOÀN TẤT** | Kiểm tra hiển thị tổng thể sau khi sửa nhóm 1–4 |
| **Test Concurrency** | Test đồng thời D1 thật | **ĐÃ XONG (FIXED)** | Muse đã kiểm chứng live 17:47:46Z (1x200 + 1x400 pre-check chặn) |
| **Nhóm 1** | SSRF Mock CNAME & Đơn vị ms | **HOÀN TẤT** | `docs/test_ssrf_doh_regression.txt` 49/49 PASS, `CHANGELOG.md` |
| **Nhóm 2** | 20 Ternary, Log tsc mới & Diff | **HOÀN TẤT** | `docs/tsc_check_success.txt`, `KNOWN_ISSUES.md`, `regression_batch6_audit.md` |
| **Nhóm 3** | StoreView Đếm & Số ít/nhiều EN | **HOÀN TẤT** | Giao diện `/` và `/en/`, từ điển `vi.json` / `en.json` |
| **Nhóm 4** | Cảnh báo AI mở modal | **HOÀN TẤT** | Giao diện modal sửa Banner, ảnh chụp `docs/` |
| **Backlog** | Dữ liệu sản phẩm D1 tiếng Anh | **BACKLOG** | Chờ User quyết định phương án schema D1 |
| **Blocked** | Khóa Gemini & TinyPNG | **BLOCKED** | Thuộc quyền cấu hình Cloudflare Pages Secrets của User |
