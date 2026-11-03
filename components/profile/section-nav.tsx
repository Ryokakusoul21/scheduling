"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

/** Sticky section links: a column on desktop, a scrolling row on small screens; follows the section in view. */
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
      className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 lg:flex-col lg:overflow-visible"
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
            "shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            active === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
