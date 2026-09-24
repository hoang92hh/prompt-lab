# Provider Spec

The extension currently implements ChatGPT through a content script on `https://chatgpt.com/*`. The Claude tab is a UI placeholder and has no adapter.

A provider checks readiness, selects the requested model and reasoning level from the website menu and confirms both selections, sets and sends a prompt once, waits for the new assistant turn to finish, and returns its text. The extension does not use a provider API or perform login.

ChatGPT project creation uses the website's New project control. The extension reads the resulting project URL and returns its ID, name, and URL. When sending to a saved project, the background worker finds a tab already in that project, redirects a ChatGPT tab, or opens a new ChatGPT tab. It confirms the content script is on the selected project URL before sending the prompt. If the project or a requested model is unavailable, or the website does not confirm the selected model and reasoning level, the job fails before writing the prompt. The extension changes the ChatGPT model and reasoning level only when requested.

The MyTool model check button enqueues `sync_model`. The content runner checks readiness and runs model selection, then returns immediately without calling prompt editing, sending or response waiting. Existing drafts in the chosen composer are preserved. The selected project follows the same navigation path as prompt jobs.

The picker opens the composer pill, opens Select model, reads `aria-checked` from model rows and selects a different row only when needed. It returns to the simple view and reads the current reasoning label/value. For a different level, it checks the target point's lock state and uses the Power keyboard control (or the target slider point), then verifies the resulting state. It closes the picker on success or failure. Unknown slider ranges fail rather than guessing a position.

The DOM selectors and controls depend on ChatGPT's current web UI and the user's account. If the UI changes, update the adapter in `extension/providers/chatgpt/`.
