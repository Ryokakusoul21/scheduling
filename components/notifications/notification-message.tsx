import { notificationSummary } from "@/lib/notifications/format";

/** All notification surfaces share the same short preview and optional full text. */
export function NotificationMessage({ message, className = "text-sm text-muted-foreground" }: { message: string; className?: string }) {
  const summary = notificationSummary(message);
  return (
    <div className="space-y-1 break-words">
      <p className={className}>{summary}</p>
      {summary !== message.replace(/\s+/g, " ").trim() && (
        <details className="text-xs leading-5 text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded py-1 font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Read full message</summary>
          <p className="mt-2 rounded-lg bg-muted/60 p-3 text-sm leading-6 whitespace-pre-wrap">{message}</p>
        </details>
      )}
    </div>
  );
}
