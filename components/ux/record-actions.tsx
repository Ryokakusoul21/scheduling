"use client";

import { DotsThree, PencilSimple, Star, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Secondary record actions stay separate from the card's navigation link. */
export function RecordActions({ label, onEdit, onDelete, onActivate, disabled }: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  onActivate?: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative z-10 size-11 shrink-0 rounded-xl" aria-label={`Actions for ${label}`} disabled={disabled} />}>
        <DotsThree className="size-6" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="min-h-11 gap-2 px-3" onClick={onEdit}><PencilSimple />Edit</DropdownMenuItem>
        {onActivate && <DropdownMenuItem className="min-h-11 gap-2 px-3" onClick={onActivate}><Star />Set as active</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="min-h-11 gap-2 px-3" onClick={onDelete}><Trash />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
