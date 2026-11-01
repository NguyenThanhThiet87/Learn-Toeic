# TOEIC Dictation Practice Tool (Part 1 & Part 2)

Công cụ cào audio và hỗ trợ luyện nghe chép chính tả (Dictation) đề thi TOEIC từ [Parroto.app](https://parroto.app).

---

## Tính năng nổi bật

1. **Cào đề thông minh & tự động**:
   - Dán link bài thi dạng `https://parroto.app/vi/exams/toeic/session/<sessionId>`.
   - Tự động lấy token xác thực từ Chrome của bạn (không cần copy/paste token thủ công).
   - Tải về toàn bộ 31 audio MP3 chất lượng cao và ảnh mô tả Part 1.
   - Giải mã dữ liệu bảo mật AES-GCM 256 để trích xuất transcript tiếng Anh và bản dịch tiếng Việt chuẩn.

2. **Luyện nghe chép chính tả từng câu (Part 1 & Part 2)**:
   - **Part 1 (Câu 1–6)**: Hiển thị hình ảnh đề thi + trình phát audio + 4 ô điền cho phương án (A), (B), (C), (D).
   - **Part 2 (Câu 7–31)**: Trình phát audio + ô điền Câu hỏi (Question) và 3 ô điền phản hồi (A), (B), (C).

3. **Gợi ý dấu sao `*` theo thời gian thực**:
   - Hiển thị cấu trúc câu bằng dấu `*`.
   - Gõ đúng chữ nào thì chữ đó mở ra màu xanh lá; gõ sai hiện màu đỏ để sửa ngay.
   - Đúng 100% tự động đánh dấu hoàn thành `✓` và chuyển con trỏ sang câu tiếp theo.

4. **Tô đen dịch Tiếng Việt (Highlight-to-Translate)**:
   - Mặc định ẩn bản dịch để bạn tập trung luyện nghe.
   - Chỉ khi dùng chuột **tô đen** văn bản tiếng Anh thì tooltip tiếng Việt mới nổi lên.

5. **Hệ thống phím tắt chuyên nghiệp (Keyboard Shortcuts)**:
   - `Ctrl + Space` / `Alt + Space`: Tạm dừng / Tiếp tục phát audio.
   - `Ctrl + Left` / `Alt + Left`: Tua lùi 2 giây để nghe lại.
   - `Ctrl + Right` / `Alt + Right`: Tua tới 2 giây.
   - `Ctrl + R` / `Alt + R`: Nghe lại từ đầu audio câu hiện tại.
   - `Ctrl + H`: Gợi ý 1 chữ cái tiếp theo khi gặp từ khó.
   - `Ctrl + Enter`: Chuyển sang câu audio tiếp theo.

---

## Hướng dẫn sử dụng

### 1. Khởi chạy ứng dụng
Chạy file `run.bat` (hoặc mở terminal gõ):
```bash
python -m uvicorn backend.app:app --port 8000
```
Trình duyệt sẽ tự động mở tại `http://localhost:8000`.

### 2. Cào đề mới
1. Nhấn nút **"+ Cào Đề Mới"** ở góc trên bên phải.
2. Dán link bài thi Parroto của bạn vào ô và nhấn **"Bắt Đầu Cào Đề & Tải Audio"**.
3. Hệ thống sẽ tự động tải 31 audio và nạp vào danh sách bài tập.
