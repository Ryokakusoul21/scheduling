import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { clientIp } from "@/lib/auth/rate-limit";
import { AvatarError, deleteAvatarFiles, saveAvatar } from "@/lib/avatar/storage";
import { AVATAR_MAX_BYTES } from "@/lib/avatar/url";

const ACTIONS = ["Updated profile photo", "Removed profile photo"];
const MAX_CHANGES_PER_HOUR = 10;

/** A user changes only their own avatar, so the target is always the signed-in account. */
async function guard(req: Request) {
  const user = (await getSession())?.user;
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }), user: null, ip: "" };
  const recent = await prisma.auditLog.count({
    where: { userId: user.id, action: { in: ACTIONS }, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= MAX_CHANGES_PER_HOUR) {
    return { error: NextResponse.json({ error: "Too many photo changes. Try again in an hour." }, { status: 429 }), user: null, ip: "" };
  }
  return { error: null, user, ip: clientIp(req.headers) };
}

async function record(userId: string, action: string, ip: string, role: string) {
  await prisma.auditLog.create({ data: { userId, action, entity: "User", entityId: userId, ipAddress: ip, role } });
}

export async function POST(req: Request) {
  const g = await guard(req);
  if (!g.user) return g.error;
  const { user, ip } = g;

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  if (file.size > AVATAR_MAX_BYTES) return NextResponse.json({ error: "The photo must be 5 MB or smaller." }, { status: 413 });

  try {
    const url = await saveAvatar(user.id, Buffer.from(await file.arrayBuffer()));
    const old = await prisma.user.findUnique({ where: { id: user.id }, select: { image: true } });
    await prisma.user.update({ where: { id: user.id }, data: { image: url } });
    await deleteAvatarFiles(old?.image);
    await record(user.id, ACTIONS[0], ip, user.role);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof AvatarError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("Avatar upload failed:", e);
    return NextResponse.json({ error: "The server could not save the photo. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if (!g.user) return g.error;
  const { user, ip } = g;

  const old = await prisma.user.findUnique({ where: { id: user.id }, select: { image: true } });
  await prisma.user.update({ where: { id: user.id }, data: { image: null } });
  await deleteAvatarFiles(old?.image);
  await record(user.id, ACTIONS[1], ip, user.role);
  return NextResponse.json({ ok: true });
}
