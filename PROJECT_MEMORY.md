# PROJECT_MEMORY.md — Hệ Thống Kiến Trúc & Tri Thức Dự Án Sàn Đa Ngành (Universal Mall)

> **QUY TẮC BẮT BUỘC DÀNH CHO AI AGENT & DEVELOPER**:
> Trước khi thực hiện bất kỳ chỉnh sửa nào trong codebase, **BẮT BUỘC** phải đọc file này cùng với `CHANGELOG.md` và `KNOWN_ISSUES.md`.
> Tuân thủ tuyệt đối 14 quy tắc vàng trong `AGENTS.md` / `GEMINI.md`, đặc biệt là **Rule 9 (Single-Screen First 100%)**, **Rule 10 (Zero Secrets & Edge Security Integrity)**, **Rule 12 (100% Bilingual VI/EN First)**, và **Rule 14 (5-Gate Anti-Error Protocol)**.

---

## 1. TỔNG QUAN DỰ ÁN & VẬN HÀNH

- **Tên dự án**: Sàn Thương Mại Điện Tử Đa Ngành & Nền Tảng Tiện Ích Số (Universal Mall Platform)
- **Hệ Thống Tên Miền Chuẩn Mực Duy Nhất (SSOT Domains)**:
  - **Trang Quản Trị (Admin Portal)**:
    - `https://admin-universal-mall.pages.dev/admin` (Cloudflare Pages Project: `admin-universal-mall`)
  - **Trang Khách Hàng (Client Portal)**:
    - `https://universal-mall-shop.pages.dev/` (Cloudflare Pages Project: `universal-mall-shop`)
- **Cơ Sở Dữ Liệu D1**:
  - Tên Database: `47webdanganh`
  - UUID: `f1c32d22-9ad3-41a7-93a4-e9025240c6b2`
  - Binding Name trong Cloudflare Pages: `DB`
  - Tổng số bảng: **62 bảng dữ liệu** (54 bảng ban đầu + 4 bảng Khóa AI Người Dùng `user_ai_api_*` + 4 bảng Liên Shop Bán Lại `seller_affiliate_*`)
- **🛑 VÙNG CẤM TUYỆT ĐỐI (RESTRICTED ZONES)**:
  - **TUYỆT ĐỐI KHÔNG SỬA ĐỔI** mã nguồn dự án cũ `C:\4 Antigravity all\13 web code game`.
  - **TUYỆT ĐỐI CẤM ĐỘNG VÀO** thư mục `C:\4 Antigravity all\3 Codegame store` (`codegame.store`).
  - Mọi thao tác phát triển, kiểm thử và deploy chỉ thực hiện trong thư mục `C:\4 Antigravity all\47 web da nganh`.

---

## 2. ĐỊNH VỊ KIẾN TRÚC & ROUTING (PHƯƠNG ÁN 2 - HYBRID MALL FIRST)

1. **Trang Chủ Mặc Định (`/`)**:
   - Hiển thị trực tiếp Sàn Thương Mại Đa Ngành Shopee Mall (`ShopeeTestView`).
   - Tích hợp Banner Carousel "Bảo Chứng Sàn 168 Giờ", Flash Sale giờ vàng đếm ngược tự động, Lưới danh mục đa ngành (thời trang, mỹ phẩm, công nghệ, tiện ích), và bộ đổi giao diện Cam / Trắng / Dark.
2. **Kho Game & Giftcodes**:
   - Tích hợp độc lập qua route `/game` hoặc hash `#catalog` (với 593 game và 14.739 mã có bản quyền).
3. **Trang Quản Trị Hệ Thống**:
   - Tự động mở khi truy cập `admin-universal-mall.pages.dev` hoặc `/admin`, bảo vệ bởi Admin Console v4.0 Secure.
   - Chứa trọn vẹn **31 Module Quản Trị Chuyên Sâu**: Đơn hàng, Kho mã, Thành viên, Doanh thu, Cổng thanh toán VietQR / SePay, Voucher đa tầng, Vận chuyển, Khóa API, Phân quyền...

