# QUY TẮC BẮT BUỘC SONG NGỮ VIỆT - ANH TOÀN DIỆN
# (100% BILINGUAL VI/EN FIRST PRINCIPLE)

Quy chuẩn kỹ thuật bắt buộc áp dụng cho toàn bộ Tác nhân (Agents & Subagents) và Lập trình viên khi phát triển bất kỳ tính năng nào trong dự án Sàn Đa Ngành Universal Mall:

---

### 1. Bắt buộc song ngữ cho 100% tính năng mới (Zero Monolingual Feature)
- **Mọi thành phần giao diện mới:** Dù là Web Khách Hàng (`universal-mall-shop.pages.dev`) hay Web Quản Trị (`admin-universal-mall.pages.dev`), bao gồm:
  - Trang (Page / View), Phân mục (Section), Lưới danh mục (Category Grid).
  - Modal, Drawer, Popup, Toast Notification, Alert, Banner.
  - Form nhập liệu, Nhãn input (Label), Placeholder, Text gợi ý (Helper Text).
  - Bảng dữ liệu (Table header & cells), Nút thao tác (Buttons), Thẻ trạng thái (Status Badges), Tooltip.
  - Thông báo lỗi mạng, Thông báo thành công, Dòng trạng thái rỗng (Empty State).
- **TUYỆT ĐỐI KHÔNG GHI CỨNG (ZERO HARDCODED TEXT):** Cấm ghi cứng bất kỳ chuỗi tiếng Việt hoặc tiếng Anh nào trực tiếp trong file JSX/TSX.

---

### 2. Quy chuẩn từ điển tập trung (`vi.json` & `en.json`)
- Mọi chuỗi hiển thị phải được khai báo song song và đối xứng trong 2 file từ điển:
  - `src/locales/vi.json` (bản tiếng Việt)
  - `src/locales/en.json` (bản tiếng Anh)
- **Cấu trúc nhóm khóa rõ ràng:** Đặt key theo ngữ cảnh module (ví dụ: `checkout.addressTitle`, `voucher.maxDiscountBadge`, `marketing.justNow`).
- **Cách gọi trong React Component:**
  ```tsx
  import { useLanguage } from '../context/LanguageContext';

  const MyComponent = () => {
    const { t, language } = useLanguage();

    return (
      <div>
        <h3>{t('moduleName.title')}</h3>
        <p>{t('moduleName.description', { count: totalItems })}</p>
      </div>
    );
  };
  ```
- **Nội suy tham số động (Dynamic Interpolation):** Chuỗi có biến số lượng, tên người dùng, thời gian phải dùng template `{param}` trong JSON (ví dụ: `"pageInfo": "Trang {page} / {totalPages}"`) và truyền object `{ page, totalPages }` vào hàm `t()`.

---

### 3. Danh mục bảo lưu không dịch (Preserved Tokens / Exceptions)
Chỉ những thành phần sau được phép giữ nguyên bản ở cả 2 ngôn ngữ:
- Tên riêng người dùng (User Display Name / masked user `a***@gmail.com`).
- Tên riêng tựa game, tên thương hiệu, tên model sản phẩm vật lý.
- Mã giftcode, mã voucher (`FREESHIP30K`, `MALL50K`, `UNIVERSAL10`).
- Đường dẫn URL, đường dẫn mạng xã hội, mã băm (Hash), UUID, ID hệ thống.
- Đơn vị tiền tệ hiển thị hoặc giữ theo locale chuẩn (`đ`, `VNĐ` / `VND`).

---

### 4. Đồng bộ chuyển đổi URL & Trạng thái (URL & State Synchronization)
- Ngôn ngữ mặc định của sàn là **Tiếng Việt (`vi`)**.
- Tiền tố URL chuẩn hóa:
  - Chế độ Tiếng Anh: URL chuẩn hóa thành `/en/` (ví dụ: `universal-mall-shop.pages.dev/en/`).
  - Chế độ Tiếng Việt: URL chuẩn hóa thành `/` hoặc `/vi/`.
- Khi người dùng chuyển đổi ngôn ngữ thông qua nút bấm hoặc thay đổi URL:
  - Toàn bộ giao diện và dữ liệu động của tính năng phải lập tức cập nhật theo ngôn ngữ đã chọn.
  - Không reload toàn trang gây mất trạng thái, không để xảy ra lệch giữa URL và ngôn ngữ hiển thị.

---

### 5. Kiểm thử song ngữ bắt buộc trước khi triển khai (Pre-deploy Verification)
- Khi hoàn thiện bất kỳ tính năng nào:
  1. Mở trang ở chế độ Tiếng Việt (`/`): Kiểm tra trọn vẹn văn bản tiếng Việt chuẩn ngữ pháp, không lỗi chính tả, không sót tiếng Anh.
  2. Mở trang ở chế độ Tiếng Anh (`/en/`): Kiểm tra 100% văn bản chuyển sang tiếng Anh tự nhiên, mốc thời gian dạng `Just now`, `1m ago`, nút bấm chuyển `Close`, `Save`, `Confirm`.
  3. Xác nhận **0% chuỗi tiếng Việt ghi cứng** sót lại ở chế độ Anh.
