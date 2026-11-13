"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Robot as Bot, CircleNotch as Loader2, PaperPlaneRight as SendHorizontal, Sparkle as Sparkles, Trash as Trash2 } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AppRole } from "@/lib/permissions/roles";
import { canAccessPath } from "@/lib/permissions/routes";
import { notificationTime } from "@/lib/notifications/format";
import {
  clearAssistantHistoryAction,
  sendAssistantMessageAction,
  type ChatMessage,
} from "@/app/(dashboard)/assistant/actions";

const SUGGESTIONS = [
  "What's my next class?",
  "Show my schedule for today",
  "Who teaches my subjects?",
  "How do I request a schedule change?",
];

const STAFF_SUGGESTIONS = [
  "Any open schedule conflicts?",
  "Which faculty are overloaded?",
  "Show today's timetable",
];

function suggestions(page: string, role: AppRole, staff: boolean) {
  const choices = page === "/rooms" || page === "/bookings"
    ? ["Show room capacities", "Which rooms have the most scheduled hours?", "Help me find a room for a date and time"]
    : page === "/workload" || page === "/faculty"
      ? ["Which faculty are overloaded?", "Which faculty are underloaded?", "Explain the current workload limits"]
      : page === "/notifications"
        ? ["Summarize my unread notifications", "Any open schedule conflicts?"]
        : page === "/requests"
          ? ["Summarize pending requests", "How do I review a scheduling request?"]
          : staff ? STAFF_SUGGESTIONS : SUGGESTIONS;
  return canAccessPath("/requests", role) && page === "/dashboard" ? [...choices, "Summarize pending requests"] : choices;
}

/** The model occasionally uses **bold** despite instructions; render it instead of showing asterisks. */
function renderBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export function AssistantChat({
  initialMessages,
  userName,
  staff = false,
  role = "FACULTY",
  currentPage = "/dashboard",
  className,
}: {
  initialMessages: ChatMessage[];
  userName?: string | null;
  /** Staff get system-wide prompts instead of personal-schedule ones. */
  staff?: boolean;
  role?: AppRole;
  currentPage?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [failure, setFailure] = useState<{ message: string; retryText?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const localId = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const optimistic: ChatMessage = { id: `local-${++localId.current}`, role: "user", content };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setFailure(null);

    startTransition(async () => {
      try {
        const result = await sendAssistantMessageAction(content, currentPage);
        if (!result.ok) throw new Error(result.error);
        setMessages((prev) => [...prev, result.reply]);
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput((draft) => draft || content);
        setFailure({ message: error instanceof Error ? error.message : "Could not send your message. Please retry.", retryText: content });
      }
    });
  }

  function clear() {
    startTransition(async () => {
      try {
        await clearAssistantHistoryAction();
        setMessages([]);
        setFailure(null);
      } catch {
        toast.error("Could not clear your conversation. Please retry.");
      }
    });
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={scrollRef} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-4" />
              </div>
              <p className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                Hi{userName ? `, ${userName.split(" ")[0]}` : ""}!{" "}
                {staff
                  ? "I can check live timetables, conflicts, faculty workloads and rooms within your access."
                  : "I can answer questions about your class schedule, rooms, instructors, and schedule requests."}{" "}
                What would you like to know?
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-9">
              {suggestions(currentPage, role, staff).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0 max-w-[85%] space-y-2">
                <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">{renderBold(m.content)}</p>
                {!!m.sources?.length && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Sources retrieved for this answer">
                    {m.sources.map((source) => <Link key={source.href} href={source.href} className="max-w-full truncate rounded-full border px-2 py-1 text-xs font-medium text-primary hover:bg-accent">{source.label}</Link>)}
                  </div>
                )}
                {m.retrievedAt && <p className="text-[11px] text-muted-foreground">Retrieved {notificationTime(m.retrievedAt)} · School time</p>}
                {!!m.terms?.length && <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer">Active terms used</summary><ul className="mt-1 space-y-1">{m.terms.map((term, index) => <li key={index}>{term}</li>)}</ul></details>}
              </div>
            </div>
          )
        )}

        {pending && messages.at(-1)?.role === "user" && (
          <div className="flex gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot className="size-4" />
            </div>
            <p className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking your scheduling data…
            </p>
          </div>
        )}
      </div>

      {failure && <div role="alert" className="mx-3 mb-2 rounded-md border border-destructive/30 p-3 text-sm">
        <p>{failure.message}</p>
        {failure.retryText && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={pending} onClick={() => send(failure.retryText!)}>Retry</Button>}
      </div>}

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {messages.length > 0 && (
          <Button type="button" variant="ghost" size="icon" onClick={clear} disabled={pending} aria-label="Clear chat">
            <Trash2 className="size-4" />
          </Button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={staff ? "Ask about schedules, conflicts, workloads…" : "Ask about your schedule…"}
          aria-label="Message the Scheduling Assistant"
          disabled={pending}
          maxLength={1000}
          rows={1}
          className="max-h-32 min-h-9 resize-none"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Send">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}

export function AssistantHeader() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground">
        <Sparkles className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">Scheduling Assistant</p>
        <p className="text-xs text-muted-foreground">Answers from your scheduling data</p>
      </div>
    </div>
  );
}