---

## 3. TECH STACK & QUY TRÌNH BUILD / DEPLOY

- **Frontend**: React 18.3.1, TypeScript 5.6.3, Vite 5.4.10, Tailwind CSS 3.4.14, Lucide Icons.
- **Backend & Serverless Edge**: Cloudflare Pages Functions & Edge Worker (`dist/_worker.js`).
- **Database**: Cloudflare D1 SQL (`47webdanganh`).
- **Quy trình Build hoàn chỉnh**:
  - Lệnh build: `node scripts/build.cjs`
  - Bước 0: Quét chuỗi tiếng Việt ghi cứng (`check-hardcoded-i18n.cjs`)
  - Bước 0.5: TypeScript type check (`tsc -p tsconfig.homepage.json --noEmit`)
  - Bước 0.6: Pre-build Lean Guard Scanner (`check-lean-budgets.cjs --stage=pre`)
  - Bước 1: Dọn sạch `dist/assets` và `dist/game_icons`, build Vite Frontend vào `dist/`
  - Bước 2: Compile Edge Worker bundle từ `functions/_worker.ts` vào `dist/_worker.js`
  - Bước 3: Copy `public/_routes.json` vào `dist/_routes.json`
  - Bước 4: Post-build Lean Guard Scanner (`check-lean-budgets.cjs --stage=post` kiểm tra chunks, worker bundle <= 10 MB [thực tế 6.17 MB], dist <= 85 MB [thực tế 67.99 MB])
- **Quy trình Deploy**:
  - `npm run deploy:all` (Deploy đồng thời cả `universal-mall-shop` và `admin-universal-mall`).
