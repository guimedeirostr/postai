// lib/ai/outcome.ts
// Registra PromptOutcome e aplica ML Modelo A (slot weighting) em tempo real.

import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { PromptOutcome, PromptSlot, PromptSlotKey, SlotWeightEntry } from "@/types";

// ── Registrar outcome ─────────────────────────────────────────────────────────

export async function recordOutcome(
  uid:      string,
  clientId: string,
  outcome:  Omit<PromptOutcome, "id" | "at">,
): Promise<string> {
  const ref = adminDb.collection(paths.promptOutcomes(uid, clientId)).doc();

  await ref.set({
    ...outcome,
    at: FieldValue.serverTimestamp(),
  });

  // Modelo A: atualiza slotWeights em ClientMemory imediatamente
  await updateSlotWeights(uid, clientId, outcome.slotsSnapshot, outcome.humanDecision);

  return ref.id;
}

// ── Modelo A: Slot Weighting (online, incremental) ───────────────────────────
// weight_slot = (approvals - rejections) / total
// Persiste em ClientMemory.slotWeights via runTransaction.

async function updateSlotWeights(
  uid:          string,
  clientId:     string,
  slots:        PromptSlot[],
  decision:     "approved" | "rejected" | "regenerated",
) {
  if (decision === "regenerated") return; // regenerated não vira sinal de treino

  const isApproval = decision === "approved";
  const memRef     = adminDb.doc(paths.memory(uid, clientId));

  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(memRef);
    const current = (snap.data()?.slotWeights ?? {}) as Partial<Record<PromptSlotKey, SlotWeightEntry>>;

    const updated = { ...current };

    for (const slot of slots) {
      if (!slot.value) continue;
      const prev = updated[slot.key] ?? { approvals: 0, rejections: 0, total: 0 };
      updated[slot.key] = {
        approvals:  prev.approvals  + (isApproval ? 1 : 0),
        rejections: prev.rejections + (isApproval ? 0 : 1),
        total:      prev.total      + 1,
      };
    }

    tx.set(memRef, { slotWeights: updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

// ── Modelo B: Few-Shot Dinâmico (retrieval por similaridade) ─────────────────
// Busca os 5 outcomes aprovados mais recentes para usar como few-shot.
// (Versão lite: não usa embeddings — usa os 5 mais recentes aprovados do cliente.)
// Full retrieval com cosine similarity é adicionado quando outcomes > 100.

export async function fetchFewShotOutcomes(
  uid:      string,
  clientId: string,
  topK = 5,
): Promise<{ finalText: string; intencao: string }[]> {
  const snap = await adminDb
    .collection(paths.promptOutcomes(uid, clientId))
    .where("humanDecision", "==", "approved")
    .orderBy("at", "desc")
    .limit(topK)
    .get();

  return snap.docs.map(d => {
    const data = d.data() as PromptOutcome;
    // Reconstrói finalText dos slots snapshot
    const finalText = (data.slotsSnapshot ?? [])
      .map(s => s.value)
      .filter(Boolean)
      .join(", ");
    return { finalText, intencao: "" };
  });
}

// ── Modelo C stub: verifica se cliente tem fine-tune personalizado ────────────

export async function resolvePromptModel(
  uid:      string,
  clientId: string,
): Promise<string> {
  const snap = await adminDb.doc(paths.memory(uid, clientId)).get();
  const customModelId = snap.data()?.customModels?.promptWriter as string | undefined;
  // Se cliente tem fine-tune (>500 outcomes aprovados), usa ele
  if (customModelId) return customModelId;
  // Fallback: modelo configurado via env ou claude padrão
  return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
}
