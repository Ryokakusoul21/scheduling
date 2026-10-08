import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";

/** Breadcrumb trail for card-based selection flows (Level → Grade → …). */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <CaretRight className="size-3" aria-hidden />}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="rounded font-medium hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="font-medium text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
