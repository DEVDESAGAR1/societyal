# ADR-006: Event-Driven Background Processing via Google Cloud Tasks and Cloud Scheduler

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal Infrastructure Architect, Systems Engineer

---

## Context
SocietyFix AI requires asynchronous and periodic background processing for:
1. Long-running AI operations (transcribing large audio files, generating multi-page meeting minutes, batch embedding document chunks).
2. Asynchronous outbound dispatches (email notifications, WhatsApp alerts, push notifications).
3. Periodic cron jobs (daily morning digests at 07:00 IST, SLA escalation checks for overdue tasks, maintenance bill late-fee calculations).

We considered:
- Option A: In-memory queues (e.g., BullMQ with Redis).
- Option B: Google Cloud Pub/Sub with dedicated worker microservices.
- Option C: Google Cloud Tasks (push queues) + Google Cloud Scheduler targeting Cloud Run HTTP endpoints.

## Decision
We decided on **Option C: Google Cloud Tasks + Google Cloud Scheduler**.

### Rationale:
1. **Serverless & Zero Infrastructure Overhead:**
   - BullMQ requires running, monitoring, patching, and paying for a high-availability Redis instance (Memorystore), which does not scale to zero.
   - Cloud Tasks is a fully managed, serverless push-queue service with a generous free tier (1 million calls/month) that scales dynamically from zero to thousands of tasks.
2. **Seamless Cloud Run Integration:**
   - Cloud Tasks uses **HTTP Target Push Queues**. When a task is enqueued, Cloud Tasks delivers an HTTP POST request directly to the Cloud Run backend (`POST /api/internal/tasks/process-meeting-audio`).
   - This eliminates the need to run separate worker containers or daemons; the same modular monolith handles both synchronous API traffic and asynchronous tasks.
3. **Resilience & Rate Control:**
   - Built-in exponential backoff, configurable retry limits (e.g. 5 retries), and Dead-Letter Queue (DLQ) support.
   - Queue-level concurrency controls allow us to rate-limit AI operations (e.g., max 10 concurrent calls to prevent model quota exhaustion).
4. **Scheduled Cron Triggering:**
   - Cloud Scheduler triggers periodic maintenance tasks via OIDC-authenticated HTTP requests directly to Cloud Run endpoints (`POST /api/internal/cron/daily-sla-check`).

## Consequences

### Positive:
- Zero persistent queue servers or Redis clusters to manage.
- Immediate scale-to-zero when no background jobs are running.
- Cryptographic security: Internal task endpoints verify the `X-CloudTasks-QueueName` and Google OIDC bearer token, blocking external requests.
- Automatic retries with exponential backoff on transient AI API failures.

### Negative / Trade-offs:
- Maximum HTTP execution timeout for Cloud Tasks calling Cloud Run is 30 minutes (well beyond our standard 2–3 minute audio chunk processing requirement).
- Testing locally requires a local queue emulator or direct synchronous dispatch fallback in development mode.
