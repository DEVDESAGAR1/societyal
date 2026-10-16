# SocietyFix AI — Firebase Authentication & Super Admin Setup Runbook

> **Document ID:** RUNBOOK-AUTH-001  
> **Milestone ID:** M2 — Google Sign-In, User Identity and Platform Super Admin  
> **Target Services:** Firebase Authentication (Google Sign-In), Cloud SQL PostgreSQL 16

---

## 1. Firebase Authentication Setup

### 1.1 Enabling Google Sign-In in Firebase Console
1. Navigate to the **[Firebase Console](https://console.firebase.google.com/)** and select your project (`societyfix-dev`, `societyfix-staging`, or `societyfix-prod`).
2. Go to **Build** > **Authentication** > **Sign-in method**.
3. Click on **Google** under Additional providers.
4. Toggle **Enable**.
5. Select the project public-facing support email (e.g. `devdesagar@gmail.com`).
6. Click **Save**.

### 1.2 Authorized Domains Configuration
Under **Authentication** > **Settings** > **Authorized domains**, ensure the following domains are added:
- `localhost` (for local development)
- The Cloud Run service URL: `*.run.app`
- Your custom domains (e.g., `app.societyfix.ai`)

### 1.3 Client Web SDK Credentials
1. Go to **Project Settings** > **General** > **Your apps** > Select or add the Web app (`</>`).
2. Copy the credentials into your `.env` file:
```bash
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="societyfix-dev.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="societyfix-dev"
VITE_FIREBASE_APP_ID="1:..."
```

---

## 2. Server-Side Token Verification (Firebase Admin SDK)

In Google Cloud Run, the backend verifies tokens using **Application Default Credentials (ADC)** natively tied to the Cloud Run service account (`societyfix-{env}-runner`), with zero private key files required.

For local development or environments outside Google Cloud:
- You may set `FIREBASE_PROJECT_ID="societyfix-dev"`.
- Or download a service account JSON key from Firebase Console > **Project Settings** > **Service accounts** and provide it via:
  ```bash
  FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
  ```

---

## 3. Platform Super Admin Provisioning Procedures

To prevent security breaches, client self-promotion is strictly blocked. Two trusted server-side mechanisms are supported:

### Method A: Environment Allowlist (`SUPER_ADMIN_EMAILS`) — Recommended
Configure the comma-separated list of authorized administrator emails in Secret Manager or environment variables:
```bash
SUPER_ADMIN_EMAILS="devdesagar@gmail.com,admin@societyfix.ai"
```
When a user with an allowlisted email signs in through Google:
1. The backend cryptographically verifies their Google email claim.
2. The user is automatically provisioned into the `platform_admins` table.
3. Their subsequent requests to `/api/admin/*` are authorized.

### Method B: One-Time Bootstrap Secret (`SUPER_ADMIN_BOOTSTRAP_SECRET`)
For environments where the operator's email is not known ahead of time:
1. Configure a high-entropy secret in Secret Manager:
   ```bash
   SUPER_ADMIN_BOOTSTRAP_SECRET="generate-a-strong-32-char-random-secret"
   ```
2. The operator signs in with Google, obtaining a valid session.
3. The operator executes a signed bootstrap request:
   ```bash
   curl -X POST https://your-app-url/api/auth/bootstrap \
     -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"bootstrapSecret": "generate-a-strong-32-char-random-secret"}'
   ```
4. Upon successful validation, the user's UUID and email are permanently elevated in `platform_admins`.

---

## 4. Account Lifecycle & Administrative Actions

### Account Status State Machine
```
[User First Sign-In] ──────────► [ACTIVE]
                                    │
                  Admin Suspends    │    Admin Reactivates
                  User              ▼    Account
                                [SUSPENDED]
                                    │
                                    ▼
                                [DISABLED]
```

- **ACTIVE:** Standard state. User can access the API and view their profile.
- **SUSPENDED / DISABLED:** Immediate block. The backend authentication middleware checks `users.account_status` in real-time on every API request. If suspended, the request is terminated with `HTTP 403 Forbidden`. Re-signing into Google does **not** reset or bypass a suspended status.

---

## 5. Database Migration & Rollback Runbook (M2)

### Forward Migration
To apply the M2 schema (`users` and `platform_admins` tables):
```bash
npm run db:migrate
```

### Rollback Procedure (Emergency Only)
If rollback to M1 is required:
```sql
BEGIN;
DROP TABLE IF EXISTS platform_admins CASCADE;
DROP TABLE IF EXISTS users CASCADE;
UPDATE system_metadata SET value = 'M1_FOUNDATION', updated_at = clock_timestamp() WHERE key = 'SCHEMA_VERSION';
COMMIT;
```
