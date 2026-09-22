import { chatgptTarget } from "../providers/chatgpt/chatgpt_config.js";
import { executionError, failure } from "./execution_errors.js";

const targets = new Map([["chatgpt", chatgptTarget]]);
export const ACTIVE_KEY = "activeExecution";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function message(tabId, body) {
  let timer;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, body, { frameId: 0 }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(executionError(
          "CONTENT_SCRIPT_NOT_READY", "Content script did not acknowledge the message.",
        )), 5000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Background routing and messaging only. No website DOM. */
export class ProviderExecutor {
  async execute(job) {
    const target = targets.get(job.provider);
    if (!target) throw executionError("UNSUPPORTED_PROVIDER", "Only ChatGPT execution is implemented.");
    const tabs = await chrome.tabs.query({ url: target.matches });
    if (!tabs.length) throw executionError(target.missingTabCode, "Open one logged-in ChatGPT tab first.");
    if (tabs.length !== 1) throw executionError(target.multipleTabsCode, "Keep exactly one ChatGPT tab open.");
    const tabId = tabs[0].id;
    console.info("[JOB]", job.job_id, target.foundLog);
    let ping;
    try { ping = await message(tabId, { type: "MYTOOL_PING" }); }
    catch { throw executionError("CONTENT_SCRIPT_NOT_READY", "Reload the existing ChatGPT tab after loading the extension."); }
    if (!ping?.ready) throw executionError("CONTENT_SCRIPT_NOT_READY", "Content script is not ready.");
    const active = { job_id: job.job_id, tabId, startedAt: Date.now() };
    // Persist BEFORE dispatch. Restart recovery polls status only; never re-executes.
    await chrome.storage.session.set({ [ACTIVE_KEY]: active });
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
      throw executionError("EXECUTION_STATE_LOST", "Worker stopped before dispatch was recorded; job will not be re-executed.");
    }
    let loggedSteps = 0;
    while (Date.now() - active.startedAt < 200000) {
      let record;
      try { record = await message(active.tabId, { type: "MYTOOL_STATUS", job_id: active.job_id }); }
      catch { throw executionError("EXECUTION_STATE_LOST", "Tab closed, reloaded or content script unavailable; prompt will not be resent."); }
      if (record?.error) throw executionError(record.error, record.message);
      if (record?.job_id !== active.job_id) throw executionError("EXECUTION_STATE_LOST", "Status job ID mismatch.");
      for (const step of (record.steps || []).slice(loggedSteps)) {
        console.info("[JOB]", active.job_id, step);
      }
      loggedSteps = (record.steps || []).length;
      if (record.result) {
        if (record.result.job_id !== active.job_id) throw executionError("EXECUTION_STATE_LOST", "Result job ID mismatch.");
        return record.result;
      }
      await sleep(1000); // Read-only status check; keeps short MV3 API activity.
    }
    return failure(active.job_id, executionError("RESPONSE_TIMEOUT", "Content execution exceeded the 200-second transport deadline."));
  }
}