- **Khung Tinh Gọn Hệ Thống (Lean Framework)**:
  - Cẩm nang quy chuẩn: [`docs/HUONG_DAN_VAN_HANH_TINH_GON.md`](file:///c:/4%20Antigravity%20all/47%20web%20da%20nganh/docs/HUONG_DAN_VAN_HANH_TINH_GON.md).
  - Lệnh kiểm tra ngân sách độc lập: `npm run check:lean`.

---

## 4. QUY TẮC CỐT LÕI (CORE RULES)

1. **Rule 9 (Single-Screen First 100%)**:
   - 100% các bảng quản trị Admin (Đơn hàng, Kho mã, Thành viên, Voucher, Vận chuyển...) phải hiển thị trọn vẹn trong màn hình laptop tiêu chuẩn (1366x768, 1280x720).
   - Tuyệt đối không để xảy ra tràn ngang (0% horizontal overflow). Thẻ `<table>` luôn có `table-fixed w-full` và phân chia % cột chính xác.
2. **Quy Tắc Kho Hàng Thật (Strict Real Inventory)**:
   - Hàng thật trong kho = 0 $\rightarrow$ Hiển thị tồn kho = 0 ("HẾT HÀNG"). Tuyệt đối không cộng tồn kho ảo.
3. **Shopee-Style Voucher Stacking**:
   - Mỗi đơn hàng áp dụng tối đa 1 Mã Freeship + 1 Mã Giảm Giá Đơn Hàng. Tính toán độc lập và an toàn, không dồn gây âm tiền đơn hàng.
4. **Vận Chuyển Tự Động**:
   - Đơn hàng vật lý tự động tính cước và sinh mã vận đơn bưu chính (GHTK / GHN / Viettel Post).
5. **Rule 8 (Auto-register New API Scopes)**:
   - Tự động map quyền mới vào `ALL_API_SCOPES` trong `src/admin/modules/ApiKeysModule.tsx` và `hasScope` trong `functions/services/mission_service.ts`.
6. **Rule 7 (Zero Test Artifacts)**:
   - Tự động dọn dẹp sạch sẽ toàn bộ dữ liệu test sau khi kiểm thử.
7. **Rule 12 (100% Bilingual VI/EN First)**:
   - Mọi tính năng, module, giao diện mới (cả Web Khách và Web Quản trị) bắt buộc phải hỗ trợ song ngữ Tiếng Việt và Tiếng Anh ngay từ đầu.
   - Không ghi cứng văn bản trong JSX/TSX; mọi chuỗi hiển thị phải lưu trong `src/locales/vi.json` và `src/locales/en.json`, gọi qua hook `useLanguage()`. URL chuẩn hóa `/en/` và `/` (hoặc `/vi/`).

---

## 5. CÁC NGUYÊN TẮC BẢO MẬT & KIẾN TRÚC AN TOÀN BẮT BUỘC (MANDATORY SECURITY ARCHITECTURE)

> **CẢNH BÁO BẢO MẬT BẮT BUỘC (ZERO TOLERANCE SECURITY RULES)**:
> Mọi thay đổi trong backend (`functions/`), dịch vụ xác thực, tài chính, rate limiting và crawler/proxy bắt buộc phải tuân thủ nghiêm ngặt 8 nguyên tắc kiến trúc dưới đây. Tuyệt đối không được vi phạm hoặc tạo lại các cạm bẫy đã thất bại.

### Nguyên Tắc 1: Phân Tách Secret Theo Đúng Mục Đích & Tuyệt Đối Không Fallback Chuỗi Ghi Cứng (Purpose-Separated Secrets & Zero Hardcoded Fallback)
- **Tách biệt độc lập theo đặc quyền**:
  - `ADMIN_API_KEY`: Dành riêng cho quyền xác thực quản trị cao nhất trên trang Admin.
  - `SYNC_SECRET`: Dành riêng cho endpoint đồng bộ dữ liệu (`/api/admin/history.ts`).
  - `CRON_SECRET`: Dành riêng cho các tác vụ nền định kỳ và scheduled workers.
  - `JWT_SECRET`: Dành riêng cho chữ ký HMAC-SHA256 của phiên đăng nhập (`session_token`).
  - `PASSWORD_PEPPER`: Dành riêng cho hàm băm mật khẩu PBKDF2.
- **Cấm Master Key đa năng**: Tuyệt đối không sử dụng một biến duy nhất (như `ADMIN_SYNC_SECRET`) để đại diện cho nhiều vai trò. Lộ một secret không được phép làm sụp đổ các phân hệ khác.
- **Cấm Fallback chuỗi tĩnh**: Tuyệt đối không đặt chuỗi mặc định ghi cứng trong code (ví dụ: `'wcg_master_key_configured_in_env'`).
- **Xử lý Fail-Closed**: Khi biến môi trường chưa được thiết lập hoặc có độ dài không đủ an toàn (< 16 ký tự), API bắt buộc phải từ chối phục vụ, ném lỗi cấu hình `SERVER_MISCONFIGURED` (HTTP 503) và hướng dẫn cấu hình qua Cloudflare Dashboard, tuyệt đối không âm thầm chạy tiếp với khóa mặc định.

### Nguyên Tắc 2: Xác Thực Single-Domain & Triệt Tiêu Bypass Phía Trình Duyệt (Zero Cross-Domain / Zero Static Bypass)
- **Single-Domain Only**: Client chỉ được phép giao tiếp với endpoint xác thực cùng domain nội bộ (`/api/auth/login`, `/api/auth/register`, `/api/auth/me`). Tuyệt đối không được fallback lặp qua danh sách domain khác (`codegame.shop`, `web-code-game.pages.dev`, `admin-code-game-shop.pages.dev`). Khi API domain hiện tại lỗi, dừng lại và thông báo lỗi rõ ràng.
- **Xóa bỏ 100% logic bypass trên Frontend**:
  - Không chấp nhận tiền tố token chuỗi tĩnh (`wcg_tok_usr_admin_`, `admin290200`).
  - Không cho phép cờ `cachedAdmin` trong `localStorage` tự động mở trang quản trị mà không có xác nhận phiên từ máy chủ D1.
- **Xác thực phiên tập trung qua Server**: Mọi phiên làm việc bắt buộc phải được máy chủ D1 xác thực qua `GET /api/auth/me`. Khi máy chủ từ chối (401, 403, 503), client phải xóa sạch cờ bộ nhớ tạm và token trong trình duyệt, đưa người dùng về giao diện đăng nhập.

### Nguyên Tắc 3: Băm Mật Khẩu Chậm PBKDF2 (100.000 Vòng) & Không Nhận Hash Từ Client
- **Thuật toán băm chuẩn mực**: Mật khẩu người dùng bắt buộc được băm bằng PBKDF2 với 100.000 vòng lặp, thuật toán SHA-256, muối ngẫu nhiên 16 bytes sinh từ `crypto.getRandomValues`, kết hợp với `PASSWORD_PEPPER` bí mật của hệ thống.
- **Xử lý phía Server duy nhất**: Client chỉ gửi mật khẩu thô qua kết nối an toàn HTTPS. Máy chủ tự sinh muối và thực hiện băm. Tuyệt đối không nhận `newPasswordHash` hay `salt` do client tự tính toán gửi lên.
- **Thu hồi phiên khi đổi mật khẩu**: Ngay khi cập nhật mật khẩu thành công, bắt buộc thực thi `UPDATE members SET session_token = NULL WHERE id = ?` để vô hiệu hóa tức thì toàn bộ phiên đăng nhập cũ trên mọi thiết bị.
- **Cấm hạ cấp thuật toán**: Không bao giờ hạ cấp mật khẩu từ PBKDF2/Bcrypt về SHA-256 một vòng.

### Nguyên Tắc 4: Giới Hạn Tần Suất Hai Trục (Dual-Axis Rate Limiting) & Fail-Closed
- **Hai trục bảo vệ**: Mọi endpoint nhạy cảm (gửi OTP, đặt lại mật khẩu, đăng nhập, nạp thẻ) phải được kiểm soát giới hạn tần suất theo 2 trục song song:
  1. Trục địa chỉ IP: `ip:ENDPOINT` (chống flood và DoS từ một nguồn).
  2. Trục tài khoản / email: `acc:EMAIL:ENDPOINT` (chống tấn công brute-force phân tán qua mạng botnet / IP xoay vòng).
- **Phòng vệ Fail-Closed**: Khi truy vấn bảng rate limit trong CSDL D1 gặp lỗi, bắt buộc trả về HTTP 503 `RATE_LIMIT_ERROR`. Tuyệt đối không nuốt lỗi bằng `.catch(() => null)` để chuyển thành fail-open.
- **Reset bộ đếm sau khi hết hạn khóa**: Khi `nowMs >= locked_until` hoặc cửa sổ thời gian hết hạn, bộ đếm số lần thử (`attempts`) phải được đặt lại về 1, không được giữ nguyên giá trị đã vượt ngưỡng khiến người dùng bị khóa vĩnh viễn sau lần thử đầu tiên.

### Nguyên Tắc 5: Rào Trạng Thái Trước Khi Ghi Sổ Cái / Cộng Tiền (State-Guard-First Concurrency)
- **Nguyên tắc rào trạng thái nguyên tử**: Trong mọi thao tác tài chính (giải ngân cọc escrow, duyệt thưởng nhiệm vụ, trả tiền hoàn, áp mã giảm giá, nhận giftcode), bắt buộc phải thực thi câu lệnh nguyên tử cập nhật trạng thái trước:
  ```sql
  UPDATE table_name SET status = 'NEW_STATUS' WHERE id = ? AND status = 'EXPECTED_STATUS'
  ```
- **Kiểm tra số dòng thay đổi**: Luôn kiểm tra `res.meta?.changes > 0`. Nếu `changes === 0`, từ chối ngay lập tức (dấu hiệu của race condition, click kép hoặc đã được xử lý bởi phiên làm việc khác).
- **Cơ chế bồi hoàn (Compensatory Rollback)**: Chỉ sau khi rào trạng thái thành công mới tiến hành ghi nhận vào sổ cái `ledger_transactions` hoặc cộng số dư ví. Nếu bước ghi sổ cái tiếp theo gặp lỗi ngoại lệ, khối `catch` bắt buộc phải khôi phục lại trạng thái ban đầu của bản ghi và ghi log kiểm toán.

### Nguyên Tắc 6: Thu Thập Dữ Liệu Gốc Từ Máy Chủ Cho Xóa Mềm (Server-Side Data Capture for Soft Delete)
- **Truy vấn D1 thực tế**: Khi quản trị viên yêu cầu xóa mềm (`soft_delete`), máy chủ D1 bắt buộc phải tự truy vấn dữ liệu gốc thực tế từ bảng tương ứng cho tất cả 8 loại đối tượng (`game`, `code`, `giveaway`, `mission`, `news`, `pending_game`, `upcoming_game`, `utility`).
- **Từ chối dữ liệu từ Client**: Tuyệt đối không tin tưởng và không lưu `originalData` do client gửi lên. Nếu bản ghi không tồn tại trong D1, trả về HTTP 404 và hủy thao tác, ngăn chặn triệt để hành vi tiêm nhiễm payload giả mạo vào bảng lịch sử để phục hồi trái phép.

### Nguyên Tắc 7: Tuyệt Đối Không Dùng Math.random() Cho Dữ Liệu Mật Mã & Định Danh Nhạy Cảm (Zero Math.random in Crypto)
- **Sử dụng Web Crypto API**: Mọi thao tác sinh muối (salt), session token, mã định danh giao dịch (`txn_`), mã xóa mềm (`del_`), mã khiếu nại (`disp_`), và mã đổi thưởng (`redId`) bắt buộc phải dùng `crypto.getRandomValues(new Uint8Array(n))`.
- **Cấm PRNG giả định**: Tuyệt đối không dùng `Math.random().toString(36)` trong bất kỳ hàm nào liên quan đến bảo mật, phiên làm việc hoặc xác thực.

### Nguyên Tắc 8: Phòng Thủ SSRF Toàn Diện & Giới Hạn Tải Dữ Liệu Ngoại Vi (Full SSRF Defense & Payload Streaming Limits)
- **Pre-Auth Fail-Closed**: Bắt buộc xác thực người gọi trước khi thực hiện bất kỳ lệnh proxy fetch nào ra ngoài mạng Internet, kể cả khi CSDL chưa sẵn sàng.
- **Lọc dải IP an toàn (`isSafeCrawlUrl`)**: Kiểm tra và chặn triệt để các địa chỉ IP nội bộ, loopback (`127.0.0.1`, `localhost`), dải private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), metadata của Cloud Provider (`169.254.169.254`), và IPv6 loopback (`::1`).
- **Kiểm soát chuyển hướng thủ công (Manual Redirect Handling)**: Thiết lập `redirect: 'manual'`. Lặp tối đa 3 hops, ở mỗi hop trích xuất header `Location`, phân giải URL đích tuyệt đối và tái kiểm tra qua `isSafeCrawlUrl` trước khi gửi request tiếp theo.
- **Giới hạn Streaming 1MB với `reader.cancel()`**: Truyền phát dữ liệu phản hồi qua Web Streams API (`res.body.getReader()`), đếm số bytes tích lũy. Ngay khi vượt quá 1MB (1.048.576 bytes), lập tức gọi `reader.cancel()`, đóng socket và trả về HTTP 413 `PAYLOAD_TOO_LARGE` nhằm triệt tiêu nguy cơ cạn kiệt bộ nhớ Worker (DoS).
- **Whitelist MIME Type & Header An Toàn Cho Proxy Ảnh**:
  - Whitelist nghiêm ngặt: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/x-icon`. Từ chối mọi Content-Type khác.
  - Luôn đính kèm các header bảo vệ: `X-Content-Type-Options: nosniff` và `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.

