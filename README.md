# SocietyFix AI

> **"Every discussion becomes an action. Every action gets tracked. Nothing gets forgotten."**  
> AI-powered operating platform and autonomous executive secretary for Indian housing societies.

---

## 🏛️ Project Overview

SocietyFix AI is an intelligent, secure, and multi-tenant operating platform designed for Indian Cooperative Housing Societies (CHS), Resident Welfare Associations (RWA), and Apartment Owner Associations (AOA). It captures meetings and informal discussions, converts them into tracked action items, orchestrates committee workflows, empowers residents with voice-first complaint logging, and provides an intelligent, grounded "Society Memory" backed by strict tenant isolation and legal compliance.

---

## 📚 Milestone M0 Architectural Documentation Index

1. **[Product Specification](docs/architecture/PRODUCT_SPECIFICATION.md)** — Executive summary, 16 major operational domains, user personas, and regulatory compliance under Indian Cooperative Acts and the DPDP Act 2023.
2. **[System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)** — Modular monolith design on Google Cloud Run, Express API pipeline, Cloud SQL PostgreSQL, Cloud Storage, and Cloud Tasks.
3. **[Relational Data Model](docs/architecture/DATA_MODEL.md)** — Complete PostgreSQL DDL with foreign keys, compound tenant indexes, exact minor-unit currency (paise), pgvector embeddings, and audit trails.
4. **[RBAC & Security Matrix](docs/architecture/RBAC_MATRIX.md)** — Dual-tiered multi-tenant permission matrix, capability guard pattern, and pending member quarantine.
5. **[Threat Model & Risk Analysis](docs/architecture/THREAT_MODEL.md)** — STRIDE and OWASP Top 10 analysis, prompt injection defense, IDOR prevention, and financial invariants.
6. **[AI Gateway & Intelligence Architecture](docs/architecture/AI_GATEWAY_DESIGN.md)** — Provider-neutral gateway, Gemma/Gemini adapter, structured Zod schemas, RAG citation grounding, and safety barriers.
7. **[MVP Scope & Milestones (M0–M7)](docs/architecture/MVP_SCOPE.md)** — Phased milestone plan, entry/exit criteria, test gates, and deferred post-MVP scope.
8. **[Open-Source Evaluation](docs/architecture/OPEN_SOURCE_EVALUATION.md)** — Technical audit of OpenSociety, MyApartmentERP, pgvector, and Langfuse with clear reuse and adoption decisions.
9. **[Implementation Roadmap](docs/architecture/IMPLEMENTATION_ROADMAP.md)** — Step-by-step engineering sequence, risk mitigations, and environment promotion strategies.
10. **[Architecture Decision Records (ADRs)](docs/architecture/ADR/)** (ADR-001 through ADR-006).

---

## 🚀 Milestone M1 Operations & Infrastructure Index

1. **[Infrastructure as Code (Terraform)](infra/terraform/)** — Complete modular Terraform configuration for Dev, Staging, and Production (`modules/apis`, `iam`, `networking`, `cloud_sql`, `storage`, `cloud_run`, `cloud_tasks`, `cloud_scheduler`, `secrets`, `monitoring`).
2. **[Database Runbook](docs/operations/DATABASE_RUNBOOK.md)** — Cloud SQL PostgreSQL 16 sizing, connection pooling math, migrations via Drizzle Kit, and point-in-time recovery (PITR).
3. **[Storage & Document Security Policy](docs/operations/STORAGE_POLICY.md)** — Uniform bucket-level access, public access prevention, 15-minute signed URL protocol, and 90-day audio auto-purge lifecycle.
4. **[IAM & Secrets Setup Guide](docs/operations/IAM_AND_SECRETS_SETUP.md)** — Workload identities, least-privilege IAM roles, Google Secret Manager inventory, and zero-downtime secret rotation.
5. **[Deployment & Rollback Runbook](docs/operations/DEPLOYMENT_AND_ROLLBACK.md)** — Staged pipeline (Dev -> Staging -> Prod), health verification, and < 60-second instant revision rollback.
6. **[Monitoring & Incident Response](docs/operations/MONITORING_AND_INCIDENTS.md)** — Structured Google Cloud Logging, SLIs/SLOs, alerting thresholds, and on-call troubleshooting workflows.
7. **[Reliability, Cost Controls & DR](docs/operations/DISASTER_RECOVERY_AND_COSTS.md)** — Cloud Run instance caps, Cloud SQL sizing, budget alerts ($50 Dev / $300 Prod), and disaster recovery drills.
8. **[Infrastructure Inventory](docs/operations/INFRASTRUCTURE_INVENTORY.md)** — Resource catalog, service accounts, and CIDR network allocations in `asia-south1`.
9. **[M1 Verification Report](docs/operations/M1_VERIFICATION_REPORT.md)** — Audit report with passing unit test results and pre-flight validation.

