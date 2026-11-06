import { google } from "@ai-sdk/google";

// THE ONE PLACE to switch AI providers.
// To use Claude later: install @ai-sdk/anthropic, then return anthropic("claude-sonnet-5-5") here.
export function getModel() {
  return google(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite");
}
