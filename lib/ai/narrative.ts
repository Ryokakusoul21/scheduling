import "server-only";
import { getGeminiClient, SCHEDULING_MODEL } from "./geminiClient";

/**
 * Optional plain-language narrative for an algorithm's result. Only anonymized figures are sent
 * (no names or contact details). Returns null when no Gemini key is configured or the call fails,
 * so every feature works fully without it.
 */
export async function narrate(task: string, facts: unknown): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const response = await getGeminiClient().models.generateContent({
      model: SCHEDULING_MODEL,
      contents: `${task}\n\nUse only these facts. Write 3 to 5 short sentences for a school administrator, without abbreviations, without markdown.\n\n${JSON.stringify(facts)}`,
    });
    return response.text?.trim() || null;
  } catch {
    return null;
  }
}
