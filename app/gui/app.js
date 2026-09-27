import {stepCatalog} from "./steps/index.js";

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
let modelControlsReady = false;

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
    applyStepModelDefaults(step);
    if (!step.defaultModel && latestModelState) renderModelComparison();
  }
}

renderStepShells();
selectStep(stepCatalog[0].id);

for (const provider of ["chatgpt","claude"]) {
  $("#tab-" + provider).addEventListener("click", () => {
    for (const name of ["chatgpt","claude"]) {
      for (const part of [name, name + "-compose", name + "-output"]) $("#" + part).hidden = name !== provider;
      $("#tab-" + name).setAttribute("aria-selected", String(name === provider));
    }
    const label = provider === "chatgpt" ? "ChatGPT" : "Claude";
    $("#question-provider").textContent = label;
    $("#response-provider").textContent = label;
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

async function loadProjects(selectId = "") {
  projects = (await api("/api/projects")).projects;
  const select = $("#project");
  const current = selectId || select.value;
  select.replaceChildren(new Option("Không dùng project", ""));
  for (const project of projects) select.add(new Option(project.name, project.id));
  if (projects.some(project => project.id === current)) select.value = current;
}

async function runJob(payload, onSuccess = null, onFailure = null) {
  if (active) return;
  active = true;
  $("#send").disabled = true;
  $("#continue-send").disabled = true;
  $("#create-project").disabled = true;
  $("#check-model").disabled = true;
  for (const id of ["model", "effort", "project", "check-project"]) $("#" + id).disabled = true;
  if (payload.action !== "sync_model") $("#answer").textContent = "";
  const id = "mytool-" + crypto.randomUUID();
  $("#job").textContent = "Job ID: " + id;
  try {
    $("#status").textContent = "Đang gửi tới Bridge...";
    await api("/api/jobs", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({job_id:id, provider:"chatgpt", options:{}, ...payload})
    });
    const deadline = Date.now() + 240000;
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
    $("#effort").disabled = !$("#model").value;
    updateModelCheck();
  }
}

function selectedProjectFields() {
  const project = projects.find(item => item.id === $("#project").value);
  return project ? {project_id: project.id, project_url: project.url} : {};
}

const modelCatalog = {
  "GPT-5.5": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.5 Pro": ["Pro Standard", "Pro Extended"],
  "GPT-5.6 Luna": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Terra": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Sol": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Sol Pro": ["Pro"],
  "GPT-6 Pro": ["Pro"]
};
for (const model of Object.keys(modelCatalog)) $("#model").add(new Option(model, model));

function populateEffortOptions(model, selectedEffort = "") {
  const levels = modelCatalog[model] || [];
  $("#effort").replaceChildren(new Option("Chọn mức suy luận", ""));
  for (const level of levels) $("#effort").add(new Option(level, level));
  $("#effort").disabled = levels.length === 0;
  if (levels.includes(selectedEffort)) $("#effort").value = selectedEffort;
}

function applyStepModelDefaults(step) {
  if (!step?.defaultModel || !step?.defaultEffort) return;
  if (!modelCatalog[step.defaultModel]?.includes(step.defaultEffort)) {
    console.warn("[MyTool][STEP_MODEL_DEFAULT_ERROR]", step.id, step.defaultModel, step.defaultEffort);
    return;
  }
  $("#model").value = step.defaultModel;
  populateEffortOptions(step.defaultModel, step.defaultEffort);
  updateModelCheck();
  if (latestModelState) renderModelComparison();
}

$("#model").addEventListener("change", () => {
  populateEffortOptions($("#model").value);
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
applyStepModelDefaults(stepCatalog.find(step => step.id === activeStepId));

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
    await loadProjects(id);
    const project = projects.find(item => item.id === id);
    $("#project-check").textContent = project
      ? "Đã lưu: " + project.name + " | ID: " + project.id + " | URL: " + project.url
      : id ? "Project này không còn trong danh sách đã lưu." : "Chưa chọn project. Chọn một project để kiểm tra.";
  } catch (error) {
    $("#project-check").textContent = "Không kiểm tra được project: " + error.message;
  }
});
$("#project").addEventListener("change", () => {
  $("#project-check").textContent = "Nhấn Kiểm tra project để đọc thông tin đã lưu.";
  $("#conversation-status").textContent = "Ô 2 sẽ kiểm tra tab ChatGPT hiện tại với project vừa chọn trước khi gửi.";
});
$("#create-project").addEventListener("click", () => {
  const name = $("#project-name").value.trim();
  if (!name) { $("#status").textContent = "Nhập tên project trước."; return; }
  void runJob({action:"create_project", content:name});
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
loadProjects().catch(error => { $("#status").textContent = "Không đọc được project: " + error.message; });
registerMytoolSession().catch(error => {
  showConnectionWarning("Không đăng ký được phiên MyTool: " + error.message + ". Việc gửi prompt vẫn không bị chặn.");
});
setInterval(() => { void pollConnection(); }, 7000);
window.addEventListener("focus", () => { void pollConnection(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void pollConnection();
});
