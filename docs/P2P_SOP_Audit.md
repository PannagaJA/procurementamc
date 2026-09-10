# Full Project Audit — AMC Inventory vs. Starlight P2P SOP

Read-only analysis. No application code was changed.

---

## STEP 1 — Project Structure Brief

### Tech stack
| Layer | Choice |
|---|---|
| Framework | TanStack Start v1 (React 19, Vite 7), file-based routing in `src/routes/` |
| Language | TypeScript (`strict: true`, several flags relaxed during the port) |
| Styling | Tailwind CSS v4 via `src/styles.css` + shadcn/ui (Radix) in `src/components/ui/` |
| Data layer | Supabase JS client directly from the browser (`src/integrations/supabase/client.ts`); **no ORM, no server functions, no migrations in-repo** |
| Server code | None. Every route is `ssr: false`; all logic is client-side. `src/server.ts`/`src/start.ts` are template scaffolding only |
| State/data fetching | TanStack Query in some pages, ad-hoc `useEffect` + `useState` in most |
| Tests | **None** — no test files, no test runner configured in `package.json` |

### Architectural pattern
Page-per-screen, client-rendered. `src/routes/*.tsx` are 5-line shims that mount a component from `src/pages/`. Business rules live inside page components; there is no service/domain layer, no validation layer (only `RequestQuotation.tsx` uses zod), and no server-side authorization. `src/lib/inventoryApi.ts` and `src/lib/libraryApi.ts` are thin CRUD wrappers, not domain services.

### Routes (39 generated ids in `src/routeTree.gen.ts`)
`/` dashboard · `/auth` · `/add` · `/inventory`, `/inventory/$id`, `/inventory/$id/history` · `/categories` · `/departments` · `/users` · `/admin/tickets` · `/raise-ticket` · `/my-tickets` · `/procure-request` · `/request-quotation` · `/quotation/$id` · `/user-dashboard` · `/hod`, `/hod/inventory`, `/hod/inventory/$id` · `/principal`, `/principal/approvals` · `/viewer`, `/viewer/inventory`, `/viewer/inventory/$id`, `/viewer/quotations` · `/librarian`, `/librarian/books|issue|return|members|reports/$type`.

### Module purpose (one line each)
**Core libs**
- `src/lib/auth.tsx` — `AuthProvider`; loads `user_roles` rows, derives a single `primaryRole` (admin > principle > hod > librarian > viewer), caches in `localStorage`.
- `src/lib/inventoryApi.ts` — CRUD for `inventory`, `categories`, `locations`, `quotations`, `tickets`.
- `src/lib/libraryApi.ts` — CRUD for `library_books`, `library_members`, `library_issues`.
- `src/lib/supabase.ts` — second, older Supabase helper for inventory/categories/locations (duplicate of `inventoryApi`; **dead-ish code**).
- `src/lib/audit.ts` — writes rows to `audit_logs`.
- `src/lib/notify.ts` — writes rows to `notifications`.
- `src/lib/ticketUtils.ts` — ticket status/priority option lists and label helpers.
- `src/integrations/supabase/client.ts` — browser Supabase client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
- `src/integrations/supabase/types.ts` — **stub**: `export type Database = any;` (line 2). All DB typing is lost.

**Pages (functional groups)**
- Inventory: `Dashboard.tsx`, `InventoryList.tsx` (filter/paginate/export), `AddInventory.tsx` (create item + photo/QR), `ItemDetails.tsx`, `ItemHistory.tsx`, `CategoryManagement.tsx`, `DepartmentManagement.tsx`.
- Tickets: `TicketRaiser.tsx` (raise), `UserTickets.tsx` / `ViewerTickets.tsx` (my tickets), `AdminTicketDashboard.tsx` (1,247 lines — triage, status transitions, SLA colouring, `ticket_updates` log).
- Procurement (current state): `ProcureRequest.tsx` (a **ticket** with `issue_category='procure'`), `PrincipalApprovals.tsx` (approve/reject those tickets), `RequestQuotation.tsx` (email RFQs to company emails), `QuotationResponse.tsx` (vendor-facing response form), `ViewerQuotations.tsx`.
- Role dashboards: `HodDashboard.tsx`, `HodInventory.tsx`, `PrincipalDashboard.tsx`, `UserDashboard.tsx`, `ViewerDashboard.tsx`, `PendingApproval.tsx`, `UserManagement.tsx`.
- Library: `librarian/{Books,Members,IssueBook,ReturnBook,Reports}.tsx` — unrelated to P2P.

