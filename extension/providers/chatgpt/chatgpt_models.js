/** Match the visible ChatGPT model menu, then verify the account accepted each choice. */
const visible = node => !!node && node.getClientRects().length > 0;
const text = node => (node.innerText || node.getAttribute("aria-label") || "").trim().split("\n")[0].trim();
const normalize = value => value.replace(/\s+/g, " ").trim().toLowerCase();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const unavailable = message => Object.assign(new Error(message), { code: "UNSUPPORTED_MODEL" });
const alias = model => normalize(model.replace(/^GPT[- ]/i, ""));
const levels = ["Instant", "Medium", "High", "Extra High"];
const clickable = () => [...document.querySelectorAll('button, [role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"]')].filter(visible);
const disabled = node => !!node && (node.disabled || node.getAttribute("aria-disabled") === "true" || !!node.closest('[aria-disabled="true"]'));

async function waitFor(check, timeout = 3000) {
  const end = Date.now() + timeout;
  do {
    const found = check();
    if (found) return found;
    await pause(100);
  } while (Date.now() < end);
  return null;
}

function exactChoice(label) {
  return clickable().find(node => normalize(text(node)) === normalize(label));
}

function modelButton() {
  return clickable().find(node => /^(?:GPT[- ]?)?\d+(?:\.\d+)?\s+(?:(?:Sol|Luna|Terra)\s+)?(?:Instant|Medium|High|Extra High)/i.test(text(node))
    && !!node.closest("form, header, [data-type=unified-composer]")
    && !node.closest('[role="menu"], [role="listbox"]'))
    || clickable().find(node => /model/i.test((node.getAttribute("data-testid") || "") + " " + (node.getAttribute("aria-label") || "")));
}

function effortButton() {
  return clickable().find(node => /thinking effort/i.test(text(node)));
}

function modelHeading() {
  return clickable().find(node => /^(?:GPT[- ]?)?\d+(?:\.\d+)?\s+.*(?:Instant|Medium|High)/i.test(text(node)));
}

function modelOption(model) {
  const names = [model, alias(model)];
  return clickable().find(node => names.some(name => normalize(text(node)) === normalize(name)));
}

async function chooseModel(model) {
  let button = modelButton() || effortButton();
  if (!button) throw unavailable("ChatGPT model picker was not found.");
  button.click();
  let option = await waitFor(() => modelOption(model));
  if (!option) {
    // Some layouts open an effort popover first; its model heading opens the model list.
    const heading = modelHeading();
    if (heading && heading !== button) {
      heading.click();
      option = await waitFor(() => modelOption(model));
    }
  }
  if (!option || disabled(option)) throw unavailable(model + " is not available in this account's model menu.");
  option.click();
  await pause(200);
  button = modelButton() || modelHeading();
  if (!button || !normalize(text(button)).startsWith(alias(model) + " ")) {
    throw unavailable("ChatGPT did not switch to " + model + ".");
  }
}

function effortLabel(model) {
  const button = modelButton() || modelHeading();
  const label = button ? normalize(text(button)) : "";
  if (!label.startsWith(alias(model) + " ")) return "";
  return levels.find(level => label.includes(" " + normalize(level))) || "";
}

function slider() {
  return [...document.querySelectorAll('[role="slider"], input[type="range"]')].find(visible);
}

function clickSliderAt(node, fraction) {
  const rect = node.getBoundingClientRect();
  if (!rect.width) throw unavailable("Thinking effort slider has no clickable area.");
  const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width * fraction));
  const y = rect.top + rect.height / 2;
  const args = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  const Pointer = window.PointerEvent || MouseEvent;
  node.dispatchEvent(new Pointer("pointerdown", args));
  node.dispatchEvent(new MouseEvent("mousedown", args));
  node.dispatchEvent(new Pointer("pointerup", args));
  node.dispatchEvent(new MouseEvent("mouseup", args));
  node.dispatchEvent(new MouseEvent("click", args));
}

async function chooseEffort(model, effort) {
  if (effortLabel(model) === effort) return;
  const button = effortButton() || modelButton();
  if (!button && !slider()) throw unavailable("Thinking effort picker was not found.");
  if (!slider() && !exactChoice(effort)) button.click();
  await pause(150);
  const option = exactChoice(effort);
  if (option) {
    if (disabled(option)) throw unavailable(effort + " is locked for this account.");
    option.click();
  } else {
    const track = await waitFor(slider, 1000);
    const index = levels.indexOf(effort);
    if (!track || index < 0) throw unavailable(effort + " is not available for " + model + ".");
    if (disabled(track)) throw unavailable("Thinking effort slider is disabled.");
    clickSliderAt(track, index / (levels.length - 1));
  }
  if (!await waitFor(() => effortLabel(model) === effort, 1500)) {
    throw unavailable(effort + " was not selected. It may be locked for this account.");
  }
}

export async function selectChatGPTModel(model, effort) {
  if (!model && !effort) return;
  if (!model || !effort) throw unavailable("Choose both a model and a reasoning level.");
  await chooseModel(model);
  await chooseEffort(model, effort);
  const upgrade = [...document.querySelectorAll('[role="dialog"]')].find(node =>
    visible(node) && /upgrade|choose a plan|get plus|get pro/i.test(node.innerText || ""));
  if (upgrade) throw unavailable("This account cannot use the selected model and reasoning level.");
}
