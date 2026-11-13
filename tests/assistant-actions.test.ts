import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), latest: vi.fn(), createConversation: vi.fn(), count: vi.fn(),
  createMessage: vi.fn(), update: vi.fn(), transaction: vi.fn(), generate: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: mocks.scope }));
vi.mock("@/lib/ai/scheduleAssistant", () => ({ generateAssistantReply: mocks.generate }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  aIConversation: { findFirst: mocks.latest, create: mocks.createConversation, update: mocks.update, deleteMany: mocks.remove },
  aIMessage: { count: mocks.count, create: mocks.createMessage }, $transaction: mocks.transaction,
} }));
import { getAssistantHistory, sendAssistantMessageAction } from "@/app/(dashboard)/assistant/actions";
import { storeAssistantReply } from "@/lib/ai/assistant-contract";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", departmentIds: ["cs", "acting"], programIds: ["bsit"] };
const reply = { content: "One class today.", sources: [{ label: "Scheduler", href: "/scheduler" }], retrievedAt: "2026-11-13T03:00:00Z", terms: ["First Semester"] };

describe("assistant history and action boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope.mockResolvedValue(scope); mocks.count.mockResolvedValue(0);
    mocks.latest.mockResolvedValue({ id: "conversation", messages: [
      { id: "a", role: "assistant", content: storeAssistantReply(reply) }, { id: "u", role: "user", content: "Today?" },
    ] });
    mocks.generate.mockResolvedValue(reply);
    mocks.createMessage.mockImplementation(async ({ data }) => ({ id: data.role, ...data }));
    mocks.transaction.mockImplementation((ops) => Promise.all(ops));
  });

  it("requires an authorized staff role before loading history or invoking the model", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(getAssistantHistory()).rejects.toThrow("Forbidden");
    await expect(sendAssistantMessageAction("Today?")).rejects.toThrow("Forbidden");
    expect(mocks.latest).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("loads a bounded recent history in chronological order with stored sources", async () => {
    const history = await getAssistantHistory();
    expect(mocks.latest.mock.calls[0][0]).toMatchObject({ where: { userId: "head" }, include: { messages: { take: 40 } } });
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[1].sources).toEqual(reply.sources);
  });

  it("passes the full authenticated scope and plain history to the model, then persists source metadata", async () => {
    const result = await sendAssistantMessageAction("  Any classes?  ", "/rooms");
    expect(mocks.generate).toHaveBeenCalledWith(scope, expect.arrayContaining([{ id: "u", role: "user", content: "Today?" }]), "Any classes?", "/rooms");
    expect(mocks.latest.mock.calls[0][0].include.messages.take).toBe(20);
    expect(result).toMatchObject({ ok: true, reply: { ...reply, role: "assistant" } });
    const userAt = mocks.createMessage.mock.calls[0][0].data.createdAt;
    const answerAt = mocks.createMessage.mock.calls[1][0].data.createdAt;
    expect(answerAt.getTime()).toBeGreaterThan(userAt.getTime());
    expect(mocks.createMessage.mock.calls[1][0].data.content).toContain('"sources"');
  });

  it("rejects invalid messages and rate-limited turns before calling the model", async () => {
    expect(await sendAssistantMessageAction(" ")).toMatchObject({ ok: false });
    mocks.count.mockResolvedValue(8);
    expect(await sendAssistantMessageAction("Today?")).toMatchObject({ ok: false });
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps model failures retryable and does not save a fabricated answer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.generate.mockRejectedValue(new Error("Provider unavailable"));
      expect(await sendAssistantMessageAction("Today?")).toMatchObject({ ok: false, error: expect.stringContaining("retry") });
      expect(mocks.createMessage).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
