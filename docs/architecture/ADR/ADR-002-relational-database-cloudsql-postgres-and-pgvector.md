# ADR-002: Cloud SQL for PostgreSQL 16 with pgvector for Relational and Semantic Storage

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal Database Designer, Solutions Architect

---

## Context
SocietyFix AI requires:
1. Strong relational integrity with foreign keys and ACID transactions for housing society legal records, statutory resolutions, member registries, and financial ledgers.
2. Vector similarity search capabilities for "Society Memory" (semantic search over meeting minutes, bye-laws, circulars, and historical decisions).

We considered:
- Option A: PostgreSQL for relational data + a dedicated external vector database (e.g., Pinecone, Milvus, Qdrant).
- Option B: Document database (e.g., MongoDB, Firestore) with search indexes.
- Option C: Google Cloud SQL for PostgreSQL 16 with native `pgvector` extension for both relational data and vector embeddings.

## Decision
We decided on **Option C: Google Cloud SQL for PostgreSQL 16 with the native `pgvector` extension**.

### Rationale:
1. **Single Source of Truth:** Housing society data is fundamentally relational. Having flats, occupants, meetings, and resolutions in PostgreSQL provides immediate referential integrity.
2. **Atomic Multi-Tenant Vector Search:** Standalone vector databases struggle with multi-tenancy because vector similarity cannot easily be joined with tenant filtering at the storage engine level without either leaky pre-filtering or slow post-filtering. In `pgvector`, the search query executes as:
   ```sql
   SELECT chunk_content, metadata 
   FROM document_embeddings 
   WHERE society_id = :authenticatedSocietyId 
   ORDER BY embedding <=> :queryVector LIMIT 5;
   ```
   This guarantees that cross-tenant vector data can never be returned.
3. **Operational Simplicity & Cost Efficiency:** No need to manage, sync, monitor, or pay for a secondary vector database cluster. Google Cloud SQL natively supports `pgvector` with HNSW and IVFFlat index types out of the box.
4. **Data Consistency:** When a meeting or document is deleted or updated, its corresponding vector embeddings are cascaded or updated within the same relational transaction (`ON DELETE CASCADE`), preventing orphan vector references.

## Consequences

### Positive:
- Simplified architecture with zero distributed data synchronization issues.
- Native support for ACID transactions across relational metadata and vector embeddings.
- Full backup, point-in-time recovery (PITR), and high-availability managed natively by Google Cloud SQL.
- High performance (sub-10ms similarity queries with HNSW indexing).

### Negative / Trade-offs:
- HNSW index construction consumes memory in PostgreSQL. For societies with millions of document chunks, memory sizing must be monitored.
- Highly specialized vector operations (e.g., hybrid sparse-dense reciprocal rank fusion) require SQL query composition.
