/**
 * DELETE /api/clients/[id]/reset-dna
 *
 * Reseta o DNA visual da marca — apaga o documento sintetizado e todos os
 * exemplos de design usados para treinar o modelo. O perfil básico (nome,
 * cores, logo, fotos da biblioteca) é preservado integralmente.
 *
 * O que é apagado:
 *   - clients/{id}/brand_dna/current        (DNA sintetizado)
 *   - clients/{id}/design_examples/*        (todos os exemplos de referência)
 *
 * O que é MANTIDO:
 *   - Perfil básico (nome, cores, logo, segmento, etc.)
 *   - Fotos da biblioteca (coleção `photos`)
 *   - Posts e carrosseis gerados
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientRef = adminDb.collection("clients").doc(id);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // ── 1. Apagar brand_dna/current ───────────────────────────────────────────
    const dnaRef = clientRef.collection("brand_dna").doc("current");
    const dnaDoc = await dnaRef.get();
    if (dnaDoc.exists) {
      await dnaRef.delete();
    }

    // ── 2. Apagar todos os design_examples ────────────────────────────────────
    const examplesSnap = await clientRef.collection("design_examples").get();
    if (!examplesSnap.empty) {
      // Firestore batch suporta até 500 operações
      const BATCH_SIZE = 490;
      const docs = examplesSnap.docs;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      deleted_dna: dnaDoc.exists,
      deleted_examples: examplesSnap.size,
      message: `DNA resetado: ${dnaDoc.exists ? "1 DNA" : "sem DNA"} + ${examplesSnap.size} exemplo(s) apagados.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[DELETE /api/clients/[id]/reset-dna]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
