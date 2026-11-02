# Trợ Lý Nhận Xét vnEdu (Lớp 1 - 12) - Cloud Data Repository

Kho lưu trữ mã nguồn và dữ liệu đám mây phục vụ tính năng **Tự Động Cập Nhật Trực Tuyến** cho tiện ích Trợ lý nhận xét vnEdu.

---

## 🌐 Cơ chế Cập nhật Dữ liệu Trực tuyến (Cloud Sync)
Tất cả các máy giáo viên đã cài tiện ích khi mở trang **vnEdu** sẽ tự động kết nối và tải phiên bản dữ liệu nhận xét mới nhất từ file:
- **Đường dẫn dữ liệu:** [`data/vnedu-online-data.json`](data/vnedu-online-data.json)
- **URL đồng bộ trực tiếp:** `https://raw.githubusercontent.com/mrlute88/trolibebut/main/data/vnedu-online-data.json`

---

## 📝 Hướng dẫn Thầy/Cô thêm mẫu nhận xét hoặc cập nhật môn mới

Khi muốn bổ sung mẫu nhận xét mới hoặc sửa lỗi nhận diện tên môn học cho toàn bộ giáo viên trong trường mà **không cần cài lại extension**:

1. Mở file [`data/vnedu-online-data.json`](data/vnedu-online-data.json) trên GitHub (bấm biểu tượng cây bút chì ✏️ để chỉnh sửa).
2. Tăng số phiên bản dữ liệu:
   ```json
   "dataVersion": "2026.11.03.1"
   ```
3. Bổ sung các câu nhận xét mới vào phần `customTemplates` theo đúng Cấp học, Môn học và Mức đạt:
   ```json
   "Tiếng Việt": {
     "T": [
       "Biết chọn lọc từ ngữ gợi cảm, diễn đạt câu văn trôi chảy và biểu cảm."
     ]
   }
   ```
4. Bấm **Commit changes** (Lưu thay đổi) trên GitHub.
5. **Hoàn tất!** Trong vòng 30 phút (hoặc ngay khi giáo viên bấm nút *"Kiểm tra & Đồng bộ dữ liệu mới"*), toàn bộ tiện ích trên máy giáo viên sẽ tự động cập nhật dữ liệu mới này.

