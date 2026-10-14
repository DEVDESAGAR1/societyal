# SocietyFix AI — Infrastructure Inventory & Resource Catalog

> **Document ID:** INV-001  
> **Status:** Milestone M1 Baseline  
> **Target Region:** `asia-south1` (Mumbai, India)

---

## 1. Managed Google Cloud Services Catalog

| Service Category | GCP Product | Resource Name Template | Purpose |
| :--- | :--- | :--- | :--- |
| **Compute** | Cloud Run (Fully Managed) | `societyfix-{env}-api` | Hosts modular monolith Express API and SPA static assets |
| **Database** | Cloud SQL for PostgreSQL 16 | `societyfix-{env}-pg16` | Relational business data, ACID transactions, `pgvector` embeddings |
| **Object Storage** | Google Cloud Storage | `societyfix-{env}-documents-{project_id}` | Private tenant files, meeting audio, signed URL access |
| **Container Registry** | Artifact Registry | `societyfix-{env}` | Immutable Docker container images tagged with git commit SHA |
| **Networking** | VPC & Cloud Router | `societyfix-{env}-vpc` | Private isolated network for database and backend communication |
| **Serverless VPC Access** | VPC Access Connector | `soc-{env}-con` | Bridges Cloud Run serverless compute into VPC private IP range |
| **Secrets Management** | Secret Manager | `societyfix-{env}-{secret_name}` | Encrypted secret storage for DB credentials, API keys, certificates |
| **Async Queues** | Cloud Tasks | `societyfix-{env}-tasks` | Serverless HTTP push queues for asynchronous meeting & alert jobs |
| **Job Scheduler** | Cloud Scheduler | `societyfix-{env}-daily-sla-check` | Automated daily cron triggering task SLA escalation checks |
| **Observability** | Cloud Logging & Monitoring | `projects/{project_id}` | Centralized JSON logs, metrics, alerts, and SLO tracking |

---

## 2. Service Identities (IAM)

| Service Account ID | Display Name | Associated IAM Roles |
| :--- | :--- | :--- |
| `societyfix-{env}-runner` | SocietyFix Cloud Run Service Account | `roles/secretmanager.secretAccessor`<br/>`roles/cloudsql.client`<br/>`roles/storage.objectAdmin`<br/>`roles/cloudtasks.enqueuer`<br/>`roles/logging.logWriter`<br/>`roles/monitoring.metricWriter` |
| `societyfix-{env}-sched` | SocietyFix Cloud Scheduler Service Account | `roles/run.invoker` |
| Cloud Build Builder | Cloud Build Default Identity | `roles/run.admin`<br/>`roles/artifactregistry.writer`<br/>`roles/iam.serviceAccountUser` |

---

## 3. Network IP Address Allocations

| Network Entity | CIDR Range | Allocation Purpose |
| :--- | :--- | :--- |
| **Development VPC Subnet** | `10.10.0.0/24` | Primary internal subnet for development services |
| **Dev Serverless VPC Connector** | `10.10.1.0/28` | Dedicated /28 block for dev VPC connector |
| **Staging VPC Subnet** | `10.20.0.0/24` | Primary internal subnet for staging services |
| **Staging VPC Connector** | `10.20.1.0/28` | Dedicated /28 block for staging VPC connector |
| **Production VPC Subnet** | `10.30.0.0/24` | Primary internal subnet for production services |
| **Production VPC Connector** | `10.30.1.0/28` | Dedicated /28 block for production VPC connector |
| **Private Services Access (Cloud SQL)** | `10.X.0.0/20` | Reserved global internal range for Cloud SQL VPC peering |
