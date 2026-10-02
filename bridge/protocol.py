"""Wire types and validation. Source of truth: docs/JOB_PROTOCOL.md."""
import re
from urllib.parse import urlsplit
from typing import Literal, TypedDict

class SourceFile(TypedDict):
    name: str
    content: str

class RequiredJobFields(TypedDict):
    job_id: str
    provider: str
    action: Literal["prompt", "create_project", "sync_model", "update_project_instructions",
                    "configure_project_from_folder"]
    content: str
    options: dict[str, object]

class JobRequest(RequiredJobFields, total=False):
    model: str | None
    effort: str | None
    project_id: str | None
    project_url: str | None
    conversation_mode: Literal["new", "continue"] | None
    step_id: str | None
    source_files: list[SourceFile]

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
    "UNSUPPORTED_MODEL", "UNSUPPORTED_OPTION", "MODEL_MISMATCH", "MODEL_PICKER_FAILED",
    "PROVIDER_NOT_READY",
    "PROVIDER_ERROR", "INTERNAL_ERROR",
    "CHATGPT_TAB_NOT_FOUND", "CHATGPT_MULTIPLE_TABS", "CONTENT_SCRIPT_NOT_READY",
    "COMPOSER_NOT_FOUND", "COMPOSER_NOT_EMPTY", "COMPOSER_WRITE_FAILED",
    "PROMPT_SEND_FAILED", "ASSISTANT_RESPONSE_NOT_FOUND", "RESPONSE_TIMEOUT",
    "DUPLICATE_EXECUTION", "EXECUTION_STATE_LOST",
    "PROJECT_CREATE_FAILED", "PROJECT_INSTRUCTIONS_FAILED", "PROJECT_NOT_FOUND", "PROJECT_NAVIGATION_FAILED",
    "PROJECT_SOURCE_DELETE_FAILED", "PROJECT_SOURCE_UPLOAD_FAILED", "PROJECT_SOURCE_UPLOAD_TIMEOUT",
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
    optional = {"model", "effort", "project_id", "project_url", "conversation_mode", "step_id",
                "source_files"}
    if not isinstance(value, dict) or not fields <= set(value) or set(value) - fields - optional:
        fail(400, "INVALID_REQUEST", "Unsupported request fields.")
    if any(not _string(value[key]) for key in fields - {"options", "content"}):
        fail(400, "INVALID_REQUEST", "Request string fields must be non-blank strings.")
    if not isinstance(value["content"], str) or (value["action"] != "sync_model" and not value["content"].strip()):
        fail(400, "INVALID_REQUEST", "content must be a string, non-blank except for sync_model.")
    if value["action"] == "sync_model" and (not _string(value.get("model")) or not _string(value.get("effort"))):
        fail(400, "INVALID_REQUEST", "sync_model requires both model and effort.")
    if value.get("project_id") is not None and not _string(value["project_id"]):
        fail(400, "INVALID_REQUEST", "project_id must be a non-blank string.")
    if value.get("project_url") is not None:
        url = urlsplit(value["project_url"]) if isinstance(value["project_url"], str) else None
        if not url or url.scheme != "https" or url.netloc != "chatgpt.com" or not re.fullmatch(r"/g/g-p-[^/]+/project/?", url.path):
            fail(400, "INVALID_REQUEST", "project_url must be a ChatGPT project URL.")
    conversation_mode = value.get("conversation_mode")
    if conversation_mode is not None and conversation_mode not in {"new", "continue"}:
        fail(400, "INVALID_REQUEST", "conversation_mode must be new or continue.")
    if value["action"] != "prompt" and conversation_mode is not None:
        fail(400, "INVALID_REQUEST", "Conversation routing is supported only for prompt jobs.")
    step_id = value.get("step_id")
    if step_id is not None and (not isinstance(step_id, str)
                                or not re.fullmatch(r"step[1-9][0-9]*", step_id)):
        fail(400, "INVALID_REQUEST", "step_id must use the step<number> format.")
    if value["action"] != "create_project" and step_id is not None:
        fail(400, "INVALID_REQUEST", "step_id is supported only for project creation.")
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
    if value["action"] not in {"prompt", "create_project", "sync_model",
                               "update_project_instructions", "configure_project_from_folder"}:
        fail(400, "UNSUPPORTED_ACTION", "Unsupported action.")
    if value["action"] == "create_project" and any(value.get(key) for key in (
            "model", "effort", "project_id", "project_url", "conversation_mode")):
        fail(400, "INVALID_REQUEST", "Project creation accepts a name and optional step_id.")
    if value["action"] == "update_project_instructions":
        if not value.get("project_id") or not value.get("project_url"):
            fail(400, "INVALID_REQUEST", "Project instructions require a saved project ID and URL.")
        if any(value.get(key) for key in ("model", "effort", "conversation_mode", "step_id")):
            fail(400, "INVALID_REQUEST", "Project instructions accept only content and project routing fields.")
    if value["action"] == "configure_project_from_folder":
        if not value.get("project_id") or not value.get("project_url"):
            fail(400, "INVALID_REQUEST", "Project folder configuration requires a saved project ID and URL.")
        if any(value.get(key) for key in ("model", "effort", "conversation_mode", "step_id")):
            fail(400, "INVALID_REQUEST", "Project folder configuration accepts only content, sources and project routing fields.")
        source_files = value.get("source_files")
        if not isinstance(source_files, list) or len(source_files) != 2:
            fail(400, "INVALID_REQUEST", "source_files must contain AGENTS.md and SKILL.md.")
        expected_names = {"AGENTS.md", "SKILL.md"}
        names = set()
        total_bytes = len(value["content"].encode("utf-8"))
        for source in source_files:
            if (not isinstance(source, dict) or set(source) != {"name", "content"}
                    or not _string(source.get("name")) or not _string(source.get("content"))):
                fail(400, "INVALID_REQUEST", "Each source file requires a non-blank name and content.")
            names.add(source["name"])
            total_bytes += len(source["content"].encode("utf-8"))
        if names != expected_names:
            fail(400, "INVALID_REQUEST", "source_files must be exactly AGENTS.md and SKILL.md.")
        if total_bytes > 750 * 1024:
            fail(400, "INVALID_REQUEST", "Project folder configuration exceeds 750 KiB.")
    elif "source_files" in value:
        fail(400, "INVALID_REQUEST", "source_files is supported only for project folder configuration.")
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
