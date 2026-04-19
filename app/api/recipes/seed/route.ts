/**
 * POST /api/recipes/seed
 * Seeds the 6 initial recipes in Firestore global `recipes` collection.
 * Protected: only runs if SEED_SECRET matches.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { RECIPES } from "@/lib/data/recipes";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-seed-secret");
  if (!secret || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const batch = adminDb.batch();
  for (const recipe of RECIPES) {
    const ref = adminDb.collection("recipes").doc(recipe.id);
    batch.set(ref, recipe);
  }
  await batch.commit();

  return NextResponse.json({ seeded: RECIPES.length, ids: RECIPES.map(r => r.id) });
}

export async function GET() {
  const snap = await adminDb.collection("recipes").get();
  const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ recipes });
}
