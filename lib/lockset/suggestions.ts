import { adminDb } from '@/lib/firebase-admin';
import type { BrandDNA, LockSuggestion } from '@/types';

async function getDnaVisual(uid: string, clientId: string): Promise<BrandDNA | null> {
  try {
    const snap = await adminDb.doc(`users/${uid}/clients/${clientId}/dna/current`).get();
    if (snap.exists) return snap.data() as BrandDNA;
    // Fallback: legacy flat collection
    const legacy = await adminDb
      .collection('clients').doc(clientId)
      .collection('brand_dna').doc('current').get();
    return legacy.exists ? (legacy.data() as BrandDNA) : null;
  } catch (e) {
    console.log(JSON.stringify({
      event: 'suggestions.dna_fetch_failed',
      uid,
      clientId,
      error: String((e as Error)?.message ?? e),
    }));
    return null;
  }
}

async function getRecentApprovedPosts(
  uid: string,
  clientId: string,
  limit: number,
): Promise<{ primary_color?: string; secondary_color?: string }[]> {
  try {
    const snap = await adminDb
      .collection('posts')
      .where('agency_id', '==', uid)
      .where('client_id', '==', clientId)
      .where('status', '==', 'approved')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as { primary_color?: string; secondary_color?: string });
  } catch (e) {
    console.log(JSON.stringify({
      event: 'suggestions.posts_fetch_failed',
      uid,
      clientId,
      error: String((e as Error)?.message ?? e),
    }));
    return [];
  }
}

function countColorsFromPosts(
  posts: { primary_color?: string; secondary_color?: string }[],
): Map<string, number> {
  const freq = new Map<string, number>();
  for (const p of posts) {
    for (const hex of [p.primary_color, p.secondary_color]) {
      if (typeof hex === 'string' && /^#[0-9a-f]{3,8}$/i.test(hex)) {
        freq.set(hex, (freq.get(hex) ?? 0) + 1);
      }
    }
  }
  return freq;
}

export async function computeLockSuggestions(uid: string, clientId: string): Promise<LockSuggestion[]> {
  try {
    const [dna, approvedPosts] = await Promise.all([
      getDnaVisual(uid, clientId),
      getRecentApprovedPosts(uid, clientId, 20),
    ]);

    if (!dna && approvedPosts.length < 3) return [];

    const suggestions: LockSuggestion[] = [];

    // Regra 1: cor recorrente
    const colorFreq = countColorsFromPosts(approvedPosts);
    for (const [hex, count] of colorFreq) {
      if (count >= Math.max(3, approvedPosts.length * 0.6)) {
        suggestions.push({
          lock: {
            scope: 'color',
            description: `Cor institucional ${hex}`,
            enforcement: 'soft',
            promptHint: `Usar a cor ${hex} como cor institucional em destaques e elementos de marca.`,
            source: 'user_approved_pattern',
            active: true,
          },
          reason: `Cor ${hex} aparece em ${count} dos últimos ${approvedPosts.length} posts aprovados`,
          source: 'repeated_pattern',
          confidence: Math.min(1, count / approvedPosts.length),
        });
      }
    }

    if (dna) {
      // Regra 2: tipografia detectada no DNA
      const typoPattern = typeof dna.typography_pattern === 'string' ? dna.typography_pattern : null;
      if (typoPattern) {
        suggestions.push({
          lock: {
            scope: 'typography',
            description: `Padrão tipográfico: ${typoPattern.slice(0, 60)}`,
            enforcement: 'soft',
            promptHint: `Seguir padrão tipográfico: ${typoPattern}`,
            source: 'dna_visual',
            active: true,
          },
          reason: `DNA Visual identificou padrão tipográfico dominante com confiança ${dna.confidence_score}%`,
          source: 'dna_visual',
          confidence: typeof dna.confidence_score === 'number' ? dna.confidence_score / 100 : 0,
        });
      }

      // Regra 3: composição dominante
      const compZone = dna.dominant_composition_zone;
      if (compZone) {
        suggestions.push({
          lock: {
            scope: 'composition',
            description: `Composição dominante: ${compZone}`,
            enforcement: 'soft',
            promptHint: `Preferir composição com texto/elementos na zona ${compZone}.`,
            source: 'dna_visual',
            active: true,
          },
          reason: `DNA Visual identificou zona de composição dominante: ${compZone}`,
          source: 'dna_visual',
          confidence: typeof dna.confidence_score === 'number' ? dna.confidence_score / 100 : 0,
        });
      }
    }

    return suggestions.slice(0, 3);
  } catch (e) {
    console.log(JSON.stringify({
      event: 'suggestions.compute_failed',
      uid,
      clientId,
      error: String((e as Error)?.message ?? e),
    }));
    return [];
  }
}
