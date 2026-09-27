// Chỉ sửa các hằng số trong khối này khi muốn đổi mặc định theo provider/step.
export const CHATGPT_STEP_1_MODEL = "GPT-5.5";
export const CHATGPT_STEP_1_EFFORT = "Medium";
export const CHATGPT_STEP_2_MODEL = "GPT-5.6 Sol";
export const CHATGPT_STEP_2_EFFORT = "Medium";
export const CHATGPT_STEP_3_MODEL = "GPT-5.6 Sol";
export const CHATGPT_STEP_3_EFFORT = "Medium";

// Claude tạm dùng cùng giá trị với ChatGPT. Các hằng số được tách riêng để đổi sau này.
export const CLAUDE_STEP_1_MODEL = "GPT-5.5";
export const CLAUDE_STEP_1_EFFORT = "Medium";
export const CLAUDE_STEP_2_MODEL = "GPT-5.6 Sol";
export const CLAUDE_STEP_2_EFFORT = "Medium";
export const CLAUDE_STEP_3_MODEL = "GPT-5.6 Sol";
export const CLAUDE_STEP_3_EFFORT = "Medium";

const CHATGPT_MODEL_CATALOG = {
  "GPT-5.5": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.5 Pro": ["Pro Standard", "Pro Extended"],
  "GPT-5.6 Luna": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Terra": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Sol": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Sol Pro": ["Pro"],
  "GPT-6 Pro": ["Pro"]
};

// Catalog Claude cũng tách riêng, dù hiện tại đang dùng tạm các giá trị của ChatGPT.
const CLAUDE_MODEL_CATALOG = {
  "GPT-5.5": ["Instant", "Medium", "High", "Extra High"],
  "GPT-5.6 Sol": ["Instant", "Medium", "High", "Extra High"]
};

export const AI_PROVIDER_CONFIG = {
  chatgpt: {
    modelSelectId: "model",
    effortSelectId: "effort",
    modelCatalog: CHATGPT_MODEL_CATALOG,
    stepDefaults: {
      step1: {model: CHATGPT_STEP_1_MODEL, effort: CHATGPT_STEP_1_EFFORT},
      step2: {model: CHATGPT_STEP_2_MODEL, effort: CHATGPT_STEP_2_EFFORT},
      step3: {model: CHATGPT_STEP_3_MODEL, effort: CHATGPT_STEP_3_EFFORT}
    }
  },
  claude: {
    modelSelectId: "claude-model",
    effortSelectId: "claude-effort",
    modelCatalog: CLAUDE_MODEL_CATALOG,
    stepDefaults: {
      step1: {model: CLAUDE_STEP_1_MODEL, effort: CLAUDE_STEP_1_EFFORT},
      step2: {model: CLAUDE_STEP_2_MODEL, effort: CLAUDE_STEP_2_EFFORT},
      step3: {model: CLAUDE_STEP_3_MODEL, effort: CLAUDE_STEP_3_EFFORT}
    }
  }
};
