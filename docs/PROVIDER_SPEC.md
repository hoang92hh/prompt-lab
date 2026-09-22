# Provider Spec

Tài liệu này là **nguồn chuẩn duy nhất** cho contract mà mọi adapter tuân theo. Base Provider là skeleton phản ánh contract, không phải triển khai website. Wire envelope và mã lỗi được định nghĩa duy nhất trong [Job Protocol](JOB_PROTOCOL.md).

## Ranh giới

Mỗi adapter kế thừa `BaseProvider` và sở hữu selector, model mapping, kiểm tra sẵn sàng, gửi prompt và đọc response của đúng một website. Adapter không gọi Bridge, không tạo wire response, không tự login, không dùng API nhà cung cấp và không phụ thuộc adapter khác.

Factory nhận provider ID cùng context thực thi và trả adapter tương ứng. ChatGPTProvider chạy trong isolated content script; context có document, callback log và timeout/stability nội bộ. Chỉ hỗ trợ một job đang chạy và đúng một tab ChatGPT.

## Capability bắt buộc

Tất cả phương thức là bất đồng bộ. Kết quả `void` nghĩa là Promise hoàn tất không có dữ liệu trả về. Ngoại lệ được chốt cho bước hiện tại: selectModel không đổi model; cancel chỉ dừng chờ cục bộ.

| Phương thức | Đầu vào | Kết quả | Ngữ nghĩa |
| --- | --- | --- | --- |
| `isReady()` | Không | `Promise<boolean>` | Kiểm tra website/phiên và khả năng bắt đầu tương tác; không đăng nhập hoặc gửi prompt |
| `selectModel(model)` | null/undefined | `Promise<void>` | No-op, dùng model đang chọn; tên model trả UNSUPPORTED_MODEL |
| `setPrompt(content, options)` | String prompt và object option | `Promise<void>` | Chuẩn bị nội dung, kiểm tra option; chưa gửi prompt |
| `sendPrompt()` | Không | `Promise<void>` | Gửi nội dung đã chuẩn bị một lần trong flow hiện tại |
| `waitForResponse()` | Không | `Promise<void>` | Chờ câu trả lời cho prompt vừa gửi hoàn tất; chưa trả kết quả nếu đang sinh |
| `getResponse()` | Không | `Promise<string>` | Đọc câu trả lời hoàn tất của prompt hiện tại, không lấy nhầm response cũ |
| `cancel()` | Không | `Promise<void>` | Dừng chờ/thao tác cục bộ và cố gắng dừng sinh nếu website cho phép; không cam kết hoàn tác prompt đã gửi |

`cancel()` phải an toàn khi gọi lặp hoặc không có thao tác đang chạy. Trong bước hiện tại cancel chỉ ngắt observer/timer cục bộ và reject promise đang chờ; không click Stop trên website. Không cam kết website dừng sinh và không báo thành response thành công. Chính sách kết thúc job bị hủy và lệnh hủy từ MyTool còn mở, chưa thêm status hoặc action wire cho chúng.

## Trình tự sử dụng dự kiến

1. Core yêu cầu Factory tạo adapter theo provider ID.
2. Gọi `isReady()`; nếu false, Core trả lỗi tương ứng theo Job Protocol.
3. `selectModel(request.model)`.
4. `setPrompt(request.content, request.options)`.
5. `sendPrompt()`.
6. `waitForResponse()`.
7. `getResponse()` và chuyển string kết quả cho Response Sender dưới dạng wire envelope.

Nếu một bước lỗi, Core dừng chuỗi; không gọi các bước tiếp theo và không tự gửi lại prompt. `cancel()` dành cho đường dừng thực thi riêng, không phải bước bắt buộc sau thành công. Response deadline hiện là 180 giây từ click Send. Chưa có lệnh hủy wire hoặc UI hủy.

## Lỗi và tính độc lập

Adapter reject Promise bằng `Error`; lỗi có thể gắn thuộc tính `code` tương ứng mã provider hợp lệ trong Job Protocol. Core chuẩn hóa lỗi thiếu mã/không nhận biết thành lỗi provider theo tài liệu giao thức. `isReady() === false` thể hiện chưa sẵn sàng; lỗi kiểm tra bất thường có thể reject.

Không âm thầm bỏ option, đổi model, nuốt lỗi đọc DOM hoặc coi response cũ là kết quả mới. Quy tắc xác định website đang sinh/đã xong và response nào thuộc prompt hiện tại hoàn toàn nằm trong adapter.


## Trạng thái hiện tại


Toàn bộ selector ChatGPT ở chatgpt_selectors.js. Provider kiểm tra composer/Stop/dấu hiệu chưa đăng nhập, từ chối draft sẵn có, chèn đầy đủ text bằng native editor input không clipboard và đối chiếu trước click. sendPrompt đặt cờ trước side effect, chỉ click một lần; không fallback Enter hoặc retry.

Trước click, lưu danh sách/identity user và assistant hiện có. Chỉ nhận user mới có nội dung khớp prompt và assistant mới sau user đó, trước lượt user tiếp theo. Assistant cũ đổi text hoặc re-render không được coi là response mới.

Hoàn tất cần đồng thời: markdown text của assistant mới, không Stop/streaming, composer sẵn sàng, action hoàn tất như Copy response trong đúng turn và nội dung ổn định 1,2 giây. MutationObserver quan sát thay đổi; timer ngắn chỉ kiểm tra độ ổn định/deadline, không thay bằng sleep cố định. Chỉ đọc markdown và loại nút điều khiển; thiếu bằng chứng thì trả lỗi thay vì partial text.

