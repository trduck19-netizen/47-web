# AGENTS.md — Quy Tắc Bắt Buộc Dành Cho Các Tác Nhân (Agents & Subagents)

### 🧠 1. BẮT BUỘC ĐỌC HỆ THỐNG GHI NHỚ TRƯỚC KHI SỬA ĐỔI
Trước mỗi lần chỉnh sửa bất kỳ file nào trong dự án, tác nhân **BẮT BUỘC** phải đọc các file sau:
1. [`PROJECT_MEMORY.md`](file:///c:/4%20Antigravity%20all/13%20web%20code%20game/PROJECT_MEMORY.md): Kiến trúc toàn dự án, tech stack, quy tắc kho hàng, cơ chế đồng bộ 1 - 1, state management.
2. [`CHANGELOG.md`](file:///c:/4%20Antigravity%20all/13%20web%20code%20game/CHANGELOG.md): Lịch sử thay đổi, nguyên nhân gốc rễ, giải pháp đã áp dụng và giải pháp đã thất bại.
3. [`KNOWN_ISSUES.md`](file:///c:/4%20Antigravity%20all/13%20web%20code%20game/KNOWN_ISSUES.md): Danh mục lỗi đã biết, các bẫy cần tránh (Failed Attempts), pre-flight và post-flight checklists.
4. [`GIT_WORKFLOW.md`](file:///c:/4%20Antigravity%20all/13%20web%20code%20game/GIT_WORKFLOW.md): Quy trình quản lý phiên bản Git 6 bước chuyên nghiệp.

### 🌿 2. QUY TRÌNH QUẢN LÝ PHIÊN BẢN GIT CHUYÊN NGHIỆP
- **Trước khi sửa**: Chạy `git status`, xem lịch sử commit và tài liệu ghi nhớ. Lưu checkpoint ổn định trước thay đổi lớn.
- **Trong khi sửa**: Sửa từng lỗi một, thu hẹp phạm vi thay đổi. Không viết lại module không liên quan. Chạy kiểm thử hồi quy sau mỗi thay đổi. Nếu phát sinh lỗi mới, khôi phục ngay, không chồng bản sửa chưa xác minh.
- **Sau khi sửa**: Chỉ commit khi vượt qua mọi bài kiểm tra. Đặt commit message chuẩn mực (ví dụ: `fix: ...`, `feat: ...`). Cập nhật tài liệu ghi nhớ. Phân biệt rõ bản ổn định với bản thử nghiệm.
- **Khôi phục an toàn (Zero Destructive Commands)**: Ưu tiên `git revert`. Với thay đổi chưa commit: kiểm tra diff và chỉ khôi phục đúng phần cần thiết. **TUYỆT ĐỐI KHÔNG** dùng `git reset --hard`, `git clean -fd` hoặc lệnh xóa lịch sử khi chưa được người dùng cho phép.
- **Báo cáo chuẩn mực**: Sau mỗi nhiệm vụ, báo cáo đủ: (1) Nguyên nhân lỗi, (2) File đã sửa, (3) Kiểm thử đã chạy, (4) Kết quả, (5) Commit ID, (6) Cách khôi phục nếu cần.

### 🚫 3. KHÔNG LẶP LẠI THẤT BẠI
- Tuyệt đối **KHÔNG LẶP LẠI** cách sửa đã ghi nhận thất bại trong `KNOWN_ISSUES.md` nếu chưa có bằng chứng mới rõ ràng.

### 🔍 4. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ & PHẠM VI ẢNH HƯỞNG
- Trước khi sửa: Luôn phân tích rõ nguyên nhân gốc rễ (Root Cause) và phạm vi ảnh hưởng (Impact Scope).
- Nếu chưa xác định được nguyên nhân: Phải điều tra, in log hoặc viết script kiểm tra trước. **KHÔNG ĐƯỢC SỬA MÒ**, đoán mò hoặc tự ý viết lại các phần không liên quan.

### ✅ 5. KIỂM THỬ HỒI QUY & CẬP NHẬT TÀI LIỆU
- Sau khi sửa xong: Chạy kiểm thử hồi quy, xác nhận các chức năng liên quan vẫn hoạt động bình thường.
- Cập nhật tài liệu: Ghi nhận đầy đủ vào `CHANGELOG.md` và `KNOWN_ISSUES.md`.

### 🚀 6. TỰ ĐỘNG TRIỂN KHAI KHI KIỂM THỬ THÀNH CÔNG 100% (MỆNH LỆNH CHỦ SỞ HỮU)
- Từ nay về sau, bất cứ khi nào tác nhân kiểm thử và build báo thành công 100%: **BẮT BUỘC TỰ ĐỘNG** chạy `npm run deploy:all` (triển khai đồng thời Web Khách `web-code-game` và Web Quản trị `admin-code-game-shop`) và `git push origin main` (đồng bộ GitHub), sau đó báo cáo kết quả và URL môi trường trực tiếp cho người dùng mà không cần dừng lại hỏi trước.

### 🧹 7. NGUYÊN TẮC TỰ ĐỘNG XÓA SẢN PHẨM TEST (ZERO TEST ARTIFACTS ON PRODUCTION)
- Tất cả sản phẩm, mã code hay dữ liệu test do tác nhân/hệ thống sinh ra trong khi kiểm thử **BẮT BUỘC** phải tự động xóa sạch sau khi kiểm thử xong (sử dụng khối `finally` hoặc lệnh dọn dẹp chuyên dụng).
- Tuyệt đối không giữ lại hay để hiển thị bất kỳ sản phẩm test nào trên web thực tế.
- Chỉ những sản phẩm thực tế do người dùng nhập vào kho mới được công nhận, lưu trữ và ghi nhận trạng thái còn hàng.

### 🔑 8. NGUYÊN TẮC TỰ ĐỘNG ĐỒNG BỘ QUYỀN API MỚI VÀO MỤC QUẢN LÝ API (AUTO-REGISTER NEW API PERMISSIONS)
- Bất cứ khi nào trong tương lai tác nhân phát triển, mở thêm hoặc cấu hình bất kỳ quyền/endpoint API mới nào trên website:
  1. **BẮT BUỘC TỰ ĐỘNG** bổ sung quyền đó vào danh mục `ALL_API_SCOPES` trong `src/admin/modules/ApiKeysModule.tsx`.
  2. Cập nhật hàm phân giải quyền `hasScope` trong `functions/services/mission_service.ts`.
  3. Cập nhật Modal "Set Quyền Cho Khóa API" và Modal "Tạo Khóa API Mới" để Quản trị viên có thể dùng 1 mã API cấu hình và gán quyền mới đó ngay lập tức.
  4. Cập nhật bảng tra cứu cấp quyền và tài liệu mẫu cURL/JS tương ứng.

### 🖥️ 9. NGUYÊN TẮC 100% GIAO DIỆN NẰM TRỌN TRONG 1 MÀN HÌNH (ZERO HORIZONTAL OVERFLOW / SINGLE-SCREEN FIRST)
- **BẮT BUỘC** tất cả các module giao diện (đặc biệt là các bảng quản trị: Danh Mục Game, Thành Viên, Tin Tức & Sự Kiện, Nhật Ký Bảo Mật, Giftcode, Đơn Hàng, Kho Mã, Khóa API...) phải hiển thị trọn vẹn 100% thông tin, cột dữ liệu và tất cả các nút thao tác (Thao tác, Sửa, Xóa, Bật/Tắt, Chi tiết...) trong cùng 1 màn hình máy tính/laptop tiêu chuẩn (1366x768, 1280x720) ngay cả khi thanh sidebar đang mở rộng.
- **TUYỆT ĐỐI KHÔNG** để xảy ra tình trạng tràn ngang (horizontal overflow) làm che khuất hoặc đẩy cột Thao Tác ra ngoài mép phải màn hình khiến người dùng phải kéo chuột ngang.
- **Quy chuẩn kỹ thuật bắt buộc**:
  1. Mọi thẻ `<table>` phải áp dụng `table-fixed w-full` và khai báo tỷ lệ phần trăm độ rộng chính xác cho từng cột trong `<th>` với tổng đúng bằng 100%.
  2. Rút gọn hoặc gom nhóm các cột thông tin bổ trợ (như kết hợp Tên + Trạng thái Bật/Tắt + Dấu thời gian lần dùng vào Cột 1).
  3. Cắt tỉa văn bản dài bằng `truncate` kèm thuộc tính `title` để hiển thị tooltip khi rê chuột.
  4. Các nút thao tác phải thiết kế tinh gọn, có icon và nhãn văn bản súc tích, độ rộng vừa khít khung nhìn.

### 🛡️ 10. QUY TẮC BẢO MẬT TUYỆT ĐỐI CHO PUBLIC REPOSITORY (ZERO SECRETS IN CODE & GIT HISTORY)
- **Mọi khóa API, token, secret, mật khẩu CHỈ ĐƯỢC PHÉP lưu ở 2 nơi**: Cloudflare Environment Variables và D1 table `mission_ai_api_keys` (dưới dạng mã băm SHA-256 `api_key_hash`).
- **TUYỆT ĐỐI KHÔNG** ghi cứng bất kỳ chuỗi khóa nào trong code (`token === 'wcg_...'`), tài liệu markdown (`CHANGELOG.md`, `KNOWN_ISSUES.md`), ghi chú, hay commit message. Giao diện và API chỉ được hiển thị tiền tố rút gọn (`key_prefix` dạng `wcg_gw_7193••••••••••••••••••••4b2a`).
- **Cột `raw_key`**: Không bao giờ được lưu chuỗi khóa thô trong D1 hay trả về qua API.
- **Dữ liệu mẫu**: Bắt buộc phải giả rõ ràng (ví dụ: `0900000001`, `sample.lead@example.com`, `sample-shop.example.com`). Khóa mẫu chỉ dùng dạng `wcg_sample_00000000000000000000000000000000` hoặc `CHANGE_ME`.
- **Lệnh kiểm tra bắt buộc trước khi push**:
  1. `git grep -nE "wcg_[a-z]+_[0-9a-f]{32}" -- functions/ src/` (Kết quả = 0).
  2. `git grep -nE "[0-9]{8,10}:[A-Za-z0-9_-]{35}" -- functions/ src/` (Kết quả = 0).
  3. `git grep -nE "BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY"` (Kết quả = 0).
- **Giữ `.gitignore`**: Không bao giờ commit file `.env`, `*.secret`, `.muse_admin_key.secret`.

### ⏳ 11. NGUYÊN TẮC CHỐNG TREO MÁY & CHỐNG TÁC VỤ LẶP LẠI VÔ HẠN (STRICT TIMEOUT, ANTI-HANG & ZERO INFINITE LOOPS)
- **1. Bắt buộc Timeout & An toàn cho mọi lệnh terminal & mạng (Strict Timeout & Safe Network Execution)**:
  - **Cấm gọi `curl` trần trong PowerShell:** Windows PowerShell tự động map `curl` thành alias của `Invoke-WebRequest`. BẮT BUỘC luôn chỉ định rõ `curl.exe` (kèm `--max-time 10 --connect-timeout 5`) hoặc chạy qua `cmd /c curl.exe ...`.
  - **Cấm dùng `Invoke-WebRequest` thiếu `-UseBasicParsing`:** Trong PowerShell 5.1, `Invoke-WebRequest` mặc định kích hoạt Internet Explorer DOM engine (`mshtml.dll`), gây treo máy (hang/freeze) vô hạn trong môi trường ngầm dù có `-TimeoutSec`. Nếu dùng PowerShell, BẮT BUỘC kèm cả `-UseBasicParsing` VÀ `-TimeoutSec 10`. Ưu tiên dùng `curl.exe` hoặc `Invoke-RestMethod`.
  - **Cấm quét đệ quy không giới hạn (`Get-ChildItem -Recurse` / `dir /s`):** Tuyệt đối không quét đệ quy thư mục lớn (`node_modules`, `.gemini`, `brain`, `appDataDir`, ổ đĩa). Luôn dùng `-Depth 1` hoặc `cmd /c dir /b`.
  - Mọi lệnh terminal (`run_command`) tiềm ẩn thời gian chạy lâu phải đặt `WaitMsBeforeAsync: 10000` (10 giây) và có cơ chế timeout xác định.
- **2. Giám sát tác vụ ngầm chủ động & Cấm chờ thụ động với lệnh kiểm tra nhanh (Active Background Watchdog & Zero Passive Wait)**:
  - **Phân loại tác vụ ngầm:**
    * *Tác vụ dài hạn thực sự (Build, Deploy, Migration):* Được phép chạy nền, Agent giám sát với watchdog tối đa 45–60 giây. Nếu sau 60 giây không sinh output mới, BẮT BUỘC gọi `manage_task kill`.
    * *Tác vụ kiểm tra nhanh (Quick Probes - đọc HTTP header, curl check, ping port, git status):* Nếu một lệnh kiểm tra nhanh bị timeout chuyển thành background task, **AGENT TUYỆT ĐỐI KHÔNG KẾT THÚC LƯỢT (END TURN) ĐỂ CHỜ THỤ ĐỘNG**. Phải kiểm tra ngay hoặc hủy (`manage_task kill`) nếu quá 15 giây không có kết quả, rồi chuyển ngay sang phương án kỹ thuật nhẹ hơn (Node.js script với AbortSignal, đọc mã nguồn, hoặc cờ CLI trực tiếp).
  - Tuyệt đối không để task chạy ngầm vô hạn khiến người dùng phải chờ đợi hoặc hỏi "Sao lâu vậy bạn?".
  - Sau khi hủy task, lập tức báo cáo nguyên nhân và chuyển ngay sang phương án kỹ thuật thay thế.
- **3. Quy tắc dập tắt vòng lặp vô hạn (Loop Breaker & Max 2 Retries)**:
  - **Tối đa 2 lần thử (Max 2 Attempts)**: Khi một lệnh terminal, truy vấn API, hoặc thao tác sửa code gặp lỗi hoặc không đạt kết quả mong muốn, tác nhân chỉ được phép thử lại tối đa 1 lần duy nhất với phương pháp khác.
  - **Cấm gọi lại cùng một lệnh với cùng tham số (Zero Exact Retry Spam)**: Nếu lần 1 thất bại, lần 2 bắt buộc phải thay đổi phương pháp (đổi cờ, đổi lệnh, kiểm tra nguyên nhân gốc rễ). Tuyệt đối không chạy 3 lần liên tiếp cùng một thao tác.
  - **Dừng lại khi chạm ngưỡng**: Nếu sau 2 lần thử vẫn thất bại, **BẮT BUỘC DỪNG LẠI NGAY LẬP TỨC**, báo cáo nguyên nhân gốc rễ và hỏi ý kiến người dùng thay vì tiếp tục lặp vô hạn.
- **4. Chạy tự động hoàn toàn không tương tác (Non-Interactive Execution)**:
  - Mọi lệnh CLI phải luôn chạy ở chế độ tự động hoàn toàn: `npx`, `npm` thêm `-y`, `--yes`, `--no-fund`, `--no-audit`.
  - Trên Windows, luôn gọi `cmd /c npx ...` thay vì gọi trực tiếp `npx` trong PowerShell để tránh bị chặn bởi PowerShell ExecutionPolicy.
  - Git: Luôn kèm `-m "..."` trong lệnh commit, không chạy `git rebase -i` hay các lệnh mở editor chờ người dùng nhập.
- **5. Phản hồi nhanh & rõ ràng cho người dùng (Fast Feedback & Transparency)**:
  - Tuyệt đối không kết thúc lượt (end turn) trong im lặng khi tác vụ có nguy cơ kéo dài.
  - Luôn cập nhật tiến độ ngắn gọn, thông báo rõ tác nhân đang làm gì và dự kiến mất bao lâu.

### 🌐 12. NGUYÊN TẮC BẮT BUỘC SONG NGỮ VIỆT - ANH TOÀN DIỆN (100% BILINGUAL VI/EN FIRST)
- **1. Bắt buộc song ngữ cho 100% tính năng mới (Zero Monolingual Feature)**:
  - Bất cứ khi nào tác nhân xây dựng, phát triển, hoặc mở rộng bất kỳ tính năng nào (Web Khách, Web Quản trị, modal, drawer, form, table, card, filter, banner, toast notification, badge, tooltip, nút bấm, nhãn input, thông báo lỗi/thành công): **BẮT BUỘC PHẢI HỖ TRỢ ĐỒNG THỜI CẢ 2 NGÔN NGỮ TIẾNG VIỆT VÀ TIẾNG ANH (VI & EN)**.
  - **TUYỆT ĐỐI KHÔNG** ghi cứng (hardcode) chuỗi văn bản Tiếng Việt hoặc Tiếng Anh trực tiếp vào JSX/TSX.
- **2. Quy chuẩn từ điển tập trung (`vi.json` & `en.json`)**:
  - Mọi chuỗi hiển thị phải được khai báo song song và đối xứng trong 2 file từ điển:
    * `src/locales/vi.json` (bản tiếng Việt)
    * `src/locales/en.json` (bản tiếng Anh)
  - Hiển thị văn bản qua hook ngôn ngữ: `const { t, language } = useLanguage();` và gọi `t('section.key')` hoặc `t.section.key`.
  - Với các chuỗi có tham số biến thiên (số lượng, tên, tiền tệ, mốc thời gian): sử dụng cú pháp template `{param}` (ví dụ: `{count}`, `{name}`, `{amount}`) và truyền qua `t('section.key', { count: ... })`.
- **3. Danh mục bảo lưu không dịch (Preserved Tokens / Exceptions)**:
  - Tên người dùng / tài khoản (masked username `a***@gmail.com`).
  - Tên riêng game, tên sản phẩm thương hiệu, mã code / giftcode bản quyền, mã voucher (`FREESHIP30K`, `MALL50K`), đường dẫn URL, mã hash / ID.
  - Các chuỗi này giữ nguyên giá trị gốc trên cả 2 ngôn ngữ.
- **4. Đồng bộ chuyển đổi URL & Trạng thái (URL & State Synchronization)**:
  - Ngôn ngữ mặc định của sàn là Tiếng Việt (`vi`).
  - Tiền tố URL chuẩn hóa: `/en/` cho Tiếng Anh, `/` hoặc `/vi/` cho Tiếng Việt.
  - Khi người dùng chuyển đổi ngôn ngữ, 100% nội dung trang và các thành phần giao diện (bao gồm cả carousel, popup, toast, placeholder tìm kiếm) phải đổi tức thì theo ngôn ngữ được chọn.
- **5. Kiểm thử song ngữ bắt buộc trước khi triển khai (Pre-deploy Bilingual Verification)**:
  - Mọi bản build và kiểm thử trước khi deploy phải được xác minh trên cả 2 chế độ Tiếng Việt (`/`) và Tiếng Anh (`/en/`).
  - Xác nhận 0% chuỗi tiếng Việt sót lại ở chế độ Anh, và 0% chuỗi tiếng Anh bị vỡ/sót ở chế độ Việt.

### 🎯 13. NGUYÊN TẮC BÁM SÁT 100% YÊU CẦU NGƯỜI DÙNG & CHỐNG PHÂN TÂM TẠP ÂM NGỮ CẢNH (ZERO DISTRACTION, STRICT USER REQUEST FOCUS & NO RESIDUAL ARTIFACT CONFUSION)
- **1. Ưu tiên tuyệt đối yêu cầu bằng văn bản hiện tại (Strict User Request Primacy)**:
  - Khi người dùng gửi yêu cầu, tác nhân BẮT BUỘC phải đọc kỹ nội dung trong thẻ `<USER_REQUEST>`, tập trung 100% vào việc giải quyết nhiệm vụ được giao. Tuyệt đối không được trả lời lạc đề hoặc tự ý chuyển hướng mục tiêu.
- **2. Chống phân tâm bởi tàn dư tệp đính kèm cũ sau nén ngữ cảnh (No Residual Context/Attachment Confusion)**:
  - Khi ngữ cảnh hội thoại được nén lại (context compaction), hệ thống có thể tự động mang theo tệp hình ảnh hoặc tài liệu đính kèm từ các lượt trao đổi trước.
  - Tác nhân PHẢI đối chiếu ngày giờ và nội dung: nếu người dùng đang giao một nhiệm vụ phát triển/sửa lỗi mới bằng văn bản, tệp đính kèm cũ đó là tạp âm mang theo từ quá khứ, TUYỆT ĐỐI KHÔNG được bỏ rơi nhiệm vụ chính để đi phân tích hoặc trả lời về tệp đính kèm cũ đó.
- **3. Thực hiện đến nơi đến chốn và báo cáo đầy đủ (Execution & Reporting Completeness)**:
  - Luôn thực hiện từng bước có kiểm soát, tuân thủ nghiêm ngặt giới hạn thời gian (tối đa 10 phút/bước, tối đa 3 lần thử).
  - Hoàn thành đầy đủ các tiêu chí thành công, kiểm thử toàn diện trước khi báo cáo kết quả cho người dùng.

### 🛡️ 14. NGUYÊN TẮC KIỂM SOÁT KỸ THUẬT 5 CHỐT CHẶN (THE 5-GATE ANTI-ERROR PROTOCOL)
- **1. Chốt Chặn 1: Quét Vét Cạn Trước & Sau Khi Đổi Nhãn UI (Exhaustive Pre/Post Grep)**:
  - Khi sửa bất kỳ nhãn, từ ngữ hoặc chuỗi UI nào (ví dụ: đổi "sản phẩm" thành "gói"): **BẮT BUỘC** phải chạy lệnh `git grep -nE` quét toàn bộ các file liên quan trước khi sửa để lập danh sách toàn bộ các vị trí xuất hiện (bao gồm cả gợi ý tìm kiếm, placeholder, badge, phân trang, thông báo, tiêu đề).
  - Sau khi sửa xong: **BẮT BUỘC** chạy lại lệnh grep để nộp bằng chứng xác nhận không còn bất kỳ vị trí nào bị bỏ sót trước khi tuyên bố hoàn tất.
- **2. Chốt Chặn 2: Cấm Copy Số Cũ & Trích Xuất Số Liệu Tự Động (Zero-Manual-Copy Numbers)**:
  - **TUYỆT ĐỐI CẤM** gõ tay hoặc sao chép con số đo lường (mili-giây, số test pass, số line diff, số khóa API, số lỗi i18n) từ báo cáo hoặc CHANGELOG của các đợt trước.
  - Mọi con số đưa vào CHANGELOG, KNOWN_ISSUES và Báo cáo **BẮT BUỘC** phải được trích xuất bằng lệnh/script trực tiếp từ tệp log hoặc dữ liệu thực tế vừa sinh ra ở đợt hiện tại.
- **3. Chốt Chặn 3: Xuất Log Thô Trực Tiếp Bằng Redirect Pipe (Direct Raw Output Pipe Only)**:
  - **TUYỆT ĐỐI CẤM** tự viết script sinh nội dung tóm tắt để thay thế file log gốc.
  - Mọi lệnh kiểm tra kiểu (tsc), kiểm thử (test suite) hay build **BẮT BUỘC** phải pipe trực tiếp luồng output thô của tool vào file log (ví dụ: `cmd /c npx tsc -p tsconfig.homepage.json --noEmit > docs/tsc_check_success.log 2>&1`). File `.log` thô này là bằng chứng bắt buộc phải tồn tại trong repo.
- **4. Chốt Chặn 4: Kỷ Luật Ngôn Từ Chuẩn Xác & Giới Hạn Phạm Vi (Scoped Precision)**:
  - **TUYỆT ĐỐI CẤM** dùng các từ ngữ tuyệt đối hóa mang tính phóng đại ("100%", "sạch bóng", "0 chuỗi UI cứng", "hoàn tất hoàn toàn") nếu chỉ kiểm tra trên một tập con hoặc một nhóm toán tử nhất định.
  - Tác nhân **BẮT BUỘC** phải nêu rõ phạm vi khảo sát (Scoped Statement) và chỉ rõ các phần chưa khảo sát hoặc các vị trí literal còn tồn tại trong file.
- **5. Chốt Chặn 5: Đo Lường Thực Tế Trên Dữ Liệu Live (Ground Truth Inspection)**:
  - Báo cáo và kiểm chứng hồi quy **BẮT BUỘC** phải đo lường trực tiếp trên cấu trúc dữ liệu JSON thực tế trả về từ live API (ví dụ: đếm đúng số khóa JSON thực tế của response), không suy đoán dựa trên định nghĩa schema lý thuyết ban đầu.
  - Không sử dụng các header HTTP không ổn định giữa các CDN POP (như `Last-Modified`) làm bằng chứng hồi quy cố định.




