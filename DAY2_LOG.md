# Day 2 Execution Log — RFQ, Vendor Evaluation, and Purchase Orders

## Overview
Day 2 builds upon the Day 1 foundation by implementing the full procurement execution lifecycle:
**Purchase Requisition (Approved) → RFQ → Comparative Statement (CS) → Purchase Order (PO) → Amendments & Closure**, with every gate from SOP §8.4 and §8.5 enforced server-side.

---

## 1. Database Migrations
Created `supabase/migrations/20260918000002_day2_rfq_cs_po.sql` establishing 8 core tables with Default-DENY Row Level Security (RLS) policies and number generation sequences:

1. `rate_contracts`: Tracks 6-month validity periods (per DECISIONS.md Q8), category, approved rates JSONB, and vendor references.
2. `rfqs`: Sequence-backed (`RFQ-YYYY-NNNN`), mandatory `pr_id` FK, `required_min_quotations` loaded from `approval_matrix_rules`, response deadline, and status lifecycle (`draft`, `sent`, `closed`, `cancelled`).
3. `rfq_vendors`: Eliminates legacy free-text email solicitations; tracks invited empanelled `vendor_id`, `sent_at`, and `response_received_at`.
4. `quotation_lines`: Granular line-item pricing (unit price, taxes, quantity, total), delivery timeline (days), warranty (months), and technical compliance flag (`meets_technical_spec`, `technical_remarks`).
5. `comparative_statements`: Sequence-backed (`CS-YYYY-NNNN`), `recommended_vendor_id`, `recommended_total`, `is_lowest_price`, mandatory `non_lowest_rationale` (enforced when `is_lowest_price = false`), authority routing, and status lifecycle (`draft`, `submitted`, `approved`, `rejected`).
6. `cs_line_scores`: Stores 4-pillar vendor scoring (price, technical, delivery, warranty) and ranks for committee evaluation.
7. `purchase_orders`: Sequence-backed (`PO-YYYY-NNNN`), mandatory `pr_id` FK, `cs_id` FK, `vendor_id` FK, type (`regular` or `rate_contract`), rate contract reference, scope of supply, price, taxes, generated `total_value`, and status lifecycle (`draft`, `pending_approval`, `approved`, `issued`, `amended`, `closed`, `partially_closed`, `cancelled`).
8. `po_amendments`: Full audit log of purchase order amendments (`old_value_total`, `new_value_total`, `reason`, `requires_reapproval`, `original_approver_role`, `new_approver_role`, `status`).

---

## 2. Server Functions & Enforcement Gates

### RFQ Engine (`src/lib/procurement/rfq.functions.ts` & `src/server/procurement/rfq.functions.ts`)
- `createRfq`: Calls `guards.assertPrApproved` — strictly blocks RFQ creation if the requisition is not in `approved` status.
- `sendRfq`: Requires selection of at least `required_min_quotations` (from matrix rule) empanelled vendors. Validates each vendor with `assertVendorEmpanelled` and rejects if fewer are selected (F4 rule).
- `recordQuotationResponse`: Captures quotation lines with taxes, unit pricing, delivery days, warranty, and technical spec compliance.
- `checkTechnicalCompliance`: Records technical evaluation remarks and compliance flags.
- `listRfqs`: Queries RFQs with linked PR and vendor responses.

### Comparative Statement Engine (`src/lib/procurement/cs.functions.ts` & `src/server/procurement/cs.functions.ts`)
- `prepareComparativeStatement`:
  - Validates that RFQ has at least `required_min_quotations` responses that passed the technical compliance check.
  - **SOP §7.2 Non-Lowest Price Rule**: Enforces that if `recommended_vendor_id` is not the lowest bidder among compliant quotes, `non_lowest_rationale` is strictly required and cannot be empty.
  - Evaluates authority routing using `authorityMatrix.resolveApprover` (e.g. ₹60,000 item routes to EVP because it exceeds Purchase Committee's ₹50,000 monthly limit).
  - Populates `cs_line_scores` for ranking.
- `approveCs`: Enforces server-side role check matching `cs.current_approver_role` or admin.
- `rejectCs`: Transitions status to `rejected` with mandatory audit remarks.
- `listComparativeStatements`: Queries CS evaluations with joined vendors and scores.

### Purchase Order Engine (`src/lib/procurement/po.functions.ts` & `src/server/procurement/po.functions.ts`)
- `createPo`:
  - Blocks regular POs unless a Comparative Statement is `approved`.
  - Blocks rate contract POs unless an active, non-expired `rate_contract` exists.
  - Verifies `assertVendorEmpanelled`.
  - Verifies `assertNoPoSplitting` for cumulative PR totals and 30-day rolling window checks.
  - Routes approval through `authorityMatrix.resolveApprover`.
- `approvePo`: Re-derives caller's roles server-side against `po.current_approver_role`.
- `issuePo`: Blocks issuing unless PO is `approved`, then dispatches notifications to User Dept, Stores, and Finance.
- `amendPo`:
  - Re-evaluates authority matrix for the new total value.
  - If the amended value crosses the original approver's tier limit (e.g., ₹8,000 → ₹15,000 crossing the Principal's ₹10,000 threshold), `requires_reapproval` is set to `true`, `new_approver_role` escalates to the higher tier (Purchase Committee / EVP), and PO status resets to `pending_approval`.
  - Records an immutable amendment log entry in `po_amendments`.
