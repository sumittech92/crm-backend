import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import HttpStatus from "http-status-codes";
import { statusError } from "../../utilis/records.js";
import { PAPER_SYSTEM, PaperRequest, PaperSchema, WrittenPaper, paperPrompt } from "./paperWriter.js";

/**
 * Free option for testing: Google Gemini API free tier (key from https://aistudio.google.com/apikey, set GEMINI_API_KEY).
 * Free-tier prompts may be used by Google to improve its products, so don't send personal data — papers contain none.
 */
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// The "$schema" marker isn't part of the schema itself; leave it out of the request.
const { $schema: _marker, ...JSON_SCHEMA } = z.toJSONSchema(PaperSchema) as Record<string, unknown>;

let client: GoogleGenAI | null = null;
const gemini = () => {
  if (!process.env.GEMINI_API_KEY) throw statusError("The mock paper generator is not set up yet. Please contact the school office.", HttpStatus.SERVICE_UNAVAILABLE);
  return client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export async function writePaperWithGemini(request: PaperRequest): Promise<WrittenPaper> {
  const ai = gemini();
  try {
    const response = await ai.models.generateContent({
      model: MODEL(),
      contents: paperPrompt(request),
      config: { systemInstruction: PAPER_SYSTEM, responseMimeType: "application/json", responseJsonSchema: JSON_SCHEMA, maxOutputTokens: 16000 },
    });
    const reason = response.candidates?.[0]?.finishReason;
    if (reason === "SAFETY" || response.promptFeedback?.blockReason) throw statusError("This paper could not be written. Try different chapters or settings.", HttpStatus.UNPROCESSABLE_ENTITY);
    if (reason === "MAX_TOKENS") throw statusError("The paper came out too long. Try a shorter paper or fewer chapters.", HttpStatus.BAD_GATEWAY);
    let parsed: unknown;
    try { parsed = JSON.parse(response.text || ""); } catch { parsed = null; }
    const result = PaperSchema.safeParse(parsed);
    if (!result.success) throw statusError("The paper could not be read. Please try again.", HttpStatus.BAD_GATEWAY);
    return result.data;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    if (error instanceof ApiError) {
      console.error("Gemini mock paper error:", error.status, error.message);
      if (error.status === 429) throw statusError("The free paper generator is busy or its daily free limit is used up. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
      if (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404) throw statusError("The mock paper generator is not set up correctly. Please contact the school office.", HttpStatus.SERVICE_UNAVAILABLE);
      throw statusError("The paper could not be written right now. Please try again.", HttpStatus.BAD_GATEWAY);
    }
    console.error("Gemini mock paper error:", error);
    throw statusError("Could not reach the paper generator. Please try again.", HttpStatus.SERVICE_UNAVAILABLE);
  }
}