### Nguyên Tắc 9: Quy Trình Khôi Phục & Xoay Secret Chuẩn Mực 3 Bước (Zero-Leak Recovery Procedure)
- **Trình tự khôi phục chuẩn xác khi xoay `PASSWORD_PEPPER`**:
  1. *Bước 1 - Thiết lập biến bí mật mới*: Cấu hình biến môi trường `PASSWORD_PEPPER` mới có độ phức tạp cao (>= 32 ký tự ngẫu nhiên) đồng bộ trên cả 2 Cloudflare Pages Projects (`universal-mall-shop` và `admin-universal-mall`).
  2. *Bước 2 - Đặt lại mật khẩu qua OTP*: Quản trị viên/người dùng sử dụng tính năng quên mật khẩu qua OTP `/api/auth/reset-password` để thiết lập mật khẩu mới. Máy chủ sẽ tự sinh muối WebCrypto mới và băm PBKDF2 100.000 vòng lặp trực tiếp với pepper mới.
  3. *Bước 3 - Đăng nhập bằng mật khẩu mới*: Đăng nhập chính thức để xác thực và nhận JWT Token phiên làm việc mới.
- **Cơ chế Pepper-Binding & Cảnh báo băm lại**:
  - *Lý do Pepper-Binding*: Mã băm PBKDF2 gắn liền với pepper tại thời điểm tính toán. Nếu tạm thời đặt pepper cũ đã lộ lên Cloudflare Pages rồi sau đó mới xoay sang pepper mới, mã băm PBKDF2 vừa tạo vẫn gắn với pepper cũ. Khi đó, lần đăng nhập tiếp theo với pepper mới sẽ thất bại 100% (tài khoản bị khóa vĩnh viễn). **Tuyệt đối không đặt tạm pepper cũ đã lộ rồi mới xoay**.
  - *Cảnh báo nâng cấp tự động*: Việc tự động nâng cấp hash khi đăng nhập chỉ băm lại mật khẩu cũ hiện tại bằng PBKDF2 — nó KHÔNG sửa việc chuỗi hash SHA-256 cũ của chính mật khẩu đó đã bị lộ công khai trong lịch sử repo và vẫn có thể bị bẻ khóa offline. **BẮT BUỘC Quản trị viên phải thực hiện ĐỔI MẬT KHẨU MỚI** (trong form quản trị hoặc qua OTP) để loại bỏ hoàn toàn rủi ro mật khẩu cũ bị bẻ khóa.
