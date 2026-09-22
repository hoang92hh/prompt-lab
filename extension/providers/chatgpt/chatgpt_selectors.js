/** All ChatGPT DOM selectors live here. Fail closed if the UI changes. */
export const chatgptSelectors = Object.freeze({
  composer: '#prompt-textarea[contenteditable="true"], textarea#prompt-textarea, form[data-type="unified-composer"] [contenteditable="true"], main [contenteditable="true"][role="textbox"]',
  send: 'button[data-testid="send-button"], button#composer-submit-button[aria-label="Send prompt"], button[aria-label="Send prompt"], button[aria-label="Gửi lời nhắc"], button[aria-label="Send message"]',
  stop: 'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Dừng tạo"]',
  signedOut: 'button[data-testid="login-button"], a[href="/auth/login"], button[data-testid="signup-button"]',
  user: '[data-message-author-role="user"]',
  assistant: '[data-message-author-role="assistant"]',
  messages: '[data-message-author-role="user"], [data-message-author-role="assistant"]',
  turn: 'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]',
  responseBody: '.markdown',
  completionAction: 'button[data-testid="copy-turn-action-button"], button[aria-label="Copy response"], button[aria-label="Sao chép phản hồi"]',
  streaming: '.result-streaming, [data-is-streaming="true"], [aria-busy="true"]',
  nonResponse: 'button, [role="button"], svg, style, script, [aria-hidden="true"]',
});
