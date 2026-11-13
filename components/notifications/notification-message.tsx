import { notificationSummary } from "@/lib/notifications/format";

/** All notification surfaces share the same short preview and optional full text. */
export function NotificationMessage({ message, className = "text-sm text-muted-foreground" }: { message: string; className?: string }) {
  const summary = notificationSummary(message);
  return (
    <div className="space-y-1 break-words">
      <p className={className}>{summary}</p>
      {summary !== message.replace(/\s+/g, " ").trim() && (
        <details className="text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded focus-visible:outline-2">Details</summary>
          <p className="mt-1 whitespace-pre-wrap">{message}</p>
        </details>
      )}
    </div>
  );
}
