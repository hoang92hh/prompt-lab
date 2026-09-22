# Job Protocol

Tài liệu này là **nguồn chuẩn duy nhất** cho dữ liệu giao tiếp giữa MyTool, Bridge và Extension. `bridge/protocol.py` phản ánh kiểu dữ liệu và validation runtime; nếu có sai khác phải sửa source theo tài liệu này. Contract nội bộ adapter nằm riêng trong [Provider Spec](PROVIDER_SPEC.md).

## Phạm vi

Envelope là JSON object. Phiên bản hiện tại gồm request `prompt`, response cuối cùng, job snapshot và HTTP API localhost được mô tả bên dưới. Không có streaming hoặc lệnh hủy.

MyTool tạo request; Bridge chuyển nguyên ý nghĩa các trường cho Extension. Extension trả response cho Bridge; Bridge chuyển kết quả về MyTool với cùng `job_id`. Bridge trả lỗi HTTP validation riêng trước khi tạo job; lỗi này không tạo terminal job result.

## Request

Năm trường job_id, provider, action, content, options bắt buộc; model là tùy chọn:

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| `job_id` | string | Không rỗng, không chỉ khoảng trắng; ID do MyTool cấp, duy nhất cho mỗi job mới; `next` là ID dành riêng |
| `action` | string | Hiện chỉ nhận `prompt` |
| `model` | string hoặc null, có thể bỏ qua | ChatGPT hiện chỉ nhận null/bỏ qua để dùng model đang chọn. Tên model hợp lệ về schema nhưng execution trả UNSUPPORTED_MODEL |
| `content` | string | Prompt không rỗng/không chỉ khoảng trắng; giữ nguyên nội dung và xuống dòng |
| `options` | object | Object JSON, dùng `{}` khi không có tùy chọn; hiện chưa có key nào được đặc tả |

Không gửi DOM selector, mã thực thi hay thông tin đăng nhập trong `options`. Các giá trị phải tuần tự hóa được bằng JSON. Envelope không có trường mở rộng được định nghĩa; chỉ gửi các trường đã đặc tả. Trường ngoài đặc tả được báo `INVALID_REQUEST`; key option chưa hỗ trợ được báo `UNSUPPORTED_OPTION` thay vì tự bỏ qua.

```json
{
  "job_id": "123",
  "provider": "chatgpt",
  "action": "prompt",
  "model": null,
  "content": "Example prompt",
  "options": {}
}
```

Không chọn model qua UI. Bỏ qua model hoặc gửi null để dùng model hiện tại; không gửi tên model.

## Response thành công

```json
{
  "job_id": "123",
  "status": "completed",
  "text": "Nội dung phản hồi"
}
```

Ba trường đều bắt buộc. `job_id` là ID request gốc; `status` chính xác là `completed`; `text` là string, có thể rỗng nếu website thực sự trả kết quả rỗng. Không dùng chuỗi rỗng để che lỗi đọc response. Chỉ gửi khi adapter đã xác nhận response hoàn tất; không trả nội dung đang sinh như kết quả cuối.

## Response lỗi

```json
{
  "job_id": "123",
  "status": "error",
  "error": "PROVIDER_NOT_READY",
  "message": "Website chưa sẵn sàng trong phiên hiện tại."
}
```

Bốn trường đều bắt buộc. `error` là mã string trong bảng dưới; `message` là string không rỗng dùng giải thích cho người dùng, không dùng làm mã điều khiển. Không kèm `text` trong response lỗi hoặc `error`/`message` trong response thành công.

