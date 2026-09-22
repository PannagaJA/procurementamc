# DAY 1 LOG — Procurement Foundation Layer

**Date:** 2026-09-18  
**Status:** Complete

---

## 1. What Was Built

### A. Database Migrations (`supabase/migrations/20260918000001_day1_procurement_foundation.sql`)

- **Role Extensions:** Added `evp`, `director_admin_finance`, `purchase_committee`, `procurement_officer`, `procurement_executive`, `stores`, `finance` to `app_role` enum. Migrated stored `principle` role rows to canonical `principal`.
- **Vendor System (§8.2):** Created `vendors`, `vendor_documents`, `vendor_evaluations`, and `vendor_blacklist` with 1-year empanelment validity support.
- **Purchase Requisitions (§8.3):** Created `purchase_requisitions`, `pr_line_items`, `pr_approvals` with sequence-backed `PR-YYYY-NNNN` generator and complete SOP taxonomy categories.
- **Authority Matrix Engine (§6):** Created `approval_matrix_rules` (seeded with literal ₹10,000 cap per DECISIONS.md Q1), `department_monthly_spend`, `deviation_approvals`, and `procurement_config`.
- **Row-Level Security (RLS):** Default-deny with explicit grants on all 11 new tables.
- **Legacy Migration:** SQL migration copying legacy `tickets` (`issue_category = 'procure'`) into `purchase_requisitions` as `archived` with `source = 'legacy_ticket'`.

### B. Strongly-Typed Database Layer & Cleanup

- Generated complete, strongly-typed `src/integrations/supabase/types.ts` replacing the `Database = any` stub.
- Removed duplicate helper `src/lib/supabase.ts`, consolidated image & QR code utilities into `src/lib/inventoryApi.ts`, and updated all imports.
- Fixed 24 legacy page type mismatches (nullability and id types) across 11 components.

### C. Server-Enforced Logic Tier

- `src/lib/procurement/authorityMatrix.ts` & `src/server/procurement/authorityMatrix.ts`: Pure, table-driven `resolveApprover` engine. Fully unit-tested with zero hardcoded thresholds.
- `src/server/procurement/guards.ts`: `assertPrApproved`, `assertVendorEmpanelled`, `assertNoPoSplitting`, `assertThreeWayMatch`, `assertEmergencyCapNotExceeded`.
- `src/server/procurement/roles.ts` & `errors.ts`: Server-side role resolution and typed `ProcurementRuleError` hierarchy.
- `src/lib/procurement/pr.functions.ts` & `src/server/procurement/pr.functions.ts`: `createPr`, `previewRouting`, `reviewPr`, `approvePr`, `rejectPr`, `escalateToEvp`.
- `src/lib/procurement/vendors.functions.ts` & `src/server/procurement/vendors.functions.ts`: `applyEmpanelment`, `evaluateVendor`, `approveEmpanelment` (EVP only), `rejectEmpanelment`, `suspendVendor`, `blacklistVendor`.

### D. End-to-End Proof UI Screens

- **Raise Purchase Requisition Screen** (`/procurement/raise-pr`):
  - Dynamic line items with auto-computed net quantities to procure and line estimates.
  - Live Authority Matrix resolver preview showing instant routing feedback before submission.
- **Vendor Empanelment & EVP Approval Screen** (`/procurement/vendors`):
  - 3-step workflow: Statutory Application → 4-Pillar Committee Evaluation → Strict EVP Approval Gate.
  - Non-EVP approval attempts are rejected server-side with typed forbidden error.
- **Procurement Hub** (`/procurement`): Quick access hub linked in the global sidebar.

---

## 2. Verification Results

Automated tests in `scripts/verify_day1.mjs`:

- `₹1,500` in "Small Value" category → resolves to `HOD` (within ₹2,000 per-txn cap).
- `₹15,000` in "Equipment" category → escalates to `EVP` (exceeds ₹10,000 Purchase Committee per-txn cap).
- `₹4,500` in "Small Value" category → resolves to `Principal` / `Procurement Officer`.
- Monthly aggregate overflow → escalates to next band / EVP.
- Non-EVP user approval attempt → rejected server-side: `"You are not permitted to approve vendor empanelment. Required role: evp."`
- `npx tsc --noEmit` & `npm run build` → 0 errors, 100% build pass.

---

## 3. What's Deferred to Day 2+

- RFQ generation and quotation capture integration (§8.4).
- Purchase Order lifecycle, rate contract POs, and PO amendment flows (§8.5).
- Goods Receipt Notes (GRN) and 3-way matching invoice verification (§8.6, §8.7).
- Full replacement of legacy `ProcureRequest.tsx` & `PrincipalApprovals.tsx` (kept running in parallel for Day 1).

---

## 4. Schema & Architectural Decisions Made

- **Client/Server RPC Isolation:** Pure authority matrix logic lives isomorphically in `src/lib/procurement/` so UI components get instant live previews, while authoritative server actions reside in `createServerFn` handlers with server-only DB queries.
- **Role Normalization:** `principle` is normalized to `principal` across DB triggers, auth context, and server-side role resolution while remaining backward compatible.
