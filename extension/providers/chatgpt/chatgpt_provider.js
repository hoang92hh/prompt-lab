import { BaseProvider } from "../base_provider.js";
import { chatgptSelectors as S } from "./chatgpt_selectors.js";
import { useCurrentModel } from "./chatgpt_models.js";

const error = (code, message) => Object.assign(new Error(message), { code });
const normalize = (text) => text.replace(/\r\n?/g, "\n").trim();
const comparable = (text) => normalize(text).replace(/\s+/g, " ");

export class ChatGPTProvider extends BaseProvider {
  constructor({ document: doc = document, timeoutMs = 180000, stableMs = 1200,
    log = () => {} } = {}) {
    super();
    this.doc = doc;
    this.win = doc.defaultView;
    this.timeoutMs = timeoutMs;
    this.stableMs = stableMs;
    this.log = log;
    this.sent = false;
    this.finished = false;
    this.cancelled = false;
    this.text = "";
  }

  visible(element) {
    return !!element && element.isConnected && element.getClientRects().length > 0
      && this.win.getComputedStyle(element).visibility !== "hidden";
  }

  find(selector, root = this.doc) {
    return [...root.querySelectorAll(selector)].find((element) => this.visible(element)) || null;
  }

  editable(element) {
    return this.visible(element) && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && (element.isContentEditable || element.tagName === "TEXTAREA");
  }

  composerText(element) {
    return element.tagName === "TEXTAREA" ? element.value : element.innerText;
  }

  async isReady() {
    if (this.find(S.signedOut)) return false;
    const composer = this.find(S.composer);
    if (!composer) throw error("COMPOSER_NOT_FOUND", "ChatGPT composer was not found.");
    return this.editable(composer) && !this.find(S.stop);
  }

  async selectModel(model) {
    useCurrentModel(model); // Explicit no-op for null/omitted only.
  }

  async setPrompt(content, options = {}) {
    if (this.sent) throw error("DUPLICATE_EXECUTION", "This provider already attempted to send.");
    if (typeof content !== "string" || !content.trim()) {
      throw error("INVALID_REQUEST", "Prompt must be a non-blank string.");
    }
    if (Object.keys(options).length) throw error("UNSUPPORTED_OPTION", "Options are not supported.");
    if (!(await this.isReady())) throw error("PROVIDER_NOT_READY", "ChatGPT is not ready or is generating.");
    const composer = this.find(S.composer);
    if (normalize(this.composerText(composer))) {
      throw error("COMPOSER_NOT_EMPTY", "Clear the existing draft before starting a job.");
    }
    this.prompt = content;
    composer.focus();
    if (composer.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(this.win.HTMLTextAreaElement.prototype, "value").set;
      setter.call(composer, content);
    } else {
      const selection = this.win.getSelection();
      const range = this.doc.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      // Native editing command updates the editor's input state; no clipboard.
      if (!this.doc.execCommand("insertText", false, content)) {
        throw error("COMPOSER_WRITE_FAILED", "The editor did not accept text insertion.");
      }
    }
    composer.dispatchEvent(new this.win.InputEvent("input", {
      bubbles: true, inputType: "insertText", data: content,
    }));
    if (normalize(this.composerText(composer)) !== normalize(content)) {
      throw error("COMPOSER_WRITE_FAILED", "Composer text does not match the complete prompt.");
    }
  }

  messageKey(node) {
    return node.getAttribute("data-message-id")
      || node.closest(S.turn)?.getAttribute("data-testid") || node;
  }

  newUser() {
    // Index AND identity checks exclude old messages even after React re-renders.
    return [...this.doc.querySelectorAll(S.user)].slice(this.beforeUsers.length).find(
      (node) => !this.beforeUserKeys.has(this.messageKey(node))
        && comparable(node.innerText) === comparable(this.prompt),
    ) || null;
  }

  currentAssistant() {
    const user = this.newUser();
    if (!user) return null;
    const messages = [...this.doc.querySelectorAll(S.messages)];
    const after = messages.slice(messages.indexOf(user) + 1);
    const candidates = [];
    for (const node of after) {
      if (node.matches(S.user)) break; // Never take a subsequent user's response.
      if (!this.beforeAssistantKeys.has(this.messageKey(node)) && this.visible(node)) {
        candidates.push(node);
      }
    }
    return candidates.at(-1) || null;
  }

  responseText(node) {
    if (!node) return "";
    // Only response markdown, excluding turn controls and thinking/status UI.
    const bodies = [...node.querySelectorAll(S.responseBody)].filter(
      (body) => !body.parentElement?.closest(S.responseBody) && this.visible(body),
    );
    const read = (element) => {
      if (element.nodeType === 3) return element.textContent;
      if (element.nodeType !== 1 || element.matches(S.nonResponse)) return "";
      if (element.tagName === "BR") return "\n";
      const text = [...element.childNodes].map(read).join("");
      return /^(P|DIV|PRE|LI|H[1-6]|BLOCKQUOTE|TR)$/.test(element.tagName) ? text + "\n" : text;
    };
    return bodies.map(read).map(normalize).filter(Boolean).join("\n\n").trim();
  }