| Mã | Ý nghĩa |
| --- | --- |
| `INVALID_REQUEST` | Sai cấu trúc, kiểu hoặc giá trị bắt buộc |
| `UNSUPPORTED_PROVIDER` | Provider chưa được đăng ký |
| `UNSUPPORTED_ACTION` | Action chưa được hỗ trợ |
| `UNSUPPORTED_MODEL` | Model không được adapter/website hỗ trợ |
| `UNSUPPORTED_OPTION` | Có option chưa được hỗ trợ |
| `PROVIDER_NOT_READY` | Website/phiên hiện tại chưa sẵn sàng |
| `PROVIDER_ERROR` | Tương tác hoặc đọc kết quả trên website thất bại |
| `INTERNAL_ERROR` | Lỗi nội bộ Bridge hoặc Extension |
| `CHATGPT_TAB_NOT_FOUND` | Không có tab ChatGPT |
| `CHATGPT_MULTIPLE_TABS` | Có nhiều tab ChatGPT |
| `CONTENT_SCRIPT_NOT_READY` | Content script chưa có hoặc không trả lời ping |
| `COMPOSER_NOT_FOUND` | Không thấy composer |
| `COMPOSER_NOT_EMPTY` | Có draft, không tự ghi đè |
| `COMPOSER_WRITE_FAILED` | Không chèn được toàn bộ prompt |
| `PROMPT_SEND_FAILED` | Không có Send hoặc chưa xác nhận lượt user sau click; không retry |
| `ASSISTANT_RESPONSE_NOT_FOUND` | Không thấy assistant tương ứng và không quan sát được generation trước deadline |
| `RESPONSE_TIMEOUT` | Không đủ bằng chứng hoàn tất trước deadline |
| `DUPLICATE_EXECUTION` | Gửi lần hai hoặc ID trùng với nội dung khác |
| `EXECUTION_STATE_LOST` | Tab/content mất trạng thái hoặc sai ID |


## Đối chiếu và vòng đời

Bridge giữ liên hệ giữa request và response bằng `job_id`; không đổi ID theo từng tầng. Mỗi job có một kết quả cuối có ý nghĩa: thành công hoặc lỗi. Không ghi đè kết quả cuối bằng response của job khác hoặc chấp nhận ID không tồn tại.

Trước kết quả cuối, snapshot có status `queued` hoặc `processing` và `result: null`. Khi kết thúc, status là `completed` hoặc `error` và result chứa terminal response.

Request thiếu/sai `job_id` bị từ chối HTTP 400 trước khi tạo job; không tự bịa ID. Quy tắc claim, duplicate và retry được định nghĩa ở phần HTTP dưới đây; không bảo đảm exactly-once.

## HTTP localhost

Base URL: `http://127.0.0.1:8765`. Bridge chỉ bind IPv4 loopback, dùng HTTP; không WebSocket. Body POST phải là UTF-8 JSON với `Content-Type: application/json`, tối đa 1 MiB, có Content-Length; không hỗ trợ chunked body. JSON malformed, key trùng và NaN/Infinity bị từ chối. Không có query parameter.

| Endpoint | Thành công | Ý nghĩa |
| --- | --- | --- |
| POST `/api/jobs` | 201 + job snapshot | Validate, từ chối ID trùng, lưu job queued trong memory |
| GET `/api/jobs/next` | 200 + request gốc; hoặc 204 không body | Long-poll tối đa 20 giây, claim FIFO nguyên tử và chuyển processing trước khi trả |
| POST `/api/jobs/{job_id}/result` | 200 + job snapshot | Ghi completed/error cho job processing; kiểm tra ID URL khớp body |
| GET `/api/jobs/{job_id}` | 200 + job snapshot | Lấy trạng thái và kết quả, không claim hoặc thay đổi job |

URL-encode toàn bộ job ID khi đặt vào path (kể cả dấu slash). ID chính xác `next` được dành riêng cho endpoint claim và bị từ chối khi tạo job.

Job snapshot:

```json
{
  "job_id": "test-001",
  "status": "queued",
  "result": null
}
```

`status` nhận `queued`, `processing`, `completed`, `error`. Với hai trạng thái cuối, `result` là response thành công/lỗi đúng định nghĩa phía trên. Snapshot không trả lại prompt.

Flow thực tế: `queued → processing → completed | error`. Bridge chỉ cho phép **một job processing** trên toàn queue. Nếu đang có job processing, GET next chờ tối đa 20 giây rồi trả 204 dù còn job queued. Condition variable đánh thức long poll khi có thể claim, không busy polling.

### Lỗi HTTP và retry

Lỗi API dùng envelope riêng `{"error": "CODE", "message": "..."}`, không phải terminal job result và không tự đổi state.

