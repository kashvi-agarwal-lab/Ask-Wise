"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ProductCard, Routine } from "@/lib/engine";
import { CompareTable, ProductCardView, RoutineChatCard, RoutineView } from "./parts";

const STORAGE_KEY = "bodywise-guide-chat-v1";

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
};

type Part = { type: string; state?: string; output?: unknown; text?: string };
type Msg = { id: string; role: string; parts: unknown[] };

const RESULT_TOOLS = ["recommend_products", "build_routine", "update_routine", "compare_products"];
const ROUTINE_TOOLS = ["tool-build_routine", "tool-update_routine"];

/** The current routine is simply the most recent build/update result in the conversation. */
function currentRoutine(messages: Msg[]): Routine | null {
  let found: Routine | null = null;
  for (const m of messages)
    for (const p of m.parts as Part[]) {
      const out = p.output as Routine | undefined;
      if (ROUTINE_TOOLS.includes(p.type) && p.state === "output-available" && out?.items) found = out;
    }
  return found;
}

export default function Chat() {
  const { messages, sendMessage, status, error, setMessages, regenerate } = useChat();
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const routine = useMemo(() => currentRoutine(messages as Msg[]), [messages]);

  // Restore the saved chat (it only ever lives in this browser) or start from ?category=
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      } else {
        const cat = new URLSearchParams(window.location.search).get("category");
        if (cat && CATEGORY_OPENERS[cat]) sendMessage({ text: CATEGORY_OPENERS[cat] });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored && status === "ready" && messages.length)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
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
    setMessages([]);
    setSheetOpen(false);
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
      ? (lastParts.find((p) => (p.type === "tool-ask_question" || p.type === "tool-ask_needs") && p.state === "output-available")
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
    <div className="flex h-dvh bg-mist">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-sky-2/60 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <Link href="/" className="font-serif text-lg text-navy">
            Bodywise <span className="text-blue">Guide</span>
          </Link>
          {messages.length > 0 && (
            <button onClick={newChat} className="rounded-full border border-navy/20 px-3 py-1.5 text-sm text-navy transition hover:bg-sky">
              New chat
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
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

            {messages.map((m) => (
              <Message
                key={m.id}
                role={m.role}
                parts={m.parts as Part[]}
                streaming={busy && m.id === last?.id}
                onOpenRoutine={() => setSheetOpen(true)}
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
              className="rounded-full bg-navy px-6 py-3 font-medium text-mist transition hover:bg-blue disabled:opacity-40"
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
          <RoutineView r={routine} onAsk={send} />
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
              <RoutineView r={routine} onAsk={send} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickReplies({ options, multi, onSend }: { options: string[]; multi: boolean; onSend: (t: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const continueRef = useRef<HTMLButtonElement>(null);
  // Keep the Continue button in view once something is ticked
  useEffect(() => {
    if (picked.length === 1) continueRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [picked.length]);
  const isDecide = (o: string) => /decide|not sure|you choose/i.test(o);
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
              className={`rounded-full border px-4 py-2 text-sm transition ${picked.includes(o) ? "border-navy bg-navy text-mist" : "border-blue/30 bg-white text-navy hover:bg-sky"}`}
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
      className="animate-fade-up rounded-full border border-blue/30 bg-white px-4 py-2 text-sm text-navy transition hover:-translate-y-0.5 hover:border-blue hover:bg-sky"
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
  <div className="max-w-[92%] whitespace-pre-wrap rounded-3xl rounded-bl-md bg-white px-5 py-3 leading-relaxed text-ink ring-1 ring-sky-2/70">
    {children}
  </div>
);

function Message({
  role,
  parts,
  streaming,
  onOpenRoutine,
}: {
  role: string;
  parts: Part[];
  streaming: boolean;
  onOpenRoutine: () => void;
}) {
  if (role === "user") {
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-navy px-5 py-3 text-mist">{text}</div>
      </div>
    );
  }
  // The explanation always comes first, then the product cards / routine, so the customer
  // reads the answer before seeing what is recommended. (The AI writes its text after the
  // tool call, so we reorder here.) Cards wait for the text while it is still streaming.
  const isText = (p: Part) => p.type === "text" && !!p.text?.trim();
  const hasText = parts.some(isText);
  const ordered = [...parts.filter(isText), ...parts.filter((p) => !isText(p))].filter(
    (p) => !(streaming && !hasText && p.state === "output-available" && /^tool-(recommend_products|build_routine|update_routine|compare_products)$/.test(p.type))
  );
  return (
    <div className="flex animate-fade-up flex-col gap-3">
      {ordered.map((p, i) => {
        if (isText(p)) return <Bubble key={i}>{p.text}</Bubble>;
        const name = p.type.replace("tool-", "");
        if (p.state !== "output-available") {
          if (!WORKING[name] || p.state === "output-error") return null;
          return RESULT_TOOLS.includes(name) ? <CardSkeleton key={i} label={WORKING[name]} /> : <Typing key={i} label={WORKING[name]} />;
        }
        const out = p.output as Record<string, unknown>;
        if (name === "ask_question" || name === "ask_needs") return <Bubble key={i}>{String(out.question)}</Bubble>;
        if (name === "recommend_products") {
          const g = out as unknown as { need: string; cards: (ProductCard & { why: string; chooseIf?: string; isBest: boolean })[]; bestReason: string };
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
          return <RoutineChatCard key={i} r={out as unknown as Routine} onOpen={onOpenRoutine} />;
        return null;
      })}
    </div>
  );
}