- **Cấm lặp lại sai lầm**: Tuyệt đối không đặt tạm pepper cũ đã lộ lên Cloudflare Pages rồi mới xoay, không lưu chuỗi bí mật trong code/commit history, và tuân thủ nguyên tắc di chuyển một chiều (One-way Legacy Migration Bridge).

---

## 6. KHO LƯU TRỮ VÀ TỐI ƯU HÓA ẢNH TRANG CHỦ & KIỂM SOÁT CONCURRENCY (HOMEPAGE IMAGE PIPELINE & CONCURRENCY GUARD)

1. **Lưu Trữ Ảnh Tách Biệt & Không Gây Ballooning D1**:
   - Ảnh tải lên được lưu trong bảng chuyên biệt `homepage_section_images` (chứa dữ liệu binary WebP nén) và phục vụ trực tiếp qua Edge streaming endpoint `/api/homepage-images/:id`.
   - Bảng cấu hình `system_settings` chỉ lưu URL nội bộ `/api/homepage-images/:id`, không bao giờ lưu base64.
2. **Loại Bỏ Migration Ngầm Khỏi Các Endpoint Đọc (Zero Migrations on Probe/Read)**:
   - Các endpoint kiểm tra trạng thái (`/api/homepage-images/probe`) hoặc tải dữ liệu (`/api/homepage-sections`) **TUYỆT ĐỐI KHÔNG** gọi `ensureSchemaUpgrades`.
   - Migration D1 chỉ chạy qua file migration chuyên dụng hoặc lệnh CLI quản trị định kỳ, đưa độ trễ của probe về dưới 50ms và không làm nghẽn giao diện Admin.
