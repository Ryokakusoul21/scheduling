"use client";

import { cn } from "cn";
import { passwordScore } from "@/lib/validation/auth";

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const COLORS = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full bg-muted", i < score && COLORS[score])} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{LABELS[score]}</span> · 8+ characters with upper &amp;
        lowercase, a number and a symbol
      </p>
    </div>
  );
}
