/** Execution errors normalized before sending terminal wire results. */
const codes = new Set([
  "INVALID_REQUEST", "UNSUPPORTED_PROVIDER", "UNSUPPORTED_ACTION", "UNSUPPORTED_MODEL",
  "UNSUPPORTED_OPTION", "PROVIDER_NOT_READY", "PROVIDER_ERROR", "INTERNAL_ERROR",
  "CHATGPT_TAB_NOT_FOUND", "CHATGPT_MULTIPLE_TABS", "CONTENT_SCRIPT_NOT_READY",
  "COMPOSER_NOT_FOUND", "COMPOSER_NOT_EMPTY", "COMPOSER_WRITE_FAILED",
  "PROMPT_SEND_FAILED", "ASSISTANT_RESPONSE_NOT_FOUND", "RESPONSE_TIMEOUT",
  "DUPLICATE_EXECUTION", "EXECUTION_STATE_LOST",
]);
export function failure(jobId, error) {
  const known = codes.has(error?.code);
  return {
    job_id: jobId, status: "error",
    error: known ? error.code : "PROVIDER_ERROR",
    message: known ? error.message : "Provider execution failed; inspect the extension console.",
  };
}
export function executionError(code, message) {
  return Object.assign(new Error(message), { code });
}
