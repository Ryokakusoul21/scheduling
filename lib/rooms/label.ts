/** Identify a room even when several rooms share a name such as "Lecture room". */
export function roomLabel(room: { roomNumber?: string | null; roomName?: string | null } | null | undefined): string {
  if (!room) return "";
  const number = room.roomNumber?.trim() ?? "";
  const name = room.roomName?.trim() ?? "";
  if (!number) return name;
  if (!name || name === number || name.startsWith(`${number} · `)) return name || number;
  return `${number} · ${name}`;
}