### Data entities actually referenced in code
`inventory`, `inventory_history`, `categories`, `locations`, `departments`, `profiles`, `user_roles`, `tickets`, `ticket_updates`, `quotations`, `quotation_responses`, `notifications`, `audit_logs`, `library_books`, `library_members`, `library_issues`. One RPC: `generate_ticket_number`. One edge function invoked: `send-quotation-email` (`RequestQuotation.tsx:142`) — **its source is not in this repo**.

### Dead code / stubs / risks
- `src/integrations/supabase/types.ts:1-2` — placeholder `any` database type.
- `src/lib/supabase.ts` — duplicates inventory/category/location reads already in `inventoryApi.ts`.
- `src/pages/Index.tsx`, `src/pages/NotFound.tsx` — not wired to any route file.
- `ProcureRequest.tsx:361` — "approval letter upload removed per UX change" (feature removed, no replacement).
- No SQL/migration directory anywhere in the repo, so schema constraints, RLS, triggers and thresholds are unverifiable from source.
- Role string is `'principle'` in code (`auth.tsx:52`) while `PrincipalApprovals.tsx:30` accepts both `'principle'` and `'principal'` — latent data-consistency bug.
- Authorization is client-side only (role checks inside components); anything not enforced by RLS is bypassable.

---

## STEP 2 — SOP Requirement Checklist

### A. Roles & governance
- A1 Roles: EVP/Trustees, Director–Admin & Finance, Purchase Committee, Principal, Procurement Officer, Procurement Executive, Stores/Inventory Executive, Finance & Accounts, HOD, Vendor (§5).
- A2 Purchase Committee composition of 5 members (§4).
- A3 Fallback: EVP acts when Director + PC unavailable (§4).
- A4 Segregation of duties: requisition ≠ procurement ≠ receipt ≠ payment (§5, §8.6, §8.7).

### B. Authority Matrix (§6, §13)
- B1 Small value / direct purchase ≤ ₹2,000 txn, ≤ ₹5,000 month → HOD.
- B2 Small value ≤ ₹5,000 txn, ≤ ₹30,000 month → Principal or Procurement Officer.
- B3 Routine consumables on rate contract (min 3 quotes at rate finalisation, 6-month validity), ≤ ₹1,00,000/month → Procurement Officer.
- B4 Equipment/assets, software, academic/research, services/AMC, maintenance: min 3 comparative quotations; ≤ ₹10,000 txn and ≤ ₹50,000 month → Purchase Committee; else escalate EVP.
- B5 Monthly aggregate tracking per approver band (all rows have a per-month cap).
- B6 "Routine consumable" classification taxonomy (9 categories).
- B7 Deviation from SOP requires documented justification + EVP approval (§7.6).

### C. 8.1 Budget
- C1 HOD prepares annual departmental requirement & budget.
- C2 Finance consolidates departmental budgets.
- C3 Submission to EVP/Trustees; completeness decision; rework loop to HOD.
- C4 EVP budget approval.
- C5 Communication of approved budget + variance monitoring.
- C6 Calendar SLAs: submit Mar, consolidate Apr, review May, approve before Jun, quarterly reviews Sep/Dec/Mar/Jun.
- C7 Budget head / YTD spend / balance available on every PR (Annexure 2 Section B).

