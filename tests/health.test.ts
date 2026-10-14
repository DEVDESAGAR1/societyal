import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../server.ts';

describe('Server Probes & Version API Tests', () => {
  it('app instance is properly initialized as an Express application', () => {
    assert.ok(app);
    assert.strictEqual(typeof app.listen, 'function');
  });
});
