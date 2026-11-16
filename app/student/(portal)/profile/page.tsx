import Link from "next/link";
import { ArrowRight, EnvelopeSimple, GraduationCap, IdentificationCard, Info, LockKey, ShieldCheck, User } from "@phosphor-icons/react/ssr";
import { loadStudentPortal } from "@/lib/student/portal";
import { UserAvatar } from "@/components/ui/user-avatar";
import { StudentPanel, STUDENT_LINK } from "@/components/student/workspace-parts";
import { NoSectionState } from "@/components/student/page-header";

export const metadata = { title: "My Profile · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function StudentProfilePage() {
  const portal = await loadStudentPortal();
  const section = portal.section;
  const accountDetails = [
    { label: "Full name", value: portal.user.name, icon: User },
    { label: "Email address", value: portal.user.email, icon: EnvelopeSimple },
    { label: "Student number", value: portal.studentNumber || "Not assigned", icon: IdentificationCard },
    { label: "Account type", value: "Student", icon: GraduationCap },
  ];
  return <div className="space-y-6">
    <header><p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-brand-link uppercase">My learning space</p><h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">My profile</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Your student identity, account information, and academic details.</p></header>
    <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-5">
        <section aria-label="Student identity" className="overflow-hidden rounded-2xl border bg-card">
          <div className="relative h-28 overflow-hidden bg-brand-navy"><div aria-hidden className="absolute -top-12 -right-6 size-48 rounded-full border-[24px] border-white/5" /><p className="absolute top-5 left-5 text-[10px] font-semibold tracking-[0.16em] text-white/80">GRANBY COLLEGES</p></div>
          <div className="relative px-6 pb-6">
            <UserAvatar name={portal.user.name} image={portal.user.image} className="-mt-9 size-20 border-4 border-card text-xl" />
            <span className="mt-4 inline-flex rounded-full bg-brand-blue/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-brand-link uppercase">Student</span>
            <h2 className="mt-3 font-heading text-xl leading-8 font-semibold break-words">{portal.user.name}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{portal.studentNumber || "Student number not assigned"}</p>
            <div className="mt-5 border-t pt-4"><p className="text-xs font-medium">{section?.name ?? "Section not assigned"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{section?.program ?? section?.stage ?? "Contact the Registrar about your enrollment."}</p></div>
          </div>
        </section>
        <div className="flex items-start gap-3 rounded-xl border border-brand-blue/15 bg-brand-blue/5 p-4"><Info aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-link" /><div><h2 className="text-xs font-semibold">Need to correct your details?</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Contact the Registrar to update your name, student number, program, or section.</p></div></div>
      </div>
      <div className="min-w-0 space-y-5">
        <StudentPanel title="Account information" description="The details associated with your student account" action={<span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><LockKey aria-hidden className="size-3.5" />Managed by the school</span>}>
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">{accountDetails.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><Icon aria-hidden className="size-4" /></span><div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 text-sm leading-6 font-medium break-words">{value}</dd></div></div>)}</dl>
        </StudentPanel>
        <StudentPanel title="Academic details" description="Your current section and published academic term">
          {section ? <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">{[
            { label: "Section", value: section.name }, { label: "Year / grade level", value: section.stage },
            { label: "Program / strand", value: section.program ?? "Not applicable for your level" }, { label: "Academic term", value: portal.term },
          ].map(({ label, value }) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 text-sm leading-6 font-medium">{value}</dd></div>)}</dl> : <NoSectionState />}
          {section && <Link href="/student/schedule" className={`${STUDENT_LINK} mt-5 border-t pt-4`}>View my section’s timetable <ArrowRight aria-hidden className="size-3.5" /></Link>}
        </StudentPanel>
        <StudentPanel title="Account security" description="Keep access to your campus workspace secure">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex max-w-lg items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/5 text-brand-link"><ShieldCheck aria-hidden className="size-5" /></span><div><h3 className="text-sm font-medium">Password recovery</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">Request a secure reset link at your registered email address. Resetting your password signs you out of other sessions.</p></div></div><Link href="/student/forgot-password" className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-xs font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Reset password <ArrowRight aria-hidden className="size-3.5" /></Link></div>
        </StudentPanel>
      </div>
    </div>
  </div>;
}
