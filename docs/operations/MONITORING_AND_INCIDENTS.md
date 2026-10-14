# SocietyFix AI — Monitoring, Alerting & Incident Response Runbook

> **Document ID:** RUNBOOK-OPS-001  
> **Target Services:** Google Cloud Monitoring, Cloud Logging & Error Reporting  
> **On-Call Contact:** `devdesagar@gmail.com`

---

## 1. Observability Architecture & Metrics

SocietyFix AI emits structured JSON events directly to stdout, automatically parsed by Google Cloud Logging and surfaced on Google Cloud Monitoring dashboards.

### Key Monitored Service Level Indicators (SLIs)

| Indicator | Metric Name | Target SLO | Alert Condition |
| :--- | :--- | :--- | :--- |
| **Availability** | `run.googleapis.com/request_count` (by response code) | 99.9% Successful Requests | 5xx error rate > 2% over a 5-minute window |
| **Latency** | `run.googleapis.com/request_latencies` | P95 < 800ms | P95 latency > 2,000ms over 5 minutes |
| **DB CPU Load** | `cloudsql.googleapis.com/database/cpu/utilization` | Average < 60% | CPU utilization > 80% for 10 minutes |
| **DB Connections**| `cloudsql.googleapis.com/database/postgresql/num_backends` | < 60% of max limit | Active connections > 300 (out of 500 max) |
| **Storage Usage** | `storage.googleapis.com/storage/total_bytes` | Predictable growth | Growth rate > 50GB/day |

---

## 2. Redaction & PII Protection Guidelines

The `logger.ts` utility strictly redacts sensitive attributes before serializing to stdout:

```typescript
// Any key matching this set is replaced with '[REDACTED]' automatically:
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'cookie', 
  'apikey', 'gemini_api_key', 'pan', 'aadhaar', 'cvv'
]);
```

**Developer Rule:** Never log full resident phone numbers, national IDs (PAN/Aadhaar), raw meeting audio buffers, or full vendor invoice PDFs in application logs. Log only reference identifiers (`societyId`, `meetingId`, `taskId`, `userId`).

---

## 3. Incident Severity Levels & Response SLA

| Severity | Definition | Response SLA | Action Required |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core service down for all housing societies; data corruption; database unreachable. | **< 15 minutes** | Trigger instant rollback or failover; assemble incident team; notify status page. |
| **SEV-2 (High)** | Degradation affecting a specific society; background AI tasks failing; elevated 5xx rate. | **< 1 hour** | Check Cloud Logging error stack traces; inspect Cloud Tasks DLQ. |
| **SEV-3 (Medium)** | Non-critical feature bug; slow report generation; minor UI rendering glitch. | **< 24 hours** | Create issue ticket; deploy fix in next staged deployment. |

---

## 4. Incident Troubleshooting Guide

### Scenario 1: Cloud Run Service Returning 503 "Service Unavailable"
1. **Diagnosis:** Check if Cloud SQL database instance is reachable from the Serverless VPC Connector:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.message=~'Database health check failed'" --limit=10
   ```
2. **Mitigation:**
   - Verify VPC connector status: `gcloud compute vpc-access connectors describe soc-prod-con --region=asia-south1`.
   - If connector is healthy, check Cloud SQL instance status: `gcloud sql instances describe societyfix-prod-pg16`.
   - If connection pool is exhausted, restart Cloud Run revision to flush stale connections: `gcloud run services update societyfix-prod-api --region=asia-south1`.

### Scenario 2: Cloud Tasks Background Queue Backlog
1. **Diagnosis:** Check Cloud Tasks queue depth:
   ```bash
   gcloud tasks queues describe societyfix-prod-tasks --location=asia-south1
   ```
2. **Mitigation:**
   - If rate-limited by external AI API, inspect `ai_runs` table for `RATE_LIMITED` error codes.
   - Temporarily increase `max_dispatches_per_second` if the backend has capacity:
     ```bash
     gcloud tasks queues update societyfix-prod-tasks --max-dispatches-per-second=100 --location=asia-south1
     ```
