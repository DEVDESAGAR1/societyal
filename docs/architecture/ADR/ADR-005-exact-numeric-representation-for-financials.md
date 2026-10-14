# ADR-005: Exact Numeric Representation for Financial Values (Integer Minor Units in Paise)

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal Database Architect, FinTech Security Engineer

---

## Context
Housing societies collect and disburse millions of rupees annually across maintenance bills, sinking funds, repair funds, vendor work orders, and statutory taxes (GST, TDS).

In software engineering, floating-point numbers (`FLOAT`, `DOUBLE`, JavaScript `number` based on IEEE 754) suffer from binary representation errors (e.g., `0.1 + 0.2 === 0.30000000000000004`). In financial accounting, these rounding errors compound over thousands of transactions, leading to unbalanced trial balances, audit discrepancies, and legal liabilities with the Registrar of Cooperative Societies.

## Decision
We decided that **all monetary amounts across SocietyFix AI must be stored, transmitted, and computed using exact integer minor units (paise in Indian Rupees: 1 INR = 100 paise)** as 64-bit integers (`BIGINT` in PostgreSQL).

### Implementation Rules:
1. **Database Schema:** Every financial column is named with the suffix `_paise` and typed as `BIGINT NOT NULL DEFAULT 0` (e.g., `amount_paise`, `subtotal_amount_paise`, `gst_amount_paise`, `budget_allocated_paise`).
2. **PostgreSQL Column Prohibition:** The use of `FLOAT`, `REAL`, or `DOUBLE PRECISION` for currency fields is strictly prohibited and enforced via database schema reviews and Drizzle ORM typing.
3. **Application Layer:**
   - In Node.js / TypeScript, financial computations are performed on integers or using `BigInt` / `Dinero.js` / `decimal.js` for multiplication by tax percentages.
   - Conversion to user-facing Rupee strings (`₹1,250.50`) is performed exclusively at the presentation boundary (frontend UI formatters) using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
4. **Rounding Invariants:** Any tax or fee calculation that produces fractional paise must explicitly declare its rounding mode (`HALF_UP` or `FLOOR`) in domain code.

## Consequences

### Positive:
- Mathematical certainty: 100% exact ledger reconciliation down to zero paise.
- Zero floating-point drift across millions of journal entries.
- Native high performance: integer arithmetic is faster and uses less CPU/memory than arbitrary-precision string math.
- Complete compliance with statutory financial audit standards under Indian Cooperative Societies Acts.

### Negative / Trade-offs:
- Engineers must remain mindful to multiply Rupee inputs by 100 before storing and divide by 100 before display. This is mitigated by domain value-object helpers (`Money.fromRupees(150)`, `Money.toRupeesString(amountPaise)`).
