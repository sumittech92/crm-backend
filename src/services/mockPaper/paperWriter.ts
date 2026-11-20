import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import HttpStatus from "http-status-codes";
import { QUESTION_TYPES } from "../../model/mockPaper/mockPaper.js";
import { statusError } from "../../utilis/records.js";

/** What the model returns: sections of questions with answers. Numbers and totals are worked out on our side. */
export const PaperSchema = z.object({
  title: z.string(),
  instructions: z.array(z.string()),
  sections: z.array(z.object({
    name: z.string(),
    description: z.string(),
    questions: z.array(z.object({
      type: z.enum(QUESTION_TYPES),
      text: z.string(),
      options: z.array(z.string()),
      marks: z.number().int(),
      answer: z.string(),
      explanation: z.string(),
    })),
  })),
});
export type WrittenPaper = z.infer<typeof PaperSchema>;

export interface PaperRequest {
  board: string; className: string; subject: string; kind: "chapter" | "full"; chapters: string[];
  length: "short" | "standard" | "board"; difficulty: "easy" | "medium" | "hard" | "mixed";
}

/** Target marks and time for each paper length. */
export const PAPER_SIZES: Record<PaperRequest["length"], { marks: number; minutes: number; label: string }> = {
  short: { marks: 25, minutes: 45, label: "Short test" },
  standard: { marks: 50, minutes: 90, label: "Standard paper" },
  board: { marks: 80, minutes: 180, label: "Full board pattern" },
};

// Stable instructions first so repeated requests can reuse the cached prefix.
export const PAPER_SYSTEM = `You are an experienced Indian school examiner who sets practice question papers for Classes 9–12.

Write one complete, original mock test paper from the request. Follow these rules:
- Follow the named board's current exam pattern and style for that class and subject (for CBSE: sections of MCQs, assertion–reason, very short, short, long and case-based questions as the subject's sample papers use; for ICSE and state boards, their usual structure). Adapt the section mix to the requested total marks.
- Use only the syllabus of the listed chapters (or the whole subject for a full-syllabus paper). Spread questions across all listed chapters.
- The marks of all questions must add up exactly to the requested total marks.
- Match the requested difficulty; "mixed" means roughly 30% easy, 50% medium, 20% hard.
- Questions must be correct, unambiguous, age-appropriate and answerable without diagrams; describe any figure in words.
- MCQ and assertion–reason questions have exactly four options (put them in "options" without letters); other types have an empty options list.
- "answer" is the correct answer (for MCQs, the full text of the correct option); "explanation" gives the key steps or marking points a teacher would expect.
- Write in English, except Hindi and Sanskrit papers, which are written in that language.
- Use plain text. For maths and science write formulas inline in a readable way (e.g. x^2 + 3x − 4 = 0, H2SO4).
- "instructions" are the general instructions printed at the top of the paper.`;

let client: Anthropic | null = null;
const anthropic = () => client ??= new Anthropic();

/** The request as the user message both writers send. */
export function paperPrompt(request: PaperRequest): string {
  const size = PAPER_SIZES[request.length];
  const scope = request.kind === "full" ? "Full syllabus of the subject" : `Chapters: ${request.chapters.join("; ")}`;
  return [
    `Board: ${request.board}`, `Class: ${request.className}`, `Subject: ${request.subject}`, scope,
    `Paper: ${size.label}, total ${size.marks} marks, time ${size.minutes} minutes`, `Difficulty: ${request.difficulty}`,
  ].join("\n");
}

/**
 * Which AI writes papers: PAPER_AI=gemini (free tier, for testing) or PAPER_AI=claude. Without PAPER_AI, Claude is used
 * when ANTHROPIC_API_KEY is set, otherwise Gemini when GEMINI_API_KEY is set.
 */
export async function writePaper(request: PaperRequest): Promise<WrittenPaper> {
  const choice = String(process.env.PAPER_AI || "").trim().toLowerCase();
  const useGemini = choice === "gemini" || (choice !== "claude" && !process.env.ANTHROPIC_API_KEY && !!process.env.GEMINI_API_KEY);
  if (useGemini) return (await import("./geminiPaperWriter.js")).writePaperWithGemini(request);
  return writePaperWithClaude(request);
}

/** Writes the paper with Claude. Errors are turned into messages a student or teacher can act on. */
async function writePaperWithClaude(request: PaperRequest): Promise<WrittenPaper> {
  const prompt = paperPrompt(request);
  try {
    const response = await anthropic().beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A refused request is re-run on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(PaperSchema) },
      system: [{ type: "text", text: PAPER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw statusError("This paper could not be written. Try different chapters or settings.", HttpStatus.UNPROCESSABLE_ENTITY);
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw statusError("The paper came out too long. Try a shorter paper or fewer chapters.", HttpStatus.BAD_GATEWAY);
    return response.parsed_output;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("Mock paper generator auth error:", error.message);
      throw statusError("The mock paper generator is not set up yet. Please contact the school office.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (error instanceof Anthropic.RateLimitError) throw statusError("Many papers are being written right now. Please try again in a minute.", HttpStatus.TOO_MANY_REQUESTS);
    if (error instanceof Anthropic.APIConnectionError) throw statusError("Could not reach the paper generator. Please try again.", HttpStatus.SERVICE_UNAVAILABLE);
    if (error instanceof Anthropic.APIError) {
      console.error("Mock paper generator error:", error.status, error.message);
      throw statusError("The paper could not be written right now. Please try again.", HttpStatus.BAD_GATEWAY);
    }
    // No API key at all (the SDK throws before sending).
    console.error("Mock paper generator setup error:", error);
    throw statusError("The mock paper generator is not set up yet. Please contact the school office.", HttpStatus.SERVICE_UNAVAILABLE);
  }
}
