import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/db/prisma";

const body = z.object({ userId: z.string().min(1).nullable() });

/** Starts (userId) or stops (null) viewing the system as another account; Super Administrator only, audited. */
export async function POST(request: Request) {
  const session = await auth();
  const realId = session?.user?.realId ?? session?.user?.id;
  if (!realId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const real = await prisma.user.findUnique({ where: { id: realId }, select: { role: true } });
  if (real?.role !== "SUPER_ADMINISTRATOR") return NextResponse.json({ error: "Only the Super Administrator can view as another account." }, { status: 403 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an account." }, { status: 400 });
  const { userId } = parsed.data;

  if (userId) {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true, archivedAt: true, name: true } });
    if (!target || target.status !== "ACTIVE" || target.archivedAt || target.role === "SUPER_ADMINISTRATOR") {
      return NextResponse.json({ error: "That account cannot be viewed." }, { status: 400 });
    }
    await unstable_update({ viewAs: userId } as never);
    await prisma.auditLog.create({ data: { userId: realId, action: `Started viewing as ${target.name ?? "an account"} (read-only)`, entity: "Auth", entityId: userId } });
    return NextResponse.json({ redirect: target.role === "STUDENT" ? "/student" : "/dashboard" });
  }

  await unstable_update({ viewAs: null } as never);
  await prisma.auditLog.create({ data: { userId: realId, action: "Stopped viewing as another account", entity: "Auth" } });
  return NextResponse.json({ redirect: "/admin/view-as" });
}
