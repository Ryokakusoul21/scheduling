import Link from "next/link";
import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";

/** A narrow summary table with optional details instead of horizontally scrolling columns. */
export function MobileRecordTable({ label, column, rows }: {
  label: string;
  column: string;
  rows: { id: string; name: string; href: string; summary?: ReactNode; details: ReactNode; actions?: ReactNode }[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <table aria-label={label} className="w-full table-fixed text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr><th scope="col" className="w-[42%] px-4 py-3 font-medium">{column}</th><th scope="col" className="px-4 py-3 font-medium">Details</th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 align-top">
                <Link href={row.href} className="flex min-h-11 items-center rounded font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{row.name}</Link>
                {row.summary && <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">{row.summary}</div>}
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex items-start justify-between gap-1">
                  <details className="group/details min-w-0 flex-1">
                    <summary aria-label={`Details for ${row.name}`} className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded font-medium focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      Details <CaretDown className="size-4 shrink-0 transition-transform group-open/details:rotate-180" aria-hidden />
                    </summary>
                    <div className="space-y-3 py-2 text-sm [overflow-wrap:anywhere]">{row.details}</div>
                  </details>
                  {row.actions}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
