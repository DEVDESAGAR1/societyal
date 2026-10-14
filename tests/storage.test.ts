import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StorageService } from '../src/infrastructure/storage.ts';

describe('StorageService Tenant Isolation Tests', () => {
  const storage = new StorageService('test-documents-bucket');

  it('correctly constructs tenant-isolated GCS path', () => {
    const path = storage.buildTenantPath('soc_123', 'meetings', 'm_456_notes.pdf');
    assert.strictEqual(path, 'societies/soc_123/meetings/m_456_notes.pdf');
  });

  it('sanitizes malicious directory traversal attempts', () => {
    const path = storage.buildTenantPath('../../etc', 'passwd', '../../../secrets.txt');
    // Path traversal characters like ../ and / are stripped by regex sanitization
    assert.strictEqual(path, 'societies/etc/passwd/secrets.txt');
    assert.ok(!path.includes('..'), 'Path must not contain traversal dots');
  });

  it('throws an error if parameters collapse to empty strings after sanitization', () => {
    assert.throws(() => {
      storage.buildTenantPath('!!!', '$$$', '***');
    }, /Invalid path parameters/);
  });

  it('generates signed URL with expiration and tenant path', async () => {
    const result = await storage.getSignedUrl({
      societyId: 'soc_alpha',
      category: 'invoices',
      fileName: 'inv_001.pdf',
      contentType: 'application/pdf',
      action: 'read',
      expiresInSeconds: 300,
    });

    assert.ok(result.url.includes('societies/soc_alpha/invoices/inv_001.pdf'));
    assert.ok(result.url.includes('auth_action=read'));
    assert.strictEqual(result.objectPath, 'societies/soc_alpha/invoices/inv_001.pdf');
  });
});
