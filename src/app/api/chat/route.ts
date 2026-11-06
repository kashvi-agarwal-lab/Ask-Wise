import {
  streamText,
  tool,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  isStepCount,
  hasToolCall,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { getModel } from "@/lib/model";
import { concernLabels } from "@/lib/catalogue";
import { systemPrompt, type Profile } from "@/lib/prompt";
import { flowHint, questionState, applyAnswers, needsQuestionDue, needsOptions, requiredGroups, MAX_QUESTIONS } from "@/lib/flow";
import {
  searchProducts,
  productDetails,
  compare,
  validate,
  cardFull,
  buildRoutine,
  updateRoutine,
  type Routine,
  type Slot,
} from "@/lib/engine";

export const maxDuration = 60;

const concernKey = z.enum(Object.keys(concernLabels) as [string, ...string[]]);
const slot = z.enum(["am", "pm", "weekly", "supplement"]);

// Tool results are stored inside the chat messages, so the server needs no database:
// we read the latest profile and routine back out of the conversation history.
function lastToolOutput<T>(messages: UIMessage[], toolName: string): T | null {
  for (const m of [...messages].reverse()) {
    for (const part of [...m.parts].reverse()) {
      const p = part as { type: string; state?: string; output?: unknown };
      if (p.type === `tool-${toolName}` && p.state === "output-available") {
        const out = p.output as { error?: string } | undefined;
        if (out && !out.error) return out as T;
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  if (!Array.isArray(messages) || messages.length > 60) {
    return new Response("Conversation too long. Please start a new one.", { status: 400 });
  }

  let profile: Profile = applyAnswers(lastToolOutput<Profile>(messages, "update_profile") ?? {}, messages);
  let routine: Routine | null = lastToolOutput<Routine>(messages, "build_routine");
  const lastUpdate = lastToolOutput<Routine>(messages, "update_routine");
  // Whichever of build/update happened last is the current routine.
  const order = (name: string) =>
    messages.findLastIndex((m) => m.parts.some((p) => p.type === `tool-${name}`));
  if (lastUpdate && order("update_routine") > order("build_routine")) routine = lastUpdate;

  const result = streamText({
    model: getModel(),
    instructions: systemPrompt(profile, !!routine, flowHint(profile, questionState(messages).asked)),
    messages: await convertToModelMessages(messages),
    stopWhen: [isStepCount(8), hasToolCall("ask_question"), hasToolCall("ask_needs")], // a question always ends the turn so the customer can answer
    // The small free model sometimes searches and then just chats instead of showing products.
    // Once it has searched, it must finish with a real answer tool (ask / recommend / routine / compare).
    prepareStep: ({ steps, stepNumber }) => {
      // Until we know "individual picks or a routine", the AI may not show products yet: it must ask.
      const blocked = !profile.mode && !profile.decideForMe && questionState(messages).asked < MAX_QUESTIONS;
      const ALL = ["update_profile", "search_products", "get_product_details", "compare_products", "recommend_products", "build_routine", "update_routine", "ask_needs", "ask_question"];
      // The app asks the "which kinds of products" question itself (the AI kept skipping it).
      if (stepNumber === 0 && needsQuestionDue(profile, messages))
        return { toolChoice: { type: "tool" as const, toolName: "ask_needs" as const }, activeTools: ["ask_needs"] as never };
      const used = new Set(steps.flatMap((s) => s.toolCalls.map((c) => c.toolName as string)));
      const answered = ["ask_question", "ask_needs", "recommend_products", "build_routine", "update_routine", "compare_products"].some((t) => used.has(t));
      if (used.has("search_products") && !answered)
        return {
          toolChoice: "required" as const,
          activeTools: (blocked ? ["ask_question"] : ["ask_question", "ask_needs", "recommend_products", "build_routine", "update_routine", "compare_products"]) as never,
        };
      if (blocked) return { activeTools: ALL.filter((t) => t !== "recommend_products" && t !== "build_routine") as never };
      // The customer chose several kinds of products: make sure each one gets its own group.
      const need = requiredGroups(profile).length;
      const done = steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "recommend_products").length;
      if (need > 1 && done > 0 && done < need)
        return { toolChoice: { type: "tool" as const, toolName: "recommend_products" as const }, activeTools: ["recommend_products"] as never };
      return undefined;
    },
    tools: {
      update_profile: tool({
        description:
          "Save new facts the customer told you about themselves. Pass ONLY new or changed facts. Returns the full saved profile.",
        inputSchema: z.object({
          skinType: z.string().optional().describe("oily, dry, combination, normal or sensitive"),
          concerns: z.array(z.string()).optional(),
          bodyAreas: z.array(z.string()).optional(),
          sensitivities: z.string().optional().describe("allergies or ingredients that irritate them"),
          pregnantOrNursing: z.boolean().optional(),
          budget: z.string().optional(),
          preferences: z.string().optional(),
          notes: z.string().optional(),
          mode: z.enum(["individual", "routine"]).optional().describe("what the customer chose: individual picks or a complete routine"),
          needs: z.array(z.string()).optional().describe("kinds of product wanted: cleansing, treatment, moisturising, sun protection"),
        }),
        execute: async (input) => {
          const merged: Profile = { ...profile };
          for (const [k, v] of Object.entries(input)) {
            if (v === undefined) continue;
            if (Array.isArray(v)) {
              const prev = ((merged as Record<string, unknown>)[k] as string[] | undefined) ?? [];
              (merged as Record<string, unknown>)[k] = [...new Set([...prev, ...v])];
            } else (merged as Record<string, unknown>)[k] = v;
          }
          profile = merged;
          return merged;
        },
      }),

      search_products: tool({
        description:
          "Search the verified Bodywise catalogue. Returns up to 6 real products (one per product family, with sizes). Use the concern keys from the instructions.",
        inputSchema: z.object({
          concernKeys: z.array(concernKey).optional(),
          category: z.enum(["body", "hair", "face", "sun-protection", "wellness"]).optional(),
          type: z.string().optional().describe("e.g. body wash, face wash, lotion, serum, sunscreen, shampoo, scrub"),
          bodyArea: z.string().optional(),
          maxPrice: z.number().optional().describe("rupees, for a single product"),
          text: z.string().optional().describe("a product name or ingredient to look for"),
          includeKits: z.boolean().optional(),
          includeSupplements: z.boolean().optional(),
          excludeIds: z.array(z.string()).optional(),
          limit: z.number().min(1).max(10).optional(),
        }),
        execute: async (input) => searchProducts(input),
      }),

      get_product_details: tool({
        description: "Get the full verified facts for one product ID: ingredients, how to use, suitability and precautions.",
        inputSchema: z.object({ productId: z.string() }),
        execute: async ({ productId }) => productDetails(productId),
      }),

      compare_products: tool({
        description: "Compare 2 to 3 products side by side using verified catalogue facts.",
        inputSchema: z.object({ productIds: z.array(z.string()).min(2).max(3) }),
        execute: async ({ productIds }) => compare(productIds),
      }),

      recommend_products: tool({
        description:
          "Show 2 to 3 real options for ONE kind of product (e.g. body wash) and mark your best pick. Call once per kind of product. The app draws the cards from the catalogue; you only give IDs and short reasons.",
        inputSchema: z.object({
          need: z.string().describe('the kind of product, e.g. "Body wash", "Moisturiser", "Sunscreen"'),
          picks: z
            .array(
              z.object({
                productId: z.string(),
                why: z.string().describe("one short sentence tied to the customer's needs"),
                chooseIf: z.string().optional().describe('for options that are NOT the best pick: "Choose this if ..."'),
              })
            )
            .min(1)
            .max(3),
          bestPickId: z.string().describe("the productId of your best pick among the picks"),
          bestReason: z.string().describe("one or two sentences on why it is the best pick for this customer"),
        }),
        execute: async ({ need, picks, bestPickId, bestReason }) => {
          const { valid, invalid } = validate(picks.map((p) => p.productId));
          const best = valid.some((p) => p.id === bestPickId) ? bestPickId : valid[0]?.id;
          const cards = valid
            .map((p) => {
              const pick = picks.find((x) => x.productId === p.id);
              return { ...cardFull(p), why: pick?.why ?? "", chooseIf: p.id === best || /sever|persist|stubborn|serious|worse|worsen|chronic/i.test(pick?.chooseIf ?? "") ? undefined : pick?.chooseIf, // never judge severity: that is a doctor's call
                 isBest: p.id === best };
            })
            .sort((a, b) => Number(b.isBest) - Number(a.isBest));
          return { need, cards, bestPickId: best, bestReason, rejected: invalid.map((id) => `${id}: not in catalogue`) };
        },
      }),

      build_routine: tool({
        description:
          "Build a complete routine from product IDs. The app places each product in AM, PM, weekly or supplement slots, adds up the cost and returns safety warnings. Slots are optional overrides.",
        inputSchema: z.object({
          products: z.array(z.object({ productId: z.string(), slots: z.array(slot).optional() })).min(1).max(8),
        }),
        execute: async ({ products }) => {
          const r = buildRoutine(products.map((p) => ({ id: p.productId, slots: p.slots as Slot[] | undefined })));
          routine = r;
          return r;
        },
      }),

      update_routine: tool({
        description:
          "Change the customer's current routine: remove a product, add one, or swap one for another. Returns the updated routine and new total.",
        inputSchema: z.object({
          action: z.enum(["remove", "add", "swap"]),
          productId: z.string().describe("the product to remove, add, or replace"),
          replacementId: z.string().optional().describe("for swap: the new product"),
          slots: z.array(slot).optional(),
        }),
        execute: async ({ action, productId, replacementId, slots }) => {
          if (!routine) return { error: "There is no routine yet. Build one first with build_routine." };
          const r = updateRoutine(routine, action, productId, replacementId, slots as Slot[] | undefined);
          if (!("error" in r)) routine = r;
          return r;
        },
      }),

      ask_needs: tool({
        description:
          'Ask which kinds of products the customer wants. Takes no input: the app words the question and builds the buttons.',
        inputSchema: z.object({}),
        execute: async () => ({
          question: "Which kinds of products would you like me to look at?",
          options: [...needsOptions(profile), "You decide for me"],
          multiSelect: true,
        }),
      }),

      ask_question: tool({
        description:
          "Ask the customer ONE question and show tappable answer buttons. This is the ONLY way to ask a question: never put a question in plain text.",
        inputSchema: z.object({
          question: z.string().describe("the one question, short and friendly"),
          options: z.array(z.string().max(40)).min(2).max(6).describe("2 to 6 short likely answers"),
          multiSelect: z.boolean().optional().describe("true when the customer may pick several answers"),
        }),
        execute: async ({ question, options, multiSelect }) => ({ question, options, multiSelect: !!multiSelect }),
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Turn technical errors into a short message the customer can understand
      onError: (error) => {
        const text = String((error as { message?: string })?.message ?? error);
        console.error("[chat error]", text.slice(0, 300));
        if (/quota|rate|429|RESOURCE_EXHAUSTED/i.test(text))
          return "The free AI is getting a lot of requests right now. Please wait about a minute and try again.";
        if (/API key|permission|401|403|API_KEY/i.test(text))
          return "The AI key isn't working. Please check GOOGLE_GENERATIVE_AI_API_KEY in .env.local.";
        return "Something went wrong on my side. Please try again.";
      },
    }),
  });
}
