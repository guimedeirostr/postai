import { cookies } from "next/headers";
import { adminAuth } from "./firebase-admin";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("postai_session")?.value;
  if (!session) return null;

  try {
    return await adminAuth.verifySessionCookie(session, true);
  } catch {
    return null;
  }
}
