import { chatgptTarget } from "../providers/chatgpt/chatgpt_config.js";
import { executionError, failure } from "./execution_errors.js";

const targets = new Map([["chatgpt", chatgptTarget]]);
export const ACTIVE_KEY = "activeExecution";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function message(tabId, body, timeoutMs = 5000) {
  let timer;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, body, { frameId: 0 }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(executionError(
          "CONTENT_SCRIPT_NOT_READY", "Content script did not acknowledge the message.",
        )), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

async function ready(tabId, expectedRoot = null) {
  for (let i = 0; i < 40; i++) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const ping = await message(tabId, { type: "MYTOOL_PING" });
      if (ping?.ready && tab.status === "complete" &&
          (!expectedRoot || ping.url === expectedRoot || ping.url?.startsWith(expectedRoot + "/"))) return;
    } catch {}
    await sleep(500);
  }
  throw executionError("CONTENT_SCRIPT_NOT_READY", "Reload the ChatGPT tab after loading the extension.");
}

async function projectComposerReady(tabId, job) {
  for (let i = 0; i < 40; i++) {
    try {
      const state = await message(tabId, { type: "MYTOOL_PROJECT_READY" });
      if (state?.ready && projectMatchesUrl(state.url, job)) return;
    } catch {}
    await sleep(500);
  }
  throw executionError("COMPOSER_NOT_FOUND", "Project opened, but its chat composer did not become ready.");
}

function projectFromUrl(url, name) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://chatgpt.com") return null;
    const match = parsed.pathname.match(/^\/g\/(g-p-[^/]+)\/project\/?$/);
    return match ? { id: match[1], name, url: parsed.origin + parsed.pathname } : null;
  } catch { return null; }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

function projectMatchesUrl(url, job) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://chatgpt.com") return false;
    if (!job.project_id || !job.project_url) {
      return parsed.pathname === "/" || /^\/c\/[^/]+\/?$/.test(parsed.pathname);
    }
    const projectPath = new URL(job.project_url).pathname.replace(/\/$/, "");
    const conversationPattern = new RegExp(
      "^/g/" + escapeRegExp(job.project_id) + "(?:-[^/]+)?/c/[^/]+/?$",
    );
    return parsed.pathname.replace(/\/$/, "") === projectPath ||
      conversationPattern.test(parsed.pathname);
  } catch { return false; }
}

async function navigate(tabId, url) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== url) await chrome.tabs.update(tabId, { url, active: true });
}

async function openPromptTarget(tabId, job) {
  const tab = await chrome.tabs.get(tabId);
  const keepCurrent = job.conversation_mode === "continue" && projectMatchesUrl(tab.url, job);
  if (!keepCurrent) {
    const target = job.project_url || "https://chatgpt.com/";
    await navigate(tabId, target);
    await ready(tabId, job.project_url
      ? job.project_url.replace(/\/project\/?$/, "") : "https://chatgpt.com");
  } else {
    await ready(tabId);
  }
  if (job.project_url) await projectComposerReady(tabId, job);
}

async function chooseTab(job) {
  const tabs = await chrome.tabs.query({ url: chatgptTarget.matches });
  if (tabs.length > 1) {
    const active = tabs.filter(tab => tab.active);
    if (active.length !== 1) throw executionError("CHATGPT_MULTIPLE_TABS", "Select one ChatGPT tab or close extra tabs.");
    return active[0].id;
  }
  if (tabs.length === 1) return tabs[0].id;
  if (job.project_url || job.action === "create_project" || job.action === "prompt") {
    const url = job.action === "create_project"
      ? "https://chatgpt.com/projects" : job.project_url || "https://chatgpt.com/";
    const tab = await chrome.tabs.create({ url, active: true });
    return tab.id;
  }
  throw executionError(chatgptTarget.missingTabCode, "Open one logged-in ChatGPT tab first.");
}

