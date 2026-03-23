"use client";

import { signInWithRedirect, getRedirectResult, signOut as firebaseSignOut } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "./firebase";

export async function signInWithGoogle() {
  await signInWithRedirect(getFirebaseAuth(), getGoogleProvider());
}

export async function handleGoogleRedirect() {
  const result = await getRedirectResult(getFirebaseAuth());
  if (!result) return null;

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
