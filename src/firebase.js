import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// ============================================================
//  PASTE YOUR FIREBASE CONFIG BELOW
//  Get it from: Firebase Console → Project Settings → Your Apps
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDjQdT2t7FoYsrnVIuhFNc30sb7kJF195U",
  authDomain: "Yuno-game-675a4.firebaseapp.com",
  databaseURL: "https://uno-game-675a4-default-rtdb.firebaseio.com",
  projectId: "uno-game-675a4",
  storageBucket: "uno-game-675a4.firebasestorage.app",
  messagingSenderId: "876070837163",
  appId: "1:876070837163:web:67c21f9c60c19276b2d0ee"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
