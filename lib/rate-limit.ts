import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/** Maximum AI API calls per agency per calendar day (UTC). */
export const AI_DAILY_LIMIT = 100;

interface RateLimitResult {
  allowed: boolean;
  /** Current count after this call (only valid when allowed = true). */
  count: number;
  /** ISO date string of the reset (midnight UTC of the next day). */
  resetAt: string;
}

/**
 * Checks and increments the daily AI call counter for a given agency.
 * Uses a Firestore document keyed by `{agency_id}_{YYYY-MM-DD}` (UTC date).
 *
 * - If the count is below AI_DAILY_LIMIT, increments and returns allowed = true.
 * - If the count is at or above the limit, returns allowed = false without incrementing.
 */
export async function checkRateLimit(agency_id: string): Promise<RateLimitResult> {
  const today   = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  const docId   = `${agency_id}_${today}`;
  const ref     = adminDb.collection("rate_limits").doc(docId);

  const resetAt = new Date(`${today}T00:00:00Z`);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);

  const result = await adminDb.runTransaction(async (tx) => {
    const snap  = await tx.get(ref);
    const count = (snap.data()?.count as number) ?? 0;

    if (count >= AI_DAILY_LIMIT) {
      return { allowed: false, count, resetAt: resetAt.toISOString() };
    }

    if (snap.exists) {
      tx.update(ref, { count: FieldValue.increment(1) });
    } else {
      tx.set(ref, {
        agency_id,
        date:       today,
        count:      1,
        created_at: FieldValue.serverTimestamp(),
      });
    }

    return { allowed: true, count: count + 1, resetAt: resetAt.toISOString() };
  });

  return result;
}