### D. 8.2 Vendor empanelment
- D1 Identify empanelment need; invite applications.
- D2 Vendor submits application in prescribed format; completeness check + return/resubmit loop.
- D3 Evaluation on technical capability, experience/past performance, service support, financial reasonableness.
- D4 Suitability decision with recorded rejection reasons.
- D5 EVP approval of empanelment.
- D6 Approved Vendor List + formal empanelment communication.
- D7 Registration docs: business registration, GST/PAN, bank details, references.
- D8 Empanelment validity 1 year, renewal at discretion, re-empanelment on performance (Annexure 1).
- D9 Suspension/removal grounds; gifts/kickbacks → blacklist across all group entities; Debarment Register.
- D10 Emergency may bypass empanelment with documented justification + EVP approval.
- D11 Stage-wise SLAs (1/5/1/2/2/1 working days).
- D12 Advance-payment Bank Guarantee rule: advance >10% AND PO > ₹10,00,000 AND vendor empanelled <5 years → BG/Performance Bond = 100% of advance, submitted ≥3 working days before payment.

### E. 8.3 Purchase Requisition
- E1 PR entity with Annexure-2 fields (Sections A–G).
- E2 Routing decision: academic scope → Principal; O&M/IT/admin/finance scope → Director/PC.
- E3 Review for necessity, justification, value for money, timelines.
- E4 Completeness decision → reject with recorded reasons / return for clarification + resubmission loop.
- E5 Authority Matrix verification of PR value.
- E6 Auto-escalation to EVP when above delegated limit; EVP approve/reject with observations.
- E7 Budget alignment check before approval.
- E8 Market survey / pre-indent due diligence record.
- E9 Approval workflow log (HOD → Principal → Director → Procurement Officer → EVP) with name/date/remarks/status.
- E10 Requester declaration: accuracy, no conflict of interest, no circumvention.
- E11 Emergency-purchase flag on the PR.
- E12 Stage SLAs incl. EVP review on 1st & 3rd Monday.
- E13 Approvals by Director/PC/Principal deemed Trustee-approved when within limits.

### F. 8.4 RFQ & vendor evaluation
- F1 Stock-availability check against Store before RFQ; issue from store path with issuance record.
- F2 Rate-contract check → skip to PO.
- F3 Approved-vendor availability check → else route to empanelment.
- F4 RFQ issued to minimum 3 approved vendors.
- F5 Vendor quotation capture within stipulated window (7 working days).
- F6 Technical-specification compliance decision + re-RFQ loop.
- F7 Negotiation & due diligence record (price reasonableness vs market/past/rate contract, terms, credibility, abnormal-variation flag).
- F8 Comparative Statement: price, technical compliance, delivery, warranty/service, recommendation.
- F9 Authority-matrix routing of CS approval (Principal/Director/PC vs EVP).
- F10 Rejection with observations → loop back to RFQ start.
- F11 Non-lowest-vendor rationale documented and approved (§7.2).
- F12 Min-quote waiver only with documented justification.
- F13 No vendor commitment before approved PO.

### G. 8.5 Purchase Orders
- G1 PO entity; regular PO vs Rate Contract PO variants with required fields.
- G2 Rate Contract PO reviewed by Procurement Officer; regular PO routed by Authority Matrix.
- G3 PO completeness decision + change loop.
- G4 PO issuance + circulation to User Dept, Stores, Finance.
- G5 PO must reference an approved PR number + approval date (hard gate).
- G6 PO amendment flow; amendment history with reasons.
- G7 Amendment beyond approval limit → full re-approval; otherwise same authority as original.
- G8 PO Register/tracker: PO no & date, authority, vendor, value, validity, amendments, delivery status, closure status.
- G9 **PO splitting prevention** + periodic review of repeated small-value POs to the same vendor (aggregation risk).
- G10 New vendors must be empanelled before PO issuance.
- G11 Open/long-pending PO review.
- G12 Stage SLAs.

