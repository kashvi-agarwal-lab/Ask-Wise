"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="font-serif text-3xl text-navy">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-slate">Sorry about that. Please try again, and if it keeps happening, come back in a little while.</p>
      <button onClick={() => retry()} className="mt-8 rounded-full bg-navy px-6 py-3 font-medium text-mist transition hover:bg-blue">
        Try again
      </button>
    </main>
  );
}
