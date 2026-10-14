/**
 * SocietyFix AI — PostgreSQL Connection Pool & Drizzle ORM Client
 * Configured for Google Cloud SQL (Unix socket / private IP) and local development.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';
import { logger } from '../infrastructure/logger.ts';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabasePool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  const isSslRequired = process.env.DATABASE_SSL === 'true';
  const maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10', 10);

  if (!connectionString) {
    logger.warn('DATABASE_URL environment variable is not defined. Database operations will be mocked or fail.');
    // Return empty mock pool configuration for graceful degraded startup
    pool = new Pool({
      max: 1,
      idleTimeoutMillis: 5000,
    });
    return pool;
  }

  pool = new Pool({
    connectionString,
    max: maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected idle client error in PostgreSQL pool', {
      error: err.message,
      stack: err.stack,
    });
  });

  return pool;
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const p = getDatabasePool();
  dbInstance = drizzle(p, { schema });
  return dbInstance;
}

/**
 * Health check probe for PostgreSQL database connectivity.
 */
export async function checkDatabaseHealth(): Promise<{ status: 'HEALTHY' | 'UNHEALTHY' | 'UNCONFIGURED'; latencyMs: number; error?: string }> {
  if (!process.env.DATABASE_URL) {
    return { status: 'UNCONFIGURED', latencyMs: 0 };
  }

  const start = Date.now();
  try {
    const p = getDatabasePool();
    const client = await p.connect();
    try {
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { status: 'HEALTHY', latencyMs };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - start;
    logger.error('Database health check failed', { error: errorMsg, latencyMs });
    return { status: 'UNHEALTHY', latencyMs, error: errorMsg };
  }
}

/**
 * Closes the database pool during server shutdown.
 */
export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    logger.info('Draining and closing PostgreSQL connection pool...');
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}
