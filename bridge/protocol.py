"""Wire types and validation. Source of truth: docs/JOB_PROTOCOL.md."""
import re
from urllib.parse import urlsplit
from typing import Literal, TypedDict

class RequiredJobFields(TypedDict):
    job_id: str
    provider: str
    action: Literal["prompt", "create_project"]
    content: str
    options: dict[str, object]

class JobRequest(RequiredJobFields, total=False):
    model: str | None
    effort: str | None
    project_id: str | None
    project_url: str | None

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
    "PROJECT_CREATE_FAILED", "PROJECT_NOT_FOUND", "PROJECT_NAVIGATION_FAILED",
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
    if not isinstance(value, dict) or not fields <= set(value) or set(value) - fields - {"model", "effort", "project_id", "project_url"}:
        fail(400, "INVALID_REQUEST", "Five required fields and optional model are supported.")
    if any(not _string(value[key]) for key in fields - {"options"}):
        fail(400, "INVALID_REQUEST", "Request string fields must be non-blank strings.")
    if value.get("project_id") is not None and not _string(value["project_id"]):
        fail(400, "INVALID_REQUEST", "project_id must be a non-blank string.")
    if value.get("project_url") is not None:
        url = urlsplit(value["project_url"]) if isinstance(value["project_url"], str) else None
        if not url or url.scheme != "https" or url.netloc != "chatgpt.com" or not re.fullmatch(r"/g/g-p-[^/]+/project/?", url.path):
            fail(400, "INVALID_REQUEST", "project_url must be a ChatGPT project URL.")
    if value.get("effort") is not None and not _string(value["effort"]):
        fail(400, "INVALID_REQUEST", "effort must be null or a non-blank string.")
    if value.get("effort") and not value.get("model"):
        fail(400, "INVALID_REQUEST", "effort requires a model.")
    if value.get("model") is not None and not _string(value["model"]):
        fail(400, "INVALID_REQUEST", "model must be null or a non-blank string.")
    if value["job_id"] == "next":
        fail(400, "INVALID_REQUEST", "job_id next is reserved for the claim endpoint.")
    if not isinstance(value["options"], dict):
        fail(400, "INVALID_REQUEST", "options must be a JSON object.")
    if value["provider"] not in {"chatgpt"}:
        fail(400, "UNSUPPORTED_PROVIDER", "Provider is not registered.")
    if value["action"] not in {"prompt", "create_project"}:
        fail(400, "UNSUPPORTED_ACTION", "Unsupported action.")
    if value["action"] == "create_project" and any(value.get(key) for key in ("model", "effort", "project_id", "project_url")):
        fail(400, "INVALID_REQUEST", "Project creation only requires a name in content.")
    if value["options"]:
        fail(400, "UNSUPPORTED_OPTION", "No options are currently supported.")
    return value

def validate_response(value: object, job_id: str) -> JobResponse:
    if not isinstance(value, dict):
        fail(400, "INVALID_REQUEST", "Result must be a JSON object.")
    if value.get("job_id") != job_id:
        fail(400, "INVALID_REQUEST", "Result job_id must match the URL.")
    if value.get("status") == "completed":
        if not {"job_id", "status", "text"} <= set(value) or set(value) - {"job_id", "status", "text", "project"} or not isinstance(value["text"], str):
            fail(400, "INVALID_REQUEST", "Completed result requires string text.")
        if "project" in value:
            project = value["project"]
            if not isinstance(project, dict) or set(project) != {"id", "name", "url"} or not all(_string(item) for item in project.values()):
                fail(400, "INVALID_REQUEST", "Project result requires id, name and url.")
            url = urlsplit(project["url"])
            if (url.scheme != "https" or url.netloc != "chatgpt.com"
                    or not re.fullmatch(r"/g/" + re.escape(project["id"]) + r"/project/?", url.path)
                    or not project["id"].startswith("g-p-")):
                fail(400, "INVALID_REQUEST", "Project ID and URL do not match.")
    elif value.get("status") == "error":
        if (set(value) != {"job_id", "status", "error", "message"}
                or not _string(value.get("error"))
                or value["error"] not in RESULT_ERRORS
                or not _string(value.get("message"))):
            fail(400, "INVALID_REQUEST", "Error result requires a known code and message.")
    else:
        fail(400, "INVALID_REQUEST", "Result status must be completed or error.")
    return value
