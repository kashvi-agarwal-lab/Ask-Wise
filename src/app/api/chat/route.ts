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
import { concernLabels, getProduct, roleOf, products } from "@/lib/catalogue";
import { systemPrompt, type Profile } from "@/lib/prompt";
import { mentionsPregnancy, allUserText, needsDoctor, recentUserText, dryOrSensitive, safetySignature, sigStricter, describeSig } from "@/lib/safety-text";
import { isAllowed, strengthOf, exclusionReason, type SafetyCtx } from "@/lib/safety";
import { flowHint, questionState, applyAnswers, needsOptions, requiredGroups, groupLabel, MAX_QUESTIONS } from "@/lib/flow";
import { nextScripted, starterMode, writesHinglish } from "@/lib/script";
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

// A "treatment" group also accepts exfoliating scrubs (for example for tan), everything else must match exactly.
const roleMatches = (kind: string, p: Parameters<typeof roleOf>[0]) => roleOf(p) === kind || (kind === "treatment" && roleOf(p) === "exfoliator");

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

/** Sentences where the customer talks about an allergy or a reaction. */
const allergySentences = (text: string) =>
  text.split(/[.!?\n]+/).filter((s) => /allerg|react|broke out|rash (from|after)/i.test(s)).join(". ");

/** Bodywise products the customer named as causing a reaction (matched on distinctive name words). */
function reactedProductFamilies(said: string): string[] {
  const t = said.toLowerCase();
  if (!t.trim()) return [];
  const fams = new Set<string>();
  for (const p of products) {
    const words = p.displayName.toLowerCase().replace(/be bodywise|bodywise/g, "").match(/[a-z0-9%]+/g) ?? [];
    const key = words.filter((w) => w.length > 2 && !["with", "for", "and", "the"].includes(w));
    if (key.length >= 2 && key.every((w) => t.includes(w))) fams.add(p.family);
  }
  return [...fams];
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
  // A product the customer named as the cause of a reaction (their words, matched to the catalogue).
  const reactedFamilies = reactedProductFamilies(`${profile.allergyText ?? ""} ${allergySentences(allUserText(messages))}`);
  const allergyUnknown = profile.allergyStatus === "yes" && !(profile.allergens ?? []).length;
  const safety = (): SafetyCtx => ({
    pregnant: pregnantByText || profile.pregnantOrNursing === true,
    mildOnly: dryOrSensitive(allUserText(messages), profile.skinType) || starter, // dry/sensitive skin, or too little known: no strong actives at all
    minor: profile.ageBand === "minor",
    allergens: profile.allergens ?? [],
    allergyUnknown,
    excludeFamilies: reactedFamilies,
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
      `This customer is PREGNANT, BREASTFEEDING OR TRYING TO CONCEIVE. The app follows a conservative rule: it does not suggest products with acids, benzoyl peroxide, retinoids, anti-dandruff or hair-growth actives, supplements, or products without a full ingredient list, so your tools only return products outside that list. This is the app's caution, NOT a medical verdict: never say a product is "safe in pregnancy", "pregnancy-safe" or that an ingredient is "banned". If the concern needs an active (acne, pigmentation, hair fall, dandruff), say plainly that you won't suggest a treatment automatically and that their doctor is the right person to advise; do not show treatment cards. You may offer the everyday basics the tools return if they want them. The app adds the doctor line itself.`
    );
  if (profile.ageBand === "minor")
    alerts.push(
      "This customer is UNDER 18. The app only allows gentle everyday basics (no acids, benzoyl peroxide, medicated anti-dandruff, hair-growth products, supplements or razors), so only recommend what the tools return. Use simple, kind language. Suggest involving a parent or guardian, and a doctor for acne, hair fall or anything that worries them. Never diagnose. The app adds this guidance line itself."
    );
  if (allergyUnknown)
    alerts.push(
      "This customer mentioned an ALLERGY or a reaction, but the app does not know which ingredient caused it, so it cannot check products against it. Do NOT recommend, name or link any product. Explain kindly in 2 or 3 sentences that without knowing the ingredient you can't check compatibility, and suggest they ask a doctor or dermatologist (or the Be Bodywise team) which ingredient it was; if they tell you the ingredient name, you can check the range for them. NEVER suggest patch-testing something they may be allergic to."
    );
  else if ((profile.allergens ?? []).length)
    alerts.push(
      `This customer reacts to: ${profile.allergens!.join(", ")}. The app removes every product whose full ingredient list mentions these (or a common alias), and every product whose full ingredient list is not available. Say that you checked the ingredient lists, that ingredient names vary so they should still read the label, and that a doctor can confirm. NEVER suggest patch-testing a product that might contain their allergen.`
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

  // Did the customer disclose pregnancy, age or an allergy AFTER seeing products? Then the app
  // re-checks everything shown so far before anything else happens (see recheck_routine).
  const lastResultsAt = messages.findLastIndex((m) =>
    m.role === "assistant" && (m.parts as { type: string }[]).some((p) => /^tool-(recommend_products|build_routine|update_routine|recheck_routine)$/.test(p.type))
  );
  const sigThen = safetySignature(allUserText(messages.slice(0, Math.max(0, lastResultsAt))));
  const sigNow = safetySignature(allUserText(messages));
  const needsRecheck = lastResultsAt >= 0 && sigStricter(sigThen, sigNow) && !referral;

  if (needsRecheck)
    alerts.push(
      `The customer just told you about ${describeSig(sigNow)} AFTER seeing products. The app has re-checked everything shown so far (recheck_routine): products it flagged are no longer suggested, and the earlier cards are marked as replaced. In 2 or 3 sentences, say you've re-checked their picks with this in mind, name what was flagged in plain words (the app shows the list and reasons), and do not recommend any flagged product again. Then follow the other safety alerts.`
    );
  if (writesHinglish(allUserText(messages)))
    alerts.push(
      "The customer is writing in Hindi or Hinglish. Reply in simple, friendly Hinglish (Roman script), with the same meaning and safety rules. Keep product names exactly as the tools give them. If you are unsure what they meant, ask kindly in Hinglish."
    );
  const finalAlerts = alerts.join("\n");

  const result = streamText({
    model: getModel(),
    instructions: systemPrompt(profile, !!routine, flowHint(profile, questionState(messages).asked, messages), finalAlerts),
    messages: await convertToModelMessages(messages),
    stopWhen: [isStepCount(14), hasToolCall("ask_question"), hasToolCall("ask_needs"), hasToolCall("ask_scripted")], // a question always ends the turn so the customer can answer
    // The small free model sometimes searches and then just chats instead of showing products.
    // Once it has searched, it must finish with a real answer tool (ask / recommend / routine / compare).
    prepareStep: ({ steps, stepNumber }) => {
      if (referral) return { toolChoice: "none" as const }; // hard gate: no tools, so no product cards and no Buy links
      if (needsRecheck && stepNumber === 0)
        return { toolChoice: { type: "tool" as const, toolName: "recheck_routine" as const }, activeTools: ["recheck_routine"] as never };
      const rechecked = steps.some((st) => st.toolCalls.some((c) => c.toolName === "recheck_routine"));
      // Allergy with an unknown cause: ask which ingredient first, otherwise no product tools at all.
      if (allergyUnknown) {
        const q = stepNumber === 0 || (rechecked && stepNumber === 1) ? pending() : null;
        return q?.id === "allergen"
          ? { toolChoice: { type: "tool" as const, toolName: "ask_scripted" as const }, activeTools: ["ask_scripted"] as never }
          : { toolChoice: "none" as const };
      }
      // Until we know "individual picks or a routine", the AI may not show products yet: it must ask.
      const next = questionState(messages).asked < MAX_QUESTIONS ? pending() : null;
      const blocked = next !== null;
      const ALL = ["update_profile", "search_products", "get_product_details", "compare_products", "recommend_products", "build_routine", "update_routine", "ask_needs", "ask_question", "ask_scripted"];
      // The app asks its own questions (it never relies on the AI to remember or word them).
      if ((stepNumber === 0 || (rechecked && stepNumber === 1)) && next) return { toolChoice: { type: "tool" as const, toolName: "ask_scripted" as const }, activeTools: ["ask_scripted"] as never };
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
            (p) => !roleMatches(kind, p) || shown.has(p.id) || before.has(p.family) || (needsMatch && !p.concerns.some((c) => concernKeys.includes(c.key)))
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
            let found2 = searchProducts({ role: kind === "treatment" ? ["treatment", "exfoliator"] : kind, category, concernKeys: keys.length ? keys : undefined, excludeIds: [...shown], limit: 6 }, safety()).results;
            // Basics like moisturiser and sunscreen do not have to match the concern: fall back to the best-reviewed ones.
            if (!found2.length && !needsMatch) found2 = searchProducts({ role: kind === "treatment" ? ["treatment", "exfoliator"] : kind, category, excludeIds: [...shown], limit: 6 }, safety()).results;
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
            const skinKnown = dryOrSensitive(allUserText(messages), profile.skinType);
            const skinWord = /sensitive/i.test(`${profile.skinType ?? ""} ${allUserText(messages)}`) ? "sensitive" : "dry";
            reason = skinKnown
              ? `The mildest matching option for your ${skinWord} skin. Start slowly and patch-test, since any active can still irritate.`
              : "A mild, low-risk place to start. Patch-test first and introduce it slowly.";
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

      recheck_routine: tool({
        description:
          "Re-check every product already shown in this chat against what the customer has just told you (pregnancy, age, allergy). Takes no input. Returns which products are no longer suggested and why, and the routine with only the products that still fit.",
        inputSchema: z.object({}),
        execute: async () => {
          const ids: string[] = [];
          for (const m of messages)
            for (const part of m.parts as { type: string; output?: { cards?: { id: string }[]; items?: { id: string }[]; routine?: { items?: { id: string }[] } } }[]) {
              part.output?.cards?.forEach((c) => ids.push(c.id));
              part.output?.items?.forEach((c) => ids.push(c.id));
              part.output?.routine?.items?.forEach((c) => ids.push(c.id));
            }
          const ctx = safety();
          const flagged: { id: string; name: string; reason: string }[] = [];
          const kept: string[] = [];
          for (const id of [...new Set(ids)]) {
            const p = getProduct(id);
            if (!p) continue;
            const reason = exclusionReason(p, ctx);
            if (reason) flagged.push({ id, name: cardFull(p).name, reason });
            else kept.push(id);
          }
          let next: Routine | null = null;
          if (routine) {
            const keep = routine.items.filter((i) => kept.includes(i.id)).map((i) => ({ id: i.id, slots: i.slots }));
            next = keep.length ? buildRoutine(keep, ctx) : null;
          }
          routine = next;
          return { about: describeSig(sigNow), flagged, keptCount: kept.length, routine: next };
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
      // The safety context this reply was made under, so the browser can tell which picks are current.
      messageMetadata: ({ part }) =>
        part.type === "start"
          ? { safety: { ...sigNow, allergens: profile.allergens ?? [], allergyUnknown, mildOnly: !!safety().mildOnly } }
          : undefined,
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
