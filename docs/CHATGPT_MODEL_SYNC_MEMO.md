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

## Publish the current model state to MyTool (2026-09-27)

- After a successful DOM read, the content script sends `{model, effort}` to the extension service worker.
- The service worker publishes the value to `POST /api/connection/model` with its extension session marker.
- Bridge keeps only the latest live value in memory and exposes it as `model_state` from `GET /api/connection`.
- A new extension session clears the previous model state. A timed-out extension does not expose stale model data.
- MyTool compares the published value with the currently selected model and effort. Missing MyTool selections show the ChatGPT value without declaring a mismatch.
- A mismatch uses the existing dismissible warning. A match clears only a model-mismatch warning, not an unrelated connection warning.
- Project or conversation navigation still triggers the existing DOM read; the newly published state replaces the previous value.
- That transport phase did not yet define per-step defaults and did not change the ChatGPT model automatically.

## Step 1 model default (2026-09-27)

- Step 1 declares GPT-5.5 with reasoning level Medium.
- The default is applied when MyTool first opens Step 1 and whenever the user selects Step 1 again.
- Applying the default updates only the MyTool selectors and comparison result. It does not change ChatGPT until the user runs the model synchronization action.
- This initial behavior was superseded by the provider-specific defaults below.

## Provider-specific step defaults (2026-09-27)

- Model and reasoning defaults now live in `app/gui/config/ai_defaults.js`, not in individual step modules.
- ChatGPT defaults are Step 1 `GPT-5.5 / Medium`, Step 2 `GPT-5.6 Sol / Medium`, and Step 3 `GPT-5.6 Sol / Medium`.
- Claude currently declares the same values through separate constants so its defaults can diverge without changing ChatGPT configuration.
- Selecting a step applies the active provider's configured pair to that provider's model controls.
- Selecting a provider reapplies that provider's default for the active step.
- Claude controls and transport remain disabled; this configuration change does not implement a Claude adapter.

## Model comparison warning lifecycle (2026-09-27)

- MyTool compares the latest live ChatGPT model state with the model and effort currently selected for the active step.
- A matching pair hides only the model-mismatch warning and reports the matching values in the model status area.
- A mismatching pair shows the existing warning box with both ChatGPT and MyTool values.
- Closing the warning suppresses only that comparison result. Repeated connection polling does not reopen it.
- A new published model state, a new step selection, or a changed MyTool model/effort creates a new comparison result and may show a new warning.
- Connection-session warnings and model-mismatch warnings use separate warning identities.

## Initial model-read debounce (2026-09-27)

- Initial page load and URL stabilization use the same one-second debounce before model DOM automation starts.
- A ChatGPT URL change during that debounce resets the timer and replaces the pending initial reason with navigation, producing one read after the URL becomes stable.
- A URL change after a read has already started still queues one follow-up read, preserving real project or conversation navigation handling.
- The DOM1 -> DOM2 -> DOM3 -> DOM2 read sequence and Bridge publication are unchanged.

## Coalesce navigation during the first successful read (2026-09-27)

- The first successful model-state read establishes the final initial ChatGPT URL.
- URL changes, pending navigation timers, and queued navigation flags created while that first read is running are absorbed into the successful initial result.
- After the first successful read, later URL changes continue to schedule normal navigation reads.
- A failed first read does not mark initialization complete and does not discard a queued retry opportunity.
- The content script logs `MODEL_STATE_NAVIGATION_COALESCED` when the initial navigation work has been absorbed.

## Read effort from a combined composer-pill label (2026-09-27)

- ChatGPT may render the DOM1 trigger as a combined label such as `5.5 Medium` instead of only `Medium`.
- Effort parsing accepts an exact label or a complete effort suffix, checking longer labels first so `Extra High` is not reduced to `High`.
- After DOM3 identifies the model, DOM2 verification restricts trigger and label parsing to the reasoning levels supported by that model.
- The read flow still returns only after DOM2 verification and then publishes the complete `{model, effort}` state to MyTool.

## Check and synchronize button flow (2026-09-27)