3. **Cơ Chế Phân Định Thứ Tự Top 10 Chống Race Condition (Atomic Top-10 Concurrency Guard)**:
   - Khi có 2 request upload chạy song song khi CSDL đang có 9 ảnh (tổng tăng lên 11), hệ thống áp dụng truy vấn:
     `SELECT id FROM homepage_section_images WHERE section_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 10`.
   - Bản ghi đến trước (thứ 10) nằm trong Top 10 được giữ lại an toàn (HTTP 200).
   - Bản ghi đến sau (thứ 11) bị tự động rollback xóa khỏi DB và trả về HTTP 400 kèm thông báo rõ ràng.
   - Luôn kiểm chứng cơ chế này bằng SQLite D1 C-Engine thật (`node:sqlite`).
4. **Điều Hướng Liên Kết Cửa Hàng Thật (Real Store Navigation)**:
   - Khi người dùng hoặc quản trị viên click vào liên kết `/store`, hệ thống chuyển thẳng `subView: 'store'` (mở `StoreView` chuyên biệt) và cuộn lên đầu trang, tuyệt đối không giữ ở trang chủ và chỉ cuộn xuống sản phẩm.

---

## 7. KIẾN TRÚC KHÓA API CHO AI CỦA TỪNG NGƯỜI DÙNG (USER AI API KEYS)