| HTTP | Code | Tình huống |
| --- | --- | --- |
| 400 | INVALID_JSON | Body không phải JSON hợp lệ |
| 400 | INVALID_REQUEST | Sai field/kiểu, ID dành riêng, ID result lệch URL, result sai schema |
| 400 | UNSUPPORTED_PROVIDER / UNSUPPORTED_ACTION / UNSUPPORTED_OPTION | Giá trị chưa hỗ trợ |
| 403 | FORBIDDEN_ORIGIN | Request mang Origin không phải extension |
| 404 | JOB_NOT_FOUND / NOT_FOUND | Job hoặc route không tồn tại |
| 405 | METHOD_NOT_ALLOWED | Sai method cho endpoint |
| 409 | DUPLICATE_JOB | POST job với ID đã tồn tại, kể cả nội dung giống hệt |
| 409 | INVALID_STATE | Gửi result cho job chưa claim |
| 409 | RESULT_CONFLICT | Gửi result khác kết quả cuối đã lưu |
| 413 | REQUEST_TOO_LARGE | Body vượt 1 MiB |
| 415 | UNSUPPORTED_MEDIA_TYPE | POST không dùng application/json |
| 500 | INTERNAL_ERROR | Lỗi nội bộ Bridge |

POST result lần hai với **cùng nội dung JSON** trả 200 và snapshot hiện có; không ghi lại kết quả hay giải phóng job đang chạy khác. Đây là retry xác nhận an toàn sau khi ACK bị mất. Result khác trả 409, giữ nguyên kết quả đầu.

Extension dùng timeout fetch 25 giây cho long poll và 10 giây cho gửi result. Khi transport lỗi, chờ 5, 10, 20 rồi tối đa 30 giây giữa các lần thử; khi thành công đặt lại delay. Chỉ retry transport, **không retry execute**. Extension lưu tối đa một result đã tính xong trong `chrome.storage.session`, gửi lại chính result đó trước khi nhận job mới. Alarm 30 giây hỗ trợ đánh thức service worker; worker có guard để không mở hai loop. Alarm có thể bị browser trì hoãn.

Result POST bị 4xx vẫn giữ pending result và retry với delay; cần người dùng kiểm tra console/sửa nguyên nhân. Không tự xóa result hoặc chạy lại job. Có thể reload extension để xóa session memory sau khi đã xử lý tình trạng này.

### Delivery và giới hạn khôi phục

Bridge không requeue job processing. Nếu phản hồi claim bị mất trước khi Extension ghi nhận ID, job có thể kẹt processing và chặn queue. Sau khi lưu activeExecution, worker khởi động lại chỉ hỏi status content script; nếu mất trạng thái thì trả lỗi, không execute lại. Không có lease, timeout tự requeue, tự execute lại, hay bảo đảm exactly-once. Cơ chế xử lý thủ công các job kẹt là Open Question.

Memory Bridge mất khi restart. Session result Extension mất khi browser restart, extension reload/disable/update. Khi reset môi trường test, restart Bridge và reload Extension cùng nhau; dùng ID mới cho job mới. Chưa có Bridge instance token để đối chiếu qua restart, nên không tái sử dụng ID cũ với pending result từ phiên trước.

### Provider execution và ranh giới truy cập


Messaging Background → content script gồm MYTOOL_PING, MYTOOL_EXECUTE, MYTOOL_STATUS. Execute trả ACK nhanh; background hỏi status mỗi giây. Content script lưu job ID trong memory document để chặn duplicate. Status/log steps nội bộ không thay đổi terminal wire result.

Marker session được lưu trước dispatch; mất ACK chỉ hỏi status. Reload tab hoặc mất content state trả EXECUTION_STATE_LOST, không tự gửi lại prompt.

Đợi Send tối đa 10 giây, xác nhận lượt user sau click tối đa 10 giây. Response deadline 180 giây từ click; background deadline 200 giây từ trước dispatch. Không trả partial response khi timeout. Chi tiết bằng chứng hoàn tất thuộc Provider Spec.

Bridge không cung cấp CORS cho website thông thường; từ chối Origin ngoài `chrome-extension://`. Local client không có Origin được chấp nhận. Đây chưa phải xác thực extension: môi trường hiện tại tin cậy các tiến trình local và extension được cài. Không expose Bridge ra LAN.
