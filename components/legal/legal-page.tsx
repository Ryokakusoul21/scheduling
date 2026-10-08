import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/register" className="text-xs font-medium text-primary hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground">Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}
