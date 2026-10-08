/** Normalises a KeyboardEvent to the shortcut string format ("n", "?", "mod+k", "shift+arrowdown"). */
export function eventToKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  const key = e.key.toLowerCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  // Printable keys like "?" already encode Shift; only record it for named keys.
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}
