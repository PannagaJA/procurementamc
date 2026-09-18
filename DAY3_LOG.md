# Day 3 Execution Log — Fulfilment, Payment Gate, Emergency Procurement, Vendor Rating

## Overview
Day 3 closes the end-to-end procurement loop from approved Purchase Orders to Delivery, Inspection, Invoice Three-Way Matching, and Payment Gate. It also implements the statutory Emergency Procurement track with a hard ₹10,00,000 annual cap ledger, and the 6-pillar Vendor Performance Rating system with automated outcome band derivation and debarment enforcement (SOP §8.6, §8.7, §9, Annexure 4).

---

## 1. Database Migrations
Created `supabase/migrations/20260918000003_day3_fulfilment_payment_emergency_ratings.sql` establishing 8 core tables with Default-DENY Row Level Security (RLS) policies and number generation sequences:

1. `delivery_challans`: Tracks gate receipt, challan number, carrier info, package count, condition, and received timestamp.
2. `grns`: Sequence-backed (`GRN-YYYY-NNNN`), links `po_id` and `delivery_challan_id`, records gate security inspection sign-off, technical inspection sign-off, accepted value, rejection reason, and status lifecycle (`pending`, `accepted`, `rejected`).
3. `grn_lines`: Line-item verification tracking `qty_delivered`, `qty_accepted`, `qty_rejected`, unit price, and technical inspection remarks.
4. `invoices`: Links `po_id` FK (NOT NULL) and `vendor_id`, enforces `is_duplicate_check_passed` (unique `vendor_id + invoice_number`), stores GST details JSONB, match status (`pending`, `matched`, `on_hold`, `approved`, `paid`), hold reason, approval sign-off, and service PO completion certificate reference.
5. `payments`: Audit log of invoice disbursements (`amount`, `paid_at`, `payment_mode`, `payment_terms_ref`, `external_ref` UTR/Cheque reference, `paid_by`).
6. `emergency_annual_ledger`: Statutory ledger tracking `financial_year` (e.g. `2026-27`), `running_total`, and `cap_limit` (₹10,00,000). Updated atomically on approved emergency procurements.
7. `emergency_procurements`: Sequence-backed (`EP-YYYY-NNNN`), links `pr_id`, records `requested_by`, `estimated_cost`, `reason_standard_process_failed`, EVP approval lifecycle (`pending`, `approved`, `rejected`), `is_post_facto` flag, `quotations_obtained_count`, `price_reasonableness_note`, and `register_entry_at`.
8. `vendor_ratings`: Annexure 4 evaluation storing Sections A through F scores (0-100), `section_e_score` nullable for non-AMC vendors, computed `weighted_score`, `outcome` (`preferred`, `active`, `active_notice`, `suspended`, `debarred`), `review_period`, reviewer sign-off, countersignature, and mandatory EVP approval for debarment.

---

## 2. Server Functions & Enforcement Gates

### Goods Receipt Note (GRN) Engine (`src/lib/procurement/grn.functions.ts` & `src/server/procurement/grn.functions.ts`)
- `recordDelivery`: Records delivery challan from carrier/vendor at the security gate.
- `securityVerify`: Records gate security verification sign-off on package count and seal condition.
- `technicalVerify`: Records inspecting engineer technical verification sign-off for technical/asset categories.
- `createGrn`:
  - **Challan Requirement Gate**: Blocks GRN generation if no `delivery_challan_id` is linked (SOP §8.6).
  - **Inspection Gate**: Blocks GRN creation unless gate security and technical verification (when required) are signed off.
  - **Cumulative Quantity Protection**: Checks `cumulative_delivered_qty + new_delivery_qty` against `po.ordered_quantity` and rejects over-deliveries.
  - Computes total accepted value from line items.
- `listGrns`: Queries GRN records with joined PO, vendor, and challan metadata.

### Invoice & Three-Way Match Engine (`src/lib/procurement/invoice.functions.ts` & `src/server/procurement/invoice.functions.ts`)
- `submitInvoice`:
  - Enforces duplicate invoice check (`invoice_number + vendor_id`).
  - Automatically runs `runThreeWayMatch` upon receipt.
- `runThreeWayMatch`:
  - Pure rule comparator evaluating PO total committed value, GRN accepted value, and claimed invoice amount within tolerance.
  - **Discrepancy Capture**: If `invoice_amount > grn.accepted_value`, transitions `match_status = 'on_hold'` with a legible, human-readable discrepancy message stating exact amounts.
  - **Service PO Exception (Annexure I2)**: If `po.is_service_po === true` and `service_completion_cert_url` is provided, matches in lieu of physical GRN.
- `approveInvoice`:
  - **Match Gate**: Hard-blocks approval unless `match_status === 'matched'`.
  - Enforces Finance role authorization.
- `recordPayment`:
  - **Approval Gate**: Strictly blocks payment disbursement on any invoice not in `'approved'` status.
  - Records payment transaction with mode (NEFT/RTGS/Cheque/Direct) and external UTR reference.
  - Automatically updates Purchase Order status to `'closed'` (if fully paid) or `'partially_closed'`.
