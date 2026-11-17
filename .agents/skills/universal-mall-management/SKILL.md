---
name: universal-mall-management
description: Quản trị, mở rộng và vận hành Sàn Thương Mại Điện Tử Đa Ngành Universal Mall (universal-mall-shop.pages.dev) và Cổng Quản Trị (admin-universal-mall.pages.dev). Quản lý 54 bảng D1 47webdanganh, hệ thống Voucher Shopee đa tầng, API Vận chuyển GHTK/GHN/Viettel Post, 31 module Admin chuẩn Rule 9 Single-Screen First, và quy trình deploy tự động Cloudflare Pages.
---

# Universal Mall Management Skill

Tài liệu hướng dẫn nghiệp vụ và kỹ năng lập trình chuyên biệt cho Sàn Thương Mại Điện Tử Đa Ngành Universal Mall.

---

## 1. THÔNG TIN HẠ TẦNG & ĐỊNH DANH HỆ THỐNG
- **Thư mục làm việc**: `c:\4 Antigravity all\47 web da nganh`
- **Cloudflare Account ID**: `9e6387498b4b3426ea4bd7656ff5142d`
- **Web Khách Live**: `https://universal-mall-shop.pages.dev/`
- **Web Quản Trị Live**: `https://admin-universal-mall.pages.dev/admin`
- **Database D1**: `47webdanganh` (UUID: `f1c32d22-9ad3-41a7-93a4-e9025240c6b2`), binding name `DB`.
- **Tổng số bảng D1**: 54 bảng (kiểm tra trạng thái thời gian thực qua `GET /api/db-status`).

---

## 2. KIẾN TRÚC ROUTING & GIAO DIỆN MẶC ĐỊNH
1. **Trang Chủ (`/`)**: Mặc định hiển thị Sàn Thương Mại Đa Ngành Shopee Mall (`ShopeeTestView`).
2. **Kho Game & Giftcodes**: Tích hợp độc lập qua đường dẫn `/game` hoặc `#catalog` (593 game, 14.739 mã).
3. **Cổng Quản Trị Admin**: Tự động mở khi truy cập `admin-universal-mall.pages.dev` hoặc `/admin`, bảo vệ bằng Admin Console v4.0 Secure.

---

## 3. CÁC QUY TẮC BẤT BIẾN (CORE RULES)
1. **Rule 9 (Single-Screen First 100%)**:
   - 100% bảng quản trị Admin (Đơn hàng, Kho mã, Thành viên, Voucher, Vận chuyển...) phải hiển thị trọn vẹn trong màn hình laptop tiêu chuẩn (1366x768, 1280x720).
   - Tuyệt đối không để xảy ra tràn ngang (0% horizontal overflow) làm che mất cột Thao Tác ở mép phải.
   - Thẻ `<table>` luôn áp dụng `table-fixed w-full` và phân chia chính xác % chiều rộng cột trong `<th>`.
2. **Quy Tắc Kho Hàng Thật (Strict Real Inventory)**:
   - Hàng thật trong kho = 0 $\rightarrow$ Hiển thị tồn kho = 0 ("HẾT HÀNG"). Tuyệt đối không cộng tồn kho ảo.
3. **Hệ Thống Voucher Đa Tầng Shopee Style (Voucher Stacking)**:
   - Áp dụng tối đa 1 Mã Freeship + 1 Mã Giảm Giá Đơn Hàng cho mỗi đơn.
   - Tính toán an toàn độc lập:
     - `finalShippingFee = Math.max(0, shippingFee - freeshipDiscount)`.
     - `finalProductTotal = Math.max(0, productTotal - productDiscount)`.
4. **Vận Chuyển Tự Động (GHTK / GHN / Viettel Post)**:
   - Đơn hàng vật lý tự động tính cước theo trọng lượng/địa chỉ nhận hàng và sinh mã vận đơn bưu chính.
5. **Tự Động Đăng Ký Quyền API Mới (Rule 8)**:
   - Khi phát triển endpoint mới, tự động cập nhật vào `ALL_API_SCOPES` trong `src/admin/modules/ApiKeysModule.tsx` và hàm `hasScope` trong `functions/services/mission_service.ts`.
6. **Zero Test Artifacts (Rule 7)**:
   - Tự động xóa sạch toàn bộ mã/sản phẩm thử nghiệm sau khi kiểm thử.

---

## 4. QUY TRÌNH BUILD & DEPLOY CHUẨN
- **Lệnh Build**:
  ```bash
  node scripts/build.cjs
  ```
  *(Biên dịch Vite Frontend + Compile Cloudflare Edge Worker `dist/_worker.js` + Copy `_routes.json`)*
- **Lệnh Deploy Web Khách**:
  ```bash
  npx wrangler pages deploy dist --project-name=universal-mall-shop --branch=main
  ```
- **Lệnh Deploy Web Quản Trị**:
  ```bash
  npx wrangler pages deploy dist --project-name=admin-universal-mall --branch=main
  ```
- **Lệnh Deploy Cả Hai**:
  ```bash
  npm run deploy:all
  ```