### H. 8.6 Delivery & invoice verification
- H1 Advance-payment decision per PO terms; Finance coordination; tracker update + proof.
- H2 Vendor delivery with Delivery Challan; partial deliveries each need a DC.
- H3 Security + procurement package/DC verification; Material Inward stamp.
- H4 Goods-in-order decision → rejection/return + reissue loop.
- H5 Route to User Dept for technical verification or to Stores.
- H6 User Department technical acceptance sign-off (mandatory for specialised items).
- H7 GRN creation.
- H8 Track until all PO items fully delivered.
- H9 Invoice matched to all DCs + PO, forwarded to Finance.
- H10 No invoice processing unless all items delivered and GRN signed.
- H11 Independent sign-offs (Security / Procurement / User Dept).
- H12 SLAs.

### I. 8.7 Invoice processing & PO closure
- I1 Invoice entity + Finance preliminary checks (arithmetic, vendor matches empanelment, duplicate check, GST/PAN compliance).
- I2 **Three-way match PO–GRN–Invoice** (service contracts: PO–Invoice + completion certificate).
- I3 Hold/discrepancy management with documented reasons and revised-invoice loop.
- I4 Net payable computation adjusting advances/deductions; TDS/GST.
- I5 Invoice approval by approval authority after confirming completion.
- I6 Payment per credit terms.
- I7 PO closure states: Closed / Partially Closed / Amended / Cancelled with reasons + final invoice & payment reference.
- I8 Audit trail retention of GRNs, invoices, approvals, payment proofs.

### J. §9 Emergency procurement
- J1 Emergency request with description, estimated cost, reason standard process fails.
- J2 Prior EVP/Trustee written approval; post-facto within 2 working days only for safety-critical.
- J3 Per-transaction limit set case-by-case by EVP.
- J4 **Aggregate annual cap ₹10,00,000 institution-wide**, hard block once reached.
- J5 Minimum 2 quotations where time permits, else price-reasonableness note.
- J6 Emergency Procurement Register entry within 2 working days.
- J7 Quarterly register review; monthly aggregate reporting to Director/PC/EVP.
- J8 Repeat-pattern detection (same item, same department) and disciplinary review trigger.

### K. §10 Value-for-money benchmarks
- K1 Consumption-based benchmarks (housekeeping, stationery, lab, electrical) surfaced at PR/approval time.

### L. §11 Asset management (pre-acquisition)
- L1 PR flags item as asset vs consumable + budget head/capitalisation threshold.
- L2 Asset PO fields: specs, warranty, installation/commissioning, training, AMC/support terms.
- L3 Physical receipt/inspection/acceptance coordination.
- L4 GRN + asset handover note.
- L5 Notify Finance for capitalisation/tagging.
- L6 Asset register fields: tag number, location, department, custodian, purchase date, PO ref, vendor, cost, depreciation method, useful life.

### M. Annexure 4 — Vendor performance rating
- M1 Rating form, half-yearly/annual cycle, 1–5 scale.
- M2 Weighted sections A 25% / B 20% / C 15% / D 20% / E 10% (N/A-able) / F 10%.
- M3 Outcome bands → PREFERRED / ACTIVE / ACTIVE–NOTICE / SUSPENDED / DEBARRED with prescribed actions.
- M4 Sign-off chain: Procurement Officer → Director/Principal → Finance rep → EVP (for suspension/debarment).
- M5 Suspended vendors excluded from new RFQs; debarred removed from Approved Vendor List.

### N. Universal gates (§13)
- N1 Approved PR must exist before any RFQ/PO action.
- N2 Vendor must be on Approved Vendor List before RFQ/PO unless emergency-exempted.
- N3 No PO splitting.
- N4 No payment without three-way match.
- N5 Deviations need documented justification + EVP approval.

---

## STEP 3 — Traceability: Built vs. Required

Legend: ✅ implemented · ⚠️ partial · ❌ absent · 🔍 unverifiable

