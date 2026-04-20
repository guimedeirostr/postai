import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId     = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!storageBucket) {
    console.warn(JSON.stringify({
      event: 'firebase.init.missing_storage_bucket',
      hint:  'Set FIREBASE_STORAGE_BUCKET in Vercel env vars (e.g. your-project.appspot.com)',
    }));
  }

  // Opção 1: JSON em base64 (recomendado — sem problemas de formatação)
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    try {
      const json = Buffer.from(base64.trim(), "base64").toString("utf-8");
      return initializeApp({ credential: cert(JSON.parse(json)), projectId, storageBucket });
    } catch (err) {
      console.error("[firebase-admin] Falha ao decodificar FIREBASE_SERVICE_ACCOUNT_BASE64:", err);
    }
  }

  // Opção 2: JSON direto
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      let json = serviceAccountJson.trim();
      if (json.startsWith('"') && json.endsWith('"')) {
        json = json.slice(1, -1).replace(/\\"/g, '"');
      }
      json = json.replace(/\\n/g, "\n");
      if (!json.startsWith("{")) json = "{" + json + "}";
      return initializeApp({ credential: cert(JSON.parse(json)), projectId, storageBucket });
    } catch (err) {
      console.error("[firebase-admin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:", err);
    }
  }

  console.error("[firebase-admin] Nenhuma credencial encontrada! Configure FIREBASE_SERVICE_ACCOUNT_BASE64.");
  return initializeApp({ projectId, storageBucket });
}

const adminApp = getAdminApp();

export const adminDb      = getFirestore(adminApp);
export const adminAuth    = getAuth(adminApp);
export const adminStorage = () => getStorage(adminApp);

// Guard against double-call on hot reload — settings() can only be called once per instance
const _settingsKey = '__postai_firestore_settings_applied';
if (!(adminDb as unknown as Record<string, unknown>)[_settingsKey]) {
  adminDb.settings({ ignoreUndefinedProperties: true });
  (adminDb as unknown as Record<string, unknown>)[_settingsKey] = true;
}
