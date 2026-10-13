import type { Icon } from "@phosphor-icons/react";
import { ArrowCounterClockwise, Check, CheckCircle, Eye, Key, PencilSimple, Plus, Prohibit, Star, Trash, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";

/** Row and dialog actions share one look everywhere: an outlined button with an icon, red for destructive ones. */
const KINDS = {
  edit: { label: "Edit", icon: PencilSimple, destructive: false },
  view: { label: "View", icon: Eye, destructive: false },
  read: { label: "Mark as read", icon: Check, destructive: false },
  delete: { label: "Delete", icon: Trash, destructive: true },
  cancel: { label: "Cancel", icon: Prohibit, destructive: true },
  reject: { label: "Reject", icon: X, destructive: true },
  dismiss: { label: "Dismiss", icon: X, destructive: false },
  withdraw: { label: "Withdraw", icon: ArrowCounterClockwise, destructive: false },
  add: { label: "Add", icon: Plus, destructive: false },
  activate: { label: "Set as active", icon: Star, destructive: false },
  approve: { label: "Approve", icon: CheckCircle, destructive: false },
  reset: { label: "Reset password", icon: Key, destructive: false },
} satisfies Record<string, { label: string; icon: Icon; destructive: boolean }>;

export type ActionKind = keyof typeof KINDS;

export function ActionButton({
  kind,
  children,
  size = "sm",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant"> & { kind: ActionKind }) {
  const k = KINDS[kind];
  return (
    <Button
      type="button"
      size={size}
      variant={k.destructive ? "destructive" : "outline"}
      {...props}
    >
      <k.icon className="size-3.5" aria-hidden /> {children ?? k.label}
    </Button>
  );
}
