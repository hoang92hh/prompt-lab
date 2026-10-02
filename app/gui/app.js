import {stepCatalog} from "./steps/index.js";
import {AI_PROVIDER_CONFIG} from "./config/ai_defaults.js";

const $ = selector => document.querySelector(selector);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let active = false;
let projects = [];
const mytoolSessionId = crypto.randomUUID();
let lastExtensionSessionId = null;
let connectionPollRunning = false;
let activeWarningKind = null;
let activeWarningKey = null;
let dismissedWarningKey = null;
let latestModelState = null;
let latestModelStateKey = null;
let modelComparisonRevision = 0;
let activeStepId = null;
let activeProvider = "chatgpt";
let modelControlsReady = false;
let projectControlsReady = false;
let projectLoadRevision = 0;
let projectInstructionsFile = null;
const MAX_PROJECT_INSTRUCTIONS_FILE_BYTES = 750 * 1024;
let projectConfigBundle = null;
const PROJECT_CONFIG_FILE_NAMES = ["INSTRUCTIONS.md", "AGENTS.md", "SKILL.md"];
const MAX_PROJECT_CONFIG_BYTES = 750 * 1024;

function renderStepShells() {
  const switcher = $("#step-switcher");
  const inputHost = $("#step-input-host");
  const outputHost = $("#step-output-host");
  for (const step of stepCatalog) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.step = step.id;
    button.textContent = step.label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => selectStep(step.id));
    switcher.append(button);

    const input = document.createElement("section");
    input.id = step.id + "-input";
    input.dataset.stepInput = step.id;
    input.innerHTML = step.inputHtml;
    input.hidden = true;
    inputHost.append(input);

    const output = document.createElement("section");
    output.id = step.id + "-output";
    output.dataset.stepOutput = step.id;
    output.innerHTML = step.outputHtml;
    output.hidden = true;
    outputHost.append(output);
  }
}

function selectStep(stepId) {
  const step = stepCatalog.find(item => item.id === stepId);
  if (!step) return;
  activeStepId = stepId;
  for (const panel of document.querySelectorAll("[data-step-input], [data-step-output]")) {
    panel.hidden = panel.dataset.stepInput !== stepId && panel.dataset.stepOutput !== stepId;
  }
  for (const button of $("#step-switcher").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.step === stepId));
  }
  $("#question-title").textContent = step.inputTitle;
  $("#response-title").textContent = step.outputTitle;
  if (modelControlsReady) {
    modelComparisonRevision += 1;
    applyStepModelDefaults(activeProvider, step.id);
  }
  if (projectControlsReady) void loadProjects("", activeProvider, step.id);
}

renderStepShells();
selectStep(stepCatalog[0].id);

for (const provider of ["chatgpt","claude"]) {
  $("#tab-" + provider).addEventListener("click", () => {
    activeProvider = provider;
    for (const name of ["chatgpt","claude"]) {
      for (const part of [name, name + "-compose", name + "-output"]) $("#" + part).hidden = name !== provider;
      $("#tab-" + name).setAttribute("aria-selected", String(name === provider));
    }
    const label = provider === "chatgpt" ? "ChatGPT" : "Claude";
    $("#question-provider").textContent = label;
    $("#response-provider").textContent = label;
    if (modelControlsReady) {
      modelComparisonRevision += 1;
      applyStepModelDefaults(provider, activeStepId);
    }
    if (projectControlsReady) void loadProjects("", provider, activeStepId);
  });
}

async function api(path, options) {
  const response = await fetch(path, {cache:"no-store", ...options});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error + ": " + data.message);
  return data;
}

function showConnectionWarning(message, kind = "connection", key = kind + ":" + message) {
  if (dismissedWarningKey === key) return;
  activeWarningKind = kind;
  activeWarningKey = key;
  $("#connection-warning-message").textContent = message;
  $("#connection-warning").hidden = false;
}

function clearConnectionWarning(kind = null) {
  if (kind && activeWarningKind !== kind) return;
  $("#connection-warning").hidden = true;
  $("#connection-warning-message").textContent = "";
  activeWarningKind = null;
  activeWarningKey = null;
}

$("#connection-warning-close").addEventListener("click", () => {
  dismissedWarningKey = activeWarningKey;
  clearConnectionWarning();
});

