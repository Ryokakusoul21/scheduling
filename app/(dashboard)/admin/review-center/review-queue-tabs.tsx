import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReviewTab } from "./review-inbox";

export function ReviewQueueTabs({ tabs, active }: { tabs: ReviewTab[]; active: string }) {
  return <nav aria-label="Submission queues" className="flex gap-2 overflow-x-auto pb-1">
    {tabs.map((tab) => <Button key={tab.key} size="sm" variant={active === tab.key ? "default" : "outline"} nativeButton={false} render={<Link href={`/admin/review-center?queue=${tab.key}`} aria-current={active === tab.key ? "page" : undefined} />}>
      {tab.label}<Badge variant={active === tab.key ? "secondary" : "outline"}>{tab.count}</Badge>
    </Button>)}
  </nav>;
}
