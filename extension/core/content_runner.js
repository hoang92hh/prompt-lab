import { ProviderFactory } from "./provider_factory.js";
import { failure, executionError } from "./execution_errors.js";

const jobs = new Map();
let activeJob = null;
const factory = new ProviderFactory();

async function execute(job, record) {
  try {
    const provider = factory.create(job.provider, {
      log: (step) => { record.steps.push(step); console.info("[JOB]", job.job_id, step); },
    });
    if (!(await provider.isReady())) {
      throw executionError("PROVIDER_NOT_READY", "Log in and leave ChatGPT idle before starting.");
    }
    await provider.selectModel(job.model);
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
    sendResponse({ ready: true });
  } else if (message.type === "MYTOOL_STATUS") {
    const record = jobs.get(message.job_id);
    sendResponse(record ? { job_id: message.job_id, status: record.status, result: record.result, steps: record.steps }
      : { error: "EXECUTION_STATE_LOST", message: "No execution state in this document. Prompt will not be resent." });
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
