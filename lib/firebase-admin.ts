import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let json = serviceAccountJson.trim();
    if (json.startsWith('"') && json.endsWith('"')) json = json.slice(1, -1);
    json = json.replace(/\\n/g, "\n");
    return initializeApp({ credential: cert(JSON.parse(json)), projectId });
  }

  return initializeApp({ projectId });
}

const adminApp = getAdminApp();

export const adminDb   = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
