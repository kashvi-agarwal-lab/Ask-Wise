"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductCard, Routine } from "@/lib/engine";

/* ---------- Small helpers ---------- */

function Price({ c }: { c: ProductCard }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-navy">₹{c.price}</span>
      {c.mrp && <span className="ml-1.5 text-xs text-slate line-through">₹{c.mrp}</span>}
    </span>
  );
}

function Expand({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-sky-2/70 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-navy marker:hidden">
        {title}
        <span className="text-blue transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 leading-relaxed text-ink/80">{children}</div>
    </details>
  );
}

// Catalogue photos are 4:3, so a 4:3 frame shows them whole (nothing cropped).
function Thumb({ c, className = "w-28" }: { c: ProductCard; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-[4/3] shrink-0 overflow-hidden rounded-2xl bg-sky ${className}`}>
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center font-serif text-3xl text-blue/60">{c.name.charAt(0)}</span>
      ) : (
        <Image src={c.image} alt={c.name} fill sizes="120px" className="object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

/* ---------- Product card with expandable sections ---------- */

export function ProductCardView({
  c,
  why,
  actions,
  badge,
  note,
}: {
  c: ProductCard;
  why?: string;
  actions?: React.ReactNode;
  badge?: string;
  note?: string; // for the best pick: why it is best; for the others: when to choose them
}) {
  const precautions = [
    ...c.precautions,
    c.isSupplement ? "Check with a doctor before starting any supplement." : "Patch-test on a small area for 24 hours before regular use.",
  ];
  return (
    <div className={`rounded-3xl bg-white p-3 ${badge ? "ring-2 ring-blue" : "ring-1 ring-sky-2/70"}`}>
      {badge && (
        <span className="mb-2 ml-1 inline-block rounded-full bg-blue px-3 py-1 text-xs font-medium tracking-wide text-white">★ {badge}</span>
      )}
      <div className="flex gap-3">
        <Thumb c={c} />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="font-medium leading-snug text-navy">
            {c.name}
            {c.size ? <span className="font-normal text-slate"> · {c.size}</span> : null}
          </p>
          <p className="mt-0.5 text-sm">
            <Price c={c} />
            {c.rating ? <span className="ml-2 text-xs text-slate">★ {c.rating} ({c.reviewCount})</span> : null}
          </p>
          {c.concerns.length > 0 && <p className="mt-1 text-xs text-slate">{c.concerns.slice(0, 2).join(" · ")}</p>}
        </div>
      </div>
      {note && (
        <p className={`mt-2 rounded-2xl px-3 py-2 text-sm leading-snug ${badge ? "bg-sky text-navy" : "text-slate"}`}>{note}</p>
      )}
      <div className="mt-2 px-1">
        {why && <Expand title="Why for you">{why}</Expand>}
        {c.keyIngredients.length > 0 && <Expand title="Key ingredients">{c.keyIngredients.join("; ")}</Expand>}
        {c.howToUse.length > 0 && (
          <Expand title="How to use">
            <ul className="space-y-1">{c.howToUse.map((s) => <li key={s}>{s}</li>)}</ul>
          </Expand>
        )}
        <Expand title="Precautions">
          <ul className="list-disc space-y-1 pl-4">{precautions.map((s) => <li key={s}>{s}</li>)}</ul>
        </Expand>
        <div className="flex items-center justify-between border-t border-sky-2/70 pt-2">
          <a href={c.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue hover:underline">
            View on Bodywise ↗
          </a>
          {actions}
        </div>
      </div>
    </div>
  );
}

/* ---------- Compare table ---------- */

type Detail = ProductCard & { allConcerns?: string[]; exfoliant?: boolean; error?: string };

export function CompareTable({ products }: { products: Detail[] }) {
  const ok = products.filter((p) => !p.error);
  if (ok.length < 2) return null;
  const rows: [string, (p: Detail) => string][] = [
    ["Price", (p) => `₹${p.price}${p.size ? ` · ${p.size}` : ""}`],
    ["Type", (p) => p.type],
    ["Made for", (p) => p.concerns.slice(0, 3).join(", ") || "—"],
    ["Key ingredients", (p) => p.keyIngredients.join("; ") || "—"],
    ["Exfoliating", (p) => (p.exfoliant ? "Yes" : "No")],
    ["How to use", (p) => p.howToUse[0] ?? "—"],
  ];
  return (
    <div className="overflow-x-auto rounded-3xl bg-white p-3 ring-1 ring-sky-2/70">
      <table className="w-full min-w-[420px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {ok.map((p) => (
              <th key={p.id} className="px-2 pb-2 align-bottom font-medium text-navy">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label}>
              <td className="border-t border-sky-2/70 py-2 pr-2 text-xs uppercase tracking-wide text-slate">{label}</td>
              {ok.map((p) => (
                <td key={p.id} className="border-t border-sky-2/70 px-2 py-2 align-top text-ink/85">{fn(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Routine ---------- */

const SLOT_LABEL: [keyof Pick<Routine, "am" | "pm" | "weekly" | "supplement">, string][] = [
  ["am", "Morning"],
  ["pm", "Evening"],
  ["weekly", "Weekly"],
  ["supplement", "Supplements"],
];

export function routineText(r: Routine) {
  const lines = ["My Bodywise routine", ""];
  for (const [key, label] of SLOT_LABEL) {
    const ids = r[key];
    if (!ids.length) continue;
    lines.push(`${label.toUpperCase()}`);
    for (const id of ids) {
      const it = r.items.find((x) => x.id === id)!;
      lines.push(`- ${it.name}${it.size ? ` (${it.size})` : ""}: ₹${it.price}`);
    }
    lines.push("");
  }
  lines.push(`Total (one of each): ₹${r.total}`, `Prices as of ${r.pricesAsOf}.`, "");
  for (const w of r.warnings) lines.push(`* ${w}`);
  return lines.join("\n");
}

/** Full routine: used in the side panel (desktop) and the bottom sheet (mobile). */
export function RoutineView({ r, onAsk }: { r: Routine; onAsk: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(routineText(r));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const exfoliantWarnings = r.warnings.filter((w) => w.startsWith("Exfoliant layering"));
  const otherWarnings = r.warnings.filter((w) => !w.startsWith("Exfoliant layering"));

  return (
    <div className="flex flex-col gap-5">
      {exfoliantWarnings.map((w) => (
        <div key={w} className="rounded-2xl border border-blue/30 bg-sky p-3 text-sm leading-relaxed text-navy">
          <span className="font-semibold">Go gently: </span>
          {w.replace("Exfoliant layering: ", "")}
        </div>
      ))}

      {SLOT_LABEL.map(([key, label]) => {
        const ids = r[key];
        if (!ids.length) return null;
        return (
          <section key={key}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate">{label}</h3>
            <div className="grid gap-3">
              {ids.map((id) => {
                const it = r.items.find((x) => x.id === id)!;
                return (
                  <ProductCardView
                    key={key + id}
                    c={it}
                    actions={
                      <span className="flex gap-3 text-sm">
                        <button onClick={() => onAsk(`Swap ${it.name} in my routine for something else`)} className="text-slate hover:text-blue">
                          Swap
                        </button>
                        <button onClick={() => onAsk(`Remove ${it.name} from my routine`)} className="text-slate hover:text-blue">
                          Remove
                        </button>
                      </span>
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="flex items-center justify-between rounded-2xl bg-navy px-5 py-4 text-mist">
        <span>Total (one of each)</span>
        <span className="font-serif text-3xl">₹{r.total}</span>
      </div>

      <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate">
        {otherWarnings.map((w) => <li key={w}>{w}</li>)}
        <li>Prices as of {r.pricesAsOf}.</li>
      </ul>

      <button onClick={copy} className="rounded-full border border-navy/25 py-3 text-sm font-medium text-navy transition hover:bg-sky">
        {copied ? "Copied ✓" : "Copy routine summary"}
      </button>
    </div>
  );
}

/** Compact version shown inside the chat message. */
export function RoutineChatCard({ r, onOpen }: { r: Routine; onOpen: () => void }) {
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-sky-2/70">
      <p className="font-serif text-xl text-navy">Your routine</p>
      <ul className="mt-2 space-y-1 text-sm text-ink/85">
        {SLOT_LABEL.map(([key, label]) => {
          const names = r[key].map((id) => r.items.find((x) => x.id === id)!.name);
          return names.length ? (
            <li key={key}>
              <span className="font-medium text-navy">{label}:</span> {names.join(", ")}
            </li>
          ) : null;
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-sky-2 pt-3">
        <span className="font-serif text-2xl text-navy">₹{r.total}</span>
        <button onClick={onOpen} className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-mist transition hover:bg-blue lg:hidden">
          See full routine
        </button>
        <span className="hidden text-xs text-slate lg:inline">Full routine is in the side panel →</span>
      </div>
    </div>
  );
}
