export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="7" className="fill-fg" />
      <path d="M8 19v-7.5a4 4 0 0 1 8 0V19z" className="fill-accent" />
    </svg>
  );
}