  observe(check, timeoutMs, timeoutError) {
    return new Promise((resolve, reject) => {
      let done = false;
      let observer, tick, deadline;
      const cleanup = () => {
        done = true;
        observer?.disconnect();
        this.win.clearInterval(tick);
        this.win.clearTimeout(deadline);
        if (this.abortWait === abort) this.abortWait = null;
      };
      const abort = () => { cleanup(); reject(error("PROVIDER_ERROR", "Local response wait cancelled.")); };
      const evaluate = () => {
        if (done) return;
        try {
          if (this.cancelled) return abort();
          const value = check();
          if (value) { cleanup(); resolve(value); }
        } catch (cause) { cleanup(); reject(cause); }
      };
      observer = new this.win.MutationObserver(evaluate);
      observer.observe(this.doc.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
      tick = this.win.setInterval(evaluate, 150);
      deadline = this.win.setTimeout(() => {
        if (done) return;
        cleanup();
        reject(timeoutError());
      }, Math.max(1, timeoutMs));
      this.abortWait = abort;
      evaluate();
    });
  }

  async sendPrompt() {
    if (this.sent) throw error("DUPLICATE_EXECUTION", "sendPrompt may only be attempted once.");
    if (!this.prompt) throw error("PROMPT_SEND_FAILED", "No prompt has been prepared.");
    const button = await this.observe(() => {
      const candidate = this.find(S.send);
      return candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true"
        ? candidate : null;
    }, 10000, () => error("PROMPT_SEND_FAILED", "No enabled Send button; prompt was not retried."));
    const composer = this.find(S.composer);
    if (!composer || normalize(this.composerText(composer)) !== normalize(this.prompt) || this.find(S.stop)) {
      throw error("PROMPT_SEND_FAILED", "Composer changed or generation is already active.");
    }
    this.beforeUsers = [...this.doc.querySelectorAll(S.user)];
    this.beforeUserKeys = new Set(this.beforeUsers.map((node) => this.messageKey(node)));
    this.beforeAssistantKeys = new Set([...this.doc.querySelectorAll(S.assistant)].map(
      (node) => this.messageKey(node),
    ));
    this.startedAt = Date.now();
    this.sent = true; // Set BEFORE the side effect; never fall back to Enter or click twice.
    button.click();
    await this.observe(() => this.newUser(), 10000, () => error(
      "PROMPT_SEND_FAILED", "Send was attempted but the new user turn was not confirmed. Do not retry automatically.",
    ));
    this.log("PROMPT SENT");
  }

  async waitForResponse() {
    if (!this.sent) throw error("PROMPT_SEND_FAILED", "Prompt has not been sent.");
    this.log("WAITING RESPONSE");
    let previousText = "";
    let previousKey = null;
    let stableSince = Date.now();
    let sawAssistant = false;
    let sawGeneration = false;
    const text = await this.observe(() => {
      if (this.find(S.stop)) sawGeneration = true;
      const assistant = this.currentAssistant();
      if (!assistant) return null;
      sawAssistant = true;
      const value = this.responseText(assistant);
      const key = this.messageKey(assistant);
      const turn = assistant.closest(S.turn) || assistant;
      const generating = !!this.find(S.stop) || !!this.find(S.streaming, turn);
      if (value !== previousText || key !== previousKey || generating) {
        previousText = value;
        previousKey = key;
        stableSince = Date.now();
      }
      // Require an end-of-turn action, no generation UI, and stable new content.
      const completeAction = this.find(S.completionAction, turn);
      if (value && completeAction && !generating && this.editable(this.find(S.composer))
          && Date.now() - stableSince >= this.stableMs) return value;
      return null;
    }, this.timeoutMs - (Date.now() - this.startedAt), () => error(
      sawAssistant || sawGeneration ? "RESPONSE_TIMEOUT" : "ASSISTANT_RESPONSE_NOT_FOUND",
      sawAssistant ? "ChatGPT did not show a completed response before the deadline."
        : "No assistant message for this prompt was found before the deadline.",
    ));
    this.text = text;
    this.finished = true;
    this.log("RESPONSE COMPLETE");
  }

  async getResponse() {
    if (!this.finished) throw error("PROVIDER_ERROR", "No confirmed completed response is available.");
    return this.text;
  }

  async cancel() {
    this.cancelled = true;
    this.abortWait?.(); // Local cleanup only; no website Stop click or job cancel API.
  }
}
