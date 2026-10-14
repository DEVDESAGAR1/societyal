# SocietyFix AI — IAM & Secrets Management Guide

> **Document ID:** SEC-IAM-001  
> **Target Services:** Google Secret Manager & Cloud IAM  
> **Principle:** Separation of Duties & Absolute Least Privilege

---

## 1. Service Account Identity Architecture

```mermaid
graph TD
    subgraph "CI/CD & Deployment Identities"
        CB_SA[Cloud Build Service Account\n`societyfix-builder@PROJECT.iam.gserviceaccount.com`]
    end

    subgraph "Runtime Workload Identities"
        CR_SA[Cloud Run Service Account\n`societyfix-ENV-runner@PROJECT.iam.gserviceaccount.com`]
        SCHED_SA[Cloud Scheduler Service Account\n`societyfix-ENV-sched@PROJECT.iam.gserviceaccount.com`]
    end

    subgraph "Google Cloud Resources"
        SM[(Secret Manager Secrets)]
        SQL[(Cloud SQL PostgreSQL)]
        GCS[(Cloud Storage Bucket)]
        TASKS[Cloud Tasks Queues]
        RUN[Cloud Run Revisions]
    end

    CB_SA -->|Deploy Revisions| RUN
    CB_SA -->|Push Images| AR[(Artifact Registry)]

    CR_SA -->|roles/secretmanager.secretAccessor| SM
    CR_SA -->|roles/cloudsql.client| SQL
    CR_SA -->|roles/storage.objectAdmin| GCS
    CR_SA -->|roles/cloudtasks.enqueuer| TASKS
    CR_SA -->|roles/logging.logWriter| LOGS[(Cloud Logging)]

    SCHED_SA -->|roles/run.invoker (OIDC)| RUN
```

---

## 2. Least-Privilege IAM Roles Matrix

| Identity | Assigned IAM Role | Resource Scope | Purpose |
| :--- | :--- | :--- | :--- |
| `societyfix-{env}-runner` | `roles/secretmanager.secretAccessor` | Specific secret resources only | Read database passwords & API keys at startup |
| `societyfix-{env}-runner` | `roles/cloudsql.client` | Cloud SQL instance | Authorize Unix socket / private proxy connection |
| `societyfix-{env}-runner` | `roles/storage.objectAdmin` | `societyfix-{env}-documents-*` bucket | Read/write tenant documents |
| `societyfix-{env}-runner` | `roles/cloudtasks.enqueuer` | `societyfix-{env}-tasks` queue | Push async processing jobs |
| `societyfix-{env}-runner` | `roles/logging.logWriter` | Project | Emit structured JSON application logs |
| `societyfix-{env}-sched` | `roles/run.invoker` | `societyfix-{env}-api` Cloud Run service | Dispatch cron trigger webhooks |
| Cloud Build SA | `roles/run.admin` | `societyfix-{env}-api` service | Deploy updated container revisions |
| Cloud Build SA | `roles/artifactregistry.writer` | Artifact Registry repository | Push newly built container images |

---

## 3. Secret Manager Inventory & Secrets Configuration

All sensitive parameters are stored in Google Secret Manager and injected into Cloud Run as environment variables via `value_source.secret_key_ref`:

| Secret Name Template | Description | Value Example (Masked) |
| :--- | :--- | :--- |
| `societyfix-{env}-database-url` | Full PostgreSQL connection string | `postgresql://societyfix_app:***@/societyfix_prod?host=/cloudsql/PROJECT:REGION:INSTANCE` |
| `societyfix-{env}-gemini-api-key` | Google AI Studio Gemini API Key | `AIzaSy...` |
| `societyfix-{env}-firebase-admin-config` | Firebase Admin SDK Service Account JSON | `{"type": "service_account", "project_id": "..."}` |

### Creating Initial Secret Values via CLI
```bash
# 1. Create and populate database URL secret
gcloud secrets versions add societyfix-prod-database-url \
    --data-file=/path/to/secure/database-url.txt \
    --project=societyfix-prod

# 2. Create and populate Gemini API key secret
gcloud secrets versions add societyfix-prod-gemini-api-key \
    --data-file=/path/to/secure/gemini-key.txt \
    --project=societyfix-prod
```

---

## 4. Secret Rotation Procedure (Zero Downtime)

When rotating database passwords or API keys:
1. Generate the new credential in PostgreSQL or Google AI Studio.
2. Add a new version to the Secret Manager secret:
   ```bash
   echo -n "NEW_SECRET_VALUE" | gcloud secrets versions add societyfix-prod-database-url --data-file=-
   ```
3. Cloud Run automatically pins the `latest` version on new revision deployments. Trigger a rolling revision update:
   ```bash
   gcloud run services update societyfix-prod-api --region=asia-south1
   ```
4. Confirm health probes pass on new revision.
5. Revoke the old credential in the upstream system.
