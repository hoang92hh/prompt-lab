/** Create a ChatGPT project from the dedicated /projects page. */
const visible = node => !!node && node.isConnected && node.getClientRects().length > 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const failed = message => Object.assign(new Error(message), { code: "PROJECT_CREATE_FAILED" });

function labels(node) {
  return [node.innerText, node.getAttribute?.("aria-label"), node.getAttribute?.("title"),
    node.getAttribute?.("data-testid"), node.getAttribute?.("placeholder")]
    .filter(Boolean).map(value => value.trim().replace(/^\+\s*/, "").replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ").trim());
}

function hasLabel(node, pattern) {
  return labels(node).some(value => pattern.test(value));
}

function enabled(node) {
  return visible(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true";
}

async function waitFor(find, message, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const found = find();
    if (found) return found;
    await pause(150);
  }
  throw failed(message);
}

function createPageButton() {
  if (!/^\/projects\/?$/.test(location.pathname)) return null;
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(enabled);
  return buttons.find(node => hasLabel(node, /^(create|t\u1ea1o)$/i))
    || buttons.find(node => hasLabel(node, /^(create project|t\u1ea1o d\u1ef1 \u00e1n)$/i));
}

function editableInputs(root = document) {
  return [...root.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')]
    .filter(enabled).filter(node => !node.readOnly);
}

function projectEditor(inputsBeforeClick) {
  const overlays = [...document.querySelectorAll(
    '[role="dialog"], dialog, [data-radix-dialog-content], [data-state="open"]',
  )].filter(visible);
  for (const scope of overlays) {
    const candidates = editableInputs(scope).filter(node =>
      !hasLabel(node, /^search projects$|t\u00ecm ki\u1ebfm d\u1ef1 \u00e1n/i));
    const input = candidates.find(node => hasLabel(node,
      /project.*name|name.*project|t\u00ean.*d\u1ef1 \u00e1n|d\u1ef1 \u00e1n.*t\u00ean/i))
      || candidates.find(node => !inputsBeforeClick.has(node));
    if (input) return { input, scope };
  }
  // Some ChatGPT builds render a sheet without role=dialog. It must still be a newly-created input.
  const input = editableInputs().find(node => !inputsBeforeClick.has(node)
    && !hasLabel(node, /^search projects$|t\u00ecm ki\u1ebfm d\u1ef1 \u00e1n/i));
  if (!input) return null;
  const scope = input.closest('form, [role="dialog"], dialog, [data-radix-dialog-content], [data-state="open"]');
  return scope ? { input, scope } : null;
}

function submitButton(scope) {
  return [...scope.querySelectorAll('button, [role="button"]')].filter(enabled)
    .find(node => hasLabel(node, /^(create|create project|t\u1ea1o|t\u1ea1o d\u1ef1 \u00e1n)$/i));
}

function setInput(input, value) {
  input.focus();
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw failed("ChatGPT project name field cannot be edited.");
  setter.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function createProject(name) {
  if (typeof name !== "string" || !name.trim()) throw failed("Project name is required.");
  if (!/^\/projects\/?$/.test(location.pathname)) {
    throw failed("ChatGPT is not on the Projects page.");
  }
  const cleanName = name.trim();
  const inputsBeforeClick = new Set(editableInputs());
  const trigger = await waitFor(createPageButton,
    "The Create button was not found on the ChatGPT Projects page.");
  trigger.click();
  const editor = await waitFor(() => projectEditor(inputsBeforeClick),
    "The project creation window did not appear.");
  setInput(editor.input, cleanName);
  if (editor.input.value !== cleanName) throw failed("ChatGPT did not accept the project name.");
  const submit = await waitFor(() => submitButton(editor.scope),
    "The Create button in the project creation window did not become available.");
  submit.click();
}
