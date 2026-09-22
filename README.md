# MyTool

MyTool runs a local HTTP Bridge and opens its application UI at `http://127.0.0.1:8765/`. The **Check Connect** button sends the entered message to a signed-in ChatGPT tab through the Chrome extension, then shows the real response.

## Run

From the `mytool` directory:

```powershell
py main.py
```

This requires an installed Python 3.10+ runtime and the Windows Python Launcher (`py`).

In Chrome, open `chrome://extensions`, enable Developer mode, and Load unpacked from `mytool/extension`. Open exactly one signed-in `https://chatgpt.com` tab. Reload that tab after loading or reloading the extension. Leave the ChatGPT composer empty and wait for any previous answer to finish. Enter a message in MyTool and press **Check Connect**.

The Bridge listens only on `127.0.0.1:8765`. The extension receives the job over HTTP, sends it to the existing ChatGPT tab, and returns the result. The UI shows the job status and any error code. Each button press creates a new job.
