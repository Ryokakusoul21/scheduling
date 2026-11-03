"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { Input } from "@/components/ui/input";

/** Password input with a show/hide toggle; extra props (including the form ref) go to the input. */
export function PasswordField(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="h-10 pr-11 md:text-base" />
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
