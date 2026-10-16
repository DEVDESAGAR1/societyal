# Security Specification for Firestore Rules

> Document ID: FIRESTORE-SEC-001  
> Architecture: Attribute-Based Access Control (ABAC) & Zero-Trust Security  
> Target Project: `hack2skillnewproject`

---

## 1. Data Invariants

1. **User Ownership Invariant:** A user document at `/users/{userId}` can only be read or written if `request.auth.uid == userId` or if `isAdmin()`.
2. **Identity Integrity:** On user creation, `incoming().id` must match `request.auth.uid`, and `incoming().email` must match `request.auth.token.email`.
3. **No Self-Assigned Privileges:** Normal users cannot create or update `/admins/{adminId}` documents. Admin documents are strictly managed by existing administrators or backend integrations.
4. **Connection Test Invariant:** `/test/{testId}` allows reading for client connectivity verification, but write access is restricted to authenticated users.
5. **Temporal Invariant:** `createdAt` is immutable after creation, and `updatedAt` must be set to `request.time`.

---

## 2. The Dirty Dozen Payloads (Adversarial Security Tests)

1. **Payload 1 (Ghost Field / Shadow Update):** Submitting `{ isSuperAdmin: true }` inside `/users/{userId}` during update -> **MUST FAIL** (`affectedKeys().hasOnly()` check).
2. **Payload 2 (ID Spoofing):** User A creates a document at `/users/{userB_id}` with their own credentials -> **MUST FAIL** (`request.auth.uid == userId`).
3. **Payload 3 (Unauthenticated Read):** Anonymous client reads `/users/{userId}` -> **MUST FAIL** (`isSignedIn()` required).
4. **Payload 4 (Admin Elevation):** Standard user writes to `/admins/{their_uid}` -> **MUST FAIL** (`isAdmin()` required).
5. **Payload 5 (Oversized ID Injection):** Target path `/users/{1.5KB_long_string}` -> **MUST FAIL** (`isValidId()` constraint).
6. **Payload 6 (Oversized Payload):** Inserting 100KB string into `fullName` -> **MUST FAIL** (`data.fullName.size() <= 255`).
7. **Payload 7 (Unverified Email Write):** Client with `email_verified == false` attempts write -> **MUST FAIL** (`request.auth.token.email_verified == true`).
8. **Payload 8 (Immutability Violation):** Updating `createdAt` timestamp to past date -> **MUST FAIL** (`incoming().createdAt == existing().createdAt`).
9. **Payload 9 (Account Status Manipulation):** User attempting to self-reactivate a `SUSPENDED` status -> **MUST FAIL** (`isAdmin()` required for status modification).
10. **Payload 10 (Null Request Resource on Delete):** Trying to delete admin document without admin privileges -> **MUST FAIL**.
11. **Payload 11 (Blanket Collection Scrape):** Executing broad collection list query on `/users` -> **MUST FAIL** (List queries must enforce `resource.data.id == request.auth.uid` or `isAdmin()`).
12. **Payload 12 (Foreign DB Cross-Access):** Request targeting document with unmatched database prefix -> **MUST FAIL**.
