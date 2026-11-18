# QUY TẮC CHỐNG TREO MÁY & CHỐNG TÁC VỤ LẶP LẠI VÔ HẠN
# (STRICT TIMEOUT, ANTI-HANG & ZERO INFINITE LOOPS)

Quy chuẩn bắt buộc dành cho tất cả các Tác nhân (Agents & Subagents) nhằm ngăn chặn triệt để tình trạng treo máy, chờ đợi ngầm vô hạn, và các vòng lặp thao tác không hồi kết:

---

### 1. Giới hạn thời gian nghiêm ngặt cho mọi lệnh Terminal & Mạng (Strict Timeout)
- **Mọi lệnh kiểm tra mạng qua PowerShell (`Invoke-WebRequest`, `Invoke-RestMethod`):**
  - **BẮT BUỘC** phải có cờ `-TimeoutSec 10` (tối đa 15 giây).
  - **TUYỆT ĐỐI KHÔNG** dùng `Invoke-WebRequest -Method Head` mà không có `-TimeoutSec` vì HTTP HEAD có thể giữ kết nối mở ở tầng Edge khiến tiến trình bị đóng băng vĩnh viễn.
  - Khuyến khích dùng `Invoke-RestMethod -Uri ... -TimeoutSec 10` hoặc `curl.exe -s -I --max-time 10 --connect-timeout 5`.
- **Mọi lệnh `curl`:**
  - Luôn kèm `--max-time 10 --connect-timeout 5`.
- **Lệnh thực thi terminal (`run_command`):**
  - Với các lệnh build, deploy hoặc kiểm thử nặng: Luôn đặt `WaitMsBeforeAsync: 10000` (10 giây).

---

### 2. Giám sát tác vụ ngầm chủ động (Active Background Task Watchdog)
- **Quy tắc 60 giây tối đa:** Bất cứ khi nào một tiến trình chạy ngầm (`task-xxxx`) được tạo ra:
  - Nếu sau **45–60 giây** task chưa hoàn thành hoặc không sinh thêm output mới: Tác nhân **BẮT BUỘC** chủ động gọi `manage_task kill` để hủy task ngay lập tức.
  - **Tuyệt đối không để task chạy ngầm vô hạn** khiến người dùng phải chờ đợi hoặc hỏi `"Sao lâu vậy bạn?"`.
- **Sau khi hủy task:**
  - Lập tức báo cáo nguyên nhân cho người dùng (ví dụ: mạng chậm, lệnh chờ input, hoặc kết nối bị treo).
  - Chuyển ngay sang phương án kỹ thuật thay thế (ví dụ: dùng GET thay HEAD, tăng cờ timeout, hoặc kiểm tra mã nguồn trực tiếp).

---

### 3. Cơ chế dập tắt vòng lặp vô hạn (Loop Breaker & Max 2 Retries)
- **Tối đa 2 lần thử (Max 2 Attempts Rule):**
  - Khi một lệnh terminal, truy vấn API, hoặc thao tác sửa code gặp lỗi hoặc không đạt kết quả mong muốn: Tác nhân chỉ được phép thử lại **tối đa 1 lần duy nhất** với phương pháp khác.
- **Cấm lặp lại cùng một lệnh với cùng tham số (Zero Exact Retry Spam):**
  - Nếu lần 1 thất bại: Lần 2 bắt buộc phải thay đổi phương pháp (đổi cờ lệnh, đổi endpoint, điều tra nguyên nhân gốc rễ).
  - **Tuyệt đối không chạy 3 lần liên tiếp cùng một thao tác** mà không có thay đổi kỹ thuật.
- **Dừng lại khi chạm ngưỡng (Early Stop):**
  - Nếu sau 2 lần thử vẫn không thành công: **BẮT BUỘC DỪNG LẠI NGAY LẬP TỨC**, báo cáo nguyên nhân gốc rễ và đề xuất phương án cho người dùng, không được tiếp tục đoán mò hoặc lặp lại.

---

### 4. Thực thi tự động hoàn toàn không tương tác (Non-Interactive Execution)
- **Tránh lệnh chờ Stdin / Prompts:**
  - `npx`, `npm`: Luôn thêm `-y`, `--yes`, `--no-fund`, `--no-audit`.
  - Trên môi trường Windows: Luôn gọi `cmd /c npx ...` thay vì gọi trực tiếp `npx` trong PowerShell để tránh bị chặn bởi `ExecutionPolicy` của file `.ps1`.
  - `git`: Luôn kèm commit message rõ ràng `git commit -m "..."`. Tuyệt đối không chạy `git commit` thiếu `-m`, không chạy `git rebase -i` hoặc các lệnh mở trình soạn thảo văn bản (Vim/Nano).
- **Tuyệt đối không gọi lệnh kích hoạt UAC hoặc GUI:**
  - Không chạy file cài đặt `.exe`, `.msi`, `winget`, `msiexec` gây prompt quyền Administrator trong môi trường non-interactive background.

---

### 5. Nguyên tắc phản hồi nhanh & minh bạch (Fast Feedback & Transparency)
- **Không bao giờ im lặng kết thúc lượt:** Khi một tác vụ có nguy cơ kéo dài, tác nhân phải cập nhật thông tin rõ ràng cho người dùng trước khi chờ tác vụ nền.
- Khi người dùng hỏi thăm tiến độ: Lập tức kiểm tra danh sách tác vụ ngầm (`manage_task list`), hủy ngay các tác vụ đang treo, và báo cáo tình trạng trung thực, chính xác.
