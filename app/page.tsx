import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HOME_PATH } from "@/lib/permissions/roles";

export default async function Home() {
  const session = await auth();
  redirect(session?.user ? HOME_PATH : "/login");
}
