export const step2 = {
  id: "step2",
  label: "Step 2",
  inputTitle: "2. Đầu vào Step 2",
  outputTitle: "3. Kết quả Step 2",
  inputHtml: `
    <p class="step-intro">Chọn một kết quả từ Step 1 để làm đầu vào cho Step 2. Phần đọc file sẽ được bổ sung khi phát triển chức năng của step.</p>
    <label for="step2-source">Ba kết quả Step 1 gần nhất</label>
    <div class="source-picker">
      <select id="step2-source" size="3" aria-label="Kết quả Step 1 gần nhất">
        <option>Chưa có kết quả Step 1</option>
      </select>
      <button class="secondary" type="button">Chọn file khác</button>
    </div>
    <label for="step2-message">Nội dung bổ sung cho Step 2</label>
    <textarea id="step2-message" placeholder="Nhập nội dung cho Step 2..."></textarea>
    <div class="actions"><button class="primary" type="button">Thực hiện Step 2</button></div>`,
  outputHtml: `
    <div class="step-placeholder">Kết quả của Step 2 sẽ xuất hiện tại đây. Giao diện và các thao tác output riêng sẽ được bổ sung cùng chức năng của Step 2.</div>`,
  mount() {}
};
