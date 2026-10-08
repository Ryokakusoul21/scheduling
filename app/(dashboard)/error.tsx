"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ux/states";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page couldn't load"
      description="Something went wrong while loading this page. Try again; if it keeps happening, contact the system administrator."
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