- The MyTool button first compares its selected model and effort with the latest live state published by ChatGPT.
- An exact match completes locally without creating a job or opening the ChatGPT model picker.
- A mismatch or missing live state creates one sync_model job and runs DOM1 -> DOM2 -> DOM3 -> DOM2 -> close.
- The sync flow logs each transition and pauses one second after visible UI changes.
- DOM3 changes the model only when the checked row differs. DOM2 changes reasoning effort only when the verified value differs.
- The final model and effort are verified before the menu closes.
- A successful synchronization publishes the final {model, effort} state to Bridge before the job is marked completed, then MyTool refreshes its connection state.
- The synchronization flow never writes or sends a prompt and is not automatically retried after a website-side mutation.

## ARIA reasoning-slider fallback (2026-09-27)

- DOM2 first uses the known reasoning-slider container selector.
- If that container changed, MyTool accepts exactly one active `role=slider` thumb in the current popup and derives its interaction container.
- Keyboard changes rely on validated `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`; slider tick elements are not required for keyboard interaction.
- Tick clicking remains a fallback only when the target tick is present and enabled.
- The live composer-pill label participates in effort verification after a change instead of always returning the cached initial label.
- Missing, ambiguous, or structurally invalid sliders report `MODEL_PICKER_FAILED`, not an incorrect unsupported-model result.

## Delayed and expanded effort-control discovery (2026-09-27)

- After returning to DOM2, synchronization waits up to five seconds for the effort control to render.
- A unique active control may be a `role=slider`, an `input[type=range]`, or an element exposing all three ARIA value attributes.
- Native range inputs may provide min, max, and current value through DOM properties instead of explicit ARIA attributes.
- Duplicate matches are deduplicated; more than one distinct candidate remains an unsafe ambiguity and is not clicked.
- `MODEL_PICKER_FAILED` is a supported wire error in both the extension and Bridge, so MyTool receives the real failure message.

## Stabilize the actual DOM2 Power slider (2026-09-27)

- The confirmed DOM2 control is a `role=menuitem` named `Power` with `ArrowLeft ArrowRight` keyboard shortcuts.
- Its semantic thumb uses `role=slider`, min 0, max 3, and integer values for Instant, Medium, High, and Extra High.
- After a model change, MyTool waits up to five seconds for all slider values to become structurally valid instead of accepting the first partially rendered element.
- Effort is read again after stabilization; if the requested point is already active, no keyboard or pointer action is sent.
- Before keyboard interaction, a known target tick is checked for its locked state.
- After arrow interaction, MyTool waits for both the semantic value and visible effort label before falling back to a tick click.
- A stabilization failure reports only bounded slider metadata: min, max, value, and tick count.

## Change effort through the DOM2 Power control (2026-09-27)

- DOM2 binds keyboard interaction to the visible `role=menuitem` named `Power`; the nested semantic thumb is `aria-hidden` and has `tabindex=-1`.
- `aria-valuenow` is the authoritative current value while a structurally valid slider is present: 0 Instant, 1 Medium, 2 High, and 3 Extra High.
- A cached composer-pill label cannot confirm a requested effort when DOM2 exposes a stale or contradictory slider value.
- Synchronization sends ArrowLeft or ArrowRight to the Power menuitem and waits for the semantic value after every step.
- Clicking an enabled target tick remains a fallback when the advertised keyboard interaction does not change the value.
- Success requires the final slider value and visible DOM2 effort label to agree before the picker closes.
- The slider's live minimum and maximum define which standard effort positions are available for the current account; synchronization does not require every catalog level to exist.
- A requested position outside that live range, or a known locked target point, is reported as unavailable for the selected model in the account.

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

## Đọc trạng thái model trước khi so sánh (2026-09-27)

