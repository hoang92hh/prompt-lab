/** Model selection is intentionally not implemented in this stage. */
export const chatgptModels = Object.freeze({});
export function useCurrentModel(model) {
  if (model != null) {
    throw Object.assign(new Error("Omit model or use null; the current ChatGPT UI model is used."), {
      code: "UNSUPPORTED_MODEL",
    });
  }
}