1. **Nguyên Tắc Lưu Trữ & Hiển Thị (Zero Raw Secret Retention)**:
   - Khóa có tiền tố `wcg_ai_usr_<32_hex_chars>`.
   - Khóa thô (raw key) CHỈ hiển thị DUY NHẤT 1 lần ngay sau khi tạo trên giao diện web.
   - Trong D1 `user_ai_api_keys`, chỉ lưu mã băm SHA-256 (`key_hash`), tiền tố rút gọn (`key_prefix`), và 4 ký tự cuối. Tuyệt đối không lưu khóa gốc, không in ra log/báo cáo.
2. **Quyền Hạn Phạm Vi (Scopes) & Phân Tách Đặc Quyền**:
   - Chỉ gồm các quyền thành viên hợp pháp: `profile`, `shopping`, `reviews` (chỉ đánh giá hàng đã mua), `disputes`, `seller` (nếu có gian hàng), `rewards`, `notifications`.
   - **CẤM TUYỆT ĐỐI**: Các endpoint admin, đổi mật khẩu, đổi email, quản lý/tạo/thu hồi khóa API.
   - Khóa API chỉ dùng qua HTTP Header `Authorization: Bearer <key>`, không dùng để đăng nhập phiên web.
3. **Bảo Vệ Ví Core & Hạn Mức Chi Tiêu Ngày**:
   - Mặc định toàn bộ quyền ví bị TẮT. Chỉ được bật trong phiên web đã đăng nhập, riêng từng khóa (`vi_xem`, `vi_nap`, `vi_chi`, `seller_withdraw`).
   - Bắt buộc đặt hạn mức chi ngày (`daily_spend_limit`), kiểm tra atomic và từ chối khi vượt hạn mức mà không trừ tiền.
4. **Kiểm Soát Thiết Bị & Cảnh Báo An Toàn**:
   - Đếm thiết bị qua `X-Device-Id` + `cf-connecting-ip` so với `max_devices` (mặc định 3).
   - Vượt hạn mức: Trả HTTP 403 `DEVICE_LIMIT_EXCEEDED`, chặn gọi tiếp và gửi cảnh báo lặp lại 1 giờ/lần (tối đa 24h) cho tới khi user xác nhận "Đã biết" trên web.