function renderModelComparison() {
  if (!latestModelState) return;
  const actual = latestModelState.model + " / " + latestModelState.effort;
  const expectedModel = $("#model").value;
  const expectedEffort = $("#effort").value;
  if (!expectedModel || !expectedEffort) {
    $("#model-check").textContent = "ChatGPT hi\u1ec7n t\u1ea1i: " + actual + ". Ch\u1ecdn model v\u00e0 m\u1ee9c suy lu\u1eadn trong MyTool \u0111\u1ec3 so s\u00e1nh.";
    clearConnectionWarning("model-mismatch");
    return;
  }
  const expected = expectedModel + " / " + expectedEffort;
  if (expectedModel === latestModelState.model && expectedEffort === latestModelState.effort) {
    $("#model-check").textContent = "\u0110\u00e3 kh\u1edbp: " + actual;
    clearConnectionWarning("model-mismatch");
    return;
  }
  $("#model-check").textContent = "Ch\u01b0a kh\u1edbp. ChatGPT: " + actual + " | MyTool: " + expected;
  const warningKey = [
    "model-mismatch",
    activeStepId || "",
    modelComparisonRevision,
    latestModelState.updated_at || "",
    actual,
    expected,
  ].join(":");
  showConnectionWarning(
    "Model ch\u01b0a \u0111\u1ed3ng b\u1ed9. ChatGPT \u0111ang d\u00f9ng " + actual + ", MyTool \u0111ang ch\u1ecdn " + expected +
    ". H\u00e3y d\u00f9ng Ki\u1ec3m tra / \u0111\u1ed3ng b\u1ed9 model n\u1ebfu mu\u1ed1n \u0111i\u1ec1u ch\u1ec9nh.",
    "model-mismatch",
    warningKey
  );
}

function readConnectionState(state) {
  if (state.mytool_session_id && state.mytool_session_id !== mytoolSessionId) {
    showConnectionWarning("Một phiên MyTool khác vừa được tải lại. Trạng thái model có thể không còn đồng bộ; hãy dùng “Kiểm tra / đồng bộ model” nếu cần.");
  }
  if (state.extension_session_id) {
    if (lastExtensionSessionId && lastExtensionSessionId !== state.extension_session_id) {
      showConnectionWarning("Extension vừa được tải lại. Trạng thái model có thể không còn đồng bộ; hãy dùng “Kiểm tra / đồng bộ model” nếu cần.");
    }
    lastExtensionSessionId = state.extension_session_id;
  }
  if (state.extension_connected && state.model_state
      && typeof state.model_state.model === "string"
      && typeof state.model_state.effort === "string") {
    const stateKey = [
      state.model_state.model,
      state.model_state.effort,
      state.model_state.updated_at || "",
    ].join(":");
    if (stateKey !== latestModelStateKey) {
      latestModelStateKey = stateKey;
      modelComparisonRevision += 1;
    }
    latestModelState = state.model_state;
    renderModelComparison();
  } else if (!state.extension_connected) {
    latestModelState = null;
    latestModelStateKey = null;
    clearConnectionWarning("model-mismatch");
  }
}

async function registerMytoolSession() {
  const state = await api("/api/connection/mytool", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({session_id:mytoolSessionId})
  });
  if (state.mytool_changed) {
    showConnectionWarning("MyTool vừa được tải lại. Trạng thái model có thể không còn đồng bộ; hãy dùng “Kiểm tra / đồng bộ model” nếu cần.");
  }
  readConnectionState(state);
}

async function pollConnection() {
  if (connectionPollRunning) return;
  connectionPollRunning = true;
  try {
    readConnectionState(await api("/api/connection"));
  } catch (error) {
    showConnectionWarning("Không đọc được trạng thái extension: " + error.message + ". Việc gửi prompt vẫn không bị chặn.");
  } finally {
    connectionPollRunning = false;
  }
}

function projectControls(provider) {
  if (provider === "chatgpt") {
    return {select:$("#project"), deleteButton:$("#delete-project")};
  }
  if (provider === "claude") {
    return {select:$("#claude-project"), deleteButton:null};
  }
  return null;
}

function projectMatchesScope(project, provider = activeProvider, stepId = activeStepId) {
  return project.provider === provider && (project.step_id === "*" || project.step_id === stepId);
}

