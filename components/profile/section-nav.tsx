"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

/** Section links: a compact grid on phones and a column on desktop; follows the section in view. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Profile sections"
      className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border bg-card p-1 lg:grid-cols-1"
    >
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? "location" : undefined}
          onClick={(e) => {
            e.preventDefault();
            setActive(i.id);
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.getElementById(i.id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
          }}
          className={cn(
            "flex min-h-11 min-w-0 items-center rounded-lg px-3 py-2 text-sm leading-snug font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            active === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
