# Quy trình bắt buộc trước khi sửa project

Rule này áp dụng cho toàn bộ thư mục `mytool/` và mọi agent làm việc trong project.

## Không được sửa code khi chưa được xác nhận

Khi người dùng báo lỗi, yêu cầu thay đổi, hoặc đề nghị triển khai, trước tiên chỉ được thực hiện các thao tác đọc và chẩn đoán không làm thay đổi project hoặc ứng dụng đang chạy.

Trước khi chỉnh sửa, tạo, xóa, đổi tên hoặc format bất kỳ file nào, agent phải gửi cho người dùng một đề xuất gồm:

1. Các file/source đã kiểm tra và phần code liên quan.
2. Hiện tượng quan sát được và bằng chứng; phân biệt rõ dữ kiện đã xác nhận với giả thuyết.
3. Nguyên nhân dự kiến và những điểm còn chưa chắc chắn.
4. Phương án sửa cụ thể theo từng file.
5. Phạm vi ảnh hưởng, rủi ro hồi quy và hành vi cần giữ nguyên.
6. Kế hoạch kiểm thử, bao gồm giới hạn của test mô phỏng so với môi trường thật.
7. Danh sách chính xác các file dự kiến sửa, tạo hoặc xóa.

Sau đó phải dừng và chờ người dùng xác nhận rõ ràng, ví dụ: “confirm”, “đồng ý triển khai”, hoặc một chỉ dẫn tương đương. Báo lỗi, trả lời câu hỏi, cung cấp log/DOM/Job ID, hoặc yêu cầu phân tích không được xem là xác nhận sửa code.

## Phạm vi của xác nhận

- Xác nhận chỉ áp dụng cho phương án và danh sách file đã trình bày.
- Nếu phát hiện cần sửa thêm file, thay đổi thiết kế, mở rộng phạm vi, hoặc dùng một cách tiếp cận khác, phải trình bày phần thay đổi và chờ xác nhận lại.
- Không được gộp thêm refactor, cleanup, nâng dependency, đổi giao thức hoặc sửa lỗi khác ngoài phạm vi đã được xác nhận.
- Không được tự ý sửa source để “thử”, kể cả thay đổi tạm thời rồi hoàn tác.
- Không được dùng test mô phỏng làm bằng chứng rằng hành vi đã chạy thành công trên ChatGPT thật.

## Trước khi được xác nhận

Được phép:

- Đọc file, tìm kiếm source, xem `git diff`/`git status`/lịch sử commit.
- Đọc log, trạng thái job và dữ liệu chẩn đoán không làm thay đổi trạng thái.
- Giải thích luồng hiện tại, đánh giá impact và soạn phương án.

Không được phép:

- Sửa hoặc tạo source, test, tài liệu, config, dependency, generated file hay memo.
- Chạy formatter, migration, build hoặc command có thể ghi vào project.
- Reset hàng đợi, restart service, reload extension/tab, click UI, claim job, gửi prompt hoặc thực hiện thao tác làm thay đổi trạng thái ứng dụng.
- Commit, push, tạo PR hoặc triển khai.

Ngoại lệ duy nhất là khi người dùng yêu cầu rõ ràng chính việc tạo hoặc cập nhật rule quản trị này. Ngoại lệ đó không cấp quyền sửa bất kỳ file nào khác.

## Sau khi được xác nhận

- Chỉ triển khai đúng phương án đã duyệt.
- Bảo toàn mọi thay đổi có sẵn trong worktree; không ghi đè hoặc hoàn tác phần không thuộc phạm vi.
- Cập nhật tiến độ nếu bằng chứng mới làm thay đổi chẩn đoán.
- Chạy đúng các kiểm thử đã nêu và báo trung thực kết quả, phần chưa kiểm chứng và các bước thủ công còn cần thiết.
- Nếu sửa logic ChatGPT model/effort, cập nhật memo liên quan chỉ khi việc cập nhật memo đã nằm trong danh sách file được người dùng xác nhận.