- `closePo`: Closes or partially closes PO.

### PO-Splitting & 30-Day Window Guard (`src/server/procurement/guards.ts`)
- `assertNoPoSplitting`:
  1. Checks cumulative PO values raised against a PR against the approved requisition value.
  2. Checks 30-day rolling window: Aggregates active POs for the same vendor/department within 30 days. If the combined value would require a higher approval tier than the individual PO received, it blocks the order and requires an approved deviation (`deviation_approvals`).

### Unified Approvals Inbox (`src/lib/procurement/approvals.functions.ts`)
- `getMyPendingApprovals`: Server-side role resolution returning PRs, CSs, POs, and Amendments awaiting authorization by the logged-in user's active matrix roles.

---

## 3. UI Screens & Routes
- **RFQ Management** (`/procurement/rfqs` — `src/pages/procurement/RfqManagement.tsx`):
  - Pick from Approved Vendor List only (empanelled + active).
  - Minimum vendor count warning and live validation.
  - Line-item quotation response modal with delivery timeline, warranty, and technical spec compliance checkbox.
- **Comparative Statements** (`/procurement/cs` — `src/pages/procurement/ComparativeStatements.tsx`):
  - Multi-vendor quotation comparison table with technical compliance badges.
  - Recommendation picker with conditional, mandatory non-lowest price rationale textarea.
  - Live authority matrix routing badge.
  - 1-click Approve and Reject actions with audit remarks.
- **Purchase Orders** (`/procurement/orders` — `src/pages/procurement/PurchaseOrders.tsx`):
  - Regular (CS-backed) and Rate Contract PO creation.
  - Order issuance action with notification trigger.
  - Amendment dialog with live threshold breach warnings.
  - Amendment history cards.
- **My Approvals Inbox** (`/procurement/approvals` — `src/pages/procurement/MyApprovals.tsx`):
  - Unified tabbed inbox for PRs, CSs, POs, and Amendments.
  - Re-derives user's matrix roles and enables fast, auditable approvals.
- **Navigation & Hub** (`Layout.tsx`, `ProcurementHub.tsx`):
  - Added direct links to all Day 1 & Day 2 procurement lifecycle steps.

---

## 4. Definition of Done (DoD) Verification Results

All 7 Definition of Done scenarios verified via automated test script `scripts/verify_day2.mjs`:

| # | Scenario | Expected Gate | Result |
|---|---|---|---|
| 1 | Create RFQ against unapproved PR | Blocked with `pr_not_approved` | ✅ Passed |
| 2 | Send RFQ to fewer than minimum vendors | Blocked with `min_vendors_not_met` | ✅ Passed |
| 3 | Submit CS with non-lowest vendor without rationale | Blocked with `non_lowest_rationale_required` | ✅ Passed |
| 4 | CS for ₹60,000 item evaluation | Routes to EVP (exceeds PC ₹50k cap) | ✅ Passed |
| 5 | Create PO without approved CS or active RC | Blocked with `cs_not_approved` / `rc_expired` | ✅ Passed |
| 6 | Amend PO from ₹8,000 to ₹15,000 | Escalates to Purchase Committee & `requires_reapproval=true` | ✅ Passed |
| 7 | Split ₹18,000 requirement into two ₹9,000 POs to same vendor in 30 days | Blocked with `po_splitting_window` | ✅ Passed |

### Build & Type Safety
- `npx tsc --noEmit`: 0 errors.
- `npm run build`: 0 errors (production Nitro bundle generated in 1.28s).
