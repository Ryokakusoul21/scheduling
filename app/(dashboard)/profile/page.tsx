import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { describeLocation } from "@/lib/auth/device";
import { formatWhen, timeAgo } from "@/lib/format/when";
import { roleLabel, type AppRole } from "@/lib/permissions/roles";
import { AccountCard } from "@/components/profile/account-card";
import { PasswordCard } from "@/components/profile/password-card";
import { ProfileHero } from "@/components/profile/profile-hero";
import { SectionNav } from "@/components/profile/section-nav";
import { SessionList } from "@/components/profile/session-list";
import { TwoFactorCard } from "@/components/profile/two-factor-card";

export const metadata = {
  title: "Profile and Security · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY",
};

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "password", label: "Password" },
  { id: "two-factor", label: "Two-factor authentication" },
  { id: "sessions", label: "Sessions & devices" },
];

export default async function ProfilePage() {
  const { id, role: sessionRole, sessionId } = await requireUser();
  const role = roleLabel(sessionRole as AppRole);
  const now = new Date();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: {
      faculty: {
        select: {
          employeeId: true,
          position: true,
          department: { select: { name: true } },
        },
      },
      programAssignments: { select: { program: { select: { code: true } } } },
    },
  });
  const sessions = await prisma.userSession.findMany({
    where: {
      userId: id,
      revokedAt: null,
      lastActiveAt: {
        gt: new Date(now.getTime() - AUTH.rememberMeMaxAgeSeconds * 1000),
      },
      // Rows from before a password change or "sign out everywhere" are stale.
      version: user.sessionVersion,
    },
    orderBy: { lastActiveAt: "desc" },
  });

  // Role-specific rows: teaching staff show their faculty record, Heads of Department their programs.
  const details = [
    user.faculty?.department && {
      label: "Department",
      value: user.faculty.department.name,
    },
    user.faculty && { label: "Employee ID", value: user.faculty.employeeId },
    user.faculty?.position && {
      label: "Position",
      value: user.faculty.position,
    },
    user.programAssignments.length > 0 && {
      label: "Programs",
      value: user.programAssignments.map((a) => a.program.code).join(", "),
    },
  ].filter((d): d is { label: string; value: string } => !!d);

  const context =
    [user.faculty?.department?.name, user.faculty?.position]
      .filter(Boolean)
      .join(" · ") || null;
  const lastSignIn = user.lastLoginAt
    ? `${formatWhen(user.lastLoginAt, now)} (${timeAgo(user.lastLoginAt, now)})`
    : "Not available";

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile and Security
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account details, photo, and sign-in security.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-0">
          <ProfileHero
            name={user.name}
            email={user.email}
            image={user.image}
            role={role}
            context={context}
            lastSignIn={lastSignIn}
          />
          <SectionNav items={SECTIONS} />
        </div>
        <div className="space-y-4">
          <section id="account" aria-label="Account" className="scroll-mt-16">
            <AccountCard
              name={user.name}
              email={user.email}
              role={role}
              details={details}
            />
          </section>
          <section id="password" aria-label="Password" className="scroll-mt-16">
            <PasswordCard />
          </section>
          <section
            id="two-factor"
            aria-label="Two-factor authentication"
            className="scroll-mt-16"
          >
            <TwoFactorCard
              enabled={user.twoFactorEnabled}
              recoveryLeft={user.twoFactorRecoveryCodes.length}
            />
          </section>
          <section
            id="sessions"
            aria-label="Sessions and devices"
            className="scroll-mt-16"
          >
            <SessionList
              sessions={sessions.map((s) => ({
                id: s.id,
                device: s.device,
                location: describeLocation(s.ipAddress),
                signedIn: formatWhen(s.createdAt, now),
                lastActive: timeAgo(s.lastActiveAt, now),
                current: s.id === sessionId,
              }))}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
