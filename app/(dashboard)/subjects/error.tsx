"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ux/states";

export default function SubjectsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Subjects could not be loaded"
      description="Something went wrong while loading the curriculum. Try again, and tell the Registrar if it keeps happening."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
