import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminStatCards({ items }: { items: { label: string; value: number | string; hint: string; attention?: boolean }[] }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <Card key={item.label} className={cn(item.attention && "ring-amber-500/35")}><CardContent className="space-y-3"><p className="text-xs font-medium text-muted-foreground">{item.label}</p><p className="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</p><p className="text-xs leading-relaxed text-muted-foreground">{item.hint}</p></CardContent></Card>)}</div>;
}
