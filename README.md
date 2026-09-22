# MyTool

MyTool runs a local Bridge and opens its UI at `http://127.0.0.1:8765/`.

## Run

From the `mytool` directory:

```powershell
py main.py
```

In Chrome, load `mytool/extension` via `chrome://extensions` > Developer mode > Load unpacked. Reload the extension after updating it, then reload the ChatGPT tab. Keep MyTool running in the terminal.

## ChatGPT

The ChatGPT tab in MyTool can create a real ChatGPT project through the website. Once ChatGPT opens the new project page, MyTool saves its name, ID and URL in `config/projects.json`. The project selector reads this file. On a prompt, the extension uses an existing tab in the selected project, redirects a ChatGPT tab to the project, or opens a ChatGPT tab if none exists.

MyTool shows a fixed catalog of OpenAI ChatGPT models and reasoning levels. Choose a model, then a level for each prompt. Before sending, the extension checks whether both choices appear in the signed-in account menu for the selected project. If either is unavailable, the UI shows UNSUPPORTED_MODEL and the prompt is not sent.

ChatGPT project and model controls can vary by account and website updates. If MyTool cannot confirm a newly created project URL, it reports an error and does not save a project record. Check the website before repeating project creation.

## Claude

The Claude tab is a UI placeholder. It does not send requests to claude.ai yet.
