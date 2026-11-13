import { getSession } from "@/lib/auth/session";
import { readDepartmentLogo } from "@/lib/departments/logo-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await getSession())?.user) return new Response(null, { status: 401 });
  const data = await readDepartmentLogo((await params).file);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), { headers: {
    "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}
