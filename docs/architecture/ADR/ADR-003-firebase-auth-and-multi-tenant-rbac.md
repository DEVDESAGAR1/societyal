# ADR-003: Firebase Authentication with Internal Multi-Tenant RBAC

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal Security Engineer, Software Architect

---

## Context
Housing societies require secure, frictionless resident authentication (predominantly via Google accounts and phone numbers) combined with complex, per-society role assignments:
- A user can belong to multiple societies (e.g., owner of Flat 302 in Society A and landlord of Flat 104 in Society B).
- A user can hold executive roles (Secretary, Treasurer) in one society and be a standard resident in another.
- Users must never be able to elevate their own privileges or access records before their resident membership is formally verified by the managing committee.

We evaluated:
- Option 1: Custom identity management (passwords, salt/hash, email verification in PostgreSQL).
- Option 2: Putting tenant roles directly into Firebase Custom Claims.
- Option 3: Firebase Authentication for identity (Google Sign-In), with internal multi-tenant membership and RBAC managed in PostgreSQL.

## Decision
We decided on **Option 3: Firebase Authentication for Identity + Internal Multi-Tenant RBAC in PostgreSQL**.

### Rationale:
1. **Frictionless Google Sign-In:** Firebase Auth provides out-of-the-box Google OAuth with secure token issuance, session refresh, and zero password-handling liability.
2. **Why NOT Firebase Custom Claims for Multi-Tenancy:**
   - Firebase Custom Claims are hard-capped at 1,000 bytes. Storing multi-society memberships, role arrays, flat assignments, and granular capabilities across multiple societies rapidly exceeds this byte limit.
   - Revoking or changing a user's role in a housing society (e.g., an urgent removal of a rogue Secretary) must take effect **instantly**. Firebase Custom Claims persist until the client token is refreshed (up to 1 hour), creating a dangerous security delay.
3. **Internal Relational RBAC:**
   - On each API request, the backend validates the Firebase ID token cryptographically to extract `firebase_uid`.
   - The user's active membership, current role, and capabilities for the requested `:societyId` are evaluated directly against the `society_memberships` table in PostgreSQL.
   - Any committee revocation or status change (`ACTIVE` -> `SUSPENDED`) takes effect immediately on the very next HTTP request.

## Consequences

### Positive:
- Instant revocation and role modification with zero caching delay.
- Unlimited role granularity and multi-society memberships without token payload size constraints.
- Secure, certified authentication handling by Google infrastructure.
- Complete auditability of membership state transitions in PostgreSQL.

### Negative / Trade-offs:
- Each authenticated request requires a fast database lookup to verify active membership and roles (mitigated by indexed compound lookup on `(society_id, user_id)` taking < 1ms).
