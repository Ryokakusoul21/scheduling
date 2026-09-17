import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign In · GCST Scheduling" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen w-full">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 text-primary-foreground lg:flex">
        <Image src="/branding/school.jpg" alt="GCST Campus" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/95 via-primary/90 to-primary/95" />

        <div className="relative flex items-center gap-3">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-gold/60">
            <Image src="/branding/logo.jpg" alt="GCST Seal" fill sizes="56px" className="object-cover" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-widest text-gold uppercase">GCST</p>
            <p className="text-xs text-primary-foreground/70">Est. 1999</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-4xl font-semibold leading-tight">
            Granby Colleges of Science &amp; Technology
          </h1>
          <p className="mt-4 max-w-sm text-primary-foreground/70">Naic, Cavite, Philippines</p>
        </div>
        <div className="relative max-w-sm text-sm text-primary-foreground/60">
          AI-Powered Scheduling Management System — automated timetabling, conflict
          detection, and faculty &amp; room allocation for the whole institution.
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="relative mb-4 size-14 overflow-hidden rounded-full ring-1 ring-border lg:hidden">
              <Image src="/branding/logo.jpg" alt="GCST Seal" fill sizes="56px" className="object-cover" />
            </div>
            <h2 className="text-2xl font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to the GCST Scheduling System
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
