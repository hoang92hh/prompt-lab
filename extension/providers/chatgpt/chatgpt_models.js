import { chatgptSelectors as S } from "./chatgpt_selectors.js";

const normalize = value => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
const alias = value => normalize(value).replace(/^gpt[- ]?/, "");
const label = node => (node?.innerText || node?.textContent || "").trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = (message, code = "UNSUPPORTED_MODEL") => Object.assign(new Error(message), { code });
const standardLevels = ["Instant", "Medium", "High", "Extra High"];
const allLevels = [...standardLevels, "Pro Standard", "Pro Extended", "Pro"];
const visible = node => !!node && node.isConnected && node.getClientRects().length > 0
  && !node.closest('[hidden], [inert], [aria-hidden="true"], [data-active="false"]')
  && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== "hidden";
const disabled = node => !node || node.disabled || !!node.closest(
  '[aria-disabled="true"], [data-disabled], [data-locked="true"]');

async function waitFor(check, timeout = 2500) {
  const end = Date.now() + timeout;
  do {
    const value = check();
    if (value) return value;
    await pause(50);
  } while (Date.now() < end);
  return null;
}

class ModelPicker {
  constructor(doc) { this.doc = doc; this.win = doc.defaultView; this.trigger = null; }
  find(selector, root = this.doc) { return [...root.querySelectorAll(selector)].find(visible); }
  menu() { return this.find(S.picker); }
  options() { return [...(this.menu()?.querySelectorAll(S.modelOption) || [])]; }
  name(option) { return label(option?.querySelector(S.modelName) || option).split("\n")[0]; }
  selectedModel() {
    const checked = this.options().filter(node => node.getAttribute("aria-checked") === "true");
    return checked.length === 1 ? this.name(checked[0]) : "";
  }
  async toggle(open) {
    if (!!this.menu() === open) return;
    const button = this.trigger;
    if (!button || disabled(button)) throw fail("ChatGPT model picker was not found or is disabled.");
    // Some composer pills respond to click; Radix triggers respond to pointerdown.
    button.click();
    if (await waitFor(() => !!this.menu() === open, 400)) return;
    const args = { bubbles: true, cancelable: true, button: 0, buttons: 1,
      pointerId: 1, pointerType: "mouse", isPrimary: true };
    button.dispatchEvent(new this.win.PointerEvent("pointerdown", args));
    button.dispatchEvent(new this.win.PointerEvent("pointerup", { ...args, buttons: 0 }));
    if (!await waitFor(() => !!this.menu() === open)) throw fail("ChatGPT model picker did not respond.");
  }
  async open() {
    const composer = this.find(S.composer);
    const candidates = [...this.doc.querySelectorAll(S.pickerTrigger)].filter(node =>
      visible(node) && !node.closest('[role="menu"], [role="dialog"]'));
    const known = node => /model|thinking effort/i.test(
      (node.getAttribute("aria-label") || "") + " " + (node.dataset.testid || "") + " " + label(node))
      || allLevels.some(level => normalize(label(node)) === normalize(level));
    // Search outward from the composer so unrelated menus are never probed.
    for (let scope = composer?.parentElement; scope && !this.trigger; scope = scope.parentElement) {
      const local = candidates.filter(node => scope.contains(node));
      this.trigger = local.find(known) || [...scope.querySelectorAll("button")].find(node =>
        visible(node) && /^(?:GPT[- ]?)?\d+(?:\.\d+)?(?:\s+(?:Sol|Luna|Terra))?\s+(?:Instant|Medium|High|Extra High)$/i.test(label(node)))
        || (local.length === 1 && !normalize(local[0].getAttribute("aria-label")) ? local[0] : null);
    }
    if (!this.trigger) this.trigger = candidates.find(known);
    await this.toggle(true);
  }
  async advanced() {
    if (this.find(S.modelView, this.menu())) return;
    const toggle = this.find(S.modelToggle, this.menu());
    if (!toggle || disabled(toggle)) throw fail("ChatGPT Select model control was not found.");
    toggle.click();
    if (!await waitFor(() => this.menu() && this.find(S.modelView, this.menu()))) {
      throw fail("ChatGPT model list did not open.");
    }
  }
  async simple() {
    if (await waitFor(() => this.menu() && this.find(S.effortView, this.menu()), 500)) return;
    // Reopening returns to DOM2 without clicking an already-selected model row.
    await this.toggle(false);
    await this.toggle(true);
    if (!await waitFor(() => this.menu() && this.find(S.effortView, this.menu()))) {
      throw fail("ChatGPT reasoning controls were not found.");
    }
  }
  effortLabel() {
    const node = this.menu() && this.find(S.effortLabel, this.menu());
    const name = label(node);
    return allLevels.find(level => normalize(level) === normalize(name)) || "";
  }
  sliderState() {
    const container = this.menu() && this.find(S.effortSlider, this.menu());
    // Radix's semantic thumb can be aria-hidden; read it, but interact with Power/the track.
    const thumb = container?.querySelector(S.sliderValue);
    if (!thumb) return null;
    const number = key => thumb.hasAttribute(key) ? Number(thumb.getAttribute(key)) : NaN;
    return { container, thumb, min: number("aria-valuemin"), max: number("aria-valuemax"),
      value: number("aria-valuenow"), ticks: [...container.querySelectorAll(S.sliderTick)] };
  }
  readEffort(levels) {
    const state = this.sliderState();
    const name = this.effortLabel();
    if (!state) return name;
    const { min, max, value } = state;
    if (min !== 0 || max !== levels.length - 1 || !Number.isInteger(value) || !levels[value]) return "";
    return !name || name === levels[value] ? levels[value] : "";
  }
  async chooseEffort(model, effort) {
    const levels = / pro$/i.test(model)
      ? (alias(model) === "5.5 pro" ? ["Pro Standard", "Pro Extended"] : ["Pro"]) : standardLevels;
    if (!levels.includes(effort)) throw fail(effort + " is not supported for " + model + ".");
    if (this.readEffort(levels) === effort) return false;
    const state = this.sliderState();
    if (!state) throw fail("Cannot verify the reasoning slider for " + model + ".");
    const index = levels.indexOf(effort);
    if (state.min !== 0 || state.max !== levels.length - 1 || !Number.isInteger(state.value)
        || state.value < state.min || state.value > state.max || state.ticks.length !== levels.length) {
      throw fail("Unrecognized reasoning slider; cannot safely map " + effort + ".");
    }
    const tick = state.ticks[index];
    if (disabled(state.container) || disabled(state.thumb) || disabled(tick)) {
      throw fail(effort + " is locked for this account.");
    }
    // Prefer the advertised keyboard interaction, which also works on Radix sliders.
    const control = state.container.closest('[aria-keyshortcuts]');
    if (control) {
      control.focus();
      for (let step = 0; step < levels.length; step++) {
        const current = this.sliderState()?.value;
        if (!Number.isInteger(current) || current === index) break;
        const key = current < index ? "ArrowRight" : "ArrowLeft";
        control.dispatchEvent(new this.win.KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
        control.dispatchEvent(new this.win.KeyboardEvent("keyup", { key, code: key, bubbles: true }));
        if (!await waitFor(() => this.sliderState()?.value !== current, 400)) break;
      }
    }
    if (this.readEffort(levels) !== effort) {
      const target = this.sliderState()?.ticks[index];
      if (!target || disabled(target)) throw fail(effort + " is locked or unavailable.");
      const rect = target.getBoundingClientRect();
      if (!rect.height) throw fail("Reasoning slider point has no clickable area.");
      const args = { bubbles: true, cancelable: true, button: 0, buttons: 1,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      target.dispatchEvent(new this.win.PointerEvent("pointerdown", args));
      target.dispatchEvent(new this.win.PointerEvent("pointerup", { ...args, buttons: 0 }));
    }
    if (!await waitFor(() => this.readEffort(levels) === effort)) {
      throw fail("ChatGPT did not confirm reasoning level " + effort + ".", "MODEL_MISMATCH");
    }
    return true;
  }
}

/** Check the account's selected row and slider; mutate only when they differ. */
export async function selectChatGPTModel(model, effort, { document: doc = document } = {}) {
  if (!model && !effort) return;
  if (!model || !effort) throw fail("Choose both a model and a reasoning level.");
  const picker = new ModelPicker(doc);
  let changed = false, selectionError;
  try {
    await picker.open();
    await picker.advanced();
    const option = picker.options().find(node => visible(node) && alias(picker.name(node)) === alias(model));
    if (!option || disabled(option)) throw fail(model + " is not available in this account's model menu.");
    if (alias(picker.selectedModel()) !== alias(model)) {
      option.click();
      if (!await waitFor(() => alias(picker.selectedModel()) === alias(model))) {
        throw fail("ChatGPT did not switch to " + model + ".", "MODEL_MISMATCH");
      }
      changed = true;
    }
    await picker.simple();
    changed = await picker.chooseEffort(model, effort) || changed;
    if (alias(picker.selectedModel()) !== alias(model)) {
      throw fail("ChatGPT model changed during reasoning selection.", "MODEL_MISMATCH");
    }
    const upgrade = [...doc.querySelectorAll('[role="dialog"]')].find(node =>
      visible(node) && /upgrade|choose a plan|get plus|get pro/i.test(label(node)));
    if (upgrade) throw fail("This account cannot use the selected model and reasoning level.");
    return { model, effort, changed };
  } catch (error) {
    selectionError = error;
    throw error;
  } finally {
    if (picker.menu() && picker.trigger) {
      try { await picker.toggle(false); }
      catch (error) { if (!selectionError) throw error; }
    }
  }
}
