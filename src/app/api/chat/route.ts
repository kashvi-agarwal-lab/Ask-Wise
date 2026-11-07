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
import { concernLabels, getProduct, roleOf } from "@/lib/catalogue";
import { systemPrompt, type Profile } from "@/lib/prompt";
import { mentionsPregnancy, allUserText, needsDoctor, recentUserText, dryOrSensitive } from "@/lib/safety-text";
import { isAllowed, strengthOf, type SafetyCtx } from "@/lib/safety";
import { flowHint, questionState, applyAnswers, needsOptions, requiredGroups, groupLabel, MAX_QUESTIONS } from "@/lib/flow";
import { nextScripted, starterMode } from "@/lib/script";
import {
  searchProducts,
  fitScore,
  popularity,
  productDetails,
  compare,
  validate,
  cardFull,
  buildRoutine,
  updateRoutine,
  type Routine,
} from "@/lib/engine";

export const maxDuration = 60;

const concernKey = z.enum(Object.keys(concernLabels) as [string, ...string[]]);

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
  // Pregnancy is read from what the customer typed, so the safety rule never depends on the AI remembering it.
  const pregnantByText = mentionsPregnancy(allUserText(messages));
  if (pregnantByText) profile = { ...profile, pregnantOrNursing: true };
  const safety = (): SafetyCtx => ({
    pregnant: pregnantByText || profile.pregnantOrNursing === true,
    mildOnly: dryOrSensitive(allUserText(messages), profile.skinType) || starter, // dry/sensitive skin, or too little known: no strong actives at all
  });
  let routine: Routine | null = lastToolOutput<Routine>(messages, "build_routine");
  const lastUpdate = lastToolOutput<Routine>(messages, "update_routine");
  // Whichever of build/update happened last is the current routine.
  const order = (name: string) =>
    messages.findLastIndex((m) => m.parts.some((p) => p.type === `tool-${name}`));
  if (lastUpdate && order("update_routine") > order("build_routine")) routine = lastUpdate;

  // The app's own next question (null = nothing more to ask, time to recommend)
  const pending = () => nextScripted(profile, messages, needsOptions(profile));
  const starter = starterMode(profile, messages);

  const shown = new Set<string>(); // products already shown in this reply: never show one twice
  const doneGroups = new Set<string>(); // kind+area groups already shown in this reply: never show the same group twice
  // When the customer asks for alternatives, never offer what they have already seen or got in their routine.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = (lastUser?.parts as { type: string; text?: string }[] | undefined)?.map((p) => p.text ?? "").join(" ") ?? "";
  const before = new Set<string>();
  if (/alternativ|something else|other option|instead|different one|swap/i.test(lastUserText)) {
    const ids: string[] = [];
    for (const m of messages)
      for (const part of m.parts as { type: string; output?: { cards?: { id: string }[]; items?: { id: string }[] } }[]) {
        part.output?.cards?.forEach((c) => ids.push(c.id));
        part.output?.items?.forEach((c) => ids.push(c.id));
      }
    ids.forEach((id) => { const p = getProduct(id); if (p) before.add(p.family); });
  }

  const alerts: string[] = [];
  if (profile.pregnantOrNursing)
    alerts.push(
      `This customer is PREGNANT OR NURSING. The app already removes every product with retinol, salicylic acid, benzoyl peroxide, hydroquinone or chemical exfoliants (AHA, glycolic, lactic) from your tools, so only recommend what the tools return. If no safe product fits their concern (for example acne or pigmentation treatments need actives), say so plainly and do NOT show product cards for that concern. You may still offer pregnancy-friendly basics (mineral sunscreen, ceramide or peptide moisturiser, gentle non-active cleanser) when those are what they want. Never call any product "safe in pregnancy". The app adds the doctor line itself.`
    );
  // Severe or medical problems get a doctor referral and NO products at all (the AI gets no tools).
  const referral = needsDoctor(recentUserText(messages, 3));
  if (referral)
    alerts.push(
      "This customer described something that needs a doctor, not a product: severe, painful, cystic or scarring acne, or eczema, psoriasis, bleeding, a spreading rash or infection. Respond with warm empathy, say clearly that this needs a dermatologist (or doctor) to assess and treat, and explain in a sentence that products alone are not the right first step. Do NOT recommend, name or link any product, and do not offer to build a routine or ask more questions. Keep it to 3 or 4 short sentences. You may say they are welcome to come back for gentle everyday basics after seeing a doctor."
    );
  if (safety().mildOnly)
    alerts.push(
      "This customer has DRY or SENSITIVE skin. The app already removes strong actives (2%+ salicylic acid, benzoyl peroxide, 5%+ acids, scrubs) from your tools. Never call any product that contains an active ingredient 'gentle', and never say it 'won't strip', 'won't dry' or 'is safe for' dry or sensitive skin. Say 'milder', and advise starting slowly and patch-testing. Lead with the mildest option."
    );
  const alertText = alerts.join("\n");

  const result = streamText({
    model: getModel(),
    instructions: systemPrompt(profile, !!routine, flowHint(profile, questionState(messages).asked, messages), alertText),
    messages: await convertToModelMessages(messages),
    stopWhen: [isStepCount(14), hasToolCall("ask_question"), hasToolCall("ask_needs"), hasToolCall("ask_scripted")], // a question always ends the turn so the customer can answer
    // The small free model sometimes searches and then just chats instead of showing products.
    // Once it has searched, it must finish with a real answer tool (ask / recommend / routine / compare).
    prepareStep: ({ steps, stepNumber }) => {
      if (referral) return { toolChoice: "none" as const }; // hard gate: no tools, so no product cards and no Buy links
      // Until we know "individual picks or a routine", the AI may not show products yet: it must ask.
      const next = questionState(messages).asked < MAX_QUESTIONS ? pending() : null;
      const blocked = next !== null;
      const ALL = ["update_profile", "search_products", "get_product_details", "compare_products", "recommend_products", "build_routine", "update_routine", "ask_needs", "ask_question", "ask_scripted"];
      // The app asks its own questions (it never relies on the AI to remember or word them).
      if (stepNumber === 0 && next) return { toolChoice: { type: "tool" as const, toolName: "ask_scripted" as const }, activeTools: ["ask_scripted"] as never };
      const used = new Set(steps.flatMap((s) => s.toolCalls.map((c) => c.toolName as string)));
      const answered = ["ask_question", "ask_needs", "ask_scripted", "recommend_products", "build_routine", "update_routine", "compare_products"].some((t) => used.has(t));
      if (used.has("search_products") && !answered)
        return {
          toolChoice: "required" as const,
          activeTools: (blocked ? ["ask_scripted"] : ["ask_question", "ask_needs", "ask_scripted", "recommend_products", "build_routine", "update_routine", "compare_products"]) as never,
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
          if (pregnantByText) merged.pregnantOrNursing = true; // the AI cannot switch this off
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
          role: z.enum(["cleanser", "treatment", "moisturiser", "sunscreen", "deodorant", "exfoliator", "conditioner", "supplement"]).optional().describe("what job the product does"),
          bodyArea: z.string().optional(),
          maxPrice: z.number().optional().describe("rupees, for a single product"),
          text: z.string().optional().describe("a product name or ingredient to look for"),
          includeKits: z.boolean().optional(),
          includeSupplements: z.boolean().optional(),
          excludeIds: z.array(z.string()).optional(),
          limit: z.number().min(1).max(10).optional(),
        }),
        execute: async (input) => searchProducts(input, safety()),
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
          "Show 2 to 3 real options for ONE kind of product and mark your best pick. Call once per kind (and per area). The app checks that every product really is that kind (a deodorant can never be shown as a cleanser), never repeats a product, and draws the cards from the catalogue.",
        inputSchema: z.object({
          kind: z
            .enum(["cleanser", "treatment", "moisturiser", "sunscreen", "deodorant", "exfoliator", "conditioner", "supplement"])
            .describe("what job these products do. Underarm roll-ons are 'deodorant', body/face wash and shampoo are 'cleanser'"),
          area: z.enum(["face", "body", "scalp"]).optional().describe("where it is used, when it matters"),
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
        execute: async ({ kind, area, picks, bestPickId, bestReason }) => {
          const gkey = `${kind}|${area ?? ""}`;
          if (doneGroups.has(gkey)) return { need: groupLabel(kind, area), kind, cards: [], bestPickId: undefined, bestReason: "", rejected: ["duplicate group"] };
          doneGroups.add(gkey);
          const need = groupLabel(kind, area, /hair|scalp/.test((profile.concerns ?? []).join(" ").toLowerCase()));
          const { valid: found, invalid } = validate(picks.map((p) => p.productId));
          // The app, not the AI, decides what kind each product is. Wrong kind or already shown = rejected.
          // Treatments must also match what the customer actually asked about (no brow serum for acne).
          const concernKeys = (profile.concerns ?? []).filter((k) => k in concernLabels);
          const needsMatch = ["treatment", "deodorant", "exfoliator"].includes(kind) && concernKeys.length > 0;
          const wrong = found.filter(
            (p) => roleOf(p) !== kind || shown.has(p.id) || before.has(p.family) || (needsMatch && !p.concerns.some((c) => concernKeys.includes(c.key)))
          );
          const unsafe = found.filter((p) => !isAllowed(p, safety()));
          const valid = found.filter((p) => !wrong.includes(p) && !unsafe.includes(p));
          invalid.push(...unsafe.map((p) => p.id));
          valid.forEach((p) => shown.add(p.id));
          invalid.push(...wrong.map((p) => p.id));
          // If nothing usable was given, the app finds the right products itself.
          let reason = bestReason;
          let auto = false;
          if (!valid.length) {
            const category = area === "face" ? "face" : area === "scalp" ? "hair" : kind === "sunscreen" ? undefined : area === "body" || kind === "deodorant" ? "body" : undefined;
            const keys = (profile.concerns ?? []).filter((k) => k in concernLabels);
            let found2 = searchProducts({ role: kind, category, concernKeys: keys.length ? keys : undefined, excludeIds: [...shown], limit: 6 }, safety()).results;
            // Basics like moisturiser and sunscreen do not have to match the concern: fall back to the best-reviewed ones.
            if (!found2.length && !needsMatch) found2 = searchProducts({ role: kind, category, excludeIds: [...shown], limit: 6 }, safety()).results;
            for (const s of found2) {
              const prod = getProduct(s.id);
              if (prod && valid.length < 2 && !before.has(prod.family) && !valid.some((v) => v.family === prod.family)) {
                valid.push(prod);
                shown.add(prod.id);
              }
            }
            auto = valid.length > 0;
            reason = "A well-reviewed Bodywise option for this step.";
          }
          let best = valid.some((p) => p.id === bestPickId) ? bestPickId : valid[0]?.id;
          const mild = safety().mildOnly;
          if (mild && valid.length) {
            // dry or sensitive skin: lead with the mildest option, whatever the AI preferred
            const lowest = Math.min(...valid.map((p) => strengthOf(p)));
            const pool = valid.filter((p) => strengthOf(p) === lowest);
            best = pool.some((p) => p.id === best) ? best : pool[0].id;
            reason = `The mildest matching option for your ${/sensitive/i.test(profile.skinType ?? "") ? "sensitive" : "dry"} skin. Start slowly and patch-test, since any active can still irritate.`;
          }
          // Purpose-built products lead: the pick that matches the customer's concern best is the headline.
          if (!mild && concernKeys.length && valid.length > 1) {
            const ranked = [...valid].sort((a, b) => fitScore(b, concernKeys) - fitScore(a, concernKeys) || popularity(b) - popularity(a));
            const current = valid.find((p) => p.id === best);
            if (!current || fitScore(ranked[0], concernKeys) > fitScore(current, concernKeys)) best = ranked[0].id;
          }
          if (best && best !== bestPickId && !mild) {
            // the app moved the headline to the closest purpose-built match, so the AI's reason no longer fits
            const bp = getProduct(best);
            const labels = (bp?.concerns ?? []).filter((c) => c.strength === "primary" && concernKeys.includes(c.key)).map((c) => c.label.toLowerCase());
            reason = labels.length ? `Made for ${labels.slice(0, 2).join(" and ")}, the closest match to what you described.` : "The closest match to what you described.";
          }
          const cards = valid
            .map((p) => {
              const pick = picks.find((x) => x.productId === p.id);
              const chooseIf = p.id === best || /sever|persist|stubborn|serious|worse|worsen|chronic/i.test(pick?.chooseIf ?? "") ? undefined : pick?.chooseIf; // never judge severity: that is a doctor's call
              const sanitizeMild = (t?: string) => (mild && /gentl|strip|soothing|mild|safe|suit/i.test(t ?? "") ? undefined : t);
              return { ...cardFull(p), why: auto || (mild && strengthOf(p) > 0) ? "" : (pick?.why ?? ""), chooseIf: sanitizeMild(chooseIf), isBest: p.id === best };
            })
            .sort((a, b) => Number(b.isBest) - Number(a.isBest) || fitScore(getProduct(b.id)!, concernKeys) - fitScore(getProduct(a.id)!, concernKeys));
          return { need, kind, cards, bestPickId: best, bestReason: reason, rejected: invalid };
        },
      }),

      build_routine: tool({
        description:
          "Build a complete routine from product IDs. The app works out how often each product is used from its own usage instructions (daily, morning, evening, a few times a week, weekly), adds any companion shampoo or conditioner a hair serum needs, adds up the cost and returns safety warnings. You never choose the schedule.",
        inputSchema: z.object({
          products: z.array(z.object({ productId: z.string() })).min(1).max(8),
        }),
        execute: async ({ products }) => {
          const r = buildRoutine(products.map((p) => ({ id: p.productId })), safety(), { companions: true });
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
        }),
        execute: async ({ action, productId, replacementId }) => {
          if (!routine) return { error: "There is no routine yet. Build one first with build_routine." };
          const r = updateRoutine(routine, action, productId, replacementId, undefined, safety());
          if (!("error" in r)) routine = r;
          return r;
        },
      }),

      ask_scripted: tool({
        description: "Ask the customer the app's next question. Takes no input: the app words the question and builds the buttons.",
        inputSchema: z.object({}),
        execute: async () => {
          const q = pending();
          return q ?? { id: "none", question: "Is there anything else you'd like to tell me?", options: ["No, that's everything"] };
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
          return "A lot of people are trying the guide right now - give me a minute and ask again.";
        return "Something went wrong on my side. Please try again.";
      },
    }),
  });
}
