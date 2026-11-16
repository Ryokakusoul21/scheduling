"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/** Password input with a show/hide toggle; extra props (including the form ref) go to the input. */
export function PasswordField({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative min-w-0">
      <Input {...props} type={shown ? "text" : "password"} className={cn("h-11 pr-11 text-base", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {shown ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