5. **Giới Hạn Tốc Độ & Nhật Ký Kiểm Toán (Audit Logs)**:
   - Rate limit: 600 yêu cầu / phút / khóa.
   - Ghi log 100% cuộc gọi vào `user_ai_api_call_logs`, lưu giữ ít nhất 30 ngày.

---

## 8. KIẾN TRÚC API GÁN SHOP / BÁN LẠI LIÊN SHOP (CROSS-SHOP RESELLER ARCHITECTURE - GĐ1)

1. **Khóa Cặp API NCC - Shop Gán (`wcg_shop_<32_hex>`)**:
   - Sinh tự động khi NCC duyệt yêu cầu liên kết của Shop gán. Chỉ hiển thị thô DUY NHẤT 1 lần.
   - Lưu D1 `seller_affiliate_partnerships` chỉ dạng băm SHA-256 (`api_key_hash`), tiền tố `wcg_shop_xxxx••••xxxx`.
   - Khóa có thẩm quyền đọc catalog mở của đúng NCC đó, cấm đọc đơn/khách/ví của NCC.
   - Khi NCC thu hồi: toàn bộ listing của shop gán lập tức ẩn, nhưng đơn hàng đang giao vẫn tiếp tục hoàn tất.
2. **Quy Tắc Chặn Gán Lại Tầng 2 (Single-Tier Guard & Anti-loop)**:
   - Sản phẩm đã được gán lại (`is_affiliate === 1` hoặc `origin_product_id != null`) TUYỆT ĐỐI CẤM mở bán lại tiếp cho shop thứ 3 (chặn $A \to B \to C$).
   - Chặn vòng lặp và tự gán ($A \to B \to A$ hoặc $A \to A$) qua kiểm tra `supplier_seller_id !== reseller_seller_id`.
3. **Chế Độ Giá & Tuân Thủ Giá Sàn MAP**:
   - Giá bán bên gán: $P = \text{base\_price} + \text{markup}$ (với $\text{markup} \ge 0$).
   - Chế độ `FORMULA`: Tự động cập nhật giá bán khi giá gốc của NCC thay đổi.
   - Chế độ `LOCKED`: Khóa giá bán cố định; nếu giá gốc vượt giá bán, hệ thống phát cảnh báo tức thì.
   - Giá sàn MAP: Nếu công thức ra thấp hơn MAP do NCC quy định, giá bán tự động nâng lên đúng MAP.
4. **Thuật Toán Chia Tiền 3 Bên & Điều Hòa Làm Tròn (3-Way Escrow Split & Rounding Reconciliation)**:
   - Khách trả: $P = \text{base\_price} + \text{markup}$
   - Phí sàn: $F = (5\% \text{ digital} / 2\% \text{ physical}) \times \text{base\_price}$ (tính trên giá gốc NCC)
   - Chiết khấu: $D = \text{discount\_pct} \times \text{base\_price}$
   - Hoa hồng: $H = \text{commission\_pct} \times \text{base\_price}$
   - NCC nhận: $\text{base\_price} - D - F - H$
   - Shop gán nhận: $\text{markup} + H + D$
   - Sàn nhận: $F$
   - Thuật toán điều hòa: $\text{NCC} + \text{Shop gán} + \text{Sàn} == P$ (chênh lệch số lẻ làm tròn bù vào Shop gán). Đảo ngược hoàn tiền theo cùng tỷ lệ.
5. **Đồng Bộ Kho Mã Số & Dropship Hàng Vật Lý**:
   - Hàng số: Tự động bốc mã từ kho của NCC (`sourceProductId = product.origin_product_id`), giao ngay cho khách sau thanh toán.
   - Hàng vật lý: NCC dropship giao thẳng cho người mua, phí vận chuyển 100% về NCC.
6. **Kiểm Toán & Giới Hạn Tốc Độ**:
   - Rate limit: 600 yêu cầu / phút / khóa.
   - Nhật ký đồng bộ `seller_affiliate_sync_logs` và nhật ký gọi `seller_affiliate_call_logs` lưu trữ $\ge 30$ ngày.
