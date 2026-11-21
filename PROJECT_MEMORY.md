# PROJECT_MEMORY.md — Hệ Thống Kiến Trúc & Tri Thức Dự Án Sàn Đa Ngành (Universal Mall)

> **QUY TẮC BẮT BUỘC DÀNH CHO AI AGENT & DEVELOPER**:
> Trước khi thực hiện bất kỳ chỉnh sửa nào trong codebase, **BẮT BUỘC** phải đọc file này cùng với `CHANGELOG.md` và `KNOWN_ISSUES.md`.
> Tuân thủ tuyệt đối 12 quy tắc vàng trong `AGENTS.md` / `GEMINI.md`, đặc biệt là **Rule 9 (Single-Screen First 100%)** và **Rule 12 (100% Bilingual VI/EN First)**.

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
  - Tổng số bảng: **54 bảng dữ liệu** (Kiểm tra qua `GET /api/db-status`)
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
  - Build Vite Frontend vào `dist/`
  - Compile Worker bundle từ `functions/_worker.ts` vào `dist/_worker.js`
  - Copy `public/_routes.json` vào `dist/_routes.json`
- **Quy trình Deploy**:
  - `npm run deploy:all` (Deploy đồng thời cả `universal-mall-shop` và `admin-universal-mall`).

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
