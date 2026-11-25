# KNOWN_ISSUES.md — Danh Mục Lỗi Đã Biết, Bẫy Cần Tránh & Quy Trình Kiểm Thử

> **CẢNH BÁO BẮT BUỘC DÀNH CHO AI AGENT VÀ DEVELOPER**:
> Trước khi thực hiện bất kỳ thao tác sửa đổi nào:
> 1. **BẮT BUỘC ĐỌC** danh mục lỗi dưới đây để không bao giờ lặp lại các cách sửa đã thất bại.
> 2. Nếu vấn đề chưa rõ nguyên nhân: **ĐIỀU TRA & THU THẬP THÔNG TIN TRƯỚC**, tuyệt đối không sửa mò hoặc tự ý viết lại mã nguồn không liên quan.
> 3. Sau khi sửa: Thực hiện đầy đủ các bước trong **Post-flight Checklist** trước khi báo cáo hoàn thành.

---

## 1. DANH MỤC LỖI & CÁC BẪY ĐÃ THẤT BẠI (DO NOT REPEAT)

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
