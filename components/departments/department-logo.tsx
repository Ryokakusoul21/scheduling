import Image from "next/image";
import { departmentInitials } from "@/lib/departments/branding";
import { cn } from "@/lib/utils";

export function DepartmentLogo({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  return (
    <span className={cn("flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background p-2", className)}>
      {logoUrl ? <Image src={logoUrl} alt={`${name} logo`} width={96} height={96} unoptimized className="size-full object-contain" />
        : <span aria-label={`${name} initials`} className="flex size-full items-center justify-center rounded-xl bg-primary/10 text-2xl font-bold text-primary">{departmentInitials(name)}</span>}
    </span>
  );
}
