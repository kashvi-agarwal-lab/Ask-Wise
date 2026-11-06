"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "bodywise-guide-chat-v1";

type Saved = { role: string; parts: { type: string; text?: string }[] }[];

/** Shows "Continue your chat" only when this browser has a saved conversation. */
export default function ResumeChat() {
  const [first, setFirst] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved: Saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      const text = saved.find((m) => m.role === "user")?.parts.find((p) => p.type === "text")?.text;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (text) setFirst(text);
    } catch {}
  }, []);

  if (!first) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-sky p-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">Your last chat</p>
          <p className="mt-1 truncate font-serif text-xl text-navy">&ldquo;{first}&rdquo;</p>
        </div>
        <div className="flex gap-2">
          <Link href="/chat" className="rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-mist transition hover:bg-blue">
            Continue chat
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setFirst(null);
            }}
            className="rounded-full border border-navy/25 px-5 py-2.5 text-sm text-navy transition hover:bg-white"
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
