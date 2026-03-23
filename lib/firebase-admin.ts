import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      let json = serviceAccountJson.trim();
      // Remove aspas externas que o Vercel às vezes adiciona
      if (json.startsWith('"') && json.endsWith('"')) {
        json = json.slice(1, -1).replace(/\\"/g, '"');
      }
      // Converte \n escapados em newlines reais (necessário para private_key)
      json = json.replace(/\\n/g, "\n");
      // Adiciona chaves se o usuário colou só o conteúdo interno do JSON
      if (!json.startsWith("{")) json = "{" + json + "}";
      return initializeApp({ credential: cert(JSON.parse(json)), projectId });
    } catch (err) {
      console.error("[firebase-admin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:", err);
    }
  }

  return initializeApp({ projectId });
}

const adminApp = getAdminApp();

export const adminDb   = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
