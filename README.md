# Xếp Lịch Làm Việc - Tiếng Anh

Ứng dụng web giúp xếp lịch nhân sự cho 2 cơ sở dạy tiếng Anh.

## Tính năng

1. **Cấu hình ca làm** - Xem lịch Cơ sở 1 & 2 (Cấp 1, 2, 3), nhập số người cần cho mỗi ca
2. **Đăng ký lịch** - Nhân viên đăng ký khung giờ rảnh theo mẫu (ô vàng = không có ca T2-T6 sáng/chiều)
3. **Xếp lịch tự động** - Thuật toán phân công nhân sự dựa trên đăng ký và nhu cầu

## Chạy ứng dụng

```bash
npm install
npm run dev
```

Mở http://localhost:5173 trên trình duyệt.

## Cách sử dụng

1. Tab **Cấu hình ca**: Chỉnh số người cần ở ô "Người:" bên cạnh mỗi lớp
2. Tab **Đăng ký lịch**: Thêm nhân viên, nhập tên, click ô trắng để đánh dấu rảnh
3. Tab **Xếp lịch**: Nhấn "Xếp lịch tự động" để phân công

Dữ liệu lưu tự động trong trình duyệt (localStorage).
