export const step1 = {
  id: "step1",
  label: "Step 1",
  inputTitle: "2. Câu hỏi và trạng thái",
  outputTitle: "3. Câu trả lời",
  inputHtml: `
    <section id="chatgpt-compose">
      <form id="form">
        <label for="message">Ô 1 — Cuộc trò chuyện mới</label>
        <textarea id="message" required placeholder="Nhập câu hỏi để tạo cuộc trò chuyện mới..."></textarea>
        <div class="actions"><button id="send" class="primary" type="submit">Gửi vào cuộc trò chuyện mới</button></div>
      </form>
      <form id="continue-form" class="conversation-form">
        <label for="continue-message">Ô 2 — Tiếp tục cuộc trò chuyện</label>
        <textarea id="continue-message" required placeholder="Nhập câu hỏi tiếp theo..."></textarea>
        <div class="actions"><button id="continue-send" class="primary" type="submit">Gửi tiếp cuộc trò chuyện</button></div>
      </form>
      <div id="conversation-status" class="notice" role="status">Ô 2 tiếp tục nếu tab ChatGPT hiện tại thuộc project đã chọn; nếu không, ChatGPT sẽ mở project trước khi gửi.</div>
      <div class="status-card"><strong>Trạng thái</strong><p id="status" role="status">Sẵn sàng</p><p id="job"></p></div>
    </section>
    <section id="claude-compose" hidden>
      <label for="claude-message">Nội dung câu hỏi</label>
      <textarea id="claude-message" disabled placeholder="Chưa kết nối Claude"></textarea>
      <div class="actions"><button class="primary" type="button" disabled>Check Connect / Gửi câu hỏi</button></div>
      <div class="status-card"><strong>Trạng thái</strong><p id="claude-status" role="status">Claude chưa kết nối</p></div>
    </section>`,
  outputHtml: `
    <div class="step-output-content">
      <div id="chatgpt-output"><div id="answer" aria-live="polite"></div></div>
      <div id="claude-output" hidden><p class="answer-placeholder">Câu trả lời của Claude sẽ xuất hiện ở đây khi kết nối được triển khai.</p></div>
    </div>
    <div class="output-save-row">
      <label class="visually-hidden" for="step1-output-name">Tên file kết quả</label>
      <input id="step1-output-name" type="text" placeholder="Để trống: step1_currenttime">
      <button id="step1-save-output" class="secondary" type="button">Lưu kết quả</button>
    </div>`,
  mount({input, pollConnection, runJob, selectedProjectFields}) {
    input.querySelector("#form").addEventListener("submit", event => {
      event.preventDefault();
      void pollConnection();
      const payload = {action:"prompt", content:input.querySelector("#message").value.trim(),
        conversation_mode:"new", ...selectedProjectFields()};
      input.querySelector("#conversation-status").textContent = "Ô 1 đang mở project và tạo cuộc trò chuyện mới...";
      void runJob(payload);
    });
    input.querySelector("#continue-form").addEventListener("submit", event => {
      event.preventDefault();
      void pollConnection();
      const payload = {action:"prompt", content:input.querySelector("#continue-message").value.trim(),
        conversation_mode:"continue", ...selectedProjectFields()};
      input.querySelector("#conversation-status").textContent = "Ô 2 đang kiểm tra URL hiện tại trước khi gửi...";
      void runJob(payload);
    });
  }
};
