# Memo: đồng bộ model và mức suy luận ChatGPT

Cập nhật: 2026-09-26.

## Hành vi cần giữ

1. DOM1: bấm nút mở menu ở composer.
2. DOM2: tìm popup thuộc nút vừa bấm, có Select model và thanh suy luận.
3. Bấm Select model để mở DOM3; chờ các dòng model tương tác được.
4. Nếu model khác lựa chọn MyTool, chọn đúng dòng và kiểm tra aria-checked.
5. Trở về DOM2, đọc lại mức suy luận của model vừa chọn, kiểm tra khóa rồi điều chỉnh nếu cần.
6. Xác nhận model và effort, bấm ngoài để đóng DOM2.
7. Tác vụ sync_model không ghi hoặc gửi prompt. Nếu lỗi, dừng tại bước đó, giữ menu hiện tại và báo tên bước.

## Lỗi đã quan sát

Log thực tế ghi DOM1 -> DOM2, Trigger="Thinking effort", expanded=true, nhưng không tìm được controls. Bridge đã lưu tác vụ ở trạng thái error với MODEL_PICKER_FAILED. Người dùng xác nhận menu mở bằng tay có Select model và thanh trượt.

Điều này xác nhận trigger đã báo mở, nhưng chưa xác nhận lý do cụ thể khiến bộ nhận diện không tìm được popup. Chưa thu được outerHTML hiện tại của popup để xác minh trực tiếp trên trang thật.

## Thay đổi nhận diện DOM2

Tệp: extension/providers/chatgpt/chatgpt_models.js, phương thức ModelPicker.menu().

Thứ tự nhận diện:
- aria-controls của trigger trỏ đến phần tử popup đang hiển thị.
- Popup có aria-labelledby chứa ID trigger; thuộc tính có thể chứa nhiều ID.
- Các marker đã biết trong chatgpt_selectors.js.
- Chỉ khi không có liên kết/marker: nhận diện theo cấu trúc Select model và slider/model view, yêu cầu một ứng viên duy nhất.

Lý do: mã cũ lọc cấu trúc con trước khi kiểm tra liên kết với trigger. Một popup đã mở nhưng phần tử con render chậm hoặc wrapper đổi có thể bị loại nhầm ngay ở bước DOM1 -> DOM2.

ModelPicker.advanced() chờ Select model trước khi kích hoạt. Nếu không tìm thấy, báo lỗi ở DOM2 -> DOM3 thay vì kết luận model không khả dụng.

ModelPicker.diagnostic()/popupSummary() ghi thuộc tính và số lượng control để chẩn đoán; không ghi nội dung hội thoại, bản nháp hay toàn bộ HTML.

Lượt sửa này không đổi chuỗi click/pointer/keyboard mở DOM1.

## Các đoạn liên quan

- chatgpt_models.js: resolveTrigger/toggle/open mở DOM1; menu tìm DOM2; advanced/activateControl mở DOM3 và chọn dòng; simple/chooseEffort xử lý DOM2; close bấm ngoài.
- chatgpt_selectors.js: tập trung selector popup và control.
- chatgpt_provider.js: truyền document và log cho bộ chọn model.
- core/content_runner.js: tác vụ sync_model trả kết quả ngay sau chọn model, không chạy setPrompt/sendPrompt.
- core/response_sender.js: nếu Bridge cũ từ chối MODEL_PICKER_FAILED bằng HTTP 400, chỉ gửi lại kết quả với PROVIDER_ERROR và giữ mã lỗi gốc trong message; không thực thi lại trên website.
- app/gui/index.html: phân biệt trạng thái queued/processing với lỗi thao tác DOM.

## Kiểm thử hồi quy

Chạy từ thư mục mytool:

    node tests/chatgpt_popup.test.cjs
    node tests/chatgpt_models.test.cjs
    node tests/chatgpt_picker.test.cjs
    node tests/chatgpt_dom_flow.test.cjs
    node tests/model_sync.test.cjs
    node tests/response_sender.test.cjs
    python -m unittest discover -s tests -p 'test_*.py'

Bộ popup kiểm tra aria-controls, aria-labelledby nhiều ID, control render trễ, popup chỉ có suy luận, và không nhận nhầm dialog khác.

Các kiểm thử DOM dùng trang mô phỏng. Không coi việc test qua là bằng chứng đã chạy được trên tài khoản ChatGPT thật. Sau khi reload extension và tab ChatGPT, đối chiếu các log DOM2 OPEN, DOM3 OPEN, DOM2 READY và MODEL AND EFFORT VERIFIED; MENU CLOSED. Nếu vẫn lỗi, cần outerHTML popup hiện tại hoặc log thuộc tính popup để sửa đúng selector.

## Quy tắc cho lần sửa sau

