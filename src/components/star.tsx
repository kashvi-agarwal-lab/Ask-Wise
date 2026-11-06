// A drawn star, so it looks the same on every device (some fonts have no star character).
export default function Star({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 1.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.4 4.9 17.3 6 11.6 1.7 7.6l5.8-.7L10 1.6z" />
    </svg>
  );
}
