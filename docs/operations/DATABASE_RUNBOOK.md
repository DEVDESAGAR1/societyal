# SocietyFix AI — Cloud SQL Database Runbook

> **Document ID:** RUNBOOK-DB-001  
> **Target Engine:** PostgreSQL 16 (Google Cloud SQL)  
> **Security Baseline:** Private IP only, TLS 1.3 enforced, IAM Database Auth, pgaudit enabled

---

## 1. Connection Architecture & Cloud Run Sizing

```mermaid
flowchart LR
    CloudRun[Cloud Run Container Instances\nMax 20 Instances] -->|Serverless VPC Access\nConnector: soc-prod-con| VPC[Google VPC Network\n10.30.0.0/24]
    VPC -->|Private Services Access\n(VPC Peering 10.30.0.0/20)| CloudSQL[(Cloud SQL PostgreSQL 16\nPrivate IP: 10.30.x.x)]
    
    subgraph "Connection Pooling Math"
        Pool["pg.Pool max: 10 connections per container\nMax Cloud Run instances: 20\nTotal Peak Connections: 200\nCloud SQL max_connections: 500"]
    end
```

### Connection Pool Configuration
- **Max Connections per Container:** 10 connections (`DATABASE_MAX_CONNECTIONS="10"`).
- **Idle Timeout:** 30,000 ms.
- **Connection Timeout:** 5,000 ms.
- **Why this sizing?** Cloud Run can auto-scale up to 20 instances in production. With 10 connections per instance, maximum concurrent connections to PostgreSQL will not exceed 200, well below Cloud SQL's default limit of 500 connections for `db-custom-4-15360`, preventing pool starvation or `FATAL: too many connections for role` crashes.

---

## 2. Database Creation & Provisioning Procedure

When applying Terraform in a new environment:
```bash
# 1. Ensure Private Services Access peering is established
gcloud compute addresses create societyfix-prod-psa-range \
    --global \
    --purpose=VPC_PEERING \
    --prefix-length=20 \
    --network=societyfix-prod-vpc

gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=societyfix-prod-psa-range \
    --network=societyfix-prod-vpc

# 2. Provision Cloud SQL instance via Terraform
cd infra/terraform/environments/prod
terraform apply -target=module.cloud_sql
```

---

## 3. Database Migration Procedures

Migrations are managed via Drizzle Kit and executed programmatically via `src/db/migrate.ts`.

### 3.1 Local Development Migrations
```bash
# Generate SQL migration files from src/db/schema.ts
npm run db:generate

# Apply migrations against local/dev database
npm run db:migrate
```

### 3.2 CI/CD & Production Migrations
Production migrations are executed via a dedicated Cloud Run Job or Cloud Build pre-deployment step:
```bash
# Run migration job using Cloud Run Jobs with VPC connector
gcloud run jobs create societyfix-db-migrate \
    --image=asia-south1-docker.pkg.dev/societyfix-prod/societyfix-prod/api:latest \
    --region=asia-south1 \
    --vpc-connector=soc-prod-con \
    --set-secrets=DATABASE_URL=societyfix-prod-database-url:latest \
    --command="node,--import,tsx,src/db/migrate.ts"

# Execute the migration job
gcloud run jobs execute societyfix-db-migrate --region=asia-south1 --wait
```

---

## 4. Backup & Point-in-Time Recovery (PITR)

### 4.1 Automated Backup Schedule
- **Frequency:** Automated daily backup window starting at 02:00 UTC (07:30 AM IST).
- **Retention:** 30 days retained backups in Production, 7 days in Staging and Development.
- **Write-Ahead Logging (WAL):** Continuous WAL archiving enabled for point-in-time recovery to any second in the past 7 days.

### 4.2 Point-in-Time Recovery Procedure
If accidental data corruption occurs (e.g. incorrect administrative bulk update):
```bash
# 1. Identify target recovery timestamp (e.g., 2026-10-14T05:30:00Z)
RECOVERY_TIMESTAMP="2026-10-14T05:30:00Z"

# 2. Restore to a new Cloud SQL instance (never overwrite in place directly)
gcloud sql instances clone societyfix-prod-pg16 societyfix-prod-pg16-restored \
    --point-in-time=$RECOVERY_TIMESTAMP

# 3. Verify restored data integrity in societyfix-prod-pg16-restored
# 4. Update Secret Manager `societyfix-prod-database-url` to point to the new instance
# 5. Redeploy Cloud Run service to connect to restored database
```

---

## 5. Security Invariants & Audit Logging

- **pgaudit Extension:** Enabled via database flag `cloudsql.enable_pgaudit=on`.
- **Logged Events:** All DDL (table creations/alterations) and ROLE statements (grant/revoke) are logged automatically to Google Cloud Logging.
- **SSL Enforcement:** Cloud SQL rejects unencrypted connections (`require_ssl=true`).
