"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { PencilSimple, UploadSimple, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DepartmentLogo } from "@/components/departments/department-logo";
import { DEPARTMENT_LOGO_MAX_BYTES, DEPARTMENT_LOGO_TYPES, type DepartmentProfile } from "@/lib/departments/branding";
import { saveDepartmentProfileAction } from "./actions";

export function DepartmentProfiles({ departments, initialId }: { departments: DepartmentProfile[]; initialId?: string }) {
  const [selected, setSelected] = useState(departments.find((d) => d.id === initialId)?.id ?? departments[0]?.id);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-4">
      {departments.length > 1 && <div className="max-w-md space-y-1.5">
        <label htmlFor="department-profile-choice" className="text-sm font-medium">Department</label>
        <select id="department-profile-choice" value={selected} disabled={saving} onChange={(e) => setSelected(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
        </select>
      </div>}
      {departments.map((d) => <div key={`${d.id}:${d.updatedAt}`} hidden={d.id !== selected}>
        <DepartmentProfileEditor initial={d} onSavingChange={setSaving} />
      </div>)}
    </div>
  );
}

function DepartmentProfileEditor({ initial, onSavingChange }: { initial: DepartmentProfile; onSavingChange: (saving: boolean) => void }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const displayedLogo = preview ?? (removeLogo ? null : saved.logoUrl);
  const dirty = name.trim() !== saved.name || !!file || (removeLogo && !!saved.logoUrl);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(next: File | undefined) {
    if (!next) return;
    if (!DEPARTMENT_LOGO_TYPES.includes(next.type)) { setError("Choose a PNG, JPG, or WebP image."); return; }
    if (next.size > DEPARTMENT_LOGO_MAX_BYTES) { setError("Choose a logo up to 2 MB."); return; }
    setFile(next); setPreview(URL.createObjectURL(next)); setRemoveLogo(false); setError("");
  }

  function close() { reset(); setOpen(false); }

  function reset() {
    setName(saved.name); setFile(null); setPreview(null); setRemoveLogo(false); setError("");
    if (input.current) input.current.value = "";
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || pending) return;
    const form = new FormData();
    form.set("name", name); form.set("updatedAt", saved.updatedAt); form.set("removeLogo", String(removeLogo));
    if (file) form.set("logo", file);
    setError("");onSavingChange(true);
    startTransition(async () => {
      try {
        const result = await saveDepartmentProfileAction(saved.id, form);
        if (!result.ok) { setError(result.error); return; }
        setSaved((previous) => ({ ...previous, ...result.profile }));
        setName(result.profile.name); setFile(null); setPreview(null); setRemoveLogo(false);
        if (input.current) input.current.value = "";
        setOpen(false);
        toast.success("Department profile saved.");
        router.refresh();
      } catch { setError("Could not save your profile. Your changes are still here; please retry."); }
      finally { onSavingChange(false); }
    });
  }

  const shown = name.trim() || saved.name;
  // Counts link to their pages; programs are listed right below, so they are not repeated.
  const chips = [["faculty", "/faculty"], ["sections", "/sections"], ["rooms", "/rooms"]] as const;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
      <DepartmentLogo name={shown} logoUrl={saved.logoUrl} className="size-14" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold break-words">{saved.name}</h2>
          <Badge variant="secondary">{saved.code}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map(([key, href]) => <Link key={key} href={href}><Badge variant="outline" className="hover:bg-muted">{saved.counts[key]} {key}</Badge></Link>)}
          {!saved.logoUrl && <button type="button" onClick={() => setOpen(true)}><Badge variant="outline" className="border-dashed hover:bg-muted">Add logo</Badge></button>}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><PencilSimple className="size-4" /> Edit profile</Button>

      <Dialog open={open} onOpenChange={(next) => { if (!pending) { if (!next) reset(); setOpen(next); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-5" aria-busy={pending}>
            <div className="space-y-2">
              <label htmlFor={`department-name-${saved.id}`} className="text-sm font-medium">Name</label>
              <Input id={`department-name-${saved.id}`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={150} disabled={pending} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DepartmentLogo name={shown} logoUrl={displayedLogo} className="size-16" />
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}><UploadSimple className="size-4" /> {displayedLogo ? "Replace" : "Upload"}</Button>
              {displayedLogo && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => {
                setFile(null); setPreview(null); setRemoveLogo(true); setError("");
                if (input.current) input.current.value = "";
              }}><Trash className="size-4" /> Remove</Button>}
              <span className="text-xs text-muted-foreground">PNG, JPG, WebP · 2 MB</span>
              <input ref={input} type="file" accept={DEPARTMENT_LOGO_TYPES.join(",")} aria-label="Department logo" className="sr-only" tabIndex={-1} disabled={pending} onChange={(e) => choose(e.target.files?.[0])} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
              <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
