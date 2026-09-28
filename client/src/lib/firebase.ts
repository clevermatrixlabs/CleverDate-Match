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
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
const phoneRecaptchaVerifiers = new Map<string, RecaptchaVerifier>();

const COUNTRY_CALLING_CODES: Record<string, string> = {
  NG: '234', US: '1', GB: '44', CA: '1', GH: '233', ZA: '27', KE: '254',
  IN: '91', AU: '61', DE: '49', FR: '33', BR: '55', MX: '52', PH: '63', AE: '971',
};

if (isFirebaseConfigured()) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export { app, auth, db };

function requireAuth(): Auth {
  if (!auth) {
    throw new Error('Authentication is not configured yet.');
  }
  return auth;
}

export function normalizePhoneNumber(value: string, countryCode?: string | null): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`;

  const callingCode = countryCode ? COUNTRY_CALLING_CODES[countryCode] : undefined;
  if (!callingCode) return `+${digits}`;
  if (digits.startsWith(callingCode)) return `+${digits}`;
  return `+${callingCode}${digits.startsWith('0') ? digits.slice(1) : digits}`;
}

export function toFriendlyAuthError(error: unknown, fallback = 'Something went wrong. Please try again.'): Error {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const code = raw.match(/auth\/[a-z-]+/i)?.[0]?.toLowerCase();
  const messages: Record<string, string> = {
    'auth/invalid-phone-number': "That phone number doesn't look right — please check the number and try again.",
    'auth/missing-phone-number': "That phone number doesn't look right — please check the number and try again.",
    'auth/invalid-verification-code': 'That code is not correct. Please check it and try again.',
    'auth/code-expired': 'That code has expired. Please request a new one.',
    'auth/session-expired': 'Your verification session expired. Please request a new code.',
    'auth/captcha-check-failed': 'Phone verification could not complete. Check that this site is listed in Firebase Console under Authentication → Settings → Authorized domains, then try again.',
    'auth/invalid-app-credential': 'Phone verification could not start. Check that this site is listed in Firebase Console under Authentication → Settings → Authorized domains, then try again.',
    'auth/missing-recaptcha-token': 'Phone verification could not start. Check that this site is listed in Firebase Console under Authentication → Settings → Authorized domains, then try again.',
    'auth/operation-not-allowed': 'Phone sign-in is not enabled in Firebase Console. Enable Phone provider under Authentication → Sign-in method, then try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little while and try again.',
    'auth/quota-exceeded': 'We have reached the message limit for now. Please try again later.',
    'auth/email-already-in-use': 'An account with that email already exists. Try signing in instead.',
    'auth/invalid-credential': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/user-not-found': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/wrong-password': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/weak-password': 'Please choose a stronger password with at least 8 characters.',
    'auth/network-request-failed': 'We could not connect just now. Please check your connection and try again.',
  };
  const lowerRaw = raw.toLowerCase();
  if (
    lowerRaw.includes('recaptcha') ||
    lowerRaw.includes('already been rendered') ||
    lowerRaw.includes('containerorid')
  ) {
    return new Error('Phone verification could not start. Check that this site is listed in Firebase Console under Authentication → Settings → Authorized domains, then try again.');
  }
  return new Error((code && messages[code]) || (raw && !/firebase|auth\//i.test(raw) ? raw : fallback));
}

export async function createFirebaseEmailAccount(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function signInFirebaseEmail(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  if (!credential.user.emailVerified) {
    throw new Error('Please verify your email address using the link in your inbox before signing in.');
  }
  return credential.user;
}

export async function resendFirebaseEmailVerification(): Promise<void> {
  const user = requireAuth().currentUser;
  if (!user) throw new Error('Your verification session has expired. Please sign up again.');
  await sendEmailVerification(user);
}

export async function reloadFirebaseUser(): Promise<FirebaseUser> {
  const user = requireAuth().currentUser;
  if (!user) throw new Error('Your verification session has expired. Please sign in again.');
  await user.reload();
  return requireAuth().currentUser || user;
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email);
}

export function createFirebasePhoneChallenge(
  phone: string,
  containerId: string,
): { confirmation: Promise<ConfirmationResult>; cleanup: () => void } {
  const firebaseAuth = requireAuth();
  const container = document.getElementById(containerId);
  if (!(container instanceof HTMLElement) || !container.isConnected) {
    throw new Error(`Phone verification could not start because the reCAPTCHA container "${containerId}" is not attached to the page.`);
  }

  let verifier = phoneRecaptchaVerifiers.get(containerId);
  if (!verifier) {
    // A previous failed attempt can leave Google's iframe markup behind even
    // after the verifier was removed from the cache. Start with a clean,
    // attached element and pass the element itself to Firebase.
    container.replaceChildren();
    verifier = new RecaptchaVerifier(firebaseAuth, container, { size: 'invisible' });
    phoneRecaptchaVerifiers.set(containerId, verifier);
  }
  const currentUser = firebaseAuth.currentUser;
  const confirmation = currentUser
    ? linkWithPhoneNumber(currentUser, phone, verifier)
    : signInWithPhoneNumber(firebaseAuth, phone, verifier);
  return {
    confirmation,
    cleanup: () => {
      if (phoneRecaptchaVerifiers.get(containerId) === verifier) {
        verifier.clear();
        phoneRecaptchaVerifiers.delete(containerId);
      }
    },
  };
}

export async function confirmFirebasePhoneCode(
  confirmation: ConfirmationResult,
  code: string,
): Promise<FirebaseUser> {
  const credential = await confirmation.confirm(code);
  return credential.user;
}

export interface FirebaseMessage {
  id: string;
  senderId: number;
  content: string;
  timestamp: Date;
}

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