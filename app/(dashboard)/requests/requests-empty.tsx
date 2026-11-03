/** Friendly empty state with a small calendar illustration; the action is passed in (create or clear filters). */
export function RequestsEmpty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden className="mb-4 text-primary">
        <rect x="14" y="14" width="92" height="70" rx="10" className="fill-muted stroke-border" strokeWidth="2" />
        <rect x="14" y="14" width="92" height="18" rx="10" className="fill-primary/15" />
        <rect x="32" y="6" width="6" height="14" rx="3" className="fill-primary" />
        <rect x="82" y="6" width="6" height="14" rx="3" className="fill-primary" />
        <g className="fill-border">
          {[0, 1, 2, 3].map((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={26 + c * 20} y={42 + r * 20} width="12" height="12" rx="3" />))}
        </g>
        <path d="M84 58l6 6 11-13" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
