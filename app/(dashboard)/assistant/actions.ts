"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateAssistantReply, type AssistantTurn } from "@/lib/ai/scheduleAssistant";
import { requireScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canAccessPath } from "@/lib/permissions/routes";
import type { AppRole } from "@/lib/permissions/roles";
import { assistantPage, readAssistantReply, storeAssistantReply, type AssistantReply } from "@/lib/ai/assistant-contract";

const messageSchema = z.string().trim().min(1, "Type a question first").max(1000, "Message is too long (max 1000 characters)");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AssistantReply["sources"];
  retrievedAt?: string;
  terms?: string[];
}

async function latestConversation(userId: string, take = 40) {
  const conversation = await prisma.aIConversation.findFirst({
    where: { userId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: { messages: { orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }], take } },
  });
  return conversation ? { ...conversation, messages: conversation.messages.reverse() } : null;
}

function toChatMessage(m: { id: string; role: string; content: string }, role: AppRole): ChatMessage {
  if (m.role !== "assistant") return { id: m.id, role: "user", content: m.content };
  const reply = readAssistantReply(m.content);
  return { id: m.id, role: "assistant", ...reply,
    sources: reply.sources?.filter((s) => canAccessPath(s.href.split(/[?#]/)[0], role)),
  };
}

/** History is bounded independently of the model's smaller replay window. */
export async function getAssistantHistory(): Promise<ChatMessage[]> {
  const scope = await requireScope(...STAFF_ROLES);
  const conversation = await latestConversation(scope.userId);
  return (conversation?.messages ?? []).map((m) => toChatMessage(m, scope.role));
}

export async function sendAssistantMessageAction(
  input: string, currentPage = "/dashboard",
): Promise<{ ok: true; reply: ChatMessage } | { ok: false; error: string }> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const message = parsed.data;
  const recent = await prisma.aIMessage.count({ where: {
    role: "user", createdAt: { gt: new Date(Date.now() - 60_000) }, conversation: { userId: scope.userId },
  } });
  if (recent >= 8) return { ok: false, error: "You are sending messages too quickly. Please wait a minute and try again." };

  const conversation = (await latestConversation(scope.userId, 20)) ?? await prisma.aIConversation.create({
    data: { userId: scope.userId, title: message.slice(0, 80) }, include: { messages: true },
  });
  const history: AssistantTurn[] = conversation.messages.map((m) => toChatMessage(m, scope.role));
  let reply: AssistantReply;
  try {
    reply = await generateAssistantReply(scope, history, message, assistantPage(currentPage, scope.role));
  } catch (err) {
    console.error("Scheduling assistant failed:", err);
    const missingKey = err instanceof Error && err.message.includes("GEMINI_API_KEY");
    return { ok: false, error: missingKey
      ? "The Scheduling Assistant is not set up yet. Please contact the Registrar."
      : "The Scheduling Assistant is unavailable right now. Please retry." };
  }

  const sentAt = new Date();
  const [, savedReply] = await prisma.$transaction([
    prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: message, createdAt: sentAt } }),
    prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: storeAssistantReply(reply), createdAt: new Date(sentAt.getTime() + 1) } }),
    prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);
  return { ok: true, reply: toChatMessage(savedReply, scope.role) };
}

export async function clearAssistantHistoryAction() {
  const scope = await requireScope(...STAFF_ROLES);
  await prisma.aIConversation.deleteMany({ where: { userId: scope.userId } });
  return { ok: true as const };
}
