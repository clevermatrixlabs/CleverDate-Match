import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Firestore,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = (): boolean =>
  !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured()) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db };

export interface FirebaseMessage {
  id: string;
  senderId: number;
  content: string;
  timestamp: Date;
}

/**
 * Subscribe to real-time messages for a given matchId.
 * Returns an unsubscribe function. If Firebase is not configured, calls onMessages([]) immediately.
 */
export function subscribeToMessages(
  matchId: number,
  onMessages: (msgs: FirebaseMessage[]) => void
): Unsubscribe {
  if (!db) {
    onMessages([]);
    return () => {};
  }

  const q = query(
    collection(db, 'chats', String(matchId), 'messages'),
    orderBy('timestamp', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const msgs: FirebaseMessage[] = snapshot.docs.map((doc) => {
      const data = doc.data() as DocumentData;
      return {
        id: doc.id,
        senderId: data.senderId as number,
        content: data.content as string,
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
      };
    });
    onMessages(msgs);
  });
}

/**
 * Send a message to a Firestore chat.
 * Returns true on success, false if Firebase is not configured.
 */
export async function sendFirebaseMessage(
  matchId: number,
  senderId: number,
  content: string
): Promise<boolean> {
  if (!db) return false;
  await addDoc(collection(db, 'chats', String(matchId), 'messages'), {
    senderId,
    content,
    timestamp: serverTimestamp(),
  });
  return true;
}
