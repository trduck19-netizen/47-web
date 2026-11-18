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
