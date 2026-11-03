import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-4" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <Skeleton className="hidden h-40 rounded-xl lg:block" />
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
