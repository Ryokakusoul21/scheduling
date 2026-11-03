import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading subjects">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-9 w-80" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[70px] rounded-xl" />)}</div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2 rounded-xl border p-3">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  );
}
