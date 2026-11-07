"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ux/states";

export default function RequestsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Requests could not be loaded"
      description="Something went wrong while loading Schedule Requests. Try again, and tell the Registrar if it keeps happening."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
