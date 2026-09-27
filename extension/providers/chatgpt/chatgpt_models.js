import { chatgptSelectors as S } from "./chatgpt_selectors.js";

const normalize = value => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
const alias = value => normalize(value).replace(/^gpt[- ]?/, "");
const label = node => (node?.innerText || node?.textContent || "").trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = (message, code = "UNSUPPORTED_MODEL") => Object.assign(new Error(message), { code });
const standardLevels = ["Instant", "Medium", "High", "Extra High"];
const allLevels = [...standardLevels, "Pro Standard", "Pro Extended", "Pro"];
const levelsForModel = model => / pro$/i.test(model)
  ? (alias(model) === "5.5 pro" ? ["Pro Standard", "Pro Extended"] : ["Pro"])
  : standardLevels;
const effortFromText = (value, levels = allLevels) => {
  const name = normalize(value);
  return [...levels].sort((left, right) => right.length - left.length).find(level => {
    const normalizedLevel = normalize(level);
    return name === normalizedLevel || name.endsWith(" " + normalizedLevel);
  }) || "";
};
const visible = node => !!node && node.isConnected && node.getClientRects().length > 0
  && !node.closest('[hidden], [inert], [aria-hidden="true"], [data-active="false"]')
  && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== "hidden";
const disabled = node => !node || node.disabled || !!node.closest(
  '[aria-disabled="true"], [data-disabled], [data-locked="true"]');

async function waitFor(check, timeout = 2500, interval = 50) {
  const end = Date.now() + timeout;
  do {
    const value = check();
    if (value) return value;
    await pause(interval);
  } while (Date.now() < end);
  return null;
}

