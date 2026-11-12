"use client";

import { useChat } from "@ai-sdk/react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ProductCard, Routine, Variant } from "@/lib/engine";
import { CONCERN_LABELS } from "@/lib/concerns";
import {
  PREGNANCY_LINE,
  MINOR_LINE,
  mentionsPregnancy,
  allUserText,
  dryOrSensitive,
  wantsTan,
  facePigmentation,
  safetySignature,
  sigStricter,
  describeSig,
  type SafetySignature,
} from "@/lib/safety-text";
import CartLink from "@/components/cart-link";
import { addToCart, useCart } from "@/lib/cart";
import { CardContext, CompareTable, ProductCardView, RecheckCard, RoutineChatCard, RoutineView } from "./parts";

const STORAGE_KEY = "bodywise-guide-chat-v1";
const SAFETY_KEY = "askwise-safety-v1"; // read by the cart page to flag items (the cart itself is never changed)

const STARTERS = [
  "I get acne on my back",
  "I'm losing more hair than usual",
  "My skin feels dry after showering",
  "I have sensitive skin",
];

const CATEGORY_OPENERS: Record<string, string> = {
  body: "I'd like help with body care",
  hair: "I'd like help with hair care",
  face: "I'd like help with face care",
  "sun-protection": "I'm looking for sun protection",
  wellness: "I'm interested in wellness supplements",
};

// What each tool's "working…" state says to the customer
const WORKING: Record<string, string> = {
  search_products: "Looking through the Bodywise range…",
  get_product_details: "Checking product details…",
  compare_products: "Comparing products…",
  recommend_products: "Picking products for you…",
  build_routine: "Building your routine…",
  update_routine: "Updating your routine…",
  recheck_routine: "Re-checking your picks…",
};

type Part = { type: string; state?: string; output?: unknown; text?: string };
type Msg = { id: string; role: string; parts: unknown[] };

const RESULT_TOOLS = ["recommend_products", "build_routine", "update_routine", "compare_products"];
const ROUTINE_TOOLS = ["tool-build_routine", "tool-update_routine"];

/** The current routine is the most recent build/update/re-check result (a re-check can also clear it). */
function currentRoutine(messages: Msg[]): { r: Routine | null; at: number } {
  let found: Routine | null = null;
  let at = -1;
  messages.forEach((m, i) => {
    for (const p of m.parts as Part[]) {
      if (p.state !== "output-available") continue;
      const out = p.output as Routine | undefined;
      if (ROUTINE_TOOLS.includes(p.type) && out?.items) {
        found = out;
        at = i;
      }
      if (p.type === "tool-recheck_routine") {
        found = (p.output as { routine?: Routine | null }).routine ?? null;
        at = i;
      }
    }
  });
  return { r: found && (found as Routine).items.length ? found : null, at };
}

type MsgSafety = SafetySignature & { allergens?: string[]; allergyUnknown?: boolean; mildOnly?: boolean };
const metaSafety = (m: Msg | undefined) => (m as { metadata?: { safety?: MsgSafety } } | undefined)?.metadata?.safety;

/** What had been disclosed when message i was made (server metadata, or the text before it for older chats). */
const sigAt = (messages: Msg[], i: number): SafetySignature => metaSafety(messages[i]) ?? safetySignature(allUserText(messages.slice(0, i)));

/** "Replaced" text for results made before a later safety disclosure (undefined = still current). */
function lockedNote(then: SafetySignature, now: SafetySignature, busy: boolean): string | undefined {
  if (!sigStricter(then, now)) return undefined;
  const news = describeSig({ pregnant: now.pregnant && !then.pregnant, minor: now.minor && !then.minor, allergy: now.allergy && !then.allergy });
  return busy
    ? `Re-checking these for ${news}… Buying is paused until it's done.`
    : `Replaced: suggested before you mentioned ${news}. See the re-checked suggestions below.`;
}

/** Facts the customer has told us (saved by the AI each time they share something). */
function currentProfile(messages: Msg[]): { concerns?: string[]; pregnantOrNursing?: boolean; sensitivities?: string; skinType?: string } {
  let found = {};
  for (const m of messages)
    for (const p of m.parts as Part[])
      if (p.type === "tool-update_profile" && p.state === "output-available" && p.output) found = p.output as object;
  return found;
}

