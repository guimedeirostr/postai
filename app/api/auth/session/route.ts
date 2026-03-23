import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { signSession } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "postai_session";
const SESSION_EXPIRY_S    = 60 * 60 * 24 * 7; // 7 dias

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    // Verifica token Firebase e obtém dados do usuário
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid, name, email, picture } = decoded;

    // Cria/atualiza doc de agência no Firestore (server-side)
    const agencyRef = adminDb.collection("agencies").doc(uid);
    const agencySnap = await agencyRef.get();
    if (!agencySnap.exists) {
      await agencyRef.set({
        id:        uid,
        name:      name      ?? "Minha Agência",
        email:     email     ?? "",
        photo_url: picture   ?? null,
        created_at: FieldValue.serverTimestamp(),
      });
    }

    // Assina JWT local — sem dependência de Admin SDK no layout/middleware
    const jwt = await signSession({ uid, email, name });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, jwt, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      maxAge:   SESSION_EXPIRY_S,
      path:     "/",
      sameSite: "lax",
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[session] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
