"use client";

import { useState } from "react";
import { PencilSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ux/form-dialog";
import { programFields } from "../programs-manager";
import { saveProgramAction } from "../actions";

export function EditProgramButton({
  program,
  departments,
}: {
  program: { id: string; code: string; name: string; level: string; departmentId: string };
  departments: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const level = program.level === "SENIOR_HIGH" ? "SENIOR_HIGH" : "COLLEGE";
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PencilSimple className="size-4" /> Edit
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${program.code}`}
        fields={programFields(level, departments)}
        values={program}
        submitLabel="Save changes"
        successMessage="Saved"
        onSubmit={(fd) => saveProgramAction(program.id, fd)}
      />
    </>
  );
}
