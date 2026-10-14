# ADR-001: Adoption of Modular Monolith Architecture over Microservices

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal Software Architect, Engineering Lead

---

## Context
SocietyFix AI needs to manage complex, interrelated domains including multi-tenancy, authentication, meeting minutes, resolutions, task tracking, vendor workflows, billing, documents, and AI-driven society memory.

We evaluated two primary architectural patterns:
1. **Microservices Architecture:** Decomposing the system into independent services (Auth Service, Meeting Service, Task Service, Billing Service, AI Service).
2. **Modular Monolith Architecture:** Structuring the codebase as a single deployable application with strictly enforced internal bounded contexts, private domain modules, and shared relational database with tenant isolation.

## Decision
We decided to adopt a **Modular Monolith** architecture implemented in Node.js / TypeScript with Express and deployed to Google Cloud Run.

### Key Factors:
1. **Domain Interdependence:** Indian housing society operations have deep entity coupling (a resolution spawns tasks; a task references a committee member and a flat; a bill references an owner and a maintenance ledger). In microservices, this would necessitate complex distributed transactions (Saga pattern) or eventual consistency anomalies that are disastrous for financial records and statutory minutes.
2. **Operational Simplicity:** A single containerized deployment artifact drastically reduces operational overhead, eliminates network latency between internal service calls, simplifies CI/CD, and lowers Google Cloud hosting costs during MVP validation.
3. **Refactoring Velocity:** In early product phases, domain boundaries evolve quickly. Refactoring internal module boundaries within a monolith is orders of magnitude faster and safer than coordinating cross-repo API contracts and breaking schema migrations across microservice boundaries.
4. **Strict Modularity Enforcement:** Internal modules (`src/modules/meetings`, `src/modules/tasks`, `src/modules/auth`) communicate strictly through exported service interfaces, preventing spaghetti coupling while preserving transactional integrity.

## Consequences

### Positive:
- Single deployment unit to Google Cloud Run with zero cold-start overhead between microservice tiers.
- ACID transactions across relational boundaries (e.g., atomically approving meeting minutes, ratifying resolutions, and creating draft tasks in a single PostgreSQL transaction).
- Unified logging, tracing, and debugging in development and production.
- Extremely low operational cost for the MVP.

### Negative / Trade-offs:
- Entire application scales as a single unit on Cloud Run (mitigated by Cloud Run's efficient concurrency up to 80 requests per instance).
- Requires architectural discipline (linting rules and code reviews) to prevent circular dependencies between internal modules.

### Future Path:
If a specific subsystem (such as audio processing or high-throughput visitor gate logging) experiences divergent CPU/memory scaling profiles in the future, it can be extracted cleanly into an independent Cloud Run microservice because domain boundaries are already modularized.
