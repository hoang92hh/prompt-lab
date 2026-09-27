export const step2 = {
  id: "step2",
  label: "Step 2",
  inputTitle: "2. Đầu vào Step 2",
  outputTitle: "3. Kết quả Step 2",
  inputHtml: `
    <div class="step2-source-block">
      <p class="step-intro">Chọn một kết quả từ Step 1 để tạo cuộc trò chuyện mới, hoặc nhập nội dung riêng để tiếp tục cuộc trò chuyện đang mở.</p>
      <label for="step2-source">Ba kết quả Step 1 gần nhất</label>
      <div class="source-picker">
        <select id="step2-source" size="3" aria-label="Kết quả Step 1 gần nhất">
          <option>Chưa có kết quả Step 1</option>
        </select>
        <button id="step2-pick-file" class="secondary" type="button">Chọn file khác</button>
      </div>
      <input id="step2-file-input" type="file" accept=".json,application/json" hidden>
      <div id="step2-source-status" class="notice" role="status">Chọn một file Step 1 để đọc nội dung.</div>
    </div>
    <form id="step2-new-form" class="step2-compose-block">
      <label for="step2-new-message">Nội dung file — <span id="step2-source-title">chưa chọn file</span></label>
      <textarea id="step2-new-message" required placeholder="Nội dung file Step 1 sẽ xuất hiện tại đây và có thể chỉnh sửa."></textarea>
      <div class="actions"><button id="step2-new-send" class="primary" type="submit">Tạo cuộc trò chuyện mới</button></div>
    </form>
    <form id="step2-continue-form" class="step2-compose-block">
      <label for="step2-message">Nội dung tiếp tục cuộc trò chuyện</label>
      <textarea id="step2-message" required placeholder="Nhập nội dung tiếp theo cho Step 2..."></textarea>
      <div class="actions"><button id="step2-continue-send" class="primary" type="submit">Thực hiện Step 2</button></div>
    </form>
    <div id="step2-conversation-status" class="notice step2-input-status" role="status">Sẵn sàng.</div>`,
  outputHtml: `
    <div class="step-placeholder">Kết quả của Step 2 sẽ xuất hiện tại đây. Giao diện và các thao tác output riêng sẽ được bổ sung cùng chức năng của Step 2.</div>`,
  mount({input, output, api, pollConnection, runJob, selectedProjectFields}) {
    mountStep2Output(output, api);
    mountStep2Input({input, output, api, pollConnection, runJob, selectedProjectFields});
  }
};

function normalizeStep2Result(value) {
  if (typeof value === 'string') {
    let source = value.trim();
    const fenced = source.match(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i);
    value = JSON.parse(fenced ? fenced[1] : source);
  }
  if (!Array.isArray(value) && value && Array.isArray(value.items)) value = value.items;
  if (!Array.isArray(value)) {
    throw new Error('Kết quả Step 2 phải là một mảng JSON hoặc object có mảng items.');
  }
  return value.map((item, index) => {
    if (!item || typeof item.title !== 'string' || typeof item.content !== 'string') {
      throw new Error('Phần tử ' + (index + 1) + ' phải có title và content dạng chuỗi.');
    }
    return {title:item.title, content:item.content};
  });
}

function readStep1Section(value) {
  if (!value || !Array.isArray(value.sections) || value.sections.length !== 1) {
    throw new Error('File Step 1 phải có đúng một phần tử trong sections.');
  }
  const section = value.sections[0];
  if (!section || typeof section.title !== 'string' || typeof section.content !== 'string') {
    throw new Error('Phần tử Step 1 phải có title và content dạng chuỗi.');
  }
  return {title:section.title, content:section.content};
}

