"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { generateAssistantReply, type AssistantTurn } from "@/lib/ai/scheduleAssistant";
import type { AppRole } from "@/lib/permissions/roles";

const messageSchema = z.string().trim().min(1, "Type a question first").max(1000, "Message is too long (max 1000 characters)");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

async function latestConversation(userId: string) {
  return prisma.aIConversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

function toChatMessage(m: { id: string; role: string; content: string }): ChatMessage {
  return { id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content };
}

/** Loads the current user's most recent assistant conversation. */
export async function getAssistantHistory(): Promise<ChatMessage[]> {
  const user = await requireUser();
  const conversation = await latestConversation(user.id);
  return (conversation?.messages ?? []).map(toChatMessage);
}

export async function sendAssistantMessageAction(
  input: string
): Promise<{ ok: true; reply: ChatMessage } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const message = parsed.data;

  const conversation =
    (await latestConversation(user.id)) ??
    (await prisma.aIConversation.create({
      data: { userId: user.id, title: message.slice(0, 80) },
      include: { messages: true },
    }));

  const history: AssistantTurn[] = conversation.messages.map((m) => toChatMessage(m));

  let replyText: string;
  try {
    replyText = await generateAssistantReply(user.id, user.role as AppRole, history, message);
  } catch (err) {
    console.error("Scheduling assistant failed:", err);
    const missingKey = err instanceof Error && err.message.includes("GEMINI_API_KEY");
    return {
      ok: false,
      error: missingKey
        ? "The Scheduling Assistant is not set up yet. Please contact the Administrator."
        : "The Scheduling Assistant is unavailable right now. Please try again in a moment.",
    };
  }

  const [, reply] = await prisma.$transaction([
    prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: message } }),
    prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: replyText } }),
    prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);

  return { ok: true, reply: toChatMessage(reply) };
}

/** Clears the current user's assistant chat history. */
export async function clearAssistantHistoryAction() {
  const user = await requireUser();
  await prisma.aIConversation.deleteMany({ where: { userId: user.id } });
  return { ok: true as const };
}
