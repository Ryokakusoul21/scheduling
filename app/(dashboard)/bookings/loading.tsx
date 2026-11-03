import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while bookings load: header, the search form, and a few booking rows. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading room booking">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Skeleton className="h-16 sm:col-span-2 lg:col-span-9" />
          <Skeleton className="h-16 lg:col-span-3" />
          <Skeleton className="h-16 lg:col-span-3" />
          <Skeleton className="h-16 lg:col-span-2" />
          <Skeleton className="h-16 lg:col-span-2" />
          <Skeleton className="h-16 lg:col-span-3" />
          <Skeleton className="h-16 sm:col-span-2 lg:col-span-2" />
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