| SOP § | Requirement | Status | Evidence | Gap details |
|---|---|---|---|---|
| §5 A1 | Full role set (EVP, Director, PC, Procurement Officer/Executive, Stores, Finance) | ⚠️ | `src/lib/auth.tsx:52` — roles are only `admin, principle, hod, librarian, viewer` | **Discrepancy**: no EVP, Director–Admin & Finance, Purchase Committee, Procurement Officer/Executive, Stores or Finance role exists. `admin` is an undifferentiated superuser |
| §4 A2/A3 | PC composition; EVP fallback | ❌ | — | No committee entity, no membership, no fallback logic |
| §5 A4 | Segregation of duties | ❌ | `AdminTicketDashboard.tsx` lets one `admin` drive every transition | No duty separation enforced anywhere |
| §6 B1–B4 | Authority Matrix thresholds | ❌ | grep for `2000/5000/10000/50000/100000` in `src/` returns no threshold logic | **Compliance-critical**: routing in `ProcureRequest.tsx:154-159` depends only on whether the requester is `hod`, never on value. `estimatedCost` is captured as free text inside a description string (`ProcureRequest.tsx:125-131`), not as a numeric column |
| §6 B5 | Per-month aggregate caps | ❌ | — | No monthly spend aggregation anywhere |
| §6 B6 | Routine-consumable taxonomy | ❌ | `categories` table is inventory categories, not procurement classes | — |
| §7.6 B7/N5 | Deviation + EVP approval | ❌ | — | No deviation record |
| §8.1 C1–C6 | Budget preparation/approval cycle | ❌ | no `budget` table referenced in any file | Entire 8.1 stage absent |
| §8.1 C7 | Budget head / YTD / balance on PR | ❌ | `ProcureRequest.tsx:20-31` form fields | Form has no budget fields |
| §8.2 D1–D11 | Vendor empanelment lifecycle | ❌ | Only `quotations.company_email` exists (`RequestQuotation.tsx:113-129`) | **There is no vendor entity at all** — vendors are ad-hoc email strings. No application, evaluation, EVP approval, Approved Vendor List, validity, blacklist |
| Annex 1 D12 | Advance-payment Bank Guarantee rule | ❌ | — | No advance payments, no BG tracking |
| §8.3 E1 | PR entity with Annexure-2 fields | ⚠️ | `src/pages/ProcureRequest.tsx`, `src/routes/procure-request.tsx` | A PR is a **ticket** row (`issue_category='procure'`) with name/email/contact/department/device/spec/qty/estimated cost/justification/priority. Missing: PR number series (reuses `generate_ticket_number`), budget section, multi-line items, stock-on-hand qty, recurring flag, emergency flag, declaration, approval log |
| §8.3 E2 | Principal-scope vs Director-scope routing | ⚠️ | `ProcureRequest.tsx:154-159`; `PrincipalApprovals.tsx:48` | **Discrepancy**: routing keys off requester role (HOD → `pending_principal`), not on academic-vs-operational scope. Director/PC branch does not exist |
| §8.3 E3/E4 | Review + reject with reasons + resubmission loop | ⚠️ | `PrincipalApprovals.tsx:268-276` (approve/reject states `procure-approved` / `procure-rejected`) | Approve/reject exists; no "return for clarification" state, no structured reason capture beyond `ticket_updates`, no resubmission loop |
| §8.3 E5/E6 | Authority-matrix verification + EVP escalation | ❌ | — | Approval chain terminates at Principal; no EVP tier |
| §8.3 E7/E8 | Budget alignment; market survey record | ❌ | — | — |
| §8.3 E9 | Approval workflow log (5 stages) | ⚠️ | `ticket_updates` writes in `PrincipalApprovals.tsx`, `AdminTicketDashboard.tsx`, `HodDashboard.tsx` | Generic activity log, not a structured per-stage approval record with designation/remarks/status |
| §8.3 E10/E11 | Declaration; emergency flag | ❌ | — | — |
| §8.3 E12 | PR stage SLAs | ⚠️ | SLA colouring in `AdminTicketDashboard.tsx:947,962` using `sla_status` | SLA exists for **support tickets**, not PR stages; thresholds not the SOP's |
| §8.4 F1 | Stock-availability check before RFQ | ⚠️ | Inventory exists (`src/lib/inventoryApi.ts:5-62`) but is never consulted from the procure/quotation flow | Not wired: no store-issue path, no issuance record |
| §8.4 F2 | Rate-contract check | ❌ | — | No rate contract entity |
| §8.4 F3 | Approved-vendor availability check | ❌ | — | — |
| §8.4 F4 | RFQ to ≥3 approved vendors | ⚠️ | `RequestQuotation.tsx:113-160` creates one `quotations` row per company email and invokes `send-quotation-email` | RFQ dispatch exists, but **no minimum-3 enforcement**, recipients are free-text emails, and the RFQ is not linked to any PR |
| §8.4 F5 | Vendor quotation capture | ✅ | `src/pages/QuotationResponse.tsx` + `quotation_responses` table, route `/quotation/$id` | Public vendor response form works; no response-deadline enforcement |
| §8.4 F6 | Technical-compliance decision + re-RFQ loop | ❌ | — | — |
| §8.4 F7 | Negotiation / due-diligence record | ❌ | — | — |
| §8.4 F8 | Comparative Statement | ❌ | `ViewerQuotations.tsx`, `RequestQuotation.tsx:361-380` group quotations for viewing only | Viewing ≠ CS: no scoring on price/technical/delivery/warranty, no recommendation, no approval object |
| §8.4 F9–F13 | CS approval routing, non-L1 rationale, waiver, no pre-PO commitment | ❌ | — | — |
| §8.5 G1–G12 | Purchase Orders (all) | ❌ | grep: no `purchase_order`/`po_` table or page anywhere | **The entire PO stage does not exist.** No PO entity, no approval, no issuance/circulation, no amendment history, no register, no PR→PO linkage |
| §8.5 G9 / N3 | PO-splitting prevention | ❌ | — | **Compliance-critical**, wholly absent |
| §8.6 H1–H12 | Delivery, DC, Material Inward, technical acceptance, GRN | ❌ | Closest artefact is `inventory_history` (`inventoryApi.ts:76-89`), which logs item changes post-hoc | No GRN, no delivery challan, no partial-delivery tracking, no security/user-dept sign-offs, no advance payments |
| §8.7 I1–I8 | Invoice processing & PO closure | ❌ | — | No invoice entity, no Finance role, no payment records, no closure states |
| §8.7 I2 / N4 | Three-way match | ❌ | — | **Compliance-critical**, wholly absent |
| §9 J1–J8 | Emergency procurement | ❌ | `ticketPriorityOptions` (`src/lib/ticketUtils.ts`) offers priorities incl. urgent | **Discrepancy**: priority ≠ emergency procurement. No EVP prior approval, no register, no ₹10,00,000 aggregate cap, no monthly reporting, no repeat-pattern detection |
| §10 K1 | Value-for-money benchmarks | ❌ | — | — |
| §11 L1–L5 | Asset pre-acquisition handling | ⚠️ | `AddInventory.tsx:443` has an `asset_type` field; `inventory` has `item_code`, category/location prefixes | Asset records exist but are created manually, not from a GRN/PO; no handover note, no capitalisation notification |
| §11 L6 | Asset register fields (tag, custodian, PO ref, cost, depreciation, useful life) | ⚠️ | `inventory` columns used across `AddInventory.tsx`/`ItemDetails.tsx` (item_code, name, category_id, location_id, department, status, photo) | Missing custodian, PO reference, vendor, cost, depreciation method, useful life, capitalisation flag |
| Annex 4 M1–M5 | Vendor performance rating | ❌ | — | No vendor entity, hence no rating, bands, or debarment register |
| §13 N1 | Approved PR before RFQ/PO | ❌ | `RequestQuotation.tsx` can be used standalone | No linkage or gate |
| §13 N2 | Approved vendor before RFQ | ❌ | — | — |
| RLS/DB constraints | Server-side enforcement of any of the above | 🔍 | No migrations in repo; `src/integrations/supabase/types.ts:2` is `any` | Cannot verify RLS, triggers, or check-constraints from source. All observed authorization is client-side and therefore bypassable |
| `send-quotation-email` | RFQ email delivery | 🔍 | Invoked at `RequestQuotation.tsx:142` | Function source not in this repository |

