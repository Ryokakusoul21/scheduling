import { CheckCircle, Clock, Prohibit, XCircle } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/requests/rules";
import { cn } from "@/lib/utils";

const STYLE: Record<string, { icon: typeof Clock; className: string }> = {
  PENDING: { icon: Clock, className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  APPROVED: { icon: CheckCircle, className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  COMPLETED: { icon: CheckCircle, className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  REJECTED: { icon: XCircle, className: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" },
  CANCELLED: { icon: Prohibit, className: "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100" },
};

/** Status with a colour and an icon, so it never relies on colour alone. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { icon: Icon, className: tone } = STYLE[status] ?? STYLE.PENDING;
  return (
    <Badge variant="secondary" className={cn("gap-1 whitespace-nowrap", tone, className)}>
      <Icon className="size-3.5" weight="fill" aria-hidden /> {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