export class ProviderExecutor {
  async execute(job) {
    if (!targets.has(job.provider)) throw executionError("UNSUPPORTED_PROVIDER", "Only ChatGPT is available.");
    const tabId = await chooseTab(job);
    console.info("[JOB]", job.job_id, chatgptTarget.foundLog);
    if (job.action === "create_project") {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url?.startsWith("https://chatgpt.com/projects")) {
        await chrome.tabs.update(tabId, { url: "https://chatgpt.com/projects", active: true });
      }
      await ready(tabId, "https://chatgpt.com/projects");
    } else if (job.action === "prompt") {
      await openPromptTarget(tabId, job);
    } else if (job.project_url) {
      const tab = await chrome.tabs.get(tabId);
      const root = job.project_url.replace(/\/project\/?$/, "");
      if (!tab.url?.startsWith(root + "/")) {
        await chrome.tabs.update(tabId, { url: job.project_url, active: true });
      }
      await ready(tabId, root);
      await projectComposerReady(tabId, job);
    } else {
      await ready(tabId);
    }
    const initialTab = job.action === "create_project" ? await chrome.tabs.get(tabId) : null;
    const active = { job_id: job.job_id, tabId, startedAt: Date.now(),
      action: job.action, projectName: job.action === "create_project" ? job.content : null,
      initialProjectId: initialTab ? projectFromUrl(initialTab.url, job.content)?.id : null };
    await chrome.storage.session.set({ [ACTIVE_KEY]: active });
    if (job.action === "create_project") {
      try {
        const ack = await message(tabId, { type: "MYTOOL_CREATE_PROJECT", name: job.content }, 40000);
        if (ack?.error) throw executionError(ack.error, ack.message);
      } catch (error) {
        if (error.code && error.code !== "CONTENT_SCRIPT_NOT_READY") throw error;
      }
      return this.resume(active);
    }
    try {
      const ack = await message(tabId, { type: "MYTOOL_EXECUTE", job });
      if (ack?.error) throw executionError(ack.error, ack.message);
    } catch (error) {
      if (error.code && error.code !== "CONTENT_SCRIPT_NOT_READY") throw error;
      console.warn("[JOB]", job.job_id, "Dispatch acknowledgement lost; checking status only.");
    }
    return this.resume(active);
  }

  async resume(active) {
    if (!Number.isInteger(active.tabId)) {
      throw executionError("EXECUTION_STATE_LOST", "Worker stopped before dispatch was recorded.");
    }
    if (active.action === "create_project") {
      while (Date.now() - active.startedAt < 90000) {
        const tab = await chrome.tabs.get(active.tabId).catch(() => null);
        if (!tab) throw executionError("EXECUTION_STATE_LOST", "Project tab was closed.");
        const project = projectFromUrl(tab.url, active.projectName);
        if (project && project.id !== active.initialProjectId) return { job_id: active.job_id, status: "completed", text: "", project };
        await sleep(500);
      }
      throw executionError("PROJECT_CREATE_FAILED", "Could not confirm the new project URL. Check ChatGPT.");
    }
    let loggedSteps = 0;
    while (Date.now() - active.startedAt < 200000) {
      let record;
      try { record = await message(active.tabId, { type: "MYTOOL_STATUS", job_id: active.job_id }); }
      catch { throw executionError("EXECUTION_STATE_LOST", "Tab closed, reloaded or content script unavailable; prompt will not be resent."); }
      if (record?.error) throw executionError(record.error, record.message);
      if (record?.job_id !== active.job_id) throw executionError("EXECUTION_STATE_LOST", "Status job ID mismatch.");
      for (const step of (record.steps || []).slice(loggedSteps)) console.info("[JOB]", active.job_id, step);
      loggedSteps = (record.steps || []).length;
      if (record.result) {
        if (record.result.job_id !== active.job_id) throw executionError("EXECUTION_STATE_LOST", "Result job ID mismatch.");
        return record.result;
      }
      await sleep(1000);
    }
    return failure(active.job_id, executionError("RESPONSE_TIMEOUT", "Content execution exceeded the 200-second transport deadline."));
  }
}