- `chatgpt_models.js` cung cấp `readChatGPTModelState()` để chỉ đọc model và mức suy luận hiện tại.
- Chuỗi đọc dùng chung là DOM1 -> DOM2 đọc effort -> DOM3 đọc model `aria-checked=true` -> click lại model checked để về DOM2 -> xác nhận effort -> đóng menu.
- Luồng đọc không bấm model option, không điều chỉnh slider, không ghi hoặc gửi prompt.
- Popup được ưu tiên nhận diện qua `aria-controls`, sau đó `aria-labelledby`, selector đã biết và cuối cùng là một ứng viên cấu trúc duy nhất.
- `ChatGPTProvider.getModelState()` là cổng dùng chung cho logic kiểm tra lúc tải lại và nút kiểm tra/đồng bộ ở các bước sau.
- Khi content script được nạp, kết quả được ghi ở Console dưới nhãn `[MyTool][MODEL_STATE]`; lỗi dùng `[MyTool][MODEL_STATE_ERROR]`.
- Content script chờ tối đa 20 giây và thử lại mỗi 250 ms khi composer chưa render; chỉ bắt đầu DOM1 sau khi provider sẵn sàng.
- Khi DOM1 không nhận diện được trigger, Console ghi tối đa 12 button gần composer với metadata giới hạn: tag, text nút rút gọn, aria-label, aria-haspopup, aria-expanded, data-testid và disabled. Không ghi composer, hội thoại hoặc toàn bộ HTML.
- Lỗi DOM1 phân biệt `DOM1_TRIGGER_NOT_FOUND` và `DOM1_TRIGGER_DISABLED`; các ứng viên chưa xác định không được click.
- DOM1 ưu tiên `button[aria-label="Select ChatGPT model"][aria-haspopup="menu"]`; biến thể không có aria-label dùng `button.__composer-pill[aria-haspopup="menu"][data-tone="neutral"][aria-expanded][data-state]`. Không dùng ID Radix vì ID thay đổi theo phiên.
- Sau khi composer sẵn sàng, bộ đọc vẫn chờ riêng DOM1 tối đa 20 giây và kiểm tra lại mỗi 100 ms; không kết luận thiếu trigger khi pill còn đang render.
- Sau click DOM1 vẫn phải xác nhận DOM2 xuất hiện. DOM2 mở `Select model`, DOM3 đọc model có `aria-checked=true`, sau đó quay lại DOM2 đọc mức suy luận và đóng panel.
- Control `Select model` của DOM2 là `[role=menuitem][aria-label="Select model"]`. Kích hoạt theo thứ tự click, pointerdown/pointerup, rồi Enter; dừng ngay khi advanced view DOM3 trở thành visible để tránh toggle hai lần.
- Từ DOM3 quay về DOM2 bằng cách kích hoạt đúng một dòng `[role=menuitemradio][aria-checked=true]`; thử click, pointerdown/pointerup rồi Enter và dừng ngay khi simple view visible. Không đóng/mở lại popup và không chọn dòng model khác.
- Luồng đọc và luồng đổi model dùng chung các bước chuyển DOM2/DOM3; không đọc model từ advanced view ẩn để thay thế thao tác UI.
- Sau mỗi thay đổi UI (mở DOM2, mở DOM3, quay lại DOM2, đóng menu) có khoảng quan sát 1 giây. DOM2 -> DOM3 và DOM3 -> DOM2 dùng pointer/mouse đầy đủ có tọa độ, sau đó fallback phím điều hướng nếu giao diện chưa chuyển.
- Việc không tìm thấy `[data-max-effort]` ở DOM2 không được chặn mở DOM3; text của pill DOM1 (ví dụ `Instant`) là fallback effort và được xác minh lại sau khi quay về DOM2.
- Xác nhận DOM3 bằng ít nhất một dòng model radio đang visible, không chỉ dựa vào wrapper advanced view. Xác nhận quay về DOM2 bằng simple view, `Select model` hoặc effort slider đang visible. Effort trên pill DOM1 được lưu trước khi mở menu vì text trigger có thể đổi trong lúc popup mở.
- Content script so sánh `location.href` mỗi 500 ms. Khi URL project hoặc cuộc thoại thay đổi, debounce 1 giây rồi đọc lại trạng thái; reload document vẫn dùng lượt `initial-load`.
- Các lượt đọc model không chạy song song. Nếu navigation xảy ra khi một lượt đang chạy, chỉ xếp một lượt `queued-navigation` sau khi lượt hiện tại kết thúc.
- Lượt đọc hiện chuyển trạng thái mới nhất về MyTool để so sánh; Step 1 có default GPT-5.5 / Medium và hệ thống chưa tự thay đổi model.