class ModelPicker {
  constructor(doc, log = () => {}) {
    this.doc = doc;
    this.win = doc.defaultView;
    this.log = log;
    this.trigger = null;
  }
  find(selector, root = this.doc) { return [...root.querySelectorAll(selector)].find(visible); }
  actionable(node) {
    if (!node) return null;
    const selector = 'button, [role="button"], [tabindex]';
    if (node.matches(selector)) return node;
    return node.closest(selector) || node.querySelector(selector) || node;
  }
  dispatchPointerClick(control) {
    control.scrollIntoView({ block: "nearest", inline: "nearest" });
    control.focus();
    const target = control.firstElementChild || control;
    const rect = target.getBoundingClientRect();
    const common = { bubbles: true, cancelable: true, composed: true, view: this.win,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    target.dispatchEvent(new this.win.PointerEvent("pointerover", {
      ...common, button: -1, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    target.dispatchEvent(new this.win.PointerEvent("pointermove", {
      ...common, button: -1, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    target.dispatchEvent(new this.win.MouseEvent("mouseover", common));
    target.dispatchEvent(new this.win.MouseEvent("mousemove", common));
    target.dispatchEvent(new this.win.PointerEvent("pointerdown", {
      ...common, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    target.dispatchEvent(new this.win.MouseEvent("mousedown", { ...common, button: 0, buttons: 1 }));
    target.dispatchEvent(new this.win.PointerEvent("pointerup", {
      ...common, button: 0, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    target.dispatchEvent(new this.win.MouseEvent("mouseup", { ...common, button: 0, buttons: 0 }));
    target.dispatchEvent(new this.win.MouseEvent("click", { ...common, button: 0, buttons: 0 }));
  }
  dispatchKey(control, key) {
    const code = key === " " ? "Space" : key;
    control.focus();
    control.dispatchEvent(new this.win.KeyboardEvent("keydown", {
      key, code, bubbles: true, cancelable: true, composed: true,
    }));
    control.dispatchEvent(new this.win.KeyboardEvent("keyup", {
      key, code, bubbles: true, composed: true,
    }));
  }
  async activateUntil(resolveControl, check, keys) {
    let control = resolveControl();
    if (!control || disabled(control)) return false;
    this.dispatchPointerClick(control);
    if (await waitFor(check, 1000)) return true;
    for (const key of keys) {
      control = resolveControl();
      if (!control || disabled(control)) return false;
      this.dispatchKey(control, key);
      if (await waitFor(check, 1000)) return true;
    }
    return false;
  }
  triggerDiagnostics(composer) {
    let buttons = [];
    for (let scope = composer?.parentElement, depth = 0; scope && depth < 6; scope = scope.parentElement, depth++) {
      buttons = [...scope.querySelectorAll("button")].filter(visible);
      if (buttons.length >= 2) break;
    }
    if (!buttons.length) buttons = [...this.doc.querySelectorAll("button")].filter(visible);
    return buttons.slice(0, 12).map(node => ({
      tag: node.tagName.toLowerCase(),
      text: label(node).replace(/\s+/g, " ").slice(0, 80),
      ariaLabel: node.getAttribute("aria-label") || "",
      ariaHaspopup: node.getAttribute("aria-haspopup") || "",
      ariaExpanded: node.getAttribute("aria-expanded") || "",
      testId: node.dataset.testid || "",
      disabled: disabled(node),
    }));
  }
  popupCandidates() {
    return [...this.doc.querySelectorAll(S.pickerPopup)].filter(visible);
  }
  menu() {
    if (this.trigger) {
      const controlledId = this.trigger.getAttribute("aria-controls");
      const controlled = controlledId && this.doc.getElementById(controlledId);
      if (visible(controlled)) return controlled;

      if (this.trigger.id) {
        const labelled = this.popupCandidates().filter(node =>
          (node.getAttribute("aria-labelledby") || "").split(/\s+/).includes(this.trigger.id));
        if (labelled.length === 1) return labelled[0];
      }
    }

    const known = [...this.doc.querySelectorAll(S.picker)].filter(visible);
    if (known.length === 1) return known[0];

    const structural = this.popupCandidates().filter(node =>
      node.querySelector(S.modelToggle) || node.querySelector(S.modelView) ||
      node.querySelector(S.effortView) || node.querySelector(S.effortSlider));
    return structural.length === 1 ? structural[0] : null;
  }
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
    const locateTrigger = () => {
      const composer = this.find(S.composer);
      const effortCandidates = [...new Set(
        [...this.doc.querySelectorAll(S.effortTrigger)].map(node => this.actionable(node)),
      )].filter(node => visible(node) && !node.closest('[role="menu"], [role="dialog"]'));
      for (let scope = composer?.parentElement; scope; scope = scope.parentElement) {
        const local = effortCandidates.filter(node => scope.contains(node));
        if (local.length === 1) return local[0];
      }
      return effortCandidates.length === 1 ? effortCandidates[0] : null;
    };
    this.trigger = await waitFor(locateTrigger, 20000, 100);
    if (!this.trigger) {
      this.log("DOM1 CANDIDATES: " + JSON.stringify(this.triggerDiagnostics(this.find(S.composer))));
      throw fail("DOM1_TRIGGER_NOT_FOUND: A unique composer effort pill was not found.", "MODEL_PICKER_FAILED");
    }
    if (disabled(this.trigger)) {
      this.log("DOM1 CANDIDATES: " + JSON.stringify(this.triggerDiagnostics(this.find(S.composer))));
      throw fail("DOM1_TRIGGER_DISABLED: ChatGPT model picker trigger is disabled.", "MODEL_PICKER_FAILED");
    }
    this.log("DOM1 TRIGGER FOUND: " + JSON.stringify({
      text: label(this.trigger).replace(/\s+/g, " ").slice(0, 80),
      ariaExpanded: this.trigger.getAttribute("aria-expanded") || "",
      state: this.trigger.dataset.state || "",
    }));
    this.initialEffort = effortFromText(label(this.trigger));
    await this.toggle(true);
  }
  async advanced() {
    const modelRowsVisible = () => this.options().some(visible);
    if (modelRowsVisible()) return;
    const resolveToggle = () => this.menu() && this.find(S.modelToggle, this.menu());
    const toggle = resolveToggle();
    if (!toggle || disabled(toggle)) {
      throw fail("DOM2 -> DOM3: ChatGPT Select model control was not found.", "MODEL_PICKER_FAILED");
    }
    const opened = () => this.menu() && modelRowsVisible();
    if (!await this.activateUntil(resolveToggle, opened, ["ArrowRight", "Enter"])) {
      throw fail("DOM2 -> DOM3: ChatGPT model list did not open.", "MODEL_PICKER_FAILED");
    }
  }
  async simple() {
    const simpleViewVisible = () => this.menu() && (
      this.find(S.effortView, this.menu()) ||
      this.find(S.modelToggle, this.menu()) ||
      this.find(S.effortSlider, this.menu())
    );
    if (await waitFor(simpleViewVisible, 500)) return;
    const selectedOption = () => {
      const selected = this.options().filter(node =>
        visible(node) && node.getAttribute("aria-checked") === "true");
      return selected.length === 1 ? selected[0] : null;
    };
    const returned = simpleViewVisible;
    const option = selectedOption();
    if (!option || disabled(option)) {
      throw fail("DOM3 -> DOM2: The checked model row was not available.", "MODEL_PICKER_FAILED");
    }
    if (!await this.activateUntil(selectedOption, returned, ["Enter", " "])) {
      throw fail("DOM3 -> DOM2: ChatGPT reasoning controls did not return.", "MODEL_PICKER_FAILED");
    }
  }
  effortLabel(levels = allLevels) {
    const node = this.menu() && this.find(S.effortLabel, this.menu());
    return effortFromText(label(node), levels);
  }
  triggerEffort(levels = allLevels) {
    if (this.initialEffort && levels.includes(this.initialEffort)) return this.initialEffort;
    return effortFromText(label(this.trigger), levels);
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
    const name = this.effortLabel(levels);
    if (!state) return name;
    const { min, max, value } = state;
    if (min !== 0 || max !== levels.length - 1 || !Number.isInteger(value) || !levels[value]) return "";
    return !name || name === levels[value] ? levels[value] : "";
  }
  async chooseEffort(model, effort) {
    const levels = levelsForModel(model);
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

/** Read the website selection without changing a model row or reasoning slider. */
export async function readChatGPTModelState({ document: doc = document, log = () => {} } = {}) {
  const picker = new ModelPicker(doc, log);
  let readError = null;
  try {
    log("DOM1 -> DOM2");
    await picker.open();
    log("DOM2 OPEN");
    await pause(1000);

    const initialEffort = await waitFor(
      () => picker.effortLabel() || picker.triggerEffort(), 2000, 100);
    log("DOM2 EFFORT READ: " + initialEffort);

    await picker.advanced();
    log("DOM3 OPEN");
    await pause(1000);

    const model = picker.selectedModel();
    if (!model) {
      throw fail("DOM3: ChatGPT did not expose exactly one checked model.", "MODEL_PICKER_FAILED");
    }
    log("DOM3 MODEL READ: " + model);

    await picker.simple();
    log("DOM2 RETURNED");
    await pause(1000);

    const modelLevels = levelsForModel(model);
    const effort = await waitFor(() =>
      picker.readEffort(modelLevels) || picker.effortLabel(modelLevels)
        || picker.triggerEffort(modelLevels),
    2000, 100);
    if (!effort) {
      throw fail("DOM2: ChatGPT reasoning level could not be verified.", "MODEL_PICKER_FAILED");
    }
    if (initialEffort && effort !== initialEffort) {
      throw fail("DOM2: Reasoning level changed while reading model state.", "MODEL_MISMATCH");
    }
    log("DOM2 EFFORT VERIFIED: " + effort);

    log("MODEL STATE READ: " + model + " / " + effort);
    return { model, effort };
  } catch (error) {
    readError = error;
    throw error;
  } finally {
    if (picker.menu() && picker.trigger) {
      try {
        await pause(1000);
        await picker.toggle(false);
        log("MENU CLOSED");
      } catch (closeError) {
        if (!readError) throw closeError;
      }
    }
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