**Headline:** of the seven SOP stages, only fragments of 8.3 (PR-as-ticket, Principal approve/reject) and 8.4 (RFQ email + vendor response) exist. Stages 8.1, 8.2, 8.5, 8.6, 8.7, §9 and Annexure 4 are unimplemented.

---

## STEP 4 — Pending Work & Recommended Architecture

### 1. Prioritized pending work

**P0 — foundation (everything else depends on these)**
| Item | What to build | Size | Depends on |
|---|---|---|---|
| Role model extension | Add `evp`, `director`, `purchase_committee`, `procurement_officer`, `procurement_executive`, `stores`, `finance`; fix `principle`→`principal`; support multi-role instead of single `primaryRole` (`src/lib/auth.tsx:52`) | M | — |
| Vendor master (8.2) | `vendors` + empanelment application/evaluation/EVP approval/validity/blacklist | L | roles |
| PR entity (8.3) | Dedicated `purchase_requisitions` + `pr_line_items`, replacing PR-as-ticket | L | roles, budget heads |
| Authority Matrix engine | Single rules module resolving (type, txn value, month-to-date value) → approver, with escalation | M | roles, PR |
| Server-side enforcement | Move approvals/thresholds behind server functions + RLS; today all logic is client-side | L | all |

**P1 — core P2P chain**
| Item | Size | Depends on |
|---|---|---|
| 8.4 RFQ objects, ≥3-vendor rule, quotation deadlines, Comparative Statement + CS approval | L | vendors, PR |
| 8.5 Purchase Orders: entity, PR gate, approval routing, issuance/circulation, amendment history with re-approval, PO register | L | CS, matrix |
| 8.6 GRN: delivery challans, partial deliveries, security inward, user-dept technical acceptance, GRN | L | PO |
| 8.7 Invoices: entity, three-way match gate, hold/discrepancy loop, payment, closure states | L | GRN, PO |
| §9 Emergency register with ₹10,00,000 running annual cap + hard block | M | PR, EVP role |