- Đọc memo và diff trước khi sửa; giữ nguyên phần đã được người dùng xác nhận hoạt động.
- Không đổi thao tác DOM1 để chữa lỗi nhận diện DOM2 khi log đã có expanded=true.
- Không suy ra thiếu quyền model từ lỗi không tìm được popup.
- Không click các dòng trong panel inert/data-active=false.
- Không tự đóng popup khi bước sau thất bại; không gửi prompt để thử đồng bộ.
- Cập nhật memo cùng với các thay đổi xử lý DOM và kết quả kiểm chứng.

## Phân biệt hàng đợi và thao tác DOM (2026-09-26)

Luồng: MyTool gửi HTTP -> Bridge lưu queued -> extension nhận job và Bridge chuyển processing -> extension chọn tab -> content script mở DOM1 -> DOM2/DOM3 -> extension trả kết quả -> Bridge giải phóng lượt chạy.

Quan sát trực tiếp:
- Job mytool-9f3c690e-e3a5-4743-82d8-c4c9ff17d7d6 đang queued, result=null khi kiểm tra.
- Job mytool-defc61c7-b51c-4f6f-be4b-91bb67717d91 vẫn tồn tại và đã ở trạng thái error. Không thể kết luận Bridge đã quên job này.
- Chưa đọc được trạng thái activeExecution/pendingResult hoặc log service worker mới nhất. Chưa xác định nguyên nhân cụ thể khiến extension chưa nhận job mới.

Impact theo tầng:
- app/gui/index.html: gửi yêu cầu, hiển thị queued/processing; không trực tiếp bấm ChatGPT.
- bridge/job_manager.py: chỉ cho một job processing. Khi còn active, next_job chờ dù có job queued.
- extension/background.js: xử lý activeExecution/pendingResult trước khi nhận job mới; lỗi gửi kết quả được retry. Khi vòng này kẹt, DOM chưa chạy.
- extension/core/response_sender.js: chỉ gửi kết quả; nhánh tương thích HTTP 400 không thay đổi DOM.
- chatgpt_models.js/chatgpt_selectors.js: chỉ chạy sau khi job đã được nhận và tab đã sẵn sàng. Sửa selector không làm job queued bắt đầu chạy.

Hướng chẩn đoán:
- queued và không có JOB RECEIVED cho đúng ID: kiểm tra service worker, log [Bridge], activeExecution/pendingResult; chưa sửa DOM.
- processing + CHATGPT TAB FOUND: theo dõi mốc DOM1 -> DOM2, DOM2 OPEN, DOM3 OPEN.
- Trigger expanded=true nhưng không nhận controls: kiểm tra liên kết/DOM popup.
- Không tự gọi GET /api/jobs/next để thăm dò: endpoint này claim job và sẽ thay đổi hàng đợi.
- Không tự reset hàng đợi hoặc khởi động lại Bridge để chẩn đoán; sẽ làm mất job trong bộ nhớ.
- Không thêm bản vá theo giả thuyết thiếu bằng chứng. Ghi rõ điều đã quan sát và điều chưa xác định.

## Tách luồng prompt và đồng bộ model (2026-09-26)

- `core/content_runner.js`: chỉ gọi `provider.selectModel()` trong nhánh `sync_model`. Nhánh `prompt` đi thẳng qua `setPrompt`, `sendPrompt`, `waitForResponse`.
- `app/gui/index.html`: gửi prompt không còn yêu cầu hoặc gửi `model` và `effort`. Hai select chỉ cung cấp dữ liệu cho nút Kiểm tra / đồng bộ model.
- Không thay đổi selector hoặc chuỗi thao tác DOM1 -> DOM2 -> DOM3 trong lần sửa này.

## Memo trạng thái phiên kết nối (2026-09-26)

- Mỗi lần trang MyTool tải tạo một UUID mới và đăng ký qua `POST /api/connection/mytool`.
- Extension giữ một UUID trong `chrome.storage.session` và gửi qua header `X-MyTool-Extension-Session` trên long poll `GET /api/jobs/next`.
- Bridge lưu hai marker trong bộ nhớ và trả snapshot qua `GET /api/connection`. Endpoint này tách khỏi hàng đợi job.
- Khi marker thay đổi, giao diện chỉ cảnh báo trạng thái model có thể không còn đồng bộ. Cảnh báo không chặn việc gửi prompt; prompt vẫn dùng model hiện tại trên web.
- Đồng bộ model thành công sẽ xóa cảnh báo.
- Không tạo hoặc sửa file trong `tests/` cho thay đổi này. Kiểm tra thủ công: F5 MyTool có cảnh báo; reload extension có cảnh báo; không reload thì không cảnh báo; prompt gửi được khi chưa chọn model; nút đồng bộ vẫn chạy riêng.
