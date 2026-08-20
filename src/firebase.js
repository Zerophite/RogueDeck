import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// ============================================================
//  PASTE YOUR FIREBASE CONFIG BELOW
//  Get it from: Firebase Console → Project Settings → Your Apps
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCI7vPpsVfLamQ1NdPiarlWCGEJTNJJQOM",
  authDomain: "rogue-deck-5e92f.firebaseapp.com",
  databaseURL: "https://rogue-deck-5e92f-default-rtdb.firebaseio.com",
  projectId: "rogue-deck-5e92f",
  storageBucket: "rogue-deck-5e92f.firebasestorage.app",
  messagingSenderId: "770940948605",
  appId: "1:770940948605:web:676147d17a2de27c6c6114"
};

// Reuse an existing app if one is already initialized (prevents duplicate-app on hot reload).
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
