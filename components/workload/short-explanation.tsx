/** Keep the first useful sentence visible; retain the complete explanation on demand. */
export function shortExplanation(text: string, limit = 110) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const sentence = clean.match(/^.*?[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length <= limit) return sentence;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > limit * 0.6 ? space : cut.length).trimEnd()}…`;
}

export function ShortExplanation({ text, label = "Details" }: { text: string; label?: string }) {
  const summary = shortExplanation(text);
  if (summary === text.replace(/\s+/g, " ").trim()) return <p className="text-xs text-muted-foreground">{summary}</p>;
  return <details className="group text-xs text-muted-foreground">
    <summary className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {summary} <span className="ml-1 font-medium text-primary group-open:hidden">{label}</span>
    </summary>
    <p className="mt-2 whitespace-pre-wrap break-words border-l-2 pl-3 leading-relaxed">{text}</p>
  </details>;
}
