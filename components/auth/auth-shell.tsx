import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, ShieldWarning, DoorOpen } from "@phosphor-icons/react/ssr";
import { PortalSwitch } from "@/components/auth/portal-switch";
import { cn } from "@/lib/utils";

const SYSTEM_TITLE = "AI-Driven Faculty and Room Scheduling System";
const FEATURES = [
  { icon: CalendarCheck, label: "Automated timetabling" },
  { icon: ShieldWarning, label: "Conflict detection" },
  { icon: DoorOpen, label: "Faculty and room allocation" },
];

function Seal({ size }: { size: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-brand-gold/70" style={{ width: size, height: size }}>
      <Image src="/branding/logo.jpg" alt="GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY seal" fill sizes={`${size}px`} className="object-cover" />
    </div>
  );
}

/** Quiet navy backdrop on phones; full campus photo and branding on the desktop left panel. */
export function AuthShell({ title, description, wide = false, children }: {
  title: string;
  description?: React.ReactNode;
  /** Kept for existing callers; no longer rendered. */
  eyebrow?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate min-h-svh bg-brand-navy lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:bg-slate-50 dark:lg:bg-background">
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-linear-to-b from-[#0b1730] to-[#173b63] lg:right-1/2">
        <div className="absolute inset-x-0 bottom-0 h-[62%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_35%)] lg:inset-0 lg:h-full lg:[mask-image:none]">
          {/* Crop out the embedded seal on phones; preserve the full photo on desktop. */}
          <div className="absolute inset-x-0 bottom-0 h-[200%] lg:h-full">
            <Image src="/branding/school.jpg" alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="scale-[1.02] object-cover object-bottom blur-[2px] lg:scale-100 lg:object-center lg:blur-none" />
          </div>
        </div>
        <div className="absolute inset-0 bg-linear-to-b from-[#0b1730]/95 via-[#102642]/80 to-[#173b63]/75 lg:from-brand-navy/70 lg:via-brand-navy/55 lg:to-brand-navy/90" />
      </div>
      <aside className="text-white">
        <div className="flex h-full flex-col justify-between p-5 lg:sticky lg:top-0 lg:min-h-svh lg:p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <Seal size={44} />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">{SYSTEM_TITLE}</p>
              <p className="text-[11px] text-white/70">Est. 1999</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="mb-6 h-0.5 w-10 bg-brand-gold" />
            <h2 className="max-w-md font-heading text-4xl leading-tight font-semibold tracking-tight uppercase xl:text-5xl">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</h2>
            <ul className="mt-8 space-y-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="flex size-6 items-center justify-center rounded bg-white/10"><Icon aria-hidden className="size-3.5 text-brand-gold" /></span>{label}
                </li>
              ))}
            </ul>
            <p className="mt-10 text-xs text-white/60">Naic, Cavite, Philippines &middot; &copy; {new Date().getFullYear()}</p>
          </div>
        </div>
      </aside>
      <main id="main-content" className="flex min-w-0 flex-col px-4 py-6 sm:px-8 lg:px-10 lg:py-9 xl:px-16">
        <div className="flex justify-end"><PortalSwitch /></div>
        <div className={cn("mx-auto flex w-full flex-1 flex-col justify-center py-6", wide ? "max-w-2xl" : "max-w-[540px]")}>
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-card text-card-foreground shadow-[0_24px_64px_-20px_rgba(3,12,27,0.35)]">
            <div className="h-1.5 bg-linear-to-r from-brand-blue via-brand-blue to-brand-gold" />
            <div className="p-6 sm:p-12 sm:py-14">
            <header className="mb-9">
              <h1 className="font-heading text-4xl font-bold tracking-normal [word-spacing:0.12em]">{title}</h1>
              {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
            </header>
            <div className="[&_input]:h-14 [&_input]:rounded-lg [&_input]:text-base [&_select]:h-14 [&_select]:rounded-lg [&_select]:text-base [&_button[type=submit]]:min-h-14 [&_button[type=submit]]:rounded-lg [&_button[type=submit]]:bg-brand-blue [&_button[type=submit]]:font-semibold [&_button[type=submit]]:text-white [&_button[type=submit]:hover]:bg-brand-navy">{children}</div>
            </div>
          </div>
        </div>
        <footer className="flex justify-center gap-5 text-xs text-white/70 lg:text-muted-foreground">
          <Link href="/privacy" className="hover:text-white hover:underline lg:hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-white hover:underline lg:hover:text-foreground">Terms</Link>
        </footer>
      </main>
    </div>
  );
}
