/**
 * SocietyFix AI — Private Document Storage Client & Signed URL Generator
 * Interacts with private Google Cloud Storage buckets enforcing tenant-scoped prefixes:
 * `societies/<societyId>/<category>/<fileId>`
 */

import { logger } from './logger.ts';

export interface SignedUrlRequest {
  societyId: string;
  category: 'meetings' | 'invoices' | 'evidence' | 'documents' | 'complaints';
  fileName: string;
  contentType: string;
  action: 'read' | 'write';
  expiresInSeconds?: number;
}

export interface StoragePolicy {
  bucketName: string;
  enforceUniformBucketLevelAccess: boolean;
  publicAccessPrevention: 'enforced';
}

export class StorageService {
  private bucketName: string;

  constructor(bucketName?: string) {
    this.bucketName = bucketName || process.env.GCS_DOCUMENTS_BUCKET || 'societyfix-dev-documents';
  }

  /**
   * Constructs a strictly sanitized, tenant-isolated object path.
   */
  public buildTenantPath(societyId: string, category: string, fileName: string): string {
    // Sanitize parameters to avoid path traversal (e.g. ../)
    const safeSocietyId = societyId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFileName = fileName
      .replace(/(\.\.[\/\\])+/g, '')
      .replace(/\.\./g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/^\.+/, ''); // Remove leading dots

    if (!safeSocietyId || !safeCategory || !safeFileName) {
      throw new Error('Invalid path parameters for tenant storage');
    }

    return `societies/${safeSocietyId}/${safeCategory}/${safeFileName}`;
  }

  /**
   * Generates a signed URL for secure, short-lived client uploads or downloads.
   * In a real GCP environment with Google Cloud Storage SDK / credentials,
   * this generates a v4 signed URL with 15-minute expiration.
   */
  public async getSignedUrl(request: SignedUrlRequest): Promise<{
    url: string;
    objectPath: string;
    expiresAt: string;
  }> {
    const objectPath = this.buildTenantPath(request.societyId, request.category, request.fileName);
    const expirationSeconds = request.expiresInSeconds || 900; // 15 minutes default
    const expiresAt = new Date(Date.now() + expirationSeconds * 1000).toISOString();

    logger.info('Generating storage signed URL', {
      societyId: request.societyId,
      action: request.action,
      objectPath,
      bucket: this.bucketName,
      expirationSeconds
    });

    // In a live GCP Cloud Run environment, the @google-cloud/storage library
    // uses Compute Engine / Cloud Run service account credentials to sign the URL.
    // For M1 foundation, we provide the deterministic signed URL contract:
    const baseUrl = `https://storage.googleapis.com/${this.bucketName}/${objectPath}`;
    const signedUrl = `${baseUrl}?auth_action=${request.action}&expires=${Math.floor(Date.now() / 1000) + expirationSeconds}&signature=mock_gcp_signed_token`;

    return {
      url: signedUrl,
      objectPath,
      expiresAt,
    };
  }
}

export const storageService = new StorageService();
