"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";

/** Goes back in history (or to the fallback page) and warns first when there are unsaved changes. */
export function BackButton({ fallback, dirty = false }: { fallback: string; dirty?: boolean }) {
  const router = useRouter();

  // The browser shows its own leave-page warning for reloads, tab closes, and typed addresses.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function goBack() {
    if (dirty && !window.confirm("You have unsaved changes. Leave this page anyway?")) return;
    // A fresh tab or an arrival from another site has no in-application page to return to.
    const external = !!document.referrer && new URL(document.referrer).origin !== window.location.origin;
    if (!external && window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return (
    <Button variant="outline" onClick={goBack} className="print:hidden">
      <ArrowLeft className="size-4" /> Back
    </Button>
  );
}
