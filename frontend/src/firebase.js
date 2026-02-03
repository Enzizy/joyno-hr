import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyC9xeiQzBZ1oh78BC-PIqDSfMqpGV4apeo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'hr-system-e6b4a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hr-system-e6b4a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'hr-system-e6b4a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '879612448853',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:879612448853:web:e891c3891e0d587a40c4dc',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-2Y7853DW6C',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