function mountStep2Input({input, output, api, pollConnection, runJob, selectedProjectFields}) {
  const source = input.querySelector('#step2-source');
  const pickFile = input.querySelector('#step2-pick-file');
  const fileInput = input.querySelector('#step2-file-input');
  const sourceStatus = input.querySelector('#step2-source-status');
  const sourceTitle = input.querySelector('#step2-source-title');
  const newForm = input.querySelector('#step2-new-form');
  const newMessage = input.querySelector('#step2-new-message');
  const newSend = input.querySelector('#step2-new-send');
  const continueForm = input.querySelector('#step2-continue-form');
  const continueMessage = input.querySelector('#step2-message');
  const continueSend = input.querySelector('#step2-continue-send');
  const conversationStatus = input.querySelector('#step2-conversation-status');
  let busy = false;
  let sourceLoaded = false;
  let loadingRecent = false;
  let storedFilename = null;

  const updateButtons = () => {
    newSend.disabled = busy || !sourceLoaded || !newMessage.value.trim();
    continueSend.disabled = busy || !continueMessage.value.trim();
    source.disabled = busy;
    pickFile.disabled = busy;
  };
  const applySource = (filename, value, stored = false) => {
    const section = readStep1Section(value);
    sourceLoaded = true;
    storedFilename = stored ? filename : null;
    sourceTitle.textContent = section.title || 'Không có tiêu đề';
    newMessage.value = section.content;
    sourceStatus.textContent = 'Đã chọn: ' + filename;
    updateButtons();
  };
  const showSourceError = error => {
    sourceLoaded = false;
    storedFilename = null;
    sourceTitle.textContent = 'chưa chọn file';
    newMessage.value = '';
    sourceStatus.textContent = 'Không đọc được file: ' + error.message;
    updateButtons();
  };
  const loadStoredFile = async filename => {
    sourceStatus.textContent = 'Đang đọc: ' + filename;
    try {
      const result = await api('/api/outputs/step1/' + encodeURIComponent(filename));
      applySource(result.filename, result.data, true);
    } catch (error) {
      showSourceError(error);
    }
  };
  const loadRecent = async loadFirst => {
    if (loadingRecent) return;
    loadingRecent = true;
    const selected = storedFilename;
    try {
      const result = await api('/api/outputs/step1');
      source.replaceChildren();
      if (!result.outputs.length) {
        const option = document.createElement('option');
        option.textContent = 'Chưa có kết quả Step 1';
        option.disabled = true;
        source.append(option);
        if (!sourceLoaded) sourceStatus.textContent = 'Chưa có file Step 1 để chọn.';
      } else {
        result.outputs.forEach(item => {
          const option = document.createElement('option');
          option.value = item.filename;
          option.textContent = item.filename;
          source.append(option);
        });
        if (result.outputs.some(item => item.filename === selected)) source.value = selected;
        else if (sourceLoaded) source.selectedIndex = -1;
        if (loadFirst && !sourceLoaded) await loadStoredFile(source.value);
      }
    } catch (error) {
      if (!sourceLoaded) sourceStatus.textContent = 'Không tải được danh sách file: ' + error.message;
    } finally {
      loadingRecent = false;
      updateButtons();
    }
  };

  source.addEventListener('change', () => {
    if (source.value) void loadStoredFile(source.value);
  });
  source.addEventListener('focus', () => {
    void loadRecent(false);
  });
  pickFile.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('File không được vượt quá 1 MiB.');
      applySource(file.name, JSON.parse(await file.text()), false);
      source.selectedIndex = -1;
    } catch (error) {
      showSourceError(error);
    }
  });
  newMessage.addEventListener('input', updateButtons);
  continueMessage.addEventListener('input', updateButtons);

  newForm.addEventListener('submit', event => {
    event.preventDefault();
    void submitPrompt('new', newMessage.value.trim());
  });
  continueForm.addEventListener('submit', event => {
    event.preventDefault();
    void submitPrompt('continue', continueMessage.value.trim());
  });

  async function submitPrompt(mode, content) {
    if (busy || !content) return;
    busy = true;
    updateButtons();
    void pollConnection();
    conversationStatus.textContent = mode === 'new'
      ? 'Đang tạo cuộc trò chuyện mới từ nội dung file...'
      : 'Đang gửi tiếp vào cuộc trò chuyện hiện tại...';
    try {
      await runJob(
        {action:'prompt', content, conversation_mode:mode, ...selectedProjectFields()},
        result => {
          output.renderResult(result.text);
          conversationStatus.textContent = 'Đã nhận kết quả Step 2.';
        },
        message => {
          conversationStatus.textContent = message;
        }
      );
    } finally {
      busy = false;
      updateButtons();
    }
  }

  updateButtons();
  void loadRecent(true);
}

