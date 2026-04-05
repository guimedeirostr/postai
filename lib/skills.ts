/**
 * lib/skills.ts
 *
 * IDs das custom skills da Anthropic — subidas via POST /v1/skills
 * com anthropic-beta: skills-2025-10-02.
 *
 * Para usar em chamadas à API do Claude, inclua:
 *   betas: [SKILLS_BETA, CODE_EXEC_BETA],
 *   container: { skills: [SKILL_ANALISADOR, SKILL_INSTAGRAM_DESIGNER, ...] }
 *   tools: [CODE_EXECUTION_TOOL]
 */

// ── Beta headers obrigatórios para usar Skills ────────────────────────────────
// Todos os 3 são necessários simultaneamente (docs: skills-guide)
export const SKILLS_BETA    = "skills-2025-10-02";
export const CODE_EXEC_BETA = "code-execution-2025-08-25";
export const FILES_API_BETA = "files-api-2025-04-14";

export const ALL_SKILLS_BETAS = [CODE_EXEC_BETA, SKILLS_BETA, FILES_API_BETA] as const;

// ── Tool de code execution (obrigatório com skills) ───────────────────────────
// Nota: skills requerem claude-opus-4-5 ou superior — haiku não suporta
export const CODE_EXECUTION_TOOL = {
  type: "code_execution_20250825" as const,
  name: "code_execution" as const,
};

// Modelos que suportam code_execution_20250825 + skills
export const SKILLS_MODEL = "claude-opus-4-5";

// ── Skill IDs ─────────────────────────────────────────────────────────────────
export const SKILL_IDS = {
  analisadorVisual:      "skill_01RpZxdeWAton8iaGqxTfUmL",
  instagramDesigner:     "skill_01D1btX2d9oS2zakEm1Ynniz",
  carrosselEditorial:    "skill_011u5c7tN3R4yy5VwwhsXgg5",
} as const;

// ── Helpers para montar o container ──────────────────────────────────────────

type SkillRef = { type: "custom"; skill_id: string; version: "latest" };

function skill(id: string): SkillRef {
  return { type: "custom", skill_id: id, version: "latest" };
}

/** Container com as skills do Instagram Designer + Analisador Visual */
export const CONTAINER_INSTAGRAM = {
  skills: [
    skill(SKILL_IDS.instagramDesigner),
  ],
};

/** Container com o Analisador Visual Blueprint */
export const CONTAINER_ANALISADOR = {
  skills: [
    skill(SKILL_IDS.analisadorVisual),
  ],
};

/** Container com o Criador de Carrossel Editorial */
export const CONTAINER_CARROSSEL = {
  skills: [
    skill(SKILL_IDS.carrosselEditorial),
  ],
};

/** Container completo (todos os 3 skills) */
export const CONTAINER_FULL = {
  skills: [
    skill(SKILL_IDS.analisadorVisual),
    skill(SKILL_IDS.instagramDesigner),
    skill(SKILL_IDS.carrosselEditorial),
  ],
};
