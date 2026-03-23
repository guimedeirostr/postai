import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "postai_session";
const SESSION_EXPIRY_MS   = 60 * 60 * 24 * 7 * 1000; // 7 dias

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    // Verifica token e obtém dados do usuário
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid, name, email, picture } = decoded;

    // Cria doc de agência no Firestore (server-side, sem problema de offline)
    const agencyRef = adminDb.collection("agencies").doc(uid);
    const agencySnap = await agencyRef.get();
    if (!agencySnap.exists) {
      await agencyRef.set({
        id: uid,
        name: name ?? "Minha Agência",
        email: email ?? "",
        photo_url: picture ?? null,
        created_at: FieldValue.serverTimestamp(),
      });
    }

    // Cria session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_EXPIRY_MS / 1000,
      path: "/",
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
