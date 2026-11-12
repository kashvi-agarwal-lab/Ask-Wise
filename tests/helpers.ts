import type { UIMessage } from "ai";

let n = 0;
export const user = (text: string): UIMessage => ({ id: `u${n++}`, role: "user", parts: [{ type: "text", text }] });
/** An assistant turn that asked one of the app's scripted questions. */
export const askedScripted = (id: string, question = "q", options: string[] = []): UIMessage =>
  ({ id: `a${n++}`, role: "assistant", parts: [{ type: "tool-ask_scripted", toolCallId: `t${n}`, state: "output-available", input: {}, output: { id, question, options } }] }) as unknown as UIMessage;
export const assistantWith = (type: string, output: unknown): UIMessage =>
  ({ id: `a${n++}`, role: "assistant", parts: [{ type, toolCallId: `t${n}`, state: "output-available", input: {}, output }] }) as unknown as UIMessage;
