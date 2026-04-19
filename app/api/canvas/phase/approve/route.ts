import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { PhaseId, PromptOutcome } from "@/types";

type ApproveBody = {
  phaseId: PhaseId;
  clientId: string;
  runId?: string;
  phaseRunId?: string;
  postId?: string;
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: ApproveBody = await req.json();
  const { phaseId, clientId, runId, phaseRunId, postId } = body;

  if (!clientId || !phaseId) {
    return NextResponse.json({ error: "clientId e phaseId obrigatórios" }, { status: 400 });
  }

  const uid = user.uid;
  const approvedAt = Date.now();

  // Mark PhaseRun as approved
  if (runId && phaseRunId) {
    await adminDb.doc(paths.phaseRun(uid, clientId, runId, phaseRunId))
      .update({ approvedByUser: true, approvedAt })
      .catch(() => null);
  }

  // Emit PromptOutcome for ML signal
  if (runId) {
    const phaseRunSnap = phaseRunId
      ? await adminDb.doc(paths.phaseRun(uid, clientId, runId, phaseRunId)).get()
      : null;
    const phaseRunData = phaseRunSnap?.data();

    const outcomeId = adminDb.collection(paths.promptOutcomes(uid, clientId)).doc().id;
    const outcome: Omit<PromptOutcome, "id"> & { id: string } = {
      id: outcomeId,
      compiledPromptId: phaseRunId ?? "",
      clientId,
      slideId: "",
      slotsSnapshot: [],
      criticScore: 0,
      humanDecision: "approved",
      at: FieldValue.serverTimestamp() as unknown as import("firebase/firestore").Timestamp,
      phaseId,
      runId,
      phaseRunId: phaseRunId ?? "",
      approved: true,
      editedByUser: phaseRunData?.editedByUser ?? false,
      regenerationCount: 0,
      timeToApproveMs: phaseRunData?.startedAt ? approvedAt - phaseRunData.startedAt : 0,
      outputPreview: JSON.stringify(phaseRunData?.output ?? {}).slice(0, 200),
      createdAt: approvedAt,
    };

    await adminDb.doc(paths.promptOutcome(uid, clientId, outcomeId)).set(outcome);
  }

  // If output phase approved, update CanvasRun.finalStatus
  if (phaseId === "output" && runId) {
    await adminDb.doc(paths.canvasRun(uid, clientId, runId))
      .update({ finalStatus: "approved", finishedAt: approvedAt })
      .catch(() => null);

    // Update PostV3 status if postId provided
    if (postId) {
      await adminDb.doc(paths.post(uid, clientId, postId))
        .update({ status: "approved", updatedAt: FieldValue.serverTimestamp() })
        .catch(() => null);
    }
  }

  return NextResponse.json({ ok: true });
}
