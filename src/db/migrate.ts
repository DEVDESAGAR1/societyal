/**
 * SocietyFix AI — Database Migration Runner
 * Executes database migrations and records schema version in system_metadata.
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getDatabasePool, closeDatabasePool } from './client.ts';
import { systemMetadata } from './schema.ts';
import { logger } from '../infrastructure/logger.ts';
import fs from 'fs';
import path from 'path';

export async function runMigrations() {
  logger.info('Starting database migration runner...');

  if (!process.env.DATABASE_URL) {
    logger.warn('DATABASE_URL is not set. Skipping database migrations.');
    return;
  }

  const pool = getDatabasePool();
  const db = getDb();

  try {
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    if (fs.existsSync(migrationsFolder)) {
      logger.info(`Applying migrations from ${migrationsFolder}...`);
      await migrate(db, { migrationsFolder });
      logger.info('Drizzle migrations completed successfully.');
    } else {
      logger.info('No migrations folder found at drizzle/. Initializing database extensions and baseline tables.');
      const client = await pool.connect();
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
        
        // Ensure baseline system_metadata table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS system_metadata (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key VARCHAR(100) NOT NULL UNIQUE,
            value TEXT NOT NULL,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );
        `);

        // Record initialization metadata
        await db.insert(systemMetadata).values({
          key: 'SCHEMA_VERSION',
          value: 'M1_FOUNDATION',
          details: { initializedAt: new Date().toISOString(), milestone: 'M1' }
        }).onConflictDoUpdate({
          target: systemMetadata.key,
          set: {
            value: 'M1_FOUNDATION',
            updatedAt: new Date(),
            details: { updatedBy: 'M1_MIGRATION_RUNNER' }
          }
        });

        logger.info('Database foundation initialization complete.');
      } finally {
        client.release();
      }
    }
  } catch (error) {
    logger.error('Failed to execute database migrations', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Allow direct CLI invocation: tsx src/db/migrate.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      await closeDatabasePool();
      process.exit(0);
    })
    .catch(async () => {
      await closeDatabasePool();
      process.exit(1);
    });
}