const sumPrice = (items: { price: number }[]) => items.reduce((s, i) => s + i.price, 0);
const sumSavings = (items: { price: number; mrp: number | null }[]) => items.reduce((s, i) => s + (i.mrp ? i.mrp - i.price : 0), 0);

/** The customer picked another size or scent: update every card/routine that shows this product. */
function withVariant(messages: Msg[], oldId: string, v: Variant): Msg[] {
  const swap = <T extends { id: string }>(x: T): T =>
    x.id === oldId ? { ...x, id: v.id, size: v.size, price: v.price, mrp: v.mrp, url: v.url, image: v.image, chosen: true } : x;
  return messages.map((m) => ({
    ...m,
    parts: (m.parts as Part[]).map((p) => {
      const out = p.output as (Record<string, unknown> & { cards?: { id: string }[]; items?: (ProductCard & { slots: string[] })[] }) | undefined;
      if (!out) return p;
      if (out.cards?.some((x) => x.id === oldId)) return { ...p, output: { ...out, cards: out.cards.map(swap) } };
      if (out.items?.some((x) => x.id === oldId)) {
        const items = out.items.map(swap);
        const rename = (ids: unknown) => ((ids as string[] | undefined) ?? []).map((id) => (id === oldId ? v.id : id));
        return {
          ...p,
          output: { ...out, items, am: rename(out.am), pm: rename(out.pm), daily: rename(out.daily), alt: rename(out.alt), weekly: rename(out.weekly), supplement: rename(out.supplement), total: sumPrice(items), savings: sumSavings(items) },
        };
      }
      return p;
    }),
  }));
}