function updateProjectActions() {
  const controls = projectControls("chatgpt");
  if (!controls?.deleteButton) return;
  const selected = projects.find(project => project.provider === "chatgpt"
    && project.id === controls.select.value && projectMatchesScope(project, "chatgpt", activeStepId));
  controls.deleteButton.disabled = active || activeProvider !== "chatgpt" || !selected;
  $("#choose-project-instructions").disabled = active || activeProvider !== "chatgpt";
  $("#upload-project-instructions").disabled = active || activeProvider !== "chatgpt"
    || !selected || !projectInstructionsFile;
  $("#choose-project-config-folder").disabled = active || activeProvider !== "chatgpt";
  $("#apply-project-config").disabled = active || activeProvider !== "chatgpt"
    || !selected || !projectConfigBundle;
}

async function loadProjects(selectId = "", provider = activeProvider, stepId = activeStepId) {
  const revision = ++projectLoadRevision;
  const loaded = (await api("/api/projects")).projects;
  if (revision !== projectLoadRevision) return;
  projects = loaded;
  const controls = projectControls(provider);
  if (!controls?.select) return;
  const current = selectId || controls.select.value;
  const visible = projects.filter(project => projectMatchesScope(project, provider, stepId));
  controls.select.replaceChildren(new Option("Không dùng project", ""));
  for (const project of visible) controls.select.add(new Option(project.name, project.id));
  if (visible.some(project => project.id === current)) controls.select.value = current;
  updateProjectActions();
}

async function runJob(payload, onSuccess = null, onFailure = null) {
  if (active) return;
  active = true;
  $("#send").disabled = true;
  $("#continue-send").disabled = true;
  $("#create-project").disabled = true;
  $("#check-model").disabled = true;
  for (const id of ["model", "effort", "project", "check-project", "delete-project",
    "choose-project-instructions", "upload-project-instructions", "project-instructions-file",
    "choose-project-config-folder", "apply-project-config", "project-config-folder"]) {
    $("#" + id).disabled = true;
  }
  if (payload.action !== "sync_model") $("#answer").textContent = "";
  const id = "mytool-" + crypto.randomUUID();
  $("#job").textContent = "Job ID: " + id;
  try {
    $("#status").textContent = "Đang gửi tới Bridge...";
    await api("/api/jobs", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({job_id:id, provider:"chatgpt", options:{}, ...payload})
    });
    const deadline = Date.now() + (payload.action === "configure_project_from_folder" ? 450000 : 240000);
    while (Date.now() < deadline) {
      const record = await api("/api/jobs/" + encodeURIComponent(id));
      $("#status").textContent = "Trạng thái: " + record.status;
      if (record.status === "completed") {
        if (onSuccess) { onSuccess(record.result); return; }
        if (record.result.project) {
          await loadProjects(record.result.project.id);
          $("#project-name").value = "";
          $("#project-check").textContent = "Đã lưu project: " + record.result.project.name + " (" + record.result.project.id + ")";
          $("#answer").textContent = "Đã tạo project trên ChatGPT: " + record.result.project.name;
        } else $("#answer").textContent = record.result.text;
        return;
      }
      if (record.status === "error") {
        const message = record.result.error === "UNSUPPORTED_MODEL"
          ? "Model " + (payload.model || "") + " / " + (payload.effort || "") +
            " không khả dụng trong tài khoản ChatGPT đang đăng nhập. " + record.result.message
          : record.result.error + ": " + record.result.message;
        if (onFailure) onFailure(message);
        else $("#answer").textContent = message;
        return;
      }
      await pause(1000);
    }
    $("#status").textContent = "Hết thời gian chờ; kiểm tra job trước khi gửi lại.";
    if (onFailure) onFailure($("#status").textContent);
  } catch (error) {
    $("#status").textContent = "Lỗi: " + error.message;
    if (onFailure) onFailure($("#status").textContent);
  } finally {
    active = false;
    $("#send").disabled = false;
    $("#continue-send").disabled = false;
    $("#create-project").disabled = false;
    for (const id of ["model", "project", "check-project"]) $("#" + id).disabled = false;
    $("#project-instructions-file").disabled = false;
    $("#project-config-folder").disabled = false;
    $("#effort").disabled = !$("#model").value;
    updateModelCheck();
    updateProjectActions();
  }
}

