/**
 * SocietyFix AI — Client-Side Firebase Authentication & Firestore Client
 * Manages Firebase Web SDK initialization, Google OAuth popup, token retrieval,
 * and Firestore database connection validation.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { logger } from '../infrastructure/logger.ts';

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
  [key: string]: unknown;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const authInstance = getAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance.currentUser?.uid,
      email: authInstance.currentUser?.email,
      emailVerified: authInstance.currentUser?.emailVerified,
      isAnonymous: authInstance.currentUser?.isAnonymous,
      tenantId: authInstance.currentUser?.tenantId,
      providerInfo: authInstance.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  logger.error('Firestore Error: ', errInfo);
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Firebase App
export const app: FirebaseApp = getApps().length > 0 && getApps()[0]
  ? getApps()[0]!
  : initializeApp(firebaseConfig);

// Initialize Authentication
export const auth: Auth = getAuth(app);

// Initialize Cloud Firestore using provisioned database ID
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

/**
 * Validates connection to Firestore on application startup.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    logger.info('Firestore connection validated successfully.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      logger.warn('Please check your Firebase configuration: client is offline.');
    } else {
      logger.info('Firestore connection test probe executed.', { message: error instanceof Error ? error.message : String(error) });
    }
    return false;
  }
}

// Run connection validation
testConnection().catch(() => {});

/**
 * Initiates Google Sign-In with Firebase popup.
 * Returns the raw Firebase ID token to transmit to the backend.
 */
export async function signInWithGoogle(): Promise<{ idToken: string; user: FirebaseUser }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const userCredential = await signInWithPopup(auth, provider);
    const idToken = await userCredential.user.getIdToken();
    return { idToken, user: userCredential.user };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    logger.error('Google Sign-In popup error', { code: err.code, message: err.message });
    throw error;
  }
}

/**
 * Signs out from Firebase.
 */
export async function signOutFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Listens for Firebase authentication state changes.
 */
export function onAuthStatusChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
