/**
 * SocietyFix AI — Foundation Database Schema (Milestone M1)
 * Establishes baseline schema tracking and system metadata without speculative business tables.
 * Business domain tables (societies, users, meetings, tasks) will be introduced in M2+.
 */

import { pgTable, uuid, varchar, timestamp, text, jsonb } from 'drizzle-orm/pg-core';

/**
 * System metadata and schema version registry table.
 * Used for database health checks, infrastructure provisioning verification, and migration status.
 */
export const systemMetadata = pgTable('system_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SystemMetadata = typeof systemMetadata.$inferSelect;
export type NewSystemMetadata = typeof systemMetadata.$inferInsert;
