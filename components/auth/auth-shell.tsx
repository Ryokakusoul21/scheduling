import Image from "next/image";
import { CalendarCheck, ShieldCheck, UsersThree } from "@phosphor-icons/react/ssr";

const HIGHLIGHTS = [
  { icon: CalendarCheck, label: "Automated timetabling" },
  { icon: ShieldCheck, label: "Conflict detection" },
  { icon: UsersThree, label: "Faculty & room allocation" },
];

/** Round school seal used in both the brand panel and the compact mobile header. */
function Seal({ size }: { size: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-brand-gold/70" style={{ width: size, height: size }}>
      <Image src="/branding/logo.jpg" alt="GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY Seal" fill sizes={`${size}px`} className="object-cover" />
    </div>
  );
}

/** Split-screen layout shared by login, registration, and password recovery pages. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex lg:w-[55%]">
        <Image src="/branding/school.jpg" alt="GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY Campus" fill priority sizes="(min-width: 1024px) 55vw, 1px" className="object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-brand-navy via-brand-navy/75 to-brand-blue/70" />

        <div className="relative flex items-center gap-3">
          <Seal size={56} />
          <div>
            <p className="text-sm font-semibold tracking-widest text-white/90 uppercase">AI-Driven Faculty and Room Scheduling System</p>
            <p className="text-xs text-white/70">Est. 1999</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <div className="mb-5 h-1 w-12 rounded-full bg-brand-gold" />
            <h1 className="max-w-lg text-4xl font-semibold leading-tight xl:text-5xl">
              GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY
            </h1>
          </div>
          <ul className="space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4 text-brand-gold" weight="bold" />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/70">Naic, Cavite, Philippines · &copy; {new Date().getFullYear()}</p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Seal size={44} />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-snug">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</p>
              <p className="text-xs text-muted-foreground">AI-Driven Faculty and Room Scheduling System</p>
            </div>
          </div>
          <div className="mb-8 space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