**P2 — governance & analytics**
| Item | Size |
|---|---|
| 8.1 Budget module (department budgets, consolidation, EVP approval, YTD/balance feeding PR) | L |
| Annexure 4 vendor rating with weights and outcome bands → auto status | M |
| PO-splitting / aggregation-risk detection report | M |
| §10 consumption benchmarks surfaced at PR review | S |
| SLA clocks per SOP stage + escalation notifications | M |
| Asset handover note + capitalisation notification, PO/vendor/cost on inventory rows | M |
| Emergency quarterly review + monthly aggregate report | S |

### 2. Data model gaps
Entirely missing tables: `budgets`/`budget_heads`/`budget_lines`, `vendors`, `vendor_applications`, `vendor_documents`, `vendor_ratings`, `vendor_blacklist`, `rate_contracts`, `purchase_requisitions`, `pr_line_items`, `pr_approvals`, `rfqs`, `rfq_vendors`, `quotation_lines`, `comparative_statements`, `cs_scores`, `purchase_orders`, `po_line_items`, `po_amendments`, `delivery_challans`, `grns`, `grn_lines`, `invoices`, `invoice_matches`, `payments`, `emergency_procurements`, `approval_matrix_rules`, `deviation_approvals`, `asset_handovers`.

Missing fields on existing tables: `tickets` has no numeric procurement value, no budget head, no emergency flag, no PR/PO linkage (estimated cost is embedded in a text blob at `ProcureRequest.tsx:125-131`); `quotations` has no vendor FK, no RFQ FK, no PR FK, no validity; `inventory` has no PO reference, vendor, cost, custodian, capitalisation flag, depreciation method or useful life; `user_roles` has only `role` + `department_id`, no approval-limit metadata.

