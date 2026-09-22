# Provider Spec

The extension currently implements ChatGPT through a content script on `https://chatgpt.com/*`. The Claude tab is a UI placeholder and has no adapter.

A provider checks readiness, checks the requested model and reasoning level in the visible website menu and selects both, sets and sends a prompt once, waits for the new assistant turn to finish, and returns its text. The extension does not use a provider API or perform login.

ChatGPT project creation uses the website's New project control. The extension reads the resulting project URL and returns its ID, name, and URL. When sending to a saved project, the background worker finds a tab already in that project, redirects a ChatGPT tab, or opens a new ChatGPT tab. It confirms the content script is on the selected project URL before sending the prompt. If the project or model cannot be confirmed, the job fails before prompt submission.

The DOM selectors and controls depend on ChatGPT's current web UI and the user's account. If the UI changes, update the adapter in `extension/providers/chatgpt/`.
