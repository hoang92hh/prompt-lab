export const step3 = {
  id: "step3",
  label: "Step 3",
  inputTitle: "2. Đầu vào Step 3",
  outputTitle: "3. Kết quả Step 3",
  inputHtml: `
    <p class="step-intro">Chọn một kết quả từ Step 2 để làm đầu vào cho Step 3. Phần đọc file sẽ được bổ sung khi phát triển chức năng của step.</p>
    <label for="step3-source">Ba kết quả Step 2 gần nhất</label>
    <div class="source-picker">
      <select id="step3-source" size="3" aria-label="Kết quả Step 2 gần nhất">
        <option>Chưa có kết quả Step 2</option>
      </select>
      <button class="secondary" type="button">Chọn file khác</button>
    </div>
    <label for="step3-message">Nội dung bổ sung cho Step 3</label>
    <textarea id="step3-message" placeholder="Nhập nội dung cho Step 3..."></textarea>
    <div class="actions"><button class="primary" type="button">Thực hiện Step 3</button></div>`,
  outputHtml: `
    <div class="step-placeholder">Kết quả của Step 3 sẽ xuất hiện tại đây. Giao diện và các thao tác output riêng sẽ được bổ sung cùng chức năng của Step 3.</div>`,
  mount() {}
};
