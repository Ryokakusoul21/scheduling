import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Throws a user-facing error if GEMINI_API_KEY isn't configured, per .env.example's documented graceful-degradation contract. */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "The Scheduling Assistant requires a Gemini key. Set GEMINI_API_KEY in your environment to enable this feature."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const SCHEDULING_MODEL = process.env.GEMINI_SCHEDULING_MODEL ?? "gemini-3.6-flash";
