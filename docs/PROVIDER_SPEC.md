# Provider Spec

The extension currently implements ChatGPT through a content script on `https://chatgpt.com/*`. The Claude tab is a UI placeholder and has no adapter.

A prompt provider checks readiness, sets and sends a prompt once, waits for the new assistant turn to finish, and returns its text. Prompt execution does not open the model picker, inspect the model, or change the reasoning level. The extension does not use a provider API or perform login.

ChatGPT project creation uses the website's New project control. The extension reads the resulting project URL and returns its ID, name, and URL. When sending to a saved project, the background worker finds a tab already in that project, redirects a ChatGPT tab, or opens a new ChatGPT tab. It confirms the content script is on the selected project URL before sending the prompt. The extension changes the ChatGPT model and reasoning level only for an explicit `sync_model` job.

The MyTool model check button enqueues `sync_model`. The content runner checks readiness and runs model selection, then returns immediately without calling prompt editing, sending or response waiting. Existing drafts in the chosen composer are preserved. The selected project follows the same navigation path as prompt jobs.

The picker opens the composer pill, opens Select model, reads `aria-checked` from model rows and selects a different row only when needed. It returns to the simple view and reads the current reasoning label/value. For a different level, it checks the target point's lock state and uses the Power keyboard control (or the target slider point), then verifies the resulting state. It closes the picker on success or failure. Unknown slider ranges fail rather than guessing a position.

The DOM selectors and controls depend on ChatGPT's current web UI and the user's account. If the UI changes, update the adapter in `extension/providers/chatgpt/`.

The prompt sender recognizes ChatGPT's current enabled submit control as `button[type="submit"][aria-label="Send"]`, in addition to the older send-button identifiers. It verifies the complete composer text before clicking and confirms that the composer clears afterward. A failed lookup or unconfirmed click is never retried automatically.

Current ChatGPT assistant turns expose `data-chatgpt-search-message-ids` and a unit key ending in `:assistant`; their response body uses `data-markdown-text-style="assistant-message"`. Before each send, the provider snapshots existing assistant IDs and action controls. It accepts only a new assistant ID and a new `.turn-action-controls` positioned after that turn. The `button[aria-label="Copy"]` inside that toolbar is the completion signal, so long responses are read only after ChatGPT publishes their actions.

The saved turn actions are Copy, Rate response, Share, Add to project sources, Read aloud, Regenerate response, and More actions. Only Copy is used by prompt execution; the remaining selectors are retained for future explicit features. Waiting is event-driven through `MutationObserver` with a deadline timer. There is no fixed 150 ms DOM polling loop.

Prompt routing has two explicit modes. New mode opens the selected project root before dispatch. Continue mode checks the current ChatGPT tab URL: it dispatches on the current page when that URL belongs to the selected project, and otherwise opens the project root first. Project conversation URLs may include a slug after the saved project ID. Response completion does not depend on reading or returning the conversation URL.

The MyTool page and extension each create a per-load session marker. The extension marker is stored in `chrome.storage.session` so service-worker suspension keeps the same value while an extension reload creates a new one. The Bridge records the marker on the normal long-poll request and exposes a separate read-only connection snapshot to the page. Marker changes only display a warning; they do not gate prompt execution.
