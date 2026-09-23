import { createProject } from "../providers/chatgpt/project_actions.js";
import { chatgptSelectors as S } from "../providers/chatgpt/chatgpt_selectors.js";
import { ProviderFactory } from "./provider_factory.js";
import { failure, executionError } from "./execution_errors.js";

const jobs = new Map();
let activeJob = null;
let projectChatOpening = false;
const factory = new ProviderFactory();

async function execute(job, record) {
  try {
    const provider = factory.create(job.provider, {
      log: (step) => { record.steps.push(step); console.info("[JOB]", job.job_id, step); },
    });
    if (!(await provider.isReady())) {
      throw executionError("PROVIDER_NOT_READY", "Log in and leave ChatGPT idle before starting.");
    }
    await provider.selectModel(job.model, job.effort);
    await provider.setPrompt(job.content, job.options);
    await provider.sendPrompt();
    await provider.waitForResponse();
    record.result = { job_id: job.job_id, status: "completed", text: await provider.getResponse() };
  } catch (error) {
    record.result = failure(job.job_id, error);
  } finally {
    record.status = record.result.status;
    activeJob = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message?.type?.startsWith("MYTOOL_")) return;
  if (message.type === "MYTOOL_PING") {
    sendResponse({ ready: true, url: location.href });
  } else if (message.type === "MYTOOL_PROJECT_READY") {
    const composer = [...document.querySelectorAll(S.composer)].find(node =>
      node.getClientRects().length > 0 &&
      (node.isContentEditable || node.tagName === "TEXTAREA") &&
      !node.disabled && node.getAttribute("aria-disabled") !== "true");
    if (composer) {
      sendResponse({ ready: true, url: location.href });
      return;
    }
    if (!projectChatOpening && /\/project\/?$/.test(location.pathname)) {
      const start = [...document.querySelectorAll("main button, main a")].find(node =>
        node.getClientRects().length > 0 &&
        /(new\s+chat|start.*chat|new\s+conversation|tr\u00f2\s+chuy\u1ec7n\s+m\u1edbi)/i
          .test((node.innerText || node.getAttribute("aria-label") || "").trim()));
      if (start) {
        projectChatOpening = true;
        start.click();
        sendResponse({ ready: false, openingChat: true, url: location.href });
        return;
      }
    }
    sendResponse({ ready: false, url: location.href });
  } else if (message.type === "MYTOOL_STATUS") {
    const record = jobs.get(message.job_id);
    sendResponse(record ? { job_id: message.job_id, status: record.status, result: record.result, steps: record.steps }
      : { error: "EXECUTION_STATE_LOST", message: "No execution state in this document. Prompt will not be resent." });
  } else if (message.type === "MYTOOL_CREATE_PROJECT") {
    if (activeJob !== null) {
      sendResponse({ error: "PROVIDER_NOT_READY", message: "This tab is already processing a job." });
      return;
    }
    activeJob = "create-project";
    void createProject(message.name).then(() => {
      sendResponse({ accepted: true });
    }).catch(error => {
      console.error("[MyTool] Project creation failed:", error);
      sendResponse({
        error: error?.code || "PROJECT_CREATE_FAILED",
        message: error?.message || "ChatGPT project creation failed.",
      });
    }).finally(() => { activeJob = null; });
    return true; // Keep the response channel open until UI automation succeeds or fails.
  } else if (message.type === "MYTOOL_EXECUTE") {
    const job = message.job;
    if (!job || typeof job.job_id !== "string" || job.action !== "prompt") {
      sendResponse({ error: "INVALID_REQUEST", message: "Invalid content-script job." });
      return;
    }
    const signature = JSON.stringify(job);
    const existing = jobs.get(job.job_id);
    if (existing) {
      sendResponse(existing.signature === signature
        ? { accepted: true, job_id: job.job_id }
        : { error: "DUPLICATE_EXECUTION", message: "Job ID already used by a different request." });
      return; // Never execute twice, even if the earlier result is an error.
    }
    if (activeJob !== null) {
      sendResponse({ error: "PROVIDER_NOT_READY", message: "This tab is already processing a job." });
      return;
    }
    const record = { signature, status: "processing", result: null, steps: [] };
    jobs.set(job.job_id, record);
    activeJob = job.job_id;
    sendResponse({ accepted: true, job_id: job.job_id });
    void execute(job, record);
  }
});
