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

MyTool shows a fixed catalog of OpenAI ChatGPT models and reasoning levels for explicit model checking. Sending a prompt does not inspect or change either setting; the prompt always uses the model and reasoning level currently selected on the ChatGPT website.

Use the model check/sync button below the reasoning selector to compare both choices with ChatGPT and synchronize any differences without sending a question. The notice reports an existing match, successful synchronization or a selection error. Select the target project first if applicable. After updating these files, restart MyTool/Bridge, reload the extension, and reload both MyTool and the ChatGPT tab.

MyTool and the extension keep separate in-memory session markers. Reloading the MyTool page or extension shows an advisory warning because the displayed model choices may no longer match the website. This warning never blocks prompt jobs. A successful explicit model sync clears it.

The question panel has two prompt forms. The first opens the selected project before sending, which starts a new conversation. The second keeps the current ChatGPT page when its URL belongs to the selected project; otherwise it opens that project before sending.

ChatGPT project and model controls can vary by account and website updates. If MyTool cannot confirm a newly created project URL, it reports an error and does not save a project record. Check the website before repeating project creation.

## Claude

The Claude tab is a UI placeholder. It does not send requests to claude.ai yet.
