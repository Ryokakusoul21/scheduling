"use client";

import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client-side paging over an already filtered list. Passing a new `resetKey` (for example the filter
 * values) returns to the first page.
 */
export function usePagination<T>(items: T[], pageSize = 10, resetKey = "") {
  const [state, setState] = useState({ page: 1, key: resetKey });
  // Filters changed: start again from the first page.
  if (state.key !== resetKey) setState({ page: 1, key: resetKey });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(state.key === resetKey ? state.page : 1, pages);
  const start = (page - 1) * pageSize;
  return {
    page,
    pages,
    pageSize,
    total: items.length,
    start,
    visible: items.slice(start, start + pageSize),
    /** Whether the item at this index of `items` is on the current page. */
    isVisible: (index: number) => index >= start && index < start + pageSize,
    setPage: (p: number) => setState({ page: Math.min(Math.max(1, p), pages), key: resetKey }),
  };
}

/** Numbered page buttons with previous and next; hidden when everything fits on one page. */
export function Pagination({ page, pages, total, start, pageSize, setPage, className }: ReturnType<typeof usePagination> & { className?: string }) {
  if (pages <= 1) return null;
  // Show the first, last, current, and neighbouring pages; gaps become an ellipsis.
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-2 text-sm print:hidden", className)}>
      <p className="text-xs text-muted-foreground">
        Showing {start + 1} to {Math.min(start + pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
          <CaretLeft className="size-3.5" /> Previous
        </Button>
        {numbers.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - numbers[i - 1] > 1 && <span className="px-1 text-muted-foreground" aria-hidden>…</span>}
            <Button size="sm" variant={n === page ? "default" : "outline"} aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} className="min-w-8">
              {n}
            </Button>
          </span>
        ))}
        <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(page + 1)}>
          Next <CaretRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
