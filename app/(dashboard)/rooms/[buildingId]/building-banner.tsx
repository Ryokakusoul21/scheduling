"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Door, ImageSquare, MapPin, PencilSimple, Stack, Users, Wrench } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BuildingArt } from "@/components/rooms/building-art";
import { PURPOSE_LABELS, buildingStatus, hoursText } from "@/lib/rooms/buildings";
import { cn } from "@/lib/utils";
import { BuildingDialog, PhotoDialog } from "../building-dialogs";
import type { LoadedBuilding } from "@/lib/rooms/load";

/** Header of a building page: photo or illustration, details, and Administrator edit actions. */
export function BuildingBanner({ building: b, isAdmin }: { building: LoadedBuilding; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState(false);
  const rooms = b.floors.flatMap((f) => f.rooms);
  const status = buildingStatus(rooms.map((r) => r.status));
  const hours = hoursText(b.openingMin, b.closingMin);

  return (
    <div className="space-y-3">
      <Link href="/rooms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All buildings
      </Link>
      <Card className="gap-0 overflow-hidden py-0 md:flex-row">
        <div className="relative aspect-[16/8] bg-muted md:aspect-auto md:w-80 md:shrink-0">
          <BuildingArt name={b.name} purpose={b.purpose} floors={b.floors.length} photo={b.photo} className="md:absolute md:inset-0" />
          {b.code && <span className="absolute top-2.5 left-2.5 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase shadow-sm">Building {b.code}</span>}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden /> {b.location || "Location not set"}</p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPhoto(true)}><ImageSquare className="size-4" /> {b.photo ? "Change photo" : "Add photo"}</Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PencilSimple className="size-4" /> Edit details</Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{PURPOSE_LABELS[b.purpose]}</Badge>
            <Badge variant="outline" className={cn("gap-1.5", status.operational ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200")}>
              <span className={cn("size-1.5 rounded-full", status.operational ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />
              {status.label}
            </Badge>
          </div>
          {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
          <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Door className="size-4" aria-hidden /> {rooms.length} rooms</span>
            <span className="flex items-center gap-1.5"><Stack className="size-4" aria-hidden /> {b.floors.length} floor{b.floors.length === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-1.5"><Users className="size-4" aria-hidden /> {rooms.reduce((s, r) => s + r.capacity, 0).toLocaleString()} seats</span>
            <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden /> {hours ?? "Hours not set"}</span>
            {!status.operational && (
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><Wrench className="size-4" aria-hidden /> {status.closed} room{status.closed === 1 ? "" : "s"} under maintenance or closed</span>
            )}
          </div>
        </div>
      </Card>
      <BuildingDialog open={editing} onOpenChange={setEditing} building={b} />
      {photo && <PhotoDialog open building={b} hasPhoto={!!b.photo} onOpenChange={setPhoto} />}
    </div>
  );
}
