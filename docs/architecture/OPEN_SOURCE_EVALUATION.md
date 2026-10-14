# SocietyFix AI — Open-Source Project Evaluation & Technical Audit

> **Document ID:** RES-001  
> **Status:** Approved / Milestone M0 Baseline  
> **Evaluation Scope:** Technical due diligence on 4 specified open-source projects for potential code reuse, architectural referencing, or operational integration into SocietyFix AI.

---

## 1. Executive Summary & Evaluation Scorecard

| Project | Primary Function | License | Maintenance & Activity | Architectural Compatibility | Final Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`opencore-x/opensociety`** | Resident-centric gated community access platform | Open Source (TypeScript/React) | Active community project; CI/CD configured | **High** (TypeScript/Web) | **Reference Only:** Inspect domain models & gate access concepts; do not copy direct code due to monolithic coupling. |
| **`jyotisman/MyApartmentERP`** | Apartment ERP management system | Unverified / Inaccessible | Inactive / Deprecated / Inaccessible | **None** | **Reject:** Repository inaccessible or private. Domain concepts captured independently in our Data Model. |
| **`pgvector/pgvector`** | Vector similarity search extension for PostgreSQL | PostgreSQL / MIT License | Extremely Active (Industry standard, backed by major cloud providers) | **Native** (Runs in Cloud SQL PostgreSQL) | **Adopt as Primary Dependency:** Core vector search engine for Society Memory and RAG. |
| **`langfuse/langfuse`** | Open-source LLM observability & prompt management | MIT / FSL-1.1-MIT | Extremely Active (Rapid releases, strong community) | **High** (Node.js SDK, self-hostable or Cloud) | **Phase 2 Integration Candidate:** Use native `ai_runs` table in MVP; evaluate Langfuse for Phase 2 production observability. |

---

## 2. In-Depth Project Evaluations

### 2.1 OpenSociety (`opencore-x/opensociety`)
- **Repository URL:** https://github.com/opencore-x/opensociety
- **Project Purpose:** Open-source, resident-centric community access management platform built as an alternative to proprietary walled gardens (MyGate, NoBrokerHood) with emphasis on data ownership and privacy.
- **Repository State & Maintenance:** Active repository with CI workflows for build and type-checking on pull requests.
- **Technology Stack:** TypeScript, React, Node.js backend.
- **License & Commercial Obligations:** Permissive open-source license; requires proper copyright notices and attribution if any snippets are referenced.
- **Security & Quality Posture:** Good type safety via TypeScript. Access control is primarily focused on gate security and visitor logs rather than cooperative society governance, statutory meetings, or double-entry financial accounting.
- **Reusable Code vs. Reference Value:**
  - *Direct Code Reuse:* **0%**. The code is tightly coupled to their specific schema and client-side assumptions.
  - *Reference Value:* **High**. Valuable reference for Indian gated community domain entities (wings, flats, resident verification concepts, visitor status states).
- **Decision:** **Reference Only**. Do not fork or copy code. Maintain our clean modular architecture tailored for Indian cooperative housing society legislation (MCS Act / RERA).

### 2.2 MyApartmentERP (`jyotisman/MyApartmentERP`)
- **Repository URL:** https://github.com/jyotisman/MyApartmentERP
- **Project Purpose:** Historically developed apartment management / ERP system for residential societies.
- **Repository State & Maintenance:** Currently inaccessible or private on GitHub (returns 404 / no active public index).
- **License & Commercial Obligations:** Unknown / unverified.
- **Security & Quality Posture:** Cannot be audited; legacy codebases in this category often lack modern multi-tenant isolation, SQL injection guards, and cloud-native scaling.
- **Decision:** **Reject / Discard**. No dependencies or code references will be drawn from this project. Our relational data model (`DATA_MODEL.md`) already covers the complete billing and asset management domain rigorously.

### 2.3 pgvector (`pgvector/pgvector`)
- **Repository URL:** https://github.com/pgvector/pgvector
- **Project Purpose:** Open-source vector similarity search for PostgreSQL. Enables vector embeddings to be stored, indexed, and queried directly within PostgreSQL relational tables alongside standard business records.
- **Repository State & Maintenance:** Extremely active, mature, and widely adopted. Pre-installed as an official extension on Google Cloud SQL for PostgreSQL 15 and 16.
- **License & Commercial Obligations:** PostgreSQL License (compatible with MIT / BSD, fully permissive for commercial SaaS).
- **Architecture & Compatibility:** Perfect match. By using `pgvector`, SocietyFix AI completely avoids the architectural overhead, operational complexity, and financial cost of running a separate vector database (e.g., Pinecone, Milvus, Qdrant).
- **Performance Characteristics:**
  - Supports HNSW (Hierarchical Navigable Small World) and IVFFlat indexes.
  - Sub-10 millisecond cosine similarity searches across millions of document chunks.
  - Supports exact relational filtering in the same query (`WHERE society_id = :id AND cosine_distance < 0.35`), eliminating cross-tenant leakage risks common in standalone vector stores.
- **Decision:** **Adopt as Core Infrastructure**. Configured in Cloud SQL PostgreSQL for Milestone M4 (Society Memory).

### 2.4 Langfuse (`langfuse/langfuse`)
- **Repository URL:** https://github.com/langfuse/langfuse
- **Project Purpose:** Open-source LLM engineering platform offering tracing, prompt versioning, evaluation, and latency/cost monitoring.
- **Repository State & Maintenance:** Very active, backed by Y Combinator, with comprehensive TypeScript/Node.js SDKs.
- **License & Commercial Obligations:** FSL-1.1-MIT / Apache 2.0 depending on enterprise components.
- **Operational Overhead:** Running a self-hosted Langfuse cluster requires ClickHouse, PostgreSQL, and Redis, which introduces significant infrastructure overhead for an MVP.
- **Evaluation for MVP:**
  - SocietyFix AI's MVP requires simple, low-latency telemetry (token counts, latency, model version, and error rate), which is natively handled by our lightweight `ai_runs` PostgreSQL table.
  - Introducing Langfuse in M0–M7 adds unnecessary operational complexity.
- **Decision:** **Defer to Phase 2**. Build lightweight telemetry directly into the AI Gateway for MVP (M4–M7). Re-evaluate Langfuse Cloud or self-hosted deployment when scaling to multi-cluster production.

---

## 3. License Compliance & Code Reuse Policy

1. **Clean-Room Implementation:** All application code in SocietyFix AI will be written from first principles or imported from verified standard open-source npm packages (e.g., React, Express, Drizzle ORM, Zod, Lucide).
2. **Third-Party Code Copying Prohibited:** No source files or snippets from unverified third-party repositories will be pasted into the codebase.
3. **Dependency Scanning:** Automated dependency auditing (`npm audit`) and license compliance checks will be incorporated into the CI/CD pipeline in Milestone M1.
