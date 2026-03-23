import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Opção 1: JSON em base64 (recomendado — sem problemas de formatação)
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    try {
      const json = Buffer.from(base64.trim(), "base64").toString("utf-8");
      return initializeApp({ credential: cert(JSON.parse(json)), projectId });
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
      return initializeApp({ credential: cert(JSON.parse(json)), projectId });
    } catch (err) {
      console.error("[firebase-admin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:", err);
    }
  }

  console.error("[firebase-admin] Nenhuma credencial encontrada! Configure FIREBASE_SERVICE_ACCOUNT_BASE64.");
  return initializeApp({ projectId });
}

const adminApp = getAdminApp();

export const adminDb   = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
