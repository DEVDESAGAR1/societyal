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
    if (fs.existsSync(migrationsFolder) && fs.readdirSync(migrationsFolder).length > 0) {
      logger.info(`Applying migrations from ${migrationsFolder}...`);
      await migrate(db, { migrationsFolder });
      logger.info('Drizzle migrations completed successfully.');
    } else {
      logger.info('Initializing database extensions and baseline tables (M1 & M2 schema)...');
      const client = await pool.connect();
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
        
        // M1: Ensure system_metadata table exists
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

        // M2: Ensure users table exists with unique constraints and indexes
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            firebase_uid VARCHAR(128) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            avatar_url TEXT,
            phone_number VARCHAR(32),
            preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
            account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
            last_sign_in_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
        `);

        // M2: Ensure platform_admins table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS platform_admins (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            granted_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOTSTRAP',
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(email);
        `);

        // M3: Ensure societies table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS societies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) NOT NULL UNIQUE,
            address TEXT NOT NULL,
            city VARCHAR(100) NOT NULL,
            state VARCHAR(100) NOT NULL,
            postal_code VARCHAR(20) NOT NULL,
            country VARCHAR(50) NOT NULL DEFAULT 'India',
            society_type VARCHAR(50) NOT NULL DEFAULT 'HOUSING_COOPERATIVE',
            status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
            contact_email VARCHAR(255),
            contact_phone VARCHAR(32),
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_societies_slug ON societies(slug);
          CREATE INDEX IF NOT EXISTS idx_societies_status ON societies(status);
        `);

        // M3: Ensure society_memberships table exists with unique constraint
        await client.query(`
          CREATE TABLE IF NOT EXISTS society_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL DEFAULT 'RESIDENT',
            status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            unit_number VARCHAR(50),
            wing VARCHAR(50),
            member_type VARCHAR(50) NOT NULL DEFAULT 'OWNER',
            notes TEXT,
            reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_society_user UNIQUE (society_id, user_id)
          );

          CREATE INDEX IF NOT EXISTS idx_memberships_society_id ON society_memberships(society_id);
          CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON society_memberships(user_id);
          CREATE INDEX IF NOT EXISTS idx_memberships_status ON society_memberships(society_id, status);
        `);

        // M3: Ensure society_audit_logs table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS society_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
            actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            action VARCHAR(100) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_id VARCHAR(255) NOT NULL,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_audit_society_id ON society_audit_logs(society_id);
          CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON society_audit_logs(actor_user_id);
        `);

        // M4: Ensure society_memory_items table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS society_memory_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
            content TEXT NOT NULL,
            source_reference VARCHAR(255),
            tags JSONB DEFAULT '[]'::jsonb,
            embedding JSONB,
            is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
            created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_memory_society_id ON society_memory_items(society_id);
          CREATE INDEX IF NOT EXISTS idx_memory_category ON society_memory_items(society_id, category);
        `);

        // M4: Ensure ai_runs table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS ai_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            operation_name VARCHAR(100) NOT NULL,
            provider VARCHAR(50) NOT NULL,
            model VARCHAR(100) NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL,
            status VARCHAR(50) NOT NULL,
            error_message TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_ai_runs_society_id ON ai_runs(society_id);
          CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs(created_at);
        `);

        // M5: Ensure meetings table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meetings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            meeting_type VARCHAR(50) NOT NULL DEFAULT 'MANAGING_COMMITTEE',
            status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
            scheduled_start_time TIMESTAMPTZ NOT NULL,
            scheduled_end_time TIMESTAMPTZ,
            timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
            location VARCHAR(255),
            is_virtual BOOLEAN NOT NULL DEFAULT FALSE,
            meeting_link TEXT,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            approved_revision_id UUID,
            approval_notes TEXT,
            published_to_memory_id UUID REFERENCES society_memory_items(id) ON DELETE SET NULL,
            published_to_memory_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_meetings_society_id ON meetings(society_id);
          CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(society_id, status);
          CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_time ON meetings(society_id, scheduled_start_time);
        `);

        // M5: Ensure meeting_agenda_items table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_agenda_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            order_index INTEGER NOT NULL DEFAULT 0,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            duration_minutes INTEGER,
            presenter_name VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_agenda_meeting_id ON meeting_agenda_items(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_agenda_order ON meeting_agenda_items(meeting_id, order_index);
        `);

        // M5: Ensure meeting_attendees table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_attendees (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            role_or_title VARCHAR(100) DEFAULT 'RESIDENT',
            attendance_status VARCHAR(50) NOT NULL DEFAULT 'EXPECTED',
            joined_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_attendees_meeting_id ON meeting_attendees(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_attendees_user_id ON meeting_attendees(user_id);
        `);

        // M5: Ensure meeting_sources table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_sources (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            source_type VARCHAR(50) NOT NULL DEFAULT 'TEXT_NOTES',
            title VARCHAR(255) NOT NULL,
            raw_content TEXT NOT NULL,
            content_hash VARCHAR(128),
            audio_storage_path TEXT,
            audio_mime_type VARCHAR(100),
            audio_duration_seconds INTEGER,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_sources_meeting_id ON meeting_sources(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_sources_society_id ON meeting_sources(society_id);
        `);

        // M5: Ensure meeting_minutes_revisions table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_minutes_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            revision_number INTEGER NOT NULL DEFAULT 1,
            status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
            executive_summary TEXT NOT NULL,
            key_discussions JSONB DEFAULT '[]'::jsonb,
            open_questions JSONB DEFAULT '[]'::jsonb,
            is_ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
            ai_model_used VARCHAR(100),
            source_version_ids JSONB DEFAULT '[]'::jsonb,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            review_notes TEXT,
            rejection_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_revisions_meeting_id ON meeting_minutes_revisions(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_revisions_status ON meeting_minutes_revisions(meeting_id, status);
        `);

        // M5: Ensure meeting_proposed_actions table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_proposed_actions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            revision_id UUID REFERENCES meeting_minutes_revisions(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            suggested_assignee_name VARCHAR(255),
            suggested_role VARCHAR(100),
            priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
            suggested_deadline_days INTEGER DEFAULT 7,
            due_date TIMESTAMPTZ,
            estimated_cost_paise INTEGER,
            dependencies JSONB DEFAULT '[]'::jsonb,
            status VARCHAR(50) NOT NULL DEFAULT 'PROPOSED',
            reviewer_notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_actions_meeting_id ON meeting_proposed_actions(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_actions_status ON meeting_proposed_actions(meeting_id, status);
        `);

        // M5: Ensure meeting_proposed_decisions table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS meeting_proposed_decisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            revision_id UUID REFERENCES meeting_minutes_revisions(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            agenda_item_ref VARCHAR(255),
            proposed_by_name VARCHAR(255),
            seconded_by_name VARCHAR(255),
            recommended_status VARCHAR(50) NOT NULL DEFAULT 'PASSED_UNANIMOUSLY',
            is_statutory BOOLEAN NOT NULL DEFAULT FALSE,
            review_status VARCHAR(50) NOT NULL DEFAULT 'PROPOSED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
          );

          CREATE INDEX IF NOT EXISTS idx_decisions_meeting_id ON meeting_proposed_decisions(meeting_id);
          CREATE INDEX IF NOT EXISTS idx_decisions_review ON meeting_proposed_decisions(meeting_id, review_status);
        `);

        // Record schema version metadata
        await db.insert(systemMetadata).values({
          key: 'SCHEMA_VERSION',
          value: 'M5_MEETING_MANAGEMENT',
          details: { initializedAt: new Date().toISOString(), milestone: 'M5' }
        }).onConflictDoUpdate({
          target: systemMetadata.key,
          set: {
            value: 'M5_MEETING_MANAGEMENT',
            updatedAt: new Date(),
            details: { updatedBy: 'M5_MIGRATION_RUNNER' }
          }
        });

        logger.info('Database M5 schema migration complete (Meetings, Minutes Revisions, Proposed Decisions & Actions).');
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
