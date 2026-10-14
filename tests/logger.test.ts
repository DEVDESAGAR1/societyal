import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logger } from '../src/infrastructure/logger.ts';

describe('Structured Logger Tests', () => {
  it('exports log functions for debug, info, warn, error, critical', () => {
    assert.strictEqual(typeof logger.debug, 'function');
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.warn, 'function');
    assert.strictEqual(typeof logger.error, 'function');
    assert.strictEqual(typeof logger.critical, 'function');
  });

  it('safely handles logging with context without crashing', () => {
    assert.doesNotThrow(() => {
      logger.info('Test log event', {
        component: 'test_runner',
        societyId: 'soc_test',
        password: 'super_secret_value_123',
        authorization: 'Bearer eyJhbGciOi...',
      });
    });
  });
});