- `listInvoices`: Lists all invoices with match status, hold reasons, and payment status.

### Emergency Procurement Engine (`src/lib/procurement/emergency.functions.ts` & `src/server/procurement/emergency.functions.ts`)
- `checkAnnualCap`: Computes current FY running total against ₹10,00,000 statutory cap and returns headroom.
- `requestEmergencyProcurement`:
  - **Hard Annual Cap Gate**: Calls `checkAnnualCap` and **HARD BLOCKS** if `running_total + estimated_cost > 10,00,000` with explicit headroom details.
  - Enforces mandatory failure justification (`reason_standard_process_failed`).
- `approveEmergency`:
  - **EVP-Only Authority**: Re-derives caller roles and rejects any non-EVP user (HOD, Purchase Committee, Finance).
  - **48-Hour Post-Facto Rule**: If `is_post_facto === true`, validates that the authorization timestamp is within 2 working days (48 hours) of `register_entry_at`. Flagged and rejected if exceeded.
  - Atomically increments `emergency_annual_ledger.running_total`.
- `listEmergencyProcurements`: Queries emergency requests and FY ledger headroom.

### Vendor Performance Rating Engine (`src/lib/procurement/vendorRating.functions.ts` & `src/server/procurement/vendorRating.functions.ts`)
- `computeWeightedScore`:
  - Multiplies Section A (Quality - 25%), Section B (Delivery - 20%), Section C (Price - 15%), Section D (Service - 20%), Section E (AMC - 10%), Section F (Statutory - 10%).
  - **Section E N/A Proportional Redistribution**: If Section E is N/A (`null`), automatically redistributes weights proportionally over the remaining 90% (`unscaled / 0.90`).
- `deriveOutcome`:
  - Maps weighted score to Annexure 4 bands:
    - `≥ 85.0`: **Preferred Vendor** (eligible for multi-year rate contracts)
    - `70.0 – 84.99`: **Active / Regular** (standard RFQ inclusion)
    - `55.0 – 69.99`: **Active with Notice** (advisory issued)
    - `40.0 – 54.99`: **Suspended** (banned from new RFQs for 6 months)
    - `< 40.0`: **Debarred / Blacklisted** (formal removal from list)
- `submitVendorRating`:
  - **Debarment EVP Gate**: Requires `evp_approved_by` before setting outcome to `debarred`.
  - Automatically updates vendor record status in `vendors` table (`suspended` or `blacklisted`).
- **RFQ Vendor Selection Gate** (`src/lib/procurement/rfq.functions.ts`):
  - Actively blocks inviting or selecting `debarred` or `suspended` vendors in RFQs.

---

## 3. UI Screens & Navigation

1. **Delivery & GRN Hub** (`/procurement/grns` — `src/pages/procurement/GrnManagement.tsx`):
   - Record Delivery Challan from Gate with carrier & package inspection.
   - Dual-stage Sign-Off: Gate Security verification & Inspecting Engineer Technical sign-off.
   - Cumulative delivery tracking with over-delivery alerts.
   - Direct link from Purchase Orders.

2. **Invoice Management & Three-Way Match** (`/procurement/invoices` — `src/pages/procurement/InvoiceManagement.tsx`):
   - Visual 3-Way Match Matrix comparing PO Total ↔ GRN Accepted Value ↔ Claimed Invoice Amount.
   - Legible discrepancy badges highlighting exact mismatched amounts.
   - Service PO Completion Certificate preview & exception handling.
   - Finance Approval & Payment Disbursement recording with UTR reference.

3. **Emergency Procurement & Annual Cap Dashboard** (`/procurement/emergency` — `src/pages/procurement/EmergencyProcurement.tsx`):
   - Prominent ₹10,00,000 statutory cap gauge displaying Spent, Headroom, and Current FY utilization.
   - Emergency requisition modal with mandatory standard process failure justification.
   - EVP post-facto ratification modal with 48-hour compliance verification.

4. **Vendor Performance Ratings** (`/procurement/vendor-ratings` — `src/pages/procurement/VendorRatings.tsx`):
   - 6-section evaluation form with real-time score calculation and outcome band preview.
   - Section E N/A toggle with live proportional redistribution.
   - EVP sign-off modal for debarment/blacklisting actions.
   - Rating history breakdown per vendor.

5. **Approvals Inbox Expansion** (`/procurement/approvals` — `src/pages/procurement/MyApprovals.tsx`):
   - Added Matched Invoices tab for Finance Officers.
   - Added Emergency Authorizations tab for Executive Vice President.

6. **Global Navigation & Hub** (`src/components/Layout.tsx` & `src/pages/procurement/ProcurementHub.tsx`):
   - Fully linked 8-module P2P lifecycle workflow from PR → RFQ → CS → PO → GRN → Invoice → Emergency → Ratings.

---

## 4. Definition of Done Verification Matrix

All 7 required scenarios were verified using automated script `scripts/verify_day3.mjs`:

