# Universal Mall — Hướng Dẫn Tích Hợp Store API (Kênh Gian Hàng)

Tài liệu kỹ thuật chính thức dành cho Quản trị viên gian hàng, Lập trình viên đối tác, Nền tảng bên thứ ba và Tác nhân Trí tuệ nhân tạo (AI Agents) để tự động hóa toàn bộ nghiệp vụ quản lý gian hàng trên Sàn Thương Mại Điện Tử Universal Mall.

---

## 1. Tổng Quan Kiến Trúc & Ranh Giới Thẩm Quyền (Authorization Model)

Store API cung cấp cơ chế giao tiếp Máy-Máy (Machine-to-Machine) với **TOÀN QUYỀN** trong phạm vi gian hàng của chính mình (Single Store Boundary):
- **Phạm vi thẩm quyền**: Thao tác toàn bộ sản phẩm, kho mã code, xác nhận đơn hàng, giải quyết khiếu nại, xem phân tích tài chính và quản lý tài khoản nhân viên phụ.
- **Ranh giới an toàn tuyệt đối (Isolation Boundary)**:
  1. **Chặn liên gian hàng**: Khóa API của Gian hàng A không bao giờ truy cập hoặc sửa đổi dữ liệu của Gian hàng B (Hệ thống trả mã `403 Forbidden`).
  2. **Chặn can thiệp hệ thống**: Khóa API gian hàng bị từ chối tuyệt đối khi gọi tới các API quản trị sàn (`/api/admin/*`), kiểm toán sàn, hoặc thông tin sàn.
  3. **Bảo vệ tài chính & Rút tiền**: Lệnh rút tiền (`POST /api/seller/finance/withdraw`) bị **CẤM HOÀN TOÀN** qua Store API (trả `403 Forbidden`). Thao tác rút tiền bắt buộc do chủ sở hữu thực hiện trực tiếp trên giao diện web có phiên đăng nhập xác thực 2 lớp.
  4. **Chặn chuyển nhượng**: Khóa API không thể thay đổi người sở hữu gian hàng (`member_id`).

---

## 2. Phương Thức Xác Thực (Authentication)

Hệ thống hỗ trợ 2 phương thức xác thực chuẩn HTTP:

### Cách 1: Header `X-Store-Key` (Khuyên dùng cho Webhook / Tích hợp nhanh)
```http
X-Store-Key: wcg_sk_YOUR_STORE_API_KEY_HERE
```

### Cách 2: Header `Authorization: Bearer` (Chuẩn RFC 6750)
```http
Authorization: Bearer wcg_sk_YOUR_STORE_API_KEY_HERE
# Hoặc với Ứng dụng bên thứ ba được ủy quyền:
Authorization: Bearer wcg_app_tok_YOUR_APP_TOKEN_HERE
```

> **Lưu ý bảo mật**: Khóa API thô chỉ hiển thị **DUY NHẤT 1 LẦN** lúc tạo mới. Hệ thống chỉ lưu trữ chuỗi băm mật mã chuẩn **SHA-256** và tiền tố hiển thị dạng `wcg_sk_••••••••`. Nếu làm mất khóa, vui lòng sử dụng chức năng **Xoay khóa (Rotate)** hoặc **Thu hồi (Revoke)** ngay lập tức trên Kênh Người Bán.

---

## 3. Giới Hạn Tốc Độ & Ghi Nhật Ký (Rate Limits & Audit)

- **Rate Limit**: Tối đa **600 yêu cầu / phút** cho mỗi gian hàng. Khi vượt ngưỡng, hệ thống trả về HTTP `429 Too Many Requests`.
- **Nhật Ký Gọi API (`seller_api_call_logs`)**: Tự động lưu vết thời gian, địa chỉ IP, User-Agent, Endpoint, Phương thức HTTP, Mã phản hồi và Thời gian xử lý (Execution time).

---

## 4. Danh Mục 14 Nhóm Endpoint Chính Thức

