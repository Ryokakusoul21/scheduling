import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homePath } from "@/lib/permissions/roles";

export default async function Home() {
  const session = await auth();
  redirect(session?.user ? homePath(session.user.role) : "/login");
}
