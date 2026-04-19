/**
 * scripts/backfill-owner-uid.ts
 * Run once: populates `ownerUid` on all V3 posts that lack it.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --project tsconfig.json scripts/backfill-owner-uid.ts
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  // users/{uid}/clients/{cid}/posts/{pid}
  const snap = await db.collectionGroup("posts").get();

  let updated = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    if (doc.data().ownerUid) continue; // already set

    const parts = doc.ref.path.split("/");
    // path: users/UID/clients/CID/posts/PID  → parts[1] = UID
    if (parts[0] !== "users" || parts.length < 6) continue;

    const ownerUid = parts[1];
    batch.set(doc.ref, { ownerUid }, { merge: true });
    updated++;
    batchCount++;

    if (batchCount === 500) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`[backfill] Updated ${updated} V3 post docs with ownerUid.`);
}

main().catch(err => { console.error(err); process.exit(1); });
