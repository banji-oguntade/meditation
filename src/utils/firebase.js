import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB5unnGDL74Sa0PBfipSGgjmU27_Nh4z-4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "logos-meditation.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "logos-meditation",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "logos-meditation.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "364047217245",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:364047217245:web:a30d52050b21f50559d3b4"
};

// Check if all essential keys are provided to avoid crash on incomplete setup
const isConfigValid = 
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.appId;

console.log("ℹ️ Firebase Env Keys Loaded:", {
  apiKey: !!import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: !!import.meta.env.VITE_FIREBASE_APP_ID
});

let db = null;
let isFirebaseEnabled = false;

if (isConfigValid) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isFirebaseEnabled = true;
    console.log("🔥 Firebase initialized successfully. Syncing to Cloud Firestore sanctuary.");
  } catch (err) {
    console.error("Failed to initialize Firebase App:", err);
  }
} else {
  console.log("💾 Firebase environment variables missing. Falling back to local storage browser sanctuary.");
}

export function isCloudEnabled(user) {
  return isFirebaseEnabled && user && user.email !== "guest@example.com";
}

export { db, isFirebaseEnabled };