---

## 🛠️ Technology Stack Summary

| Layer | Selected Technology | Rationale & ADR Reference |
| :--- | :--- | :--- |
| **Compute & Hosting** | Google Cloud Run (Containerized Node.js) | Serverless, auto-scaling to zero, high concurrency, deployed in `asia-south1`. [ADR-001](docs/architecture/ADR/ADR-001-modular-monolith-vs-microservices.md) |
| **Frontend SPA** | React 19, TypeScript, Tailwind CSS v4, Motion, Lucide | High performance, rapid iteration, accessible micro-interactions. |
| **Backend Framework** | Node.js 22 LTS, Express, Drizzle ORM | Type-safe SQL, modular router topology, minimal cold starts. |
| **Identity & Auth** | Firebase Authentication (Google Sign-In) | Enterprise Google OAuth, zero password liability, internal relational RBAC. [ADR-003](docs/architecture/ADR/ADR-003-firebase-auth-and-multi-tenant-rbac.md) |
| **Database & Search** | Google Cloud SQL PostgreSQL 16 + `pgvector` | ACID transactions, strict multi-tenancy, sub-10ms semantic vector search. [ADR-002](docs/architecture/ADR/ADR-002-relational-database-cloudsql-postgres-and-pgvector.md) |
| **Document Storage** | Google Cloud Storage (GCS) | Encrypted private bucket, short-lived signed URLs, tenant prefixes. |
| **AI Gateway** | Gemma 2 & Gemini via `@google/genai` | Provider-neutral port, guaranteed Zod schemas, grounded RAG citations. [ADR-004](docs/architecture/ADR/ADR-004-provider-neutral-ai-gateway-and-gemma.md) |
| **Async Queues** | Google Cloud Tasks & Cloud Scheduler | Serverless push queues, exponential backoff, automated daily SLA cron. [ADR-006](docs/architecture/ADR/ADR-006-event-driven-background-processing-cloud-tasks.md) |
| **Secrets & Config** | Google Secret Manager | Centralized secret injection for DB credentials and API keys. |
| **Observability** | Google Cloud Logging, Cloud Monitoring | Centralized structured JSON logging and alert triggers. |

---

## 🚦 Milestone Status

- [x] **M0: Product Specification, Architecture and Technical Design** *(Completed)*
- [x] **M1: Google Cloud Foundation, CI/CD & Express Server Skeleton** *(Completed)*
- [ ] **M2: Google Sign-in & Platform Super Admin** *(Next Milestone)*
- [ ] **M3: Societies, Membership & Multi-Tenant RBAC**
- [ ] **M4: Provider-Neutral AI Gateway & Society Memory (pgvector)**
- [ ] **M5: Meeting Capture, Minutes & Resolution Extraction**
- [ ] **M6: Task & Commitment Management**
- [ ] **M7: Executive Dashboard, Notifications & Audit Trail (MVP Launch)**
