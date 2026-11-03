"use client";

import { useState } from "react";
import { Camera, PencilSimple } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvatarButton, AvatarDialog } from "./avatar-uploader";

/** Identity summary at the top of the profile; Edit profile jumps to the name field in the Account section. */
export function ProfileHero({
  name,
  email,
  image,
  role,
  context,
  lastSignIn,
}: {
  name: string;
  email: string;
  image: string | null;
  role: string;
  context: string | null;
  lastSignIn: string;
}) {
  const [open, setOpen] = useState(false);

  function editProfile() {
    document.getElementById("account")?.scrollIntoView({ block: "start" });
    window.dispatchEvent(new Event("profile:edit-name"));
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-20 bg-gradient-to-br from-primary to-primary/30" aria-hidden />
      <div className="flex flex-col items-center gap-4 px-5 pb-5 text-center">
        <AvatarButton name={name} image={image} onClick={() => setOpen(true)} className="-mt-14 size-28 shrink-0 ring-4 ring-card" />
        <div className="w-full min-w-0 space-y-1">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h2 className="truncate text-xl sm:text-2xl font-semibold tracking-tight">{name}</h2>
            <Badge>{role}</Badge>
          </div>
          <p className="break-all text-sm text-muted-foreground">{email}</p>
          {context && <p className="text-sm text-muted-foreground">{context}</p>}
          <p className="text-sm text-muted-foreground">Last sign-in: {lastSignIn}</p>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-2 border-t pt-4">
          <Button onClick={() => setOpen(true)}>
            <Camera className="size-4" /> Change photo
          </Button>
          <Button variant="outline" onClick={editProfile}>
            <PencilSimple className="size-4" /> Edit profile
          </Button>
        </div>
      </div>
      <AvatarDialog open={open} onOpenChange={setOpen} name={name} image={image} />
    </Card>
  );
}