| # | Endpoint | Method | Scope Yêu Cầu | Chức Năng |
|---|---|---|---|---|
| 1 | `/api/seller` | `GET` | `READ_ONLY` / `FULL` | Lấy hồ sơ thông tin & chỉ số tổng quan gian hàng |
| 2 | `/api/seller` | `PUT` / `PATCH` | `FULL` | Cập nhật tên, mô tả, logo, banner, hotline gian hàng |
| 3 | `/api/seller/products` | `GET` | `READ_ONLY` / `FULL` | Danh sách sản phẩm của gian hàng (hỗ trợ phân trang) |
| 4 | `/api/seller/products` | `POST` | `PRODUCTS_ONLY` / `FULL` | Đăng sản phẩm mới (tự động phân loại danh mục) |
| 5 | `/api/seller/products/:id` | `GET`, `PUT`, `PATCH`, `DELETE` | `PRODUCTS_ONLY` / `FULL` | Xem chi tiết, cập nhật thông tin, bật/tắt bán hoặc xóa sản phẩm |
| 6 | `/api/seller/products/:id/codes` | `GET`, `POST` | `PRODUCTS_ONLY` / `FULL` | Xem tồn kho và nạp mã giftcode hàng loạt vào sản phẩm |
| 7 | `/api/seller/codes/:id` | `DELETE` | `PRODUCTS_ONLY` / `FULL` | Xóa mã thẻ / giftcode chưa bán khỏi kho |
| 8 | `/api/seller/codes/:id/reveal` | `POST` | `OWNER` | Giải mã xem nội dung mã quà tặng trong kho |
| 9 | `/api/seller/orders` | `GET` | `ORDERS_ONLY` / `FULL` | Danh sách đơn hàng bán ra của gian hàng |
| 10 | `/api/seller/orders/:id` | `GET`, `POST` | `ORDERS_ONLY` / `FULL` | Xem chi tiết đơn; Xác nhận đơn (`CONFIRM`) / Giao vận (`SHIPPING`) |
| 11 | `/api/seller/orders/:id/resolve-report` | `POST` | `ORDERS_ONLY` / `FULL` | Xử lý khiếu nại báo lỗi đơn hàng (Đổi mã mới / Hoàn tiền) |
| 12 | `/api/seller/disputes` | `GET` | `ORDERS_ONLY` / `FULL` | Danh sách các tranh chấp / khiếu nại đang chờ xử lý |
| 13 | `/api/seller/disputes/:id/respond` | `POST` | `ORDERS_ONLY` / `FULL` | Phản hồi khiếu nại tranh chấp với khách mua |
| 14 | `/api/seller/finance` | `GET` | `FULL` | Báo cáo doanh thu, số dư ví khả dụng, tiền ký quỹ |
| 15 | `/api/seller/finance/withdrawals` | `GET` | `FULL` | Lịch sử các yêu cầu rút tiền của gian hàng |
| 16 | `/api/seller/finance/withdraw` | `POST` | *BỊ CHẶN QUA API* | **Trả về HTTP 403 Forbidden** (Chỉ cho phép trên Web) |
| 17 | `/api/seller/subaccounts` | `GET`, `POST` | `OWNER` | Danh sách & Thêm tài khoản nhân viên vận hành phụ |
| 18 | `/api/seller/subaccounts/:id` | `PUT`, `DELETE` | `OWNER` | Đổi quyền (`MANAGE_STOCK` / `VIEW_ORDERS`) hoặc gỡ bỏ |
| 19 | `/api/seller/api-keys` | `GET`, `POST` | `OWNER` | Danh sách khóa API & Tạo khóa API mới |
| 20 | `/api/seller/api-keys/:id` | `DELETE` | `OWNER` | Thu hồi khóa API ngay lập tức |
| 21 | `/api/seller/api-keys/:id/rotate` | `POST` | `OWNER` | Xoay khóa API (Hủy khóa cũ, cấp khóa mới an toàn) |
| 22 | `/api/seller/apps` | `GET`, `POST` | `OWNER` | Quản lý kết nối ứng dụng bên thứ ba |
| 23 | `/api/seller/apps/:id/approve` | `POST` | `OWNER` | Cấp phép ủy quyền cho ứng dụng bên thứ ba |
| 24 | `/api/seller/apps/:id/revoke` | `DELETE` | `OWNER` | Hủy bỏ ủy quyền ứng dụng bên thứ ba |

---

## 5. Ví Dụ Tích Hợp (Code Examples)

### Ví dụ 1: Lấy thông tin gian hàng & Tình trạng kho (cURL)
```bash
curl -X GET "https://universal-mall-shop.pages.dev/api/seller" \
  -H "X-Store-Key: wcg_sk_YOUR_STORE_API_KEY_HERE" \
  -H "Content-Type: application/json"
```

### Ví dụ 2: Đăng sản phẩm mới (Node.js / Fetch)
```javascript
const STORE_API_KEY = process.env.STORE_API_KEY;

async function createProduct() {
  const response = await fetch('https://universal-mall-shop.pages.dev/api/seller/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STORE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Thẻ Quà Tặng Nạp Game 100K VIP',
      category_id: 'cat_the_game',
      price: 95000,
      original_price: 100000,
      description: 'Mã nạp chính hãng kích hoạt tức thì 24/7.',
      product_type: 'digital',
      stock: 50
    })
  });

  const data = await response.json();
  console.log('Kết quả đăng sản phẩm:', data);
}
```

### Ví dụ 3: Nạp kho mã thẻ số lượng lớn (Python)
```python
import requests

API_KEY = "wcg_sk_YOUR_STORE_API_KEY_HERE"
PRODUCT_ID = "prod_123456"

headers = {
    "X-Store-Key": API_KEY,
    "Content-Type": "application/json"
}

payload = {
    "codes": [
        "MALL-GAME-A1B2-C3D4",
        "MALL-GAME-E5F6-G7H8",
        "MALL-GAME-I9J0-K1L2"
    ]
}

res = requests.post(
    f"https://universal-mall-shop.pages.dev/api/seller/products/{PRODUCT_ID}/codes",
    json=payload,
    headers=headers
)
print("Kết quả nạp mã:", res.json())
```

---

## 6. Bảng Mã Lỗi Tiêu Chuẩn

| HTTP Code | Ý Nghĩa | Mô Tả & Khắc Phục |
|---|---|---|
| `200 OK` / `201 Created` | Thành công | Thao tác được thực thi trọn vẹn |
| `400 Bad Request` | Dữ liệu không hợp lệ | Thiếu trường bắt buộc hoặc sai định dạng JSON |
| `401 Unauthorized` | Không có quyền truy cập | Khóa API không tồn tại, đã bị thu hồi hoặc sai mã |
| `403 Forbidden` | Vi phạm ranh giới thẩm quyền | Gọi ngoài phạm vi gian hàng của mình, hoặc cố gắng rút tiền qua API |
| `404 Not Found` | Không tìm thấy | ID sản phẩm, đơn hàng hoặc tài khoản không tồn tại trong gian hàng |
| `429 Too Many Requests` | Vượt ngưỡng tần suất | Vượt quá 600 yêu cầu / phút |
| `500 Internal Error` | Lỗi máy chủ Cloudflare | Lỗi xử lý CSDL D1 hoặc hạ tầng Cloudflare Workers |
