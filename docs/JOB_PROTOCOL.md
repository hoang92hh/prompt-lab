# Job Protocol

MyTool communicates with the local Bridge over HTTP at `127.0.0.1:8765`. The Chrome extension long-polls `GET /api/jobs/next` and posts a terminal result.

## Request

`POST /api/jobs` accepts `job_id`, `provider: "chatgpt"`, `action`, `content`, and `options: {}`. `action` is `prompt` or `create_project`. For `create_project`, `content` is the project name. For `prompt`, `content` is the question. A prompt can include optional `project_id` and `project_url`, and requires both `model` and `effort` when selecting a specific model. MyTool verifies the project ID and URL against `config/projects.json` before enqueueing a job. An omitted model and effort use the current ChatGPT UI selection.

Each job moves through `queued`, `processing`, and either `completed` or `error`. Jobs are kept in Bridge memory until the process ends. Claimed jobs are not automatically requeued.

## Result

A completed prompt returns `{ "job_id": "...", "status": "completed", "text": "..." }`. A completed project creation additionally returns `project` with `id`, `name`, and `url`. The Bridge saves that project to JSON only after confirming the result shape and project URL. An error returns `job_id`, `status: "error"`, `error`, and `message`.

The UI reads `GET /api/jobs/{id}` for status and `GET /api/projects` for saved projects. Project creation is performed through the ChatGPT web UI. ChatGPT page changes can make selectors fail; in that case the extension reports an error without saving a project record.
