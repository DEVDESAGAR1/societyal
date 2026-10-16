/**
 * SocietyFix AI — Database Schema
 * Milestone M1: System metadata
 * Milestone M2: Internal user identity and platform super admin directory
 */

import { pgTable, uuid, varchar, timestamp, text, jsonb, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';

/**
 * System metadata and schema version registry table.
 */
export const systemMetadata = pgTable('system_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Account status lifecycle enum
 */
export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'SUSPENDED', 'DISABLED']);

/**
 * Global User Directory (Synchronized from Firebase Auth)
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  phoneNumber: varchar('32'),
  preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('en'),
  accountStatus: varchar('account_status', { length: 30 }).notNull().default('ACTIVE'),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Platform Super Administrators (Product-wide authority, not society-scoped)
 */
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  grantedBy: varchar('granted_by', { length: 255 }).notNull().default('SYSTEM_BOOTSTRAP'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Housing Societies Directory (Multi-Tenant Root Entity)
 * Milestone M3: Tenant boundary definition
 */
export const societies = pgTable('societies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }).notNull(),
  country: varchar('country', { length: 50 }).notNull().default('India'),
  societyType: varchar('society_type', { length: 50 }).notNull().default('HOUSING_COOPERATIVE'),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 32 }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Society Memberships and Roles
 * Milestone M3: RBAC and membership lifecycle
 */
export const societyMemberships = pgTable('society_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('RESIDENT'),
  status: varchar('status', { length: 30 }).notNull().default('PENDING'),
  unitNumber: varchar('unit_number', { length: 50 }),
  wing: varchar('wing', { length: 50 }),
  memberType: varchar('member_type', { length: 50 }).notNull().default('OWNER'),
  notes: text('notes'),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Society Security Audit Logs
 * Milestone M3: Tamper-evident administrative audit trail
 */
export const societyAuditLogs = pgTable('society_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Society Memory Items
 * Milestone M4: Tenant-isolated knowledge base for AI Grounding and Retrieval
 */
export const societyMemoryItems = pgTable('society_memory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull().default('OTHER'), // 'BYE_LAWS', 'MEETING_MINUTES', 'RESOLUTION', 'CIRCULAR', 'VENDOR_RULE', 'MAINTENANCE_GUIDE', 'OTHER'
  content: text('content').notNull(),
  sourceReference: varchar('source_reference', { length: 255 }), // e.g. "Model Bye-laws 2014, Rule 168", "AGM Dec 2024"
  tags: jsonb('tags').$type<string[]>().default([]),
  embedding: jsonb('embedding').$type<number[]>(), // Stored vector representation
  isAiGenerated: boolean('is_ai_generated').default(false).notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * AI Execution Telemetry & Quota Accounting
 * Milestone M4: Meters token usage, latency, and schema validation reliability per society
 */
export const aiRuns = pgTable('ai_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  operationName: varchar('operation_name', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'gemini', 'gemma', 'mock'
  model: varchar('model', { length: 100 }).notNull(),
  promptTokens: integer('prompt_tokens').default(0).notNull(),
  completionTokens: integer('completion_tokens').default(0).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'SUCCESS', 'FAILED', 'REPAIRED'
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Housing Society Meetings
 * Milestone M5: Structured meeting capture and lifecycle management
 */
export const meetings = pgTable('meetings', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  meetingType: varchar('meeting_type', { length: 50 }).notNull().default('MANAGING_COMMITTEE'), // 'MANAGING_COMMITTEE', 'ANNUAL_GENERAL_MEETING', 'SPECIAL_GENERAL_MEETING', 'INFORMAL_DISCUSSION'
  status: varchar('status', { length: 50 }).notNull().default('SCHEDULED'), // 'SCHEDULED', 'IN_PROGRESS', 'MINUTES_DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ARCHIVED', 'CANCELLED'
  scheduledStartTime: timestamp('scheduled_start_time', { withTimezone: true }).notNull(),
  scheduledEndTime: timestamp('scheduled_end_time', { withTimezone: true }),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
  location: varchar('255'),
  isVirtual: boolean('is_virtual').notNull().default(false),
  meetingLink: text('meeting_link'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedRevisionId: uuid('approved_revision_id'),
  approvalNotes: text('approval_notes'),
  publishedToMemoryId: uuid('published_to_memory_id').references(() => societyMemoryItems.id, { onDelete: 'set null' }),
  publishedToMemoryAt: timestamp('published_to_memory_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Agenda Items
 * Milestone M5: Ordered agenda items
 */
export const meetingAgendaItems = pgTable('meeting_agenda_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes'),
  presenterName: varchar('presenter_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Attendees & Quorum Tracking
 * Milestone M5: Expected vs actual attendance
 */
export const meetingAttendees = pgTable('meeting_attendees', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  roleOrTitle: varchar('role_or_title', { length: 100 }).default('RESIDENT'),
  attendanceStatus: varchar('attendance_status', { length: 50 }).notNull().default('EXPECTED'), // 'EXPECTED', 'ATTENDED', 'ABSENT', 'EXCUSED'
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Sources & Raw Notes Provenance
 * Milestone M5: Tamper-evident source preservation
 */
export const meetingSources = pgTable('meeting_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull().default('TEXT_NOTES'), // 'TEXT_NOTES', 'TRANSCRIPT', 'AUDIO_RECORDING'
  title: varchar('title', { length: 255 }).notNull(),
  rawContent: text('raw_content').notNull(),
  contentHash: varchar('content_hash', { length: 128 }), // SHA-256 hash for provenance
  audioStoragePath: text('audio_storage_path'),
  audioMimeType: varchar('audio_mime_type', { length: 100 }),
  audioDurationSeconds: integer('audio_duration_seconds'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Minutes Revisions
 * Milestone M5: Versioned draft minutes with explicit review and approval
 */
export const meetingMinutesRevisions = pgTable('meeting_minutes_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  revisionNumber: integer('revision_number').notNull().default(1),
  status: varchar('status', { length: 50 }).notNull().default('DRAFT'), // 'DRAFT', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'
  executiveSummary: text('executive_summary').notNull(),
  keyDiscussions: jsonb('key_discussions').default([]), // array of { topic, summary, sentiment }
  openQuestions: jsonb('open_questions').default([]), // array of strings
  isAiGenerated: boolean('is_ai_generated').notNull().default(true),
  aiModelUsed: varchar('ai_model_used', { length: 100 }),
  sourceVersionIds: jsonb('source_version_ids').default([]),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Proposed Action Items
 * Milestone M5: Proposed actions extracted from discussions (not committed tasks)
 */
export const meetingProposedActions = pgTable('meeting_proposed_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  revisionId: uuid('revision_id').references(() => meetingMinutesRevisions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  suggestedAssigneeName: varchar('suggested_assignee_name', { length: 255 }),
  suggestedRole: varchar('suggested_role', { length: 100 }),
  priority: varchar('priority', { length: 50 }).notNull().default('MEDIUM'),
  suggestedDeadlineDays: integer('suggested_deadline_days').default(7),
  dueDate: timestamp('due_date', { withTimezone: true }),
  estimatedCostPaise: integer('estimated_cost_paise'),
  dependencies: jsonb('dependencies').default([]),
  status: varchar('status', { length: 50 }).notNull().default('PROPOSED'), // 'PROPOSED', 'ACCEPTED', 'REJECTED', 'MODIFIED'
  reviewerNotes: text('reviewer_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Meeting Proposed Decisions / Resolutions
 * Milestone M5: Draft decisions requiring formal committee approval
 */
export const meetingProposedDecisions = pgTable('meeting_proposed_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  revisionId: uuid('revision_id').references(() => meetingMinutesRevisions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  agendaItemRef: varchar('agenda_item_ref', { length: 255 }),
  proposedByName: varchar('proposed_by_name', { length: 255 }),
  secondedByName: varchar('seconded_by_name', { length: 255 }),
  recommendedStatus: varchar('recommended_status', { length: 50 }).notNull().default('PASSED_UNANIMOUSLY'),
  isStatutory: boolean('is_statutory').notNull().default(false),
  reviewStatus: varchar('review_status', { length: 50 }).notNull().default('PROPOSED'), // 'PROPOSED', 'CONFIRMED_IN_NOTES', 'FORMALLY_APPROVED', 'REJECTED'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SystemMetadata = typeof systemMetadata.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type Society = typeof societies.$inferSelect;
export type NewSociety = typeof societies.$inferInsert;
export type SocietyMembership = typeof societyMemberships.$inferSelect;
export type NewSocietyMembership = typeof societyMemberships.$inferInsert;
export type SocietyAuditLog = typeof societyAuditLogs.$inferSelect;
export type NewSocietyAuditLog = typeof societyAuditLogs.$inferInsert;
export type SocietyMemoryItem = typeof societyMemoryItems.$inferSelect;
export type NewSocietyMemoryItem = typeof societyMemoryItems.$inferInsert;
export type AIRun = typeof aiRuns.$inferSelect;
export type NewAIRun = typeof aiRuns.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type MeetingAgendaItem = typeof meetingAgendaItems.$inferSelect;
export type NewMeetingAgendaItem = typeof meetingAgendaItems.$inferInsert;
export type MeetingAttendee = typeof meetingAttendees.$inferSelect;
export type NewMeetingAttendee = typeof meetingAttendees.$inferInsert;
export type MeetingSource = typeof meetingSources.$inferSelect;
export type NewMeetingSource = typeof meetingSources.$inferInsert;
export type MeetingMinutesRevision = typeof meetingMinutesRevisions.$inferSelect;
export type NewMeetingMinutesRevision = typeof meetingMinutesRevisions.$inferInsert;
export type MeetingProposedAction = typeof meetingProposedActions.$inferSelect;
export type NewMeetingProposedAction = typeof meetingProposedActions.$inferInsert;
export type MeetingProposedDecision = typeof meetingProposedDecisions.$inferSelect;
export type NewMeetingProposedDecision = typeof meetingProposedDecisions.$inferInsert;

