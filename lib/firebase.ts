import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

// Lazy getters — só inicializam quando chamados no client
export function getFirebaseAuth(): Auth        { return getAuth(getFirebaseApp()); }
export function getFirebaseDb(): Firestore     { return getFirestore(getFirebaseApp()); }
export function getFirebaseStorage(): FirebaseStorage { return getStorage(getFirebaseApp()); }
export function getGoogleProvider(): GoogleAuthProvider { return new GoogleAuthProvider(); }

// Aliases para compatibilidade
export const auth            = typeof window !== "undefined" ? getAuth(getFirebaseApp())      : null as unknown as Auth;
export const db              = typeof window !== "undefined" ? getFirestore(getFirebaseApp()) : null as unknown as Firestore;
export const storage         = typeof window !== "undefined" ? getStorage(getFirebaseApp())   : null as unknown as FirebaseStorage;
export const googleProvider  = new GoogleAuthProvider();
