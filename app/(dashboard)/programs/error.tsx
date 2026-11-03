"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ux/states";

export default function ProgramsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Programs could not be loaded"
      description="Something went wrong while loading this page. Try again, and tell the Administrator if it keeps happening."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
