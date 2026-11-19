# 🤖 Nexus Smart Q&A & Deep-Link Traceability Telegram Bot

Trợ lý AI chuyên trách **Hỏi đáp & Truy xuất nguồn gốc thông tin (Smart Q&A + Deep Link)** dành cho các nhóm làm việc, dự án kiến trúc, xây dựng, nội thất và quản lý dự án trên Telegram.

---

## 🌟 Tính Năng Nổi Bật

1. **Hỏi đáp theo ngữ nghĩa tự nhiên (Semantic Q&A)**:
   - Hiểu câu hỏi tự nhiên bằng tiếng Việt thông qua mô hình **Google Gemini AI**.
   - Kích hoạt linh hoạt:
     - Nhắc tên bot: `@Nexus1208_bot <câu hỏi>`
     - Dùng lệnh: `/ask <câu hỏi>` (hoặc `/hoi`, `/tim`, `/truyxuat`)
     - Reply trực tiếp vào tin nhắn của bot.
     - Nhắn tin trực tiếp (DM) cho bot.

2. **Cấu Trúc Trả Lời Chuẩn Bắt Buộc 4 Yếu Tố**:
   - 📌 **1. Nội dung tóm tắt**: Tóm lược chính xác thông tin và **nêu rõ trạng thái** (`Đã chốt` hay `Mới chỉ là đề xuất / đang thảo luận`).
   - 👤 **2. Người gửi**: Xác định rõ ai là người gửi (Tên đối tác / Sếp / KTS / Bạn).
   - ⏰ **3. Thời gian gửi**: Ngày và giờ cụ thể đến từng phút (`HH:mm ngày DD/MM/YYYY`).
   - 🔗 **4. Deep Link Topic**: Nút nhảy thẳng về tin nhắn gốc trong đúng Topic để xem file, bản vẽ CAD/PDF hoặc ảnh đính kèm ngay lập tức.

3. **Hoạt Động 24/7 & Chống Ngủ Trên Render**:
   - Tích hợp sẵn cơ chế **Keep-Alive tự động** (tự động ping định kỳ mỗi 3 phút).
   - Hỗ trợ cả 2 chế độ: **Webhook** (khi chạy trên Render) và **Long Polling** (khi chạy trên máy local).

---

## 🛠️ Hướng Dẫn Thêm Bot Vào Nhóm Telegram

Để bot có thể tự động ghi nhớ toàn bộ tin nhắn, tài liệu và quyết định trong nhóm dự án:
1. Thêm `@Nexus1208_bot` vào nhóm hoặc Topic của bạn.
2. **Cấp quyền Quản trị viên (Admin)** cho Bot để Telegram cho phép Bot đọc mọi tin nhắn trong nhóm.
   *(Hoặc vào `@BotFather` -> `/mybots` -> chọn `@Nexus1208_bot` -> `Bot Settings` -> `Group Privacy` -> `Turn off`)*.

---

## 🚀 Triển Khai Lên Render.com (24/7 Miễn Phí)

### Cách 1: Triển khai tự động bằng Blueprint (`render.yaml`)
1. Đăng nhập [Render.com](https://render.com).
2. Vào **Blueprints** -> chọn **New Blueprint Instance**.
3. Kết nối với repository GitHub `telegram-smart-qa-bot`.
4. Render sẽ tự động đọc file `render.yaml` và hỏi điền 2 biến:
   - `BOT_TOKEN`: `<Điền Telegram BOT_TOKEN của bạn>`
   - `GEMINI_API_KEY`: `<Điền GEMINI_API_KEY của bạn>`
5. Nhấn **Apply**. Dịch vụ sẽ tự động build và online 24/7!

### Cách 2: Tạo thủ công Web Service trên Render
1. Chọn **New +** -> **Web Service**.
2. Chọn repo `telegram-smart-qa-bot`.
3. Cấu hình:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node bot.js`
4. Thêm các **Environment Variables**:
   - `BOT_TOKEN`: Điền Token Bot Telegram
   - `GEMINI_API_KEY`: Điền Key Gemini
   - `RENDER_EXTERNAL_URL`: `https://<tên-app-của-bạn>.onrender.com`
   - `PORT`: `3000`
5. Nhấn **Create Web Service**. Bot sẽ kích hoạt Webhook và chạy liên tục 24/7!
