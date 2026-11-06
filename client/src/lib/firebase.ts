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
  doc,
  getDocFromServer,
  setLogLevel,
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
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  listAll,
  type FirebaseStorage,
} from 'firebase/storage';
import firebaseConfig from '../../../firebase-applet-config.json';

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let firebaseStorage: FirebaseStorage | null = null;
const phoneRecaptchaVerifiers = new Map<string, RecaptchaVerifier>();

const COUNTRY_CALLING_CODES: Record<string, string> = {
  NG: '234', US: '1', GB: '44', CA: '1', GH: '233', ZA: '27', KE: '254',
  IN: '91', AU: '61', DE: '49', FR: '33', BR: '55', MX: '52', PH: '63', AE: '971',
};

if (isFirebaseConfigured()) {
  setLogLevel('silent');
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  auth = getAuth(app);
  if (firebaseConfig.storageBucket) {
    firebaseStorage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
  } else {
    firebaseStorage = getStorage(app);
  }

  // Validate connection to Firestore on boot with graceful offline recovery
  async function testConnection() {
    if (!db) return;
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn("Firestore client operating in offline mode. Will sync when connection is restored.");
      }
    }
  }
  testConnection();
}

export { app, auth, db, firebaseStorage };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Info:', JSON.stringify(errInfo));
  return errInfo;
}

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
  const errorCode =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  const code = (errorCode || raw.match(/auth\/[a-z0-9-]+/i)?.[0])?.toLowerCase();
  const messages: Record<string, string> = {
    'auth/invalid-phone-number': "That phone number doesn't look right — please check the number and try again.",
    'auth/missing-phone-number': "That phone number doesn't look right — please check the number and try again.",
    'auth/invalid-verification-code': 'That code is not correct. Please check it and try again.',
    'auth/invalid-verification-id': 'This code request expired. Request a new code and try again.',
    'auth/code-expired': 'That code has expired. Please request a new one.',
    'auth/session-expired': 'Your verification session expired. Please request a new code.',
    'auth/captcha-check-failed': 'Phone verification check failed. Please ensure your number is valid and try again.',
    'auth/invalid-app-credential': 'Phone verification check failed. Please try again.',
    'auth/missing-recaptcha-token': 'Phone verification check failed. Please try again.',
    'auth/unauthorized-domain': 'This website domain is initializing authorization. Try again in a moment or use email sign-in.',
    'auth/operation-not-allowed': 'Phone sign-in is completing setup. You can also sign in with email.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little while and try again.',
    'auth/quota-exceeded': 'We have reached the message limit for now. Please try again later.',
    'auth/phone-number-already-exists': 'That phone number is already linked to an account.',
    'auth/credential-already-in-use': 'That phone number is already linked to an account.',
    'auth/provider-already-linked': 'That phone number is already linked to this account.',
    'auth/email-already-in-use': 'An account with that email already exists. Try signing in instead.',
    'auth/invalid-credential': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/user-not-found': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/wrong-password': 'Those sign-in details do not look right. Please check them and try again.',
    'auth/weak-password': 'Please choose a stronger password with at least 8 characters.',
    'auth/network-request-failed': 'We could not connect just now. Please check your connection and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before completing. Please try again or use Email sign-in.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled. Please try again.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Please allow popups or use Email sign-in.',
  };
  const lowerRaw = raw.toLowerCase();
  if (
    lowerRaw.includes('recaptcha') ||
    lowerRaw.includes('already been rendered') ||
    lowerRaw.includes('containerorid')
  ) {
    return new Error('Phone verification could not start. Please refresh and try again.');
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
  return credential.user;
}

export async function signInWithFirebaseGoogle(): Promise<FirebaseUser> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(requireAuth(), provider);
    return credential.user;
  } catch (err: any) {
    throw toFriendlyAuthError(err, 'Google sign-in could not be completed. Please try again or use Email sign-in.');
  }
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
  mode: 'sign-in' | 'link' = 'sign-in',
): { confirmation: Promise<ConfirmationResult>; cleanup: () => void } {
  const firebaseAuth = requireAuth();
  const container = document.getElementById(containerId);
  if (!(container instanceof HTMLElement) || !container.isConnected) {
    throw new Error(`Phone verification container "${containerId}" is not attached to the page.`);
  }

  let verifier = phoneRecaptchaVerifiers.get(containerId);
  if (!verifier) {
    container.replaceChildren();
    verifier = new RecaptchaVerifier(firebaseAuth, container, { size: 'invisible' });
    phoneRecaptchaVerifiers.set(containerId, verifier);
  }
  const currentUser = firebaseAuth.currentUser;
  const confirmation = mode === 'link' && currentUser
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
    collection(db, 'matches', String(matchId), 'messages'),
    orderBy('timestamp', 'asc')
  );

  const path = `matches/${matchId}/messages`;
  return onSnapshot(
    q,
    (snapshot) => {
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
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function sendFirebaseMessage(
  matchId: number,
  senderId: number,
  content: string
): Promise<boolean> {
  if (!db) return false;
  await addDoc(collection(db, 'matches', String(matchId), 'messages'), {
    senderId,
    content,
    timestamp: serverTimestamp(),
  });
  return true;
}

/**
 * Uploads a user-recorded video profile to Firebase Storage.
 * Stores in `video_profiles/${userId}/profile_video_${timestamp}.mp4`
 * Returns the public Firebase Storage download URL.
 */
export async function uploadVideoProfileToFirebase(
  userId: number,
  file: File | Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!firebaseStorage) throw new Error('Firebase Storage is not initialized.');
  const ext = file.type?.includes('webm') ? 'webm' : 'mp4';
  const filename = `profile_video_${Date.now()}.${ext}`;
  const fileRef = storageRef(firebaseStorage, `video_profiles/${userId}/${filename}`);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type || 'video/mp4',
      customMetadata: {
        userId: String(userId),
        uploadedAt: new Date().toISOString(),
      },
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.(Math.round(progress));
        }
      },
      (error) => {
        console.error('Firebase Storage upload error:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (urlErr) {
          reject(urlErr);
        }
      }
    );
  });
}

/**
 * Fetches the latest user video profile URL directly from Firebase Storage.
 */
export async function fetchUserVideoProfileFromFirebase(userId: number): Promise<string | null> {
  if (!firebaseStorage) return null;
  try {
    const folderRef = storageRef(firebaseStorage, `video_profiles/${userId}`);
    const listResult = await listAll(folderRef);
    if (!listResult.items || listResult.items.length === 0) return null;

    // Get the most recent video
    const latestItem = listResult.items[listResult.items.length - 1];
    return await getDownloadURL(latestItem);
  } catch (err) {
    console.warn(`Could not fetch video from Firebase Storage for user ${userId}:`, err);
    return null;
  }
}