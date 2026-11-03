import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { smallAvatarUrl } from "@/lib/avatar/url";
import { cn } from "cn";

/** Dark enough for white text to pass 4.5:1. */
const COLORS = ["bg-blue-700", "bg-emerald-700", "bg-violet-700", "bg-rose-700", "bg-amber-700", "bg-teal-700", "bg-indigo-700", "bg-cyan-800"];

export function initials(name: string) {
  return name.replace(/^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s*/, "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Same name, same color, so a person looks the same in every list. */
function colorOf(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Profile photo with a colored initials fallback; `small` loads the 64px copy for 40px and under. */
export function UserAvatar({
  name,
  image,
  small,
  className,
}: {
  name: string;
  image?: string | null;
  small?: boolean;
  className?: string;
}) {
  const src = small ? smallAvatarUrl(image) : image;
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className={cn("font-semibold text-white", colorOf(name))}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
