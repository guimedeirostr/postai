"use client";

import { signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "./firebase";

export async function signInWithGoogle() {
  const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
  const user = result.user;

  const agencyRef = doc(getFirebaseDb(), "agencies", user.uid);
  const agencySnap = await getDoc(agencyRef);

  if (!agencySnap.exists()) {
    await setDoc(agencyRef, {
      id: user.uid,
      name: user.displayName ?? "Minha Agência",
      email: user.email,
      photo_url: user.photoURL ?? null,
      created_at: serverTimestamp(),
    });
  }

  // Gera session cookie via API
  const idToken = await user.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  return user;
}

export async function signOut() {
  await firebaseSignOut(getFirebaseAuth());
  await fetch("/api/auth/session", { method: "DELETE" });
}
