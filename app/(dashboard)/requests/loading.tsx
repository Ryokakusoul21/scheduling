import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading requests">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-80" /></div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}</div>
      <div className="space-y-2 rounded-xl border p-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  );
}
