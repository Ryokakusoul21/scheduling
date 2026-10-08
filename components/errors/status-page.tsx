import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Full-page layout for HTTP status pages (401, 403). */
export function StatusPage({
  code,
  title,
  description,
  action,
}: {
  code: number;
  title: string;
  description: string;
  action: { href: string; label: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-semibold tracking-tight text-primary">{code}</p>
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button nativeButton={false} render={<Link href={action.href} />}>
            {action.label}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}