function selectedProjectFields() {
  const controls = projectControls(activeProvider);
  const project = projects.find(item => controls?.select && item.id === controls.select.value
    && projectMatchesScope(item));
  return project ? {project_id: project.id, project_url: project.url} : {};
}

function providerModelControls(provider) {
  const config = AI_PROVIDER_CONFIG[provider];
  if (!config) return null;
  return {
    config,
    modelSelect: $("#" + config.modelSelectId),
    effortSelect: $("#" + config.effortSelectId)
  };
}

function populateModelOptions(provider) {
  const controls = providerModelControls(provider);
  if (!controls?.modelSelect) return;
  controls.modelSelect.replaceChildren(new Option("Chọn model", ""));
  for (const model of Object.keys(controls.config.modelCatalog)) {
    controls.modelSelect.add(new Option(model, model));
  }
}

function populateEffortOptions(provider, model, selectedEffort = "") {
  const controls = providerModelControls(provider);
  if (!controls?.effortSelect) return;
  const levels = controls.config.modelCatalog[model] || [];
  controls.effortSelect.replaceChildren(new Option("Chọn mức suy luận", ""));
  for (const level of levels) controls.effortSelect.add(new Option(level, level));
  if (provider === "chatgpt") controls.effortSelect.disabled = levels.length === 0;
  if (levels.includes(selectedEffort)) controls.effortSelect.value = selectedEffort;
}

function applyStepModelDefaults(provider, stepId) {
  const controls = providerModelControls(provider);
  const defaults = controls?.config.stepDefaults[stepId];
  if (!controls?.modelSelect || !controls.effortSelect || !defaults) return;
  if (!controls.config.modelCatalog[defaults.model]?.includes(defaults.effort)) {
    console.warn("[MyTool][STEP_MODEL_DEFAULT_ERROR]", provider, stepId, defaults.model, defaults.effort);
    return;
  }
  controls.modelSelect.value = defaults.model;
  populateEffortOptions(provider, defaults.model, defaults.effort);
  if (provider === "chatgpt") {
    updateModelCheck();
    if (latestModelState) renderModelComparison();
  }
}

for (const provider of Object.keys(AI_PROVIDER_CONFIG)) populateModelOptions(provider);

$("#model").addEventListener("change", () => {
  populateEffortOptions("chatgpt", $("#model").value);
});

function updateModelCheck() {
  $("#check-model").disabled = active || !$("#model").value || !$("#effort").value;
}
for (const id of ["model", "effort", "project"]) {
  $("#" + id).addEventListener("change", () => {
    updateModelCheck();
    if (id === "project") return;
    modelComparisonRevision += 1;
    if (latestModelState) renderModelComparison();
    else $("#model-check").textContent = "L\u1ef1a ch\u1ecdn \u0111\u00e3 thay \u0111\u1ed5i. Ch\u01b0a nh\u1eadn \u0111\u01b0\u1ee3c tr\u1ea1ng th\u00e1i model t\u1eeb ChatGPT.";
  });
}
modelControlsReady = true;
applyStepModelDefaults(activeProvider, activeStepId);

$("#check-model").addEventListener("click", () => {
  if (active || !$("#model").value || !$("#effort").value) return;
  if (latestModelState
      && latestModelState.model === $("#model").value
      && latestModelState.effort === $("#effort").value) {
    renderModelComparison();
    return;
  }
  $("#model-check").textContent = "Đang kiểm tra và đồng bộ trên ChatGPT...";
  void runJob({action:"sync_model", content:"", model:$("#model").value,
    effort:$("#effort").value, ...selectedProjectFields()},
    result => {
      $("#model-check").textContent = result.text;
      clearConnectionWarning("model-mismatch");
      void pollConnection();
    },
    message => { $("#model-check").textContent = message; });
});

