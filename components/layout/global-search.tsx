"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, BookOpen, UserSquare2, Building2, Layers } from "lucide-react";
import { globalSearchAction, type SearchResult } from "./search-actions";

const GROUP_ICONS: Record<SearchResult["group"], typeof BookOpen> = {
  Subjects: BookOpen,
  Faculty: UserSquare2,
  Rooms: Building2,
  Sections: Layers,
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearchAction(value);
        setResults(res);
      });
    }, 250);
  }

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="group relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Search subject, faculty, room, section..."
        className="h-10 w-full rounded-xl border border-transparent bg-muted/70 pl-10 pr-9 text-sm text-foreground outline-none ring-1 ring-inset ring-black/[0.04] transition-all placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:border-primary/30 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 dark:ring-white/[0.04]"
      />
      {pending && (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {results.length === 0 && !pending && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No results for &quot;{query}&quot;</p>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              {items.map((r) => {
                const Icon = GROUP_ICONS[r.group];
                return (
                  <button
                    key={`${r.group}-${r.id}`}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.sublabel}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
