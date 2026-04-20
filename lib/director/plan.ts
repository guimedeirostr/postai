import Anthropic from "@anthropic-ai/sdk";
import { buildDirectorSystemPrompt, buildDirectorUserPrompt, parsePlanoDePost } from "@/lib/prompts/director";
import type { BrandKit, ClientMemory, PlanoDePost } from "@/types";

export interface DirectorPlanParams {
  objetivo: string;
  formato?: string;
  clientName?: string;
  brandKit?: BrandKit | null;
  clientMemory?: ClientMemory | null;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export async function runDirectorPlan(params: DirectorPlanParams): Promise<PlanoDePost> {
  const { objetivo, formato = "feed", clientName, brandKit = null, clientMemory = null } = params;

  const systemPrompt = buildDirectorSystemPrompt(brandKit, clientMemory);
  const userPrompt   = buildDirectorUserPrompt(objetivo, formato, clientName);

  const message = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2048,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = message.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("");

  return parsePlanoDePost(raw);
}
