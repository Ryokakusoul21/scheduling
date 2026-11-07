import { loadStudentPortal } from "@/lib/student/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";

export const metadata = { title: "Profile · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Read-only account and enrollment details of the signed-in student. */
export default async function StudentProfilePage() {
  const portal = await loadStudentPortal();
  const account = (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <UserAvatar name={portal.user.name} className="size-14" />
        <div className="min-w-0">
          <p className="truncate font-medium">{portal.user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{portal.user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">To correct your name, section, or student number, contact the Registrar or the Registrar.</p>
        </div>
      </CardContent>
    </Card>
  );
  if (!portal.section) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        {account}
        <NoSectionState />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <StudentPageHeader title="Profile" portal={portal} />
      {account}
    </div>
  );
}
