import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeForRole, type AppRole } from "@/lib/permissions/roles";

export default async function Home() {
  const session = await auth();
  redirect(session?.user ? homeForRole(session.user.role as AppRole) : "/login");
}