### 3. Business-logic / compliance-critical gaps (call-outs)
1. **Authority Matrix not implemented at all.** Approval routing depends solely on the requester's role, not the value (`ProcureRequest.tsx:154-159`). No ₹2,000 / ₹5,000 / ₹10,000 per-transaction or ₹5,000 / ₹30,000 / ₹50,000 / ₹1,00,000 monthly caps exist in code.
2. **No EVP tier.** Every SOP path above delegated limits escalates to EVP; the app's chain ends at Principal, so over-limit spend can be approved by a lower authority — a direct control failure.
3. **Three-way match absent.** No PO, GRN, or invoice objects exist, so payment cannot be gated.
4. **PO-splitting prevention absent**, along with the aggregation-risk review of repeated small-value POs to one vendor.
5. **Emergency ₹10,00,000 annual aggregate cap absent** — and there is no emergency concept at all, only ticket priority.
6. **Minimum-3-quotation rule unenforced** (`RequestQuotation.tsx` accepts any number of emails).
7. **Segregation of duties unenforced** — `admin` can perform every step.
8. **All authorization is client-side.** Without verified RLS (not in this repo), threshold and role checks are advisory only.

### 4. Suggested architecture (extend, do not rewrite)
The stack (TanStack Start + Supabase) supports the SOP. Two structural changes are needed:

- **Introduce a server tier.** Today every write is a direct browser Supabase call. Approval routing, matrix evaluation, three-way match, and the emergency cap must run in `createServerFn` handlers under `src/lib/*.functions.ts` with `requireSupabaseAuth`, backed by RLS and DB check-constraints, so client code cannot bypass them.
- **Introduce a domain layer.** Add `src/domain/procurement/` holding: `authorityMatrix.ts` (pure, table-driven, unit-testable), `workflow.ts` (state machine for PR → RFQ → CS → PO → GRN → Invoice → Closure), `guards.ts` (PR-approved-before-PO, vendor-empanelled, no-splitting, three-way match, emergency cap). Pages call server functions; server functions call the domain layer. Keep the existing shadcn/Tailwind UI and file-based route pattern unchanged.
- **Separate procurement from support ticketing.** The current PR-as-ticket approach cannot carry line items, budget data, or a multi-stage approval log. Keep `tickets` for IT/maintenance support; create first-class procurement entities and migrate `issue_category='procure'` rows across.
- **Make the schema first-class in the repo.** Add a `supabase/migrations/` directory and regenerate `src/integrations/supabase/types.ts`; the `any` stub currently hides every schema error.
- **Add tests.** The matrix, the guards, and the state machine are pure logic and should be covered before any UI work.

### 5. Open questions for a human
1. **Threshold plausibility.** The matrix caps Equipment/Assets and AMC at ₹10,000 per transaction with EVP escalation above — meaning nearly every asset purchase goes to EVP. Is that intended, or is a digit missing?
2. **Overlap in rows 2 and 3** of §6: Principal and Procurement Officer have identical ≤₹5,000 / ≤₹30,000 authority. Who takes precedence, and can either approve independently?
3. **Monthly cap scope** — per requesting department, per approver, or institution-wide? The SOP does not say, and it changes the aggregation query materially.
4. **"Director – Admin & Finance" vs "Purchase Committee"** are treated as one approval slot in §6 but as separate bodies in §4. Should they be one role or two with a defined order?
5. **`principle` vs `principal`** — the code uses the misspelling in stored role data (`auth.tsx:52`). Confirm before a data migration.
6. **Existing procure tickets** — should historical `issue_category='procure'` tickets be migrated into the new PR entity or archived?
7. **Finance boundary** — does this system record payments, or does it hand off to an external accounting system after invoice approval? §11 defers post-acquisition asset lifecycle to the Finance & Accounts SOP; the same boundary needs confirming for payments.
8. **Rate contracts** — the SOP mentions 6-month rate validity (§6) and 1-year empanelment validity (Annexure 1). Confirm both are tracked independently.
9. **`send-quotation-email`** — this edge function is invoked but its source is outside this repo. Confirm where it lives and whether it stays as-is for RFQ dispatch.
10. **EVP review cadence** — PR decisions on the 1st and 3rd Monday (§8.3). Should the system queue and batch PRs to those dates, or is it advisory?
