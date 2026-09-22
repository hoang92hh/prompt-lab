"""Wire types and validation. Source of truth: docs/JOB_PROTOCOL.md."""
from typing import Literal, TypedDict

class RequiredJobFields(TypedDict):
    job_id: str
    provider: str
    action: Literal["prompt"]
    content: str
    options: dict[str, object]

class JobRequest(RequiredJobFields, total=False):
    model: str | None

class CompletedResponse(TypedDict):
    job_id: str
    status: Literal["completed"]
    text: str

class ErrorResponse(TypedDict):
    job_id: str
    status: Literal["error"]
    error: str
    message: str

JobResponse = CompletedResponse | ErrorResponse
RESULT_ERRORS = {
    "INVALID_REQUEST", "UNSUPPORTED_PROVIDER", "UNSUPPORTED_ACTION",
    "UNSUPPORTED_MODEL", "UNSUPPORTED_OPTION", "PROVIDER_NOT_READY",
    "PROVIDER_ERROR", "INTERNAL_ERROR",
    "CHATGPT_TAB_NOT_FOUND", "CHATGPT_MULTIPLE_TABS", "CONTENT_SCRIPT_NOT_READY",
    "COMPOSER_NOT_FOUND", "COMPOSER_NOT_EMPTY", "COMPOSER_WRITE_FAILED",
    "PROMPT_SEND_FAILED", "ASSISTANT_RESPONSE_NOT_FOUND", "RESPONSE_TIMEOUT",
    "DUPLICATE_EXECUTION", "EXECUTION_STATE_LOST",
}

class ProtocolError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code = status, code

def fail(status: int, code: str, message: str) -> None:
    raise ProtocolError(status, code, message)

def _string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())

def validate_request(value: object) -> JobRequest:
    fields = {"job_id", "provider", "action", "content", "options"}
    if not isinstance(value, dict) or not fields <= set(value) or set(value) - fields - {"model"}:
        fail(400, "INVALID_REQUEST", "Five required fields and optional model are supported.")
    if any(not _string(value[key]) for key in fields - {"options"}):
        fail(400, "INVALID_REQUEST", "Request string fields must be non-blank strings.")
    if value.get("model") is not None and not _string(value["model"]):
        fail(400, "INVALID_REQUEST", "model must be null or a non-blank string.")
    if value["job_id"] == "next":
        fail(400, "INVALID_REQUEST", "job_id next is reserved for the claim endpoint.")
    if not isinstance(value["options"], dict):
        fail(400, "INVALID_REQUEST", "options must be a JSON object.")
    if value["provider"] not in {"chatgpt"}:
        fail(400, "UNSUPPORTED_PROVIDER", "Provider is not registered.")
    if value["action"] != "prompt":
        fail(400, "UNSUPPORTED_ACTION", "Only prompt is supported.")
    if value["options"]:
        fail(400, "UNSUPPORTED_OPTION", "No options are currently supported.")
    return value

def validate_response(value: object, job_id: str) -> JobResponse:
    if not isinstance(value, dict):
        fail(400, "INVALID_REQUEST", "Result must be a JSON object.")
    if value.get("job_id") != job_id:
        fail(400, "INVALID_REQUEST", "Result job_id must match the URL.")
    if value.get("status") == "completed":
        if set(value) != {"job_id", "status", "text"} or not isinstance(value["text"], str):
            fail(400, "INVALID_REQUEST", "Completed result requires string text.")
    elif value.get("status") == "error":
        if (set(value) != {"job_id", "status", "error", "message"}
                or not _string(value.get("error"))
                or value["error"] not in RESULT_ERRORS
                or not _string(value.get("message"))):
            fail(400, "INVALID_REQUEST", "Error result requires a known code and message.")
    else:
        fail(400, "INVALID_REQUEST", "Result status must be completed or error.")
    return value
