"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";

/** Starts or stops viewing as another account, then reloads so every page uses the new session. */
async function switchView(userId: string | null) {
  const res = await fetch("/api/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
  const data = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
  if (!res.ok || !data.redirect) return void toast.error(data.error ?? "Could not switch the view.");
  window.location.assign(data.redirect);
}

export function ViewAsButton({ userId, label }: { userId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setBusy(true); void switchView(userId).finally(() => setBusy(false)); }}>
      <UserCircle className="size-4" /> View as {label}
    </Button>
  );
}

/** Shown on every page while viewing as another account. */
export function ViewAsBanner({ name, role, realName }: { name: string; role: string; realName: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between gap-2 bg-amber-500 px-4 text-sm font-medium text-amber-950 print:hidden">
      <span className="flex min-w-0 items-center gap-2 truncate"><UserCircle className="size-4" weight="bold" aria-hidden /> Viewing as {name} ({role}). Read-only: changes are blocked.</span>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setBusy(true); void switchView(null).finally(() => setBusy(false)); }}>
        <ArrowLeft className="size-4" /> Back to {realName}
      </Button>
    </div>
  );
}
