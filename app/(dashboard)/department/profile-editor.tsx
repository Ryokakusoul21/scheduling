"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Buildings, UploadSimple, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const displayedLogo = preview ?? (removeLogo ? null : saved.logoUrl);
  const dirty = name.trim() !== saved.name || !!file || (removeLogo && !!saved.logoUrl);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(next: File | undefined) {
    if (!next) return;
    if (!DEPARTMENT_LOGO_TYPES.includes(next.type)) { setError("Choose a PNG, JPG, or WebP image."); return; }
    if (next.size > DEPARTMENT_LOGO_MAX_BYTES) { setError("Choose a logo up to 2 MB."); return; }
    setFile(next); setPreview(URL.createObjectURL(next)); setRemoveLogo(false); setError(""); setStatus("");
  }

  function reset() {
    setName(saved.name); setFile(null); setPreview(null); setRemoveLogo(false); setError(""); setStatus("");
    if (input.current) input.current.value = "";
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || pending) return;
    const form = new FormData();
    form.set("name", name); form.set("updatedAt", saved.updatedAt); form.set("removeLogo", String(removeLogo));
    if (file) form.set("logo", file);
    setError(""); setStatus(""); onSavingChange(true);
    startTransition(async () => {
      try {
        const result = await saveDepartmentProfileAction(saved.id, form);
        if (!result.ok) { setError(result.error); return; }
        setSaved((previous) => ({ ...previous, ...result.profile }));
        setName(result.profile.name); setFile(null); setPreview(null); setRemoveLogo(false);
        if (input.current) input.current.value = "";
        setStatus("Department profile saved.");
        toast.success("Department profile saved.");
        router.refresh();
      } catch { setError("Could not save your profile. Your changes are still here; please retry."); }
      finally { onSavingChange(false); }
    });
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-5 bg-gradient-to-br from-primary/5 to-transparent p-5 sm:p-6">
          <DepartmentLogo name={name.trim() || saved.name} logoUrl={displayedLogo} />
          <div className="min-w-0 flex-1 space-y-2">
            <Badge variant="secondary">{saved.code}</Badge>
            <h2 className="text-xl font-bold break-words sm:text-2xl">{name.trim() || saved.name}</h2>
            <p className="text-sm text-muted-foreground">Department profile</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Department overview">
        {Object.entries(saved.counts).map(([label, count]) => <Card key={label} className="gap-1 p-4">
          <p className="text-2xl font-bold tabular-nums">{count}</p><p className="text-xs text-muted-foreground capitalize">{label}</p>
        </Card>)}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Buildings className="size-5 text-primary" /> Profile details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-6" aria-busy={pending}>
            <div className="max-w-xl space-y-2">
              <label htmlFor={`department-name-${saved.id}`} className="text-sm font-medium">Department name</label>
              <Input id={`department-name-${saved.id}`} value={name} onChange={(e) => { setName(e.target.value); setStatus(""); }} required minLength={2} maxLength={150} disabled={pending} />
            </div>
            <div className="space-y-3">
              <p id={`logo-label-${saved.id}`} className="text-sm font-medium">Department logo</p>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-4">
                <DepartmentLogo name={name.trim() || saved.name} logoUrl={displayedLogo} className="size-20" />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}><UploadSimple className="size-4" /> {displayedLogo ? "Replace logo" : "Upload logo"}</Button>
                    {displayedLogo && <Button type="button" variant="ghost" disabled={pending} onClick={() => {
                      setFile(null); setPreview(null); setRemoveLogo(true); setStatus(""); setError("");
                      if (input.current) input.current.value = "";
                    }}><Trash className="size-4" /> Remove</Button>}
                  </div>
                  <p id={`logo-help-${saved.id}`} className="text-xs text-muted-foreground">PNG, JPG, or WebP · Up to 2 MB. Your full logo stays visible.</p>
                  {file && <p className="max-w-xs truncate text-xs text-muted-foreground">Selected: {file.name}</p>}
                  {removeLogo && <p className="text-xs text-muted-foreground">The current logo will be removed when you save.</p>}
                </div>
                <input ref={input} type="file" accept={DEPARTMENT_LOGO_TYPES.join(",")} aria-labelledby={`logo-label-${saved.id}`} aria-describedby={`logo-help-${saved.id}`} className="sr-only" tabIndex={-1} disabled={pending} onChange={(e) => choose(e.target.files?.[0])} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {status && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{status}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" disabled={pending || !dirty} onClick={reset}>Cancel</Button>
              <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
