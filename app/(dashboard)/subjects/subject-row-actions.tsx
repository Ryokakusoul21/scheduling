"use client";

import { DotsThree } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CurriculumRow } from "./types";

export type RowAction = "assign" | "request-assignment" | "request-change" | "edit" | "view" | "history" | "archive";

/** One primary button per row (Assign, Reassign, or Request assignment) and the rest under the ⋯ menu. */
export function SubjectRowActions({ row, canAssign, onAction }: { row: CurriculumRow; canAssign: boolean; onAction: (action: RowAction, row: CurriculumRow) => void }) {
  const hasTeacher = row.assignments.length > 0;
  // Nothing to offer: a read-only subject outside a term has no assignment or edit actions.
  if (!canAssign && !row.editable) return null;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {canAssign && (
        <Button size="sm" variant={row.editable && !hasTeacher ? "default" : "outline"} onClick={() => onAction(row.editable ? "assign" : "request-assignment", row)}>
          {!row.editable ? "Request assignment" : hasTeacher ? "Reassign" : "Assign"}
          <span className="sr-only"> {row.code}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${row.code}`} />}>
          <DotsThree className="size-5" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canAssign && row.editable && <DropdownMenuItem onClick={() => onAction("assign", row)}>{hasTeacher ? "Reassign" : "Assign"}</DropdownMenuItem>}
          {canAssign && !row.editable && <DropdownMenuItem onClick={() => onAction("request-change", row)}>Request change</DropdownMenuItem>}
          {row.editable && <DropdownMenuItem onClick={() => onAction("edit", row)}>Edit subject</DropdownMenuItem>}
          {canAssign && <DropdownMenuItem onClick={() => onAction("view", row)}>View assigned faculty</DropdownMenuItem>}
          {canAssign && <DropdownMenuItem onClick={() => onAction("history", row)}>View history</DropdownMenuItem>}
          {row.editable && <DropdownMenuSeparator />}
          {row.editable && <DropdownMenuItem variant="destructive" onClick={() => onAction("archive", row)}>Archive</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