$("#check-project").addEventListener("click", async () => {
  const id = $("#project").value;
  $("#project-check").textContent = "Đang kiểm tra danh sách project đã lưu...";
  try {
    await loadProjects(id, "chatgpt", activeStepId);
    const project = projects.find(item => item.provider === "chatgpt" && item.id === id
      && projectMatchesScope(item, "chatgpt", activeStepId));
    $("#project-check").textContent = project
      ? "Đã lưu: " + project.name + " | Phạm vi: " + project.step_id + " | ID: " + project.id + " | URL: " + project.url
      : id ? "Project này không còn trong danh sách đã lưu." : "Chưa chọn project. Chọn một project để kiểm tra.";
  } catch (error) {
    $("#project-check").textContent = "Không kiểm tra được project: " + error.message;
  }
});
$("#project").addEventListener("change", () => {
  $("#project-check").textContent = "Nhấn Kiểm tra project để đọc thông tin đã lưu.";
  $("#conversation-status").textContent = "Ô 2 sẽ kiểm tra tab ChatGPT hiện tại với project vừa chọn trước khi gửi.";
  updateProjectActions();
});
$("#choose-project-instructions").addEventListener("click", () => {
  if (!active && activeProvider === "chatgpt") $("#project-instructions-file").click();
});
$("#project-instructions-file").addEventListener("change", async event => {
  const file = event.target.files?.[0] || null;
  projectInstructionsFile = null;
  $("#project-instructions-file-name").textContent = "Chưa chọn file";
  if (!file) { updateProjectActions(); return; }
  if (!/\.md$/i.test(file.name)) {
    $("#project-instructions-check").textContent = "File không hợp lệ. Hãy chọn file có đuôi .md.";
    event.target.value = "";
    updateProjectActions();
    return;
  }
  if (file.size > MAX_PROJECT_INSTRUCTIONS_FILE_BYTES) {
    $("#project-instructions-check").textContent = "File quá lớn. Giới hạn của MyTool là 750 KiB.";
    event.target.value = "";
    updateProjectActions();
    return;
  }
  try {
    const content = (await file.text()).replace(/^\uFEFF/, "");
    if (!content.trim()) throw new Error("File Markdown không có nội dung.");
    projectInstructionsFile = {name:file.name, size:file.size, content};
    $("#project-instructions-file-name").textContent = file.name + " (" + file.size + " bytes)";
    $("#project-instructions-check").textContent = "Đã đọc file. Nhấn Cập nhật chỉ dẫn để ghi đè Project instructions của project đang chọn.";
  } catch (error) {
    event.target.value = "";
    $("#project-instructions-check").textContent = "Không đọc được file: " + error.message;
  }
  updateProjectActions();
});
$("#upload-project-instructions").addEventListener("click", () => {
  const project = selectedProjectFields();
  if (active || !projectInstructionsFile || !project.project_id) {
    $("#project-instructions-check").textContent = "Hãy chọn project và file Markdown trước.";
    return;
  }
  $("#project-instructions-check").textContent = "Đang cập nhật Project instructions trên ChatGPT...";
  void runJob({action:"update_project_instructions", content:projectInstructionsFile.content, ...project},
    result => {
      $("#project-instructions-check").textContent = result.text;
      $("#answer").textContent = result.text;
    },
    message => { $("#project-instructions-check").textContent = message; });
});
function resetProjectConfigBundle() {
  projectConfigBundle = null;
  $("#project-config-folder-name").textContent = "Chưa chọn folder";
  for (const name of PROJECT_CONFIG_FILE_NAMES) {
    const row = document.querySelector('[data-config-file="' + name + '"]');
    row.dataset.ready = "false";
    row.textContent = "○ " + name;
  }
}

$("#choose-project-config-folder").addEventListener("click", () => {
  if (active || activeProvider !== "chatgpt") return;
  $("#project-config-folder").value = "";
  $("#project-config-folder").click();
});

