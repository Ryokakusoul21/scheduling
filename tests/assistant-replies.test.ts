import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), execute: vi.fn(), data: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/geminiClient", () => ({
  getGeminiClient: () => ({ models: { generateContent: mocks.generate } }), SCHEDULING_MODEL: "test-model",
}));
vi.mock("@/lib/ai/assistant-data", () => ({ createAssistantData: mocks.data }));
import { generateAssistantReply } from "@/lib/ai/scheduleAssistant";
import { assistantPage, readAssistantReply, storeAssistantReply } from "@/lib/ai/assistant-contract";

const scope = { userId: "head", name: "Head", role: "HEAD_OF_DEPARTMENT" } as Scope;

describe("assistant replies and verified sources", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.data.mockResolvedValue({ declarations: [{ name: "getSchedule" }], execute: mocks.execute,
      sources: new Map([["/scheduler", { label: "Scheduler", href: "/scheduler" }]]),
      retrievedAt: "2026-11-13T03:00:00Z", termNames: ["College: First Semester, 2026–2027"], terms: [],
    });
    mocks.execute.mockResolvedValue({ total: 1, rows: [{ subject: "CS101" }] });
  });

  it("preserves Gemini tool signatures and returns sources from the server registry", async () => {
    const modelContent = { role: "model", parts: [{ functionCall: { name: "getSchedule", id: "call", args: {} }, thoughtSignature: "signature" }] };
    mocks.generate.mockResolvedValueOnce({ functionCalls: [{ name: "getSchedule", id: "call", args: {} }], candidates: [{ content: modelContent }] });
    mocks.generate.mockResolvedValueOnce({ text: "CS101 meets today. Visit https://invented.example for more." });
    const reply = await generateAssistantReply(scope, [], "What meets today?", "/scheduler");
    expect(mocks.execute).toHaveBeenCalledWith("getSchedule", {});
    expect(mocks.generate.mock.calls[1][0].contents).toContainEqual(modelContent);
    expect(mocks.generate.mock.calls[1][0].contents).toContainEqual({ role: "user", parts: [{ functionResponse: { id: "call", name: "getSchedule", response: { total: 1, rows: [{ subject: "CS101" }] } } }] });
    expect(reply.content).not.toContain("invented.example");
    expect(reply.sources).toEqual([{ label: "Scheduler", href: "/scheduler" }]);
    expect(readAssistantReply(storeAssistantReply(reply))).toMatchObject(reply);
  });

  it("treats tool failures as failures instead of empty results", async () => {
    mocks.execute.mockRejectedValue(new Error("Database offline"));
    mocks.generate.mockResolvedValueOnce({ functionCalls: [{ name: "getSchedule", args: {} }], candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "getSchedule" } }] } }] });
    mocks.generate.mockResolvedValueOnce({ text: "I could not retrieve your schedule. Please retry." });
    await generateAssistantReply(scope, [], "Today?");
    expect(mocks.generate.mock.calls[1][0].contents.at(-1).parts[0].functionResponse.response).toHaveProperty("error");
  });

  it("limits model-driven queries and disables tools before the final answer", async () => {
    const calls = Array.from({ length: 12 }, () => ({ name: "getSchedule", args: {} }));
    mocks.generate.mockResolvedValueOnce({ functionCalls: calls, candidates: [{ content: { role: "model", parts: calls.map((functionCall) => ({ functionCall })) } }] });
    mocks.generate.mockResolvedValueOnce({ text: "Please narrow the query." });
    await generateAssistantReply(scope, [], "Show everything");
    expect(mocks.execute).toHaveBeenCalledTimes(8);
    expect(mocks.generate.mock.calls[1][0].config.tools).toBeUndefined();
  });

  it("answers from live data when Gemini is unavailable", async () => {
    mocks.generate.mockRejectedValue(new Error("GEMINI_API_KEY missing"));
    mocks.execute.mockResolvedValue({ total: 1, rows: [{ name: "Ana Santos", status: "OVERLOADED" }] });
    const reply = await generateAssistantReply(scope, [], "Who is overloaded?");
    expect(mocks.execute).toHaveBeenCalledWith("getWorkloads", { status: "OVERLOADED" });
    expect(reply.content).toContain("Ana Santos");
    expect(reply.sources).toEqual([{ label: "Scheduler", href: "/scheduler" }]);
  });

  it("supports older plain-text history and refuses unauthorized page context", () => {
    expect(readAssistantReply("An older answer")).toEqual({ content: "An older answer" });
    expect(assistantPage("/requests", "REGISTRAR")).toBe("/dashboard");
    expect(assistantPage("/admin/settings", "HEAD_OF_DEPARTMENT")).toBe("/dashboard");
    expect(assistantPage("/rooms", "HEAD_OF_DEPARTMENT")).toBe("/rooms");
  });

  it("does not turn model-generated JSON from older history into unsafe source links", () => {
    for (const href of ["javascript:alert(1)", "//example.com", "/scheduler\\evil", "https://example.com", "/admin/settings"]) {
      const value = JSON.stringify({ version: 1, content: "Old output", sources: [{ label: "Open", href }], retrievedAt: "2026-11-13T03:00:00Z", terms: [] });
      expect(readAssistantReply(value).sources).toBeUndefined();
    }
  });
});
