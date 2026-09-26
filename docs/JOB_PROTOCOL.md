# Job Protocol

MyTool communicates with the local Bridge over HTTP at `127.0.0.1:8765`. The Chrome extension long-polls `GET /api/jobs/next` and posts a terminal result.

## Request

`POST /api/jobs` accepts `job_id`, `provider: "chatgpt"`, `action`, `content`, and `options: {}`. Actions:

- `prompt`: `content` is a non-blank question. Omit `model` and `effort`; the extension uses the current ChatGPT website selection without inspecting it.
- `create_project`: `content` is a non-blank project name.
- `sync_model`: checks and synchronizes the website model and reasoning level without writing or sending a prompt. Requires both `model` and `effort`. `content` must be a string and may be empty; its value is ignored.

Prompt and sync jobs can include `project_id` and `project_url`. MyTool verifies the saved project ID and URL before enqueueing and the extension selects that project's tab using the normal execution path.

Model selection is performed only for `sync_model`. It reads the checked account model row and reasoning slider. Already-matching choices are left alone. Missing or locked choices report `UNSUPPORTED_MODEL`; changes not confirmed by the website report `MODEL_MISMATCH`.

Each job moves through `queued`, `processing`, and either `completed` or `error`. Jobs are kept in Bridge memory until the process ends. Claimed jobs are not automatically requeued.

## Result

A completed sync returns `job_id`, `status: "completed"` and `text` indicating whether the model/effort already matched or were synchronized. It does not return an assistant response. Sync jobs share the same queue, duplicate protection and terminal error handling as prompt jobs.

A completed prompt returns `{ "job_id": "...", "status": "completed", "text": "..." }`. A completed project creation additionally returns `project` with `id`, `name`, and `url`. The Bridge saves that project to JSON only after confirming the result shape and project URL. An error returns `job_id`, `status: "error"`, `error`, and `message`.

The UI reads `GET /api/jobs/{id}` for status and `GET /api/projects` for saved projects. Project creation is performed through the ChatGPT web UI. ChatGPT page changes can make selectors fail; in that case the extension reports an error without saving a project record.

## Connection state

Connection state is separate from the job queue:

- The MyTool page registers a new page-lifetime marker with `POST /api/connection/mytool`.
- The extension sends its `chrome.storage.session` marker in the `X-MyTool-Extension-Session` header on each `GET /api/jobs/next` long poll.
- The page reads `GET /api/connection` periodically. A changed marker displays an advisory reload warning.

These endpoints do not enqueue, claim, complete, or block a job. The extension heartbeat is recorded before the long poll waits. Session state is held in Bridge memory and resets when the Bridge restarts.