export default function Chat() {
  const { messages, sendMessage, status, error, setMessages, regenerate } = useChat();
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const { r: routine, at: routineAt } = useMemo(() => currentRoutine(messages as Msg[]), [messages]);
  const nowSig = useMemo(() => safetySignature(allUserText(messages as Msg[])), [messages]);
  const routineLocked = routine ? lockedNote(sigAt(messages as Msg[], routineAt), nowSig, busy) : undefined;
  // The safety context of the latest reply (decided by the server), used for routine edits and cart flags.
  const ctx = useMemo(() => {
    const lastA = [...(messages as Msg[])].reverse().find((m) => m.role === "assistant" && metaSafety(m));
    return metaSafety(lastA);
  }, [messages]);

  // Restore the saved chat (it only ever lives in this browser) or start from ?category=
  useEffect(() => {
    // (run in a timer that is cancelled on cleanup, so development's double-run of effects only starts one chat)
    const timer = setTimeout(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get("category");
      const concern = params.get("concern");
      const opener = concern && CONCERN_LABELS[concern] ? `I need help with: ${CONCERN_LABELS[concern]}` : cat && CATEGORY_OPENERS[cat] ? CATEGORY_OPENERS[cat] : null;
      if (opener) {
        // Tapping a concern or category tile always starts a fresh chat from that topic
        localStorage.removeItem(STORAGE_KEY);
        sendMessage({ text: opener });
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed) && parsed.length) {
          const lastMsg = parsed[parsed.length - 1];
          if (lastMsg?.role === "user") {
            // refreshed while the guide was still answering: put the question back and ask again
            const text = (lastMsg.parts as { type: string; text?: string }[]).find((p) => p.type === "text")?.text ?? "";
            setMessages(parsed.slice(0, -1));
            if (text) sendMessage({ text });
          } else setMessages(parsed);
        }
      }
    } catch {}
    setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once a chat has started from a tile, drop ?concern= from the address so a refresh restores it instead of restarting
  useEffect(() => {
    if (messages.length > 0 && window.location.search) window.history.replaceState(null, "", "/chat");
  }, [messages.length]);

  useEffect(() => {
    // Save the conversation after every change (not while a reply is half-written)
    if (restored && (status === "ready" || status === "submitted") && messages.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages, status, restored]);

  // Escape closes the routine sheet
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // On computers (not phones, where it would pop up the keyboard) put the cursor in the box
  useEffect(() => {
    if (status === "ready" && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setSheetOpen(false);
    sendMessage({ text: t });
    setInput("");
  };

  const newChat = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAFETY_KEY);
    setMessages([]);
    setSheetOpen(false);
  };

  const profile = useMemo(() => currentProfile(messages as Msg[]), [messages]);
  const pregnant = useMemo(() => mentionsPregnancy(allUserText(messages as Msg[])), [messages]);
  const topicText = useMemo(() => allUserText(messages as Msg[]), [messages]);
  const mildOnly = useMemo(() => dryOrSensitive(allUserText(messages as Msg[]), (profile as { skinType?: string }).skinType), [messages, profile]);
  const routineIds = useMemo(() => new Set((routine?.items ?? []).map((i) => i.id)), [routine]);

  // Cart (shared across chats, saved in this browser)
  const cartLines = useCart();
  const cartIds = useMemo(() => new Set(cartLines.map((l) => l.id)), [cartLines]);
  const [toast, setToast] = useState("");
  const [flagged, setFlagged] = useState<string[]>([]);
  const ctxKey = ctx ? JSON.stringify(ctx) : "";
  const flagsActive = !!ctx && (ctx.pregnant || ctx.minor || ctx.allergy);
  const cartFlags = flagsActive ? flagged.filter((id) => cartIds.has(id)) : [];
  useEffect(() => {
    if (!ctx || !flagsActive) return;
    try {
      localStorage.setItem(SAFETY_KEY, ctxKey);
    } catch {}
    const ids = [...cartIds];
    if (!ids.length) return;
    let live = true;
    fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, ctx: { pregnant: ctx.pregnant, minor: ctx.minor, allergens: ctx.allergens, allergyUnknown: ctx.allergyUnknown } }) })
      .then((r) => r.json())
      .then((d: { flags?: Record<string, string> }) => live && setFlagged(Object.keys(d.flags ?? {})))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey, cartIds]);
  const topic = useMemo(() => {
    const first = (messages as Msg[]).find((m) => m.role === "user");
    const text = ((first?.parts ?? []) as Part[]).find((p) => p.type === "text")?.text ?? "";
    return text.length > 36 ? text.slice(0, 34) + "…" : text;
  }, [messages]);
  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 3500);
  };
  const onCart = (card: ProductCard) => {
    addToCart([{ id: card.id, from: topic ? `Chat: ${topic}` : "Chat", chosen: card.chosen }]);
    showToast(`Added ${card.name} to your cart`);
  };
  const onCartAll = (r: Routine) => {
    addToCart(r.items.map((i) => ({ id: i.id, from: topic ? `Routine: ${topic}` : "Routine", chosen: i.chosen })));
    showToast(`Added your routine (${r.items.length} products) to your cart`);
  };

  const onVariant = (oldId: string, v: Variant) => setMessages((prev) => withVariant(prev as Msg[], oldId, v) as typeof prev);

  // Add or remove a routine step without the AI: the server just rebuilds the routine from the product list.
  const changeRoutine = async (entries: { id: string; slots?: string[] }[], note: string, input: object) => {
    const before = routine?.items ?? [];
    try {
      const res = await fetch("/api/routine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries, pregnant, mildOnly, ctx: ctx ? { pregnant: ctx.pregnant, minor: ctx.minor, allergens: ctx.allergens, allergyUnknown: ctx.allergyUnknown, mildOnly: ctx.mildOnly } : undefined }) });
      if (!res.ok) throw new Error();
      const r = (await res.json()) as Routine;
      // keep the size/scent choices the customer already made
      r.items = r.items.map((i) => ({ ...i, companion: before.find((b) => b.id === i.id)?.companion, chosen: before.find((b) => b.id === i.id)?.chosen || (input as { chosen?: boolean }).chosen === true && entries[entries.length - 1]?.id === i.id }));
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: note }, { type: "tool-update_routine", toolCallId: `local-${Date.now()}`, state: "output-available", input, output: r }] } as (typeof prev)[number],
      ]);
      setSheetOpen(false);
    } catch {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: "Sorry, I couldn't update your routine just now. Please try again." }] } as (typeof prev)[number]]);
    }
  };
  const onAdd = (card: ProductCard) =>
    changeRoutine([...(routine?.items ?? []).map((i) => ({ id: i.id, slots: i.slots })), { id: card.id }], `Added ${card.name} to your routine.`, { action: "add", productId: card.id, chosen: card.chosen });
  const onRemove = (id: string) => {
    const it = routine?.items.find((i) => i.id === id);
    changeRoutine((routine?.items ?? []).filter((i) => i.id !== id).map((i) => ({ id: i.id, slots: i.slots })), `Removed ${it?.name ?? "the product"} from your routine.`, { action: "remove", productId: id });
  };

  const last = messages[messages.length - 1];
  const lastParts = (last?.parts ?? []) as Part[];
  // Show "Thinking…" whenever the AI is working but nothing visible has appeared yet
  const lastVisible =
    last?.role === "assistant" &&
    lastParts.some(
      (p) =>
        (p.type === "text" && !!p.text?.trim()) ||
        (p.type.startsWith("tool-") && (p.state === "output-available" ? !["update_profile", "search_products", "get_product_details"].includes(p.type.slice(5)) : !!WORKING[p.type.slice(5)]))
    );
  const showThinking = busy && !lastVisible;
  const ask =
    status === "ready" && last?.role === "assistant"
      ? (lastParts.find((p) => (p.type === "tool-ask_question" || p.type === "tool-ask_needs" || p.type === "tool-ask_scripted") && p.state === "output-available")
          ?.output as { options: string[]; multiSelect?: boolean } | undefined)
      : undefined;
  const chips = ask?.options;

  // Follow-up buttons under the latest results
  const lastHasCards = lastParts.some((p) => p.type === "tool-recommend_products" && p.state === "output-available");
  const lastHasRoutine = lastParts.some((p) => ROUTINE_TOOLS.includes(p.type) && p.state === "output-available");
  const followUps =
    status === "ready" && !chips
      ? lastHasCards
        ? ["Compare these", "Show me alternatives", "Build a routine with these"]
        : lastHasRoutine
          ? ["Show me alternatives", "Compare the products", "Remove a step"]
          : []
      : [];
  const followUpText: Record<string, string> = {
    "Remove a step": "I'd like to remove a step from my routine. Which steps could I do without?",
  };

  return (
    <CardContext.Provider value={{ onVariant, onAdd, onCart, routineIds, cartIds, profileConcerns: profile.concerns ?? [], allergy: nowSig.allergy }}>
    <div className="flex h-dvh bg-mist">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-sky-2/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0 whitespace-nowrap font-serif text-lg text-navy">
            Ask <span className="text-blue">Wise</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Home"
              className="inline-flex min-h-[34px] items-center justify-center whitespace-nowrap rounded-full border border-navy/20 px-2.5 py-1.5 text-sm text-navy transition hover:bg-sky sm:px-3"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l9-7.5 9 7.5" />
                <path d="M5.5 9.5V20h13V9.5" />
              </svg>
              <span className="hidden sm:inline">Home</span>
            </Link>
            <CartLink compact className="px-2.5 text-sm sm:px-3" />
            {messages.length > 0 && (
              <button onClick={newChat} className="whitespace-nowrap rounded-full border border-navy/20 px-2.5 py-1.5 text-sm text-navy transition hover:bg-sky sm:px-3">
                New chat
              </button>
            )}
          </div>
          </div>
      </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
            {restored && messages.length === 0 && (
              <div className="animate-fade-up pt-8 text-center">
                <h1 className="font-serif text-3xl text-navy sm:text-4xl">What can I help you with?</h1>
                <p className="mx-auto mt-3 max-w-md text-slate">
                  Tell me about your skin, hair or body concern in your own words, or pick one to start.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <Chip key={s} onClick={() => send(s)}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Message
                key={m.id}
                role={m.role}
                parts={m.parts as Part[]}
                streaming={busy && m.id === last?.id}
                locked={m.role === "assistant" ? lockedNote(sigAt(messages as Msg[], i), nowSig, busy) : undefined}
                minor={nowSig.minor}
                pregnant={pregnant}
                tan={wantsTan(topicText)}
                limitedFacePigmentation={facePigmentation(topicText)}
                onOpenRoutine={() => setSheetOpen(true)}
                onCartAll={onCartAll}
              />
            ))}

            {showThinking && <Typing label="Thinking…" />}

            {error && (
              <div className="rounded-2xl bg-white p-4 text-sm text-navy ring-1 ring-sky-2">
                {error.message || "Something went wrong. Please try again."}
                <button onClick={() => regenerate()} className="ml-2 font-medium text-blue underline">
                  Retry
                </button>
              </div>
            )}

            {ask && !busy && <QuickReplies key={last.id} options={ask.options} multi={!!ask.multiSelect} onSend={send} />}
            {cartFlags.length > 0 && !busy && (
              <div className="rounded-2xl border border-blue/30 bg-sky p-3 text-sm leading-relaxed text-navy">
                {cartFlags.length} item{cartFlags.length === 1 ? "" : "s"} in your cart {cartFlags.length === 1 ? "is" : "are"} no longer suggested after what you told me. Nothing was removed.{" "}
                <Link href="/cart" className="font-medium text-blue underline">Review your cart</Link>
              </div>
            )}
            {followUps.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {followUps.map((f) => (
                  <Chip key={f} onClick={() => send(followUpText[f] ?? f)}>{f}</Chip>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </main>

        {routine && (
          <div className="border-t border-sky-2/60 bg-white/80 px-4 pt-3 lg:hidden">
            <button
              onClick={() => setSheetOpen(true)}
              className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-full bg-navy px-5 py-3 text-mist"
            >
              <span className="text-sm">Your routine · {routine.items.length} products</span>
              <span className="font-serif text-lg">₹{routine.total}</span>
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className={`bg-white/80 px-4 py-3 backdrop-blur sm:px-6 ${routine ? "lg:border-t lg:border-sky-2/60" : "border-t border-sky-2/60"}`}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <input
              ref={inputRef}
              aria-label="Your message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              maxLength={600}
              className="min-w-0 flex-1 rounded-full border border-sky-2 bg-white px-5 py-3 text-base text-navy outline-none transition placeholder:text-slate/60 focus:border-blue"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-full bg-blue px-6 py-3 font-medium text-mist transition hover:bg-navy disabled:opacity-40"
            >
              Send
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-slate">
            Product guidance, not medical advice. See a doctor for severe or persistent concerns.
          </p>
        </form>
      </div>

      {/* Desktop: routine side panel */}
      {routine && (
        <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-l border-sky-2/60 bg-white/60 p-5 lg:block">
          <h2 className="mb-4 font-serif text-2xl text-navy">Your routine</h2>
          <RoutineView r={routine} onAsk={send} onRemove={onRemove} onCartAll={onCartAll} locked={routineLocked} />
        </aside>
      )}

      {/* Mobile: routine bottom sheet */}
      {routine && sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Your routine">
          <div className="absolute inset-0 animate-fade-in bg-navy/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet flex-col rounded-t-[2rem] bg-mist shadow-2xl">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="font-serif text-2xl text-navy">Your routine</h2>
              <button onClick={() => setSheetOpen(false)} className="rounded-full border border-navy/20 px-3 py-1 text-sm text-navy">
                Close
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-8 pt-2">
              <RoutineView r={routine} onAsk={send} onRemove={onRemove} onCartAll={onCartAll} locked={routineLocked} />
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-40 z-[60] mx-auto flex w-fit max-w-[90%] animate-fade-up items-center gap-3 rounded-full bg-navy px-5 py-3 text-sm text-mist shadow-xl">
          {toast}
          <Link href="/cart" className="font-medium text-aqua underline">View cart</Link>
        </div>
      )}
    </div>
    </CardContext.Provider>
  );
}

function QuickReplies({ options, multi, onSend }: { options: string[]; multi: boolean; onSend: (t: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const continueRef = useRef<HTMLButtonElement>(null);
  // Keep the Continue button in view once something is ticked
  useEffect(() => {
    if (picked.length === 1) continueRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [picked.length]);
  const isDecide = (o: string) => /decide|not sure|you choose|none of these|prefer not/i.test(o);
  if (!multi) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <Chip key={o} onClick={() => onSend(o)}>{o}</Chip>)}
      </div>
    );
  }
  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate">Tap all that apply, then Continue.</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) =>
          isDecide(o) ? (
            <Chip key={o} onClick={() => onSend(o)}>{o}</Chip>
          ) : (
            <button
              key={o}
              onClick={() => toggle(o)}
              aria-pressed={picked.includes(o)}
              className={`rounded-full border px-4 py-2.5 text-sm shadow-sm shadow-navy/5 transition active:scale-95 ${picked.includes(o) ? "border-blue bg-blue text-white" : "border-blue/30 bg-white text-navy hover:border-blue hover:bg-sky"}`}
            >
              {picked.includes(o) ? "✓ " : ""}{o}
            </button>
          )
        )}
      </div>
      {picked.length > 0 && (
        <button ref={continueRef} onClick={() => onSend(picked.join(", "))} className="w-fit rounded-full bg-blue px-6 py-2.5 text-sm font-medium text-white transition hover:bg-navy">
          Continue
        </button>
      )}
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="animate-fade-up rounded-full border border-blue/30 bg-white px-4 py-2.5 text-sm text-navy shadow-sm shadow-navy/5 transition hover:-translate-y-0.5 hover:border-blue hover:bg-sky active:scale-95"
    >
      {children}
    </button>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
      {label}
    </div>
  );
}

function CardSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-2" aria-live="polite">
      <Typing label={label} />
      <div className="flex animate-pulse gap-3 rounded-3xl bg-white p-3 ring-1 ring-sky-2/70">
        <div className="aspect-[4/3] w-28 shrink-0 rounded-2xl bg-sky" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-3/4 rounded-full bg-sky" />
          <div className="h-3 w-1/3 rounded-full bg-sky" />
          <div className="h-3 w-1/2 rounded-full bg-sky" />
        </div>
      </div>
    </div>
  );
}

const Bubble = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-[92%] whitespace-pre-wrap rounded-3xl rounded-bl-md bg-white px-5 py-3.5 leading-relaxed text-ink shadow-sm shadow-navy/5 ring-1 ring-sky-2/70">
    {children}
  </div>
);

function Message({
  role,
  parts,
  streaming,
  locked,
  minor,
  pregnant,
  tan,
  limitedFacePigmentation,
  onOpenRoutine,
  onCartAll,
}: {
  role: string;
  parts: Part[];
  streaming: boolean;
  locked?: string;
  minor: boolean;
  pregnant: boolean;
  tan: boolean;
  limitedFacePigmentation: boolean;
  onOpenRoutine: () => void;
  onCartAll: (r: Routine) => void;
}) {
  const base = useContext(CardContext);
  if (role === "user") {
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-navy px-5 py-3.5 leading-relaxed text-mist shadow-sm shadow-navy/10">{text}</div>
      </div>
    );
  }
  // The explanation always comes first, then the product cards / routine, so the customer
  // reads the answer before seeing what is recommended. (The AI writes its text after the
  // tool call, so we reorder here.) Cards wait for the text while it is still streaming.
  const isText = (p: Part) => p.type === "text" && !!p.text?.trim();
  const hasText = parts.some(isText);
  const hasNonSunscreen = parts.some((p) => p.type === "tool-recommend_products" && ((p.output as { cards?: { role: string }[] } | undefined)?.cards ?? []).some((x) => x.role !== "sunscreen"));
  const hasResults = parts.some((p) => p.state === "output-available" && /^tool-(recommend_products|build_routine|update_routine|recheck_routine)$/.test(p.type));
  // Treatments lead, supporting basics (cleansers, moisturisers, sunscreen) follow.
  const KIND_ORDER: Record<string, number> = { treatment: 0, deodorant: 1, exfoliator: 2, cleanser: 3, moisturiser: 4, conditioner: 5, sunscreen: 6, supplement: 7 };
  const rank = (p: Part) => (p.type === "tool-recommend_products" ? (KIND_ORDER[(p.output as { kind?: string } | undefined)?.kind ?? ""] ?? 9) : -1);
  const nonText = parts.filter((p) => !isText(p));
  const ordered = [...parts.filter(isText), ...nonText.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)].filter(
    (p) => !(streaming && !hasText && p.state === "output-available" && /^tool-(recommend_products|build_routine|update_routine|compare_products)$/.test(p.type))
  );
  return (
    <CardContext.Provider value={locked ? { ...base, locked } : base}>
    <div className="flex animate-fade-up flex-col gap-3">
      {locked && hasResults && <p className="rounded-2xl bg-sky px-3 py-2 text-xs leading-relaxed text-navy">{locked}</p>}
      {ordered.map((p, i) => {
        if (isText(p)) return <Bubble key={i}>{p.text}</Bubble>;
        const name = p.type.replace("tool-", "");
        if (p.state !== "output-available") {
          if (!WORKING[name] || p.state === "output-error") return null;
          return RESULT_TOOLS.includes(name) ? <CardSkeleton key={i} label={WORKING[name]} /> : <Typing key={i} label={WORKING[name]} />;
        }
        const out = p.output as Record<string, unknown>;
        if (name === "ask_question" || name === "ask_needs" || name === "ask_scripted") return <Bubble key={i}>{String(out.question)}</Bubble>;
        if (name === "recommend_products") {
          const g = out as unknown as { need: string; cards: (ProductCard & { why: string; chooseIf?: string; isBest: boolean })[]; bestReason: string };
          if (!g.cards?.length) return null;
          return (
            <section key={i} className="grid gap-3">
              {g.need && <h3 className="text-xs font-medium uppercase tracking-widest text-slate">{g.need}</h3>}
              {g.cards.map((c) => (
                <ProductCardView key={c.id} c={c} why={c.why} badge={c.isBest ? "Our pick" : undefined} note={c.isBest ? g.bestReason : c.chooseIf} />
              ))}
            </section>
          );
        }
        if (name === "compare_products") return <CompareTable key={i} products={(out.products as never[]) ?? []} />;
        if (ROUTINE_TOOLS.includes(p.type) && out.items)
          return <RoutineChatCard key={i} r={out as unknown as Routine} onOpen={onOpenRoutine} onCartAll={onCartAll} locked={locked} />;
        if (name === "recheck_routine") {
          const rc = out as unknown as { about: string; flagged: { id: string; name: string; reason: string }[]; keptCount: number; routine: Routine | null };
          return (
            <div key={i} className="grid gap-3">
              <RecheckCard about={rc.about} flagged={rc.flagged ?? []} keptCount={rc.keptCount ?? 0} />
              {rc.routine?.items?.length ? <RoutineChatCard r={rc.routine} onOpen={onOpenRoutine} onCartAll={onCartAll} locked={locked} title="Your re-checked routine" /> : null}
            </div>
          );
        }
        return null;
      })}
      {tan && hasResults && !streaming && (
        <Bubble>
          {hasNonSunscreen
            ? "Sunscreen helps prevent more tan, but it doesn't fade tan you already have. The exfoliating picks above are the ones in the range that help lighten it over time."
            : "I couldn't find a Bodywise product that removes tan. Sunscreen only helps prevent more tan: it doesn't fade tan you already have."}
        </Bubble>
      )}
      {limitedFacePigmentation && hasResults && !streaming && (
        <Bubble>
          The Bodywise range has limited options for dark patches on the face, so the picks above are what exists. For stubborn patches, a dermatologist can help.
        </Bubble>
      )}
      {hasResults && !streaming && (
        <p className="px-1 text-xs leading-relaxed text-slate">Topical products work best alongside a healthy diet and lifestyle.</p>
      )}
      {pregnant && hasResults && !streaming && <Bubble>{PREGNANCY_LINE}</Bubble>}
      {minor && hasResults && !streaming && <Bubble>{MINOR_LINE}</Bubble>}
    </div>
    </CardContext.Provider>
  );
}
