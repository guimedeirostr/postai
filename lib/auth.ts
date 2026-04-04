"use client";

import { signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "./firebase";

export async function signInWithGoogle() {
  await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
}


export async function signOut() {
  await firebaseSignOut(getFirebaseAuth());
  await fetch("/api/auth/session", { method: "DELETE" });
}
