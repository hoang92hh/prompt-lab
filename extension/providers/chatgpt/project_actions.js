/** ChatGPT project creation through the visible web UI. */
const visible = node => !!node && node.getClientRects().length > 0;
const label = node => (node.innerText || node.getAttribute("aria-label") || "").trim().replace(/^\+\s*/, "").toLowerCase();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(find, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const found = find();
    if (found) return found;
    await pause(200);
  }
  throw Object.assign(new Error("ChatGPT project UI was not found."), { code: "PROJECT_CREATE_FAILED" });
}
export async function createProject(name) {
  const trigger = await waitFor(() => [...document.querySelectorAll("button, a")]
    .find(node => visible(node) && /^(new project|create project|dự án mới|tạo dự án)$/i.test(label(node))));
  trigger.click();
  const dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"], dialog')]
    .find(visible));
  const input = await waitFor(() => [...dialog.querySelectorAll("input")]
    .find(node => visible(node) && !["checkbox", "radio", "hidden"].includes(node.type)));
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, name);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: name, inputType: "insertText" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  if (input.value !== name) throw Object.assign(new Error("Project name was not accepted."), { code: "PROJECT_CREATE_FAILED" });
  const submit = await waitFor(() => [...dialog.querySelectorAll("button")]
    .find(node => visible(node) && !node.disabled && /^(create|create project|tạo|tạo dự án)$/i.test(label(node))));
  submit.click();
}
