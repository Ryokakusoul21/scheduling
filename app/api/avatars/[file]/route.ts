import { getSession } from "@/lib/auth/session";
import { readAvatarFile } from "@/lib/avatar/storage";

/** Serves stored avatars to signed-in users; file names are unguessable and never reused, so they cache forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await getSession())?.user) return new Response(null, { status: 401 });
  const data = await readAvatarFile((await params).file);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
