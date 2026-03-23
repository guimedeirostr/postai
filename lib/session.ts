import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const SECRET    = new TextEncoder().encode(process.env.JWT_SECRET!);
const ALGORITHM = "HS256";
const EXPIRY    = "7d";

export interface SessionPayload extends JWTPayload {
  uid:    string;
  email?: string;
  name?:  string;
}

export async function signSession(
  payload: Omit<SessionPayload, keyof JWTPayload>,
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