| # | Requirement | Implementation / Gate | Test Result |
|---|-------------|-----------------------|-------------|
| 1 | Cannot create GRN for PO with no delivery challan | `validateGrnCreation` checks `delivery_challan_id` and blocks | `PASS` |
| 2 | Cannot approve invoice whose amount doesn't match PO+GRN | `runThreeWayMatch` flags `on_hold` with legible reason; `approveInvoice` blocks | `PASS` |
| 3 | Cannot record payment on an unapproved invoice | `recordPayment` blocks unless status is `approved` | `PASS` |
| 4 | Emergency request pushing annual ledger past ₹10L is hard-blocked | `checkAnnualCap` strictly rejects > ₹10,00,000 with headroom message | `PASS` |
| 5 | Non-EVP cannot approve emergency; Post-facto > 48h rejected | `approveEmergency` enforces EVP role & 48h post-facto validation | `PASS` |
| 6 | Vendor ratings compute score & right outcome for all 5 bands | `computeWeightedScore` & `deriveOutcome` tested for Preferred, Active, Active Notice, Suspended, Debarred + Section E N/A | `PASS` |
| 7 | Debarred/suspended vendor cannot be selected in RFQ | `validateVendorSelectionForRfq` actively blocks non-active vendors | `PASS` |

### Test Run Output
```
====================================================
🧪 RUNNING DAY 3 VERIFICATION TESTS (SOP §8.6, §8.7, §9, Annexure 4)
====================================================

1. GRN & Delivery Challan Gate (§8.6)
  ✓ Creating a GRN without a recorded Delivery Challan is rejected.
  ✓ Creating a GRN that causes cumulative delivery to exceed PO quantity is rejected.

2. Three-Way Match & Discrepancy Detection (§8.7)
  ✓ Mismatched invoice (billed ₹50k vs GRN accepted ₹40k) is held with reason: "Three-way mismatch: Invoiced amount (₹50,000) exceeds GRN accepted value (₹40,000). Discrepancy: ₹10,000.".
  ✓ Approving an on-hold mismatched invoice is blocked by server gate.
  ✓ Service PO invoice without Work Completion Certificate is held.
  ✓ Service PO invoice with valid Completion Certificate matches successfully in lieu of GRN (Annexure I2).

3. Payment Gate on Approved Invoices (§8.7)
  ✓ Recording payment on an unapproved invoice is strictly blocked.
  ✓ Payment recorded on approved invoice successfully closes PO.

4. Emergency Procurement Hard Annual Cap (§9)
  ✓ Emergency request of ₹1.20L within ₹10L cap headroom is accepted for EVP routing.
  ✓ Emergency request pushing FY total to ₹10.50L is HARD-BLOCKED with clear headroom details.

5. Emergency Authorization Authority & Post-Facto Window (§9)
  ✓ Non-EVP user (HOD / Finance) is rejected from approving Emergency Procurement.
  ✓ EVP post-facto ratification within 48 hours (20h elapsed) is approved.
  ✓ EVP post-facto ratification after 48-hour statutory window (55h elapsed) is flagged and rejected.

6. Vendor Rating Computation & 5 Outcome Bands (Annexure 4)
  ✓ Band 1: Score 88.75 -> 'preferred' (>= 85)
  ✓ Band 2: Score 73.75 -> 'active' (70 - 84.99)
  ✓ Band 3: Score 60 -> 'active_notice' (55 - 69.99)
  ✓ Band 4: Score 46.5 -> 'suspended' (40 - 54.99)
  ✓ Band 5: Score 29 -> 'debarred' (< 40)
  ✓ Section E N/A redistribution computed correctly: 80.56 (scaled over 90%).
  ✓ Debarring a vendor without EVP sign-off is blocked.
  ✓ Debarring a vendor with EVP sign-off successfully flips status to blacklisted.

7. Debarred / Suspended Vendor Selection Prevention in RFQ
  ✓ Selecting a debarred/blacklisted vendor for a new RFQ is blocked.
  ✓ Selecting a suspended vendor for a new RFQ is blocked.
  ✓ Active approved vendor is permitted for RFQ selection.

====================================================
DAY 3 VERIFICATION SUMMARY: 24 passed, 0 failed.
====================================================
🎉 ALL DAY 3 CRITERIA SATISFIED!
```

---

## 5. P2 / "If Time Remains" Status (Honest Audit)

Per the prompt's prioritization order:
1. **GRN Engine & Delivery Challans** — ✅ COMPLETED
2. **Invoice & Three-Way Match & Payment Gate** — ✅ COMPLETED
3. **Emergency Procurement & ₹10L Hard Annual Cap Ledger** — ✅ COMPLETED
4. **Vendor Performance Rating & Debarment System** — ✅ COMPLETED
5. **Budget Module UI & Value-for-money benchmarks (§8.1)**:
   - Status: Pending / Deferred to Day 4.
   - Details: Requisitions already capture `budget_head` and `balance_available` fields on PR submissions, but dedicated Department Budget entry UI and EVP budget allocation approval workflows were prioritized below the core P1 compliance gates and can be expanded in subsequent refinement.

---

## 6. Build & Type Safety Status
- `npx tsc --noEmit`: Exited with code `0` (0 errors).
- `npm run build`: Production client and SSR server bundles compiled successfully in 1.28s.