$("#project-config-folder").addEventListener("change", async event => {
  const files = [...(event.target.files || [])];
  resetProjectConfigBundle();
  if (!files.length) { updateProjectActions(); return; }
  try {
    if (files.length !== PROJECT_CONFIG_FILE_NAMES.length) {
      throw new Error("Folder phải chứa đúng ba file bắt buộc và không có file khác.");
    }
    const paths = files.map(file => (file.webkitRelativePath || "").split("/").filter(Boolean));
    if (paths.some(parts => parts.length !== 2) || new Set(paths.map(parts => parts[0])).size !== 1) {
      throw new Error("Ba file phải nằm trực tiếp trong cùng một folder.");
    }
    const byName = new Map(files.map(file => [file.name, file]));
    if (byName.size !== PROJECT_CONFIG_FILE_NAMES.length
        || PROJECT_CONFIG_FILE_NAMES.some(name => !byName.has(name))) {
      throw new Error("Folder phải có đúng INSTRUCTIONS.md, AGENTS.md và SKILL.md.");
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_PROJECT_CONFIG_BYTES) {
      throw new Error("Tổng dung lượng ba file vượt quá 750 KiB.");
    }
    const contents = {};
    for (const name of PROJECT_CONFIG_FILE_NAMES) {
      const content = (await byName.get(name).text()).replace(/^\uFEFF/, "");
      if (!content.trim()) throw new Error(name + " không có nội dung.");
      contents[name] = content;
      const row = document.querySelector('[data-config-file="' + name + '"]');
      row.dataset.ready = "true";
      row.textContent = "✓ " + name + " (" + byName.get(name).size + " bytes)";
    }
    projectConfigBundle = {
      folderName:paths[0][0],
      instructions:contents["INSTRUCTIONS.md"],
      sourceFiles:[
        {name:"AGENTS.md", content:contents["AGENTS.md"]},
        {name:"SKILL.md", content:contents["SKILL.md"]},
      ],
    };
    $("#project-config-folder-name").textContent = projectConfigBundle.folderName;
    $("#project-config-check").textContent =
      "Folder hợp lệ. Khi áp dụng, AGENTS.md và SKILL.md cũ sẽ bị xóa trước khi upload bản mới.";
  } catch (error) {
    event.target.value = "";
    $("#project-config-check").textContent = "Folder không hợp lệ: " + error.message;
  }
  updateProjectActions();
});

$("#apply-project-config").addEventListener("click", () => {
  const project = selectedProjectFields();
  if (active || !projectConfigBundle || !project.project_id) {
    $("#project-config-check").textContent = "Hãy chọn project và folder cấu hình hợp lệ trước.";
    return;
  }
  if (!window.confirm("Thay thế AGENTS.md, SKILL.md và Project instructions của project đang chọn?")) return;
  $("#project-config-check").textContent = "Đang thay thế Sources và Project instructions trên ChatGPT...";
  void runJob({
    action:"configure_project_from_folder",
    content:projectConfigBundle.instructions,
    source_files:projectConfigBundle.sourceFiles,
    ...project,
  }, result => {
    $("#project-config-check").textContent = result.text;
    $("#answer").textContent = result.text;
  }, message => { $("#project-config-check").textContent = message; });
});
$("#delete-project").addEventListener("click", async () => {
  const project = projects.find(item => item.provider === "chatgpt" && item.id === $("#project").value
    && projectMatchesScope(item, "chatgpt", activeStepId));
  if (!project || active) return;
  const confirmed = window.confirm("Xóa “" + project.name + "” khỏi MyTool? Project thật trên ChatGPT sẽ không bị xóa.");
  if (!confirmed) return;
  $("#delete-project").disabled = true;
  $("#project-check").textContent = "Đang xóa project khỏi MyTool...";
  try {
    await api("/api/projects/chatgpt/" + encodeURIComponent(project.id), {method:"DELETE"});
    await loadProjects("", "chatgpt", activeStepId);
    $("#project-check").textContent = "Đã xóa khỏi MyTool: " + project.name + ". Project trên ChatGPT vẫn được giữ nguyên.";
  } catch (error) {
    $("#project-check").textContent = "Không xóa được project: " + error.message;
  } finally {
    updateProjectActions();
  }
});
$("#create-project").addEventListener("click", () => {
  const name = $("#project-name").value.trim();
  if (!name) { $("#status").textContent = "Nhập tên project trước."; return; }
  void runJob({action:"create_project", content:name, step_id:activeStepId});
});
for (const step of stepCatalog) {
  if (step.mount) {
    step.mount({
      input: $("#" + step.id + "-input"),
      output: $("#" + step.id + "-output"),
      api,
      pollConnection,
      runJob,
      selectedProjectFields
    });
  }
}
projectControlsReady = true;
loadProjects().catch(error => { $("#status").textContent = "Không đọc được project: " + error.message; });
registerMytoolSession().catch(error => {
  showConnectionWarning("Không đăng ký được phiên MyTool: " + error.message + ". Việc gửi prompt vẫn không bị chặn.");
});
setInterval(() => { void pollConnection(); }, 7000);
window.addEventListener("focus", () => { void pollConnection(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void pollConnection();
});
