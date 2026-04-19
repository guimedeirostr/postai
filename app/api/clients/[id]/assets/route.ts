import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { AssetKind } from "@/types";

// ── Helper: próximo slug @imgN disponível ─────────────────────────────────────
async function nextSlug(uid: string, cid: string, kind: AssetKind): Promise<string> {
  const prefix = kind === "avatar" ? "avatar" : "img";
  const snap   = await adminDb.collection(paths.assets(uid, cid))
    .where("slug", ">=", `${prefix}1`).where("slug", "<=", `${prefix}9999`).get();
  const nums   = snap.docs
    .map(d => parseInt((d.data().slug as string).replace(prefix, ""), 10))
    .filter(n => !isNaN(n));
  const next   = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${next}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: clientId } = await params;

  const snap = await adminDb.collection(paths.assets(user.uid, clientId))
    .orderBy("createdAt", "desc").get();
  const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: clientId } = await params;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = (form.get("kind") as AssetKind | null) ?? "reference";

  if (!file) return NextResponse.json({ error: "file obrigatório" }, { status: 400 });

  const buffer      = Buffer.from(await file.arrayBuffer());
  const ext         = file.name.split(".").pop() ?? "jpg";
  const assetRef    = adminDb.collection(paths.assets(user.uid, clientId)).doc();
  const storagePath = `users/${user.uid}/clients/${clientId}/assets/${assetRef.id}.${ext}`;

  // Upload para Firebase Storage
  const bucket     = adminStorage().bucket();
  const fileRef    = bucket.file(storagePath);
  await fileRef.save(buffer, { contentType: file.type, public: true });
  const url        = fileRef.publicUrl();

  const slug = await nextSlug(user.uid, clientId, kind);

  await assetRef.set({
    clientId,
    kind,
    url,
    storagePath,
    slug,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ asset: { id: assetRef.id, clientId, kind, url, storagePath, slug } });
}