function mountStep2Output(output, api) {
  const list = document.createElement('div');
  const placeholder = document.createElement('div');
  const saveRow = document.createElement('div');
  const name = document.createElement('input');
  const button = document.createElement('button');
  const status = document.createElement('p');
  list.id = 'step2-result-list';
  list.className = 'step2-result-list';
  list.setAttribute('aria-live', 'polite');
  placeholder.className = 'step-placeholder';
  placeholder.textContent = 'Kết quả của Step 2 sẽ xuất hiện tại đây.';
  list.append(placeholder);
  saveRow.className = 'output-save-row';
  name.id = 'step2-output-name';
  name.type = 'text';
  name.placeholder = 'Để trống: step2_currenttime';
  name.setAttribute('aria-label', 'Tên file kết quả');
  button.id = 'step2-save-output';
  button.className = 'secondary';
  button.type = 'button';
  button.disabled = true;
  button.textContent = 'Lưu kết quả';
  saveRow.append(name, button);
  status.id = 'step2-save-status';
  status.className = 'output-save-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  output.replaceChildren(list, saveRow, status);

  let sections = [], saving = false, saved = false;
  const updateButton = () => {
    button.disabled = saving || saved || sections.length === 0;
  };
  const showMessage = (message, error = false) => {
    const element = document.createElement('div');
    element.className = 'step-placeholder' + (error ? ' step2-result-error' : '');
    element.textContent = message;
    list.replaceChildren(element);
  };
  const renderResult = value => {
    try {
      sections = normalizeStep2Result(value);
      list.replaceChildren();
      if (!sections.length) {
        showMessage('Kết quả Step 2 không có phần tử nào.');
      } else {
        sections.forEach((section, index) => {
          const block = document.createElement('article');
          const title = document.createElement('h3');
          const content = document.createElement('div');
          block.className = 'step2-result-block';
          title.textContent = section.title || 'Kết quả ' + (index + 1);
          content.className = 'step2-result-content';
          content.textContent = section.content;
          block.append(title, content);
          list.append(block);
        });
      }
      saved = false;
      status.textContent = '';
    } catch (error) {
      sections = [];
      saved = false;
      status.textContent = '';
      showMessage('Không đọc được kết quả Step 2: ' + error.message, true);
    }
    updateButton();
  };

  output.addEventListener('step2-result', event => renderResult(event.detail));
  output.renderResult = renderResult;
  button.addEventListener('click', () => saveStep2Output());

  async function saveStep2Output() {
    if (!sections.length) return;
    const snapshot = sections.map(section => ({...section}));
    saving = true;
    updateButton();
    status.textContent = 'Đang lưu...';
    try {
      const result = await api('/api/outputs/step2', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name.value.trim(), sections:snapshot})
      });
      saved = sections.length === snapshot.length && sections.every((section, index) =>
        section.title === snapshot[index].title && section.content === snapshot[index].content);
      status.textContent = saved
        ? 'Đã lưu: ' + result.filename
        : 'Đã lưu kết quả trước; kết quả mới chưa được lưu.';
    } catch (error) {
      saved = false;
      status.textContent = 'Không lưu được: ' + error.message;
    } finally {
      saving = false;
      updateButton();
    }
  }
}
