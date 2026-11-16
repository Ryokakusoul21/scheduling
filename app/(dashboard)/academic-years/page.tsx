import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

export const metadata = { title: "Academic Years and Terms · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function AcademicYearsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(...ADMIN_ROLES);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (value) query.set(key, value);
  redirect(`/programs${query.size ? `?${query}` : ""}#academic-calendar`);
}
