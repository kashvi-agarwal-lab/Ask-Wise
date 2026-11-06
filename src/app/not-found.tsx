import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-serif text-6xl text-blue">404</p>
      <h1 className="mt-4 font-serif text-3xl text-navy">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-sm text-slate">It may have moved, or the link might be wrong.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="rounded-full border border-navy/20 px-6 py-3 text-navy transition hover:bg-sky">
          Home
        </Link>
        <Link href="/chat" className="rounded-full bg-navy px-6 py-3 font-medium text-mist transition hover:bg-blue">
          Find my routine
        </Link>
      </div>
    </main>
  );
}
