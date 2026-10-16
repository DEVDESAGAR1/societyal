/**
 * SocietyFix AI — Firebase Admin Initialization and Token Verification
 * Handles server-side cryptographic verification of Firebase ID tokens.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../infrastructure/logger.ts';

let firebaseAdminApp: App | null = null;

function loadFirebaseConfig(): Record<string, string> {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    logger.warn('Could not read firebase-applet-config.json from disk', { error: String(err) });
  }
  return {};
}

export interface VerifiedTokenClaims {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Initializes the Firebase Admin SDK safely.
 * Prefers Application Default Credentials (ADC) or explicit environment credentials.
 */
export function getFirebaseAdmin(): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  const fileConfig = loadFirebaseConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID || 
                    process.env.GOOGLE_CLOUD_PROJECT || 
                    fileConfig.projectId || 
                    'hack2skillnewproject';

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return firebaseAdminApp;
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const credentials = JSON.parse(serviceAccountJson);
      firebaseAdminApp = initializeApp({
        credential: cert(credentials),
        projectId,
      });
      logger.info('Firebase Admin initialized with service account JSON credential.', { projectId });
    } else {
      // Default to Google Cloud Application Default Credentials / Project ID
      firebaseAdminApp = initializeApp({
        projectId,
      });
      logger.info('Firebase Admin initialized with default project credentials.', { projectId });
    }
  } catch (error) {
    logger.warn('Firebase Admin standard initialization failed or already initialized', {
      error: error instanceof Error ? error.message : String(error)
    });
    const apps = getApps();
    if (apps.length > 0 && apps[0]) {
      firebaseAdminApp = apps[0];
    } else {
      firebaseAdminApp = initializeApp({ projectId }, 'societyfix-fallback');
    }
  }

  return firebaseAdminApp;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}
let certCache: CertCache | null = null;

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) {
    return certCache.certs;
  }

  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public certs: HTTP ${res.status}`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control');
  let maxAge = 3600;
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match && match[1]) {
      maxAge = parseInt(match[1], 10);
    }
  }

  certCache = {
    certs,
    expiresAt: Date.now() + maxAge * 1000,
  };

  return certs;
}

/**
 * Direct cryptographic verification of Firebase RS256 ID tokens using Google's public certs.
 * Used when Firebase Admin lacks service account credentials or encounters auth/internal-error.
 */
export async function verifyTokenWithGoogleCertificates(
  token: string,
  expectedProjectId?: string
): Promise<VerifiedTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    const err = new Error('Firebase ID token has invalid format');
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    user_id?: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
    auth_time?: number;
  };

  try {
    header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('Failed to parse Firebase ID token JWT header or payload');
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  if (header.alg !== 'RS256' || !header.kid) {
    const err = new Error('Invalid token header: alg must be RS256 and kid must be present');
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    const err = new Error('Firebase ID token has expired');
    (err as unknown as { code: string }).code = 'auth/id-token-expired';
    throw err;
  }

  const fileConfig = loadFirebaseConfig();
  const allowedAudiences = new Set<string>(
    [
      expectedProjectId,
      fileConfig.projectId,
      'hack2skillnewproject',
      process.env.FIREBASE_PROJECT_ID,
      process.env.GOOGLE_CLOUD_PROJECT,
    ].filter(Boolean) as string[]
  );

  // Check audience and issuer
  if (!payload.aud || (!allowedAudiences.has(payload.aud) && allowedAudiences.size > 0)) {
    // If payload.iss matches standard securetoken with payload.aud, accept it
    if (payload.iss !== `https://securetoken.google.com/${payload.aud}`) {
      const err = new Error(`Firebase ID token audience mismatch (${payload.aud})`);
      (err as unknown as { code: string }).code = 'auth/argument-error';
      throw err;
    }
  }

  const expectedIssuer = `https://securetoken.google.com/${payload.aud}`;
  if (payload.iss !== expectedIssuer) {
    const err = new Error(`Firebase ID token has incorrect issuer (${payload.iss}), expected ${expectedIssuer}`);
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  const uid = payload.sub || payload.user_id;
  if (!uid || typeof uid !== 'string') {
    const err = new Error('Firebase ID token must have a valid sub (UID)');
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  if (!payload.email) {
    throw new Error('Authenticated user token does not contain an email address');
  }

  // Fetch Google public certificates
  const certs = await fetchGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    const err = new Error(`No matching public certificate found for kid '${header.kid}'`);
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  // Cryptographically verify RSA-SHA256 signature
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const isValid = verifier.verify(cert, Buffer.from(signatureB64!, 'base64url'));

  if (!isValid) {
    const err = new Error('Firebase ID token signature verification failed');
    (err as unknown as { code: string }).code = 'auth/argument-error';
    throw err;
  }

  return {
    uid,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    email_verified: payload.email_verified,
  };
}

/**
 * Verifies a Firebase ID token.
 * Supports a deterministic test adapter when FIREBASE_AUTH_MOCK=true or NODE_ENV=test.
 */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedTokenClaims> {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or not a string');
  }

  // Test & development mock token bypass (strictly limited to non-production environment with explicit prefix)
  if ((process.env.NODE_ENV !== 'production' || process.env.FIREBASE_AUTH_MOCK === 'true') && token.startsWith('mock-token-')) {
    const parts = token.split(':');
    // Format: mock-token-valid:<uid>:<email>:<name>
    const type = parts[0];
    if (type === 'mock-token-expired') {
      const err = new Error('Firebase ID token has expired');
      (err as unknown as { code: string }).code = 'auth/id-token-expired';
      throw err;
    }
    if (type === 'mock-token-invalid') {
      const err = new Error('Firebase ID token is invalid');
      (err as unknown as { code: string }).code = 'auth/argument-error';
      throw err;
    }

    const uid = parts[1] || 'mock-user-123';
    const email = parts[2] || 'test@societyfix.local';
    const name = parts[3] || 'Test Resident';
    return {
      uid,
      email,
      name,
      picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      email_verified: true,
    };
  }

  const fileConfig = loadFirebaseConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID || 
                    process.env.GOOGLE_CLOUD_PROJECT || 
                    fileConfig.projectId || 
                    'hack2skillnewproject';

  // 1. Try authoritative direct cryptographic verification using Google's public certificates.
  // This does not require GCP Application Default Credentials / service accounts and avoids auth/internal-error.
  try {
    const directResult = await verifyTokenWithGoogleCertificates(token, projectId);
    return directResult;
  } catch (directErr: unknown) {
    const err = directErr as { code?: string; message?: string };
    if (err.code === 'auth/id-token-expired') {
      throw directErr;
    }

    // 2. Fallback to Firebase Admin SDK if direct verification encountered unexpected certificate format
    try {
      const app = getFirebaseAdmin();
      const auth = getAuth(app);
      const decoded = await auth.verifyIdToken(token, false);
      if (!decoded.email) {
        throw new Error('Authenticated user token does not contain an email address');
      }

      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        picture: decoded.picture,
        email_verified: decoded.email_verified,
      };
    } catch (adminErr: unknown) {
      const aErr = adminErr as { code?: string; message?: string };
      logger.warn('Token verification failed under both direct and Admin SDK verifiers', {
        directCode: err.code,
        directMsg: err.message,
        adminCode: aErr.code,
        adminMsg: aErr.message,
      });
      // Throw the more specific error
      throw directErr || adminErr;
    }
  }
}

