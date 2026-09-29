export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <path d="M40.5 17.2 A16 16 0 1 0 47.3 25.5" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" />
      <circle cx="44.2" cy="17.6" r="4" fill="#fff" />
      <circle cx="32" cy="32" r="4.6" fill="#e3f1ee" />
    </svg>
  );
}
