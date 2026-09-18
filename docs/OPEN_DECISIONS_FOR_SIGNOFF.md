# Open Decisions for SOP Owner / EVP Sign-Off

**Date:** 2026-09-18  
**Document Purpose:** Presentation of all technical, operational, and financial assumptions made during the P2P system build for formal review, confirmation, or adjustment by the SOP Owner and Executive Leadership (EVP / Trustees).

---

## 1. Decision Matrix for Executive Review

| # | Item & SOP Reference | Built Assumption / Resolution | Storage / Data Location | Business Impact & Recommended Action | Sign-Off Status |
|---|---|---|---|---|:---:|
| **D1** | **Asset / AMC Cap Thresholds**<br>(SOP §6, §13) | Implemented **literally as written**: ₹10,000 per transaction and ₹50,000 per month for Equipment/Assets, Software, Academic/Research, Services/AMC, and Maintenance. Transactions above ₹10,000 automatically escalate to EVP. | `public.approval_matrix_rules` (`per_txn_limit = 10000`, `per_month_limit = 50000`) | **High operational impact**: Almost all asset purchases route to EVP. If the intended cap was higher (e.g. ₹50,000 or ₹1,00,000), update the row in `approval_matrix_rules` with zero code deploy. | `PENDING REVIEW` |
| **D2** | **Small-Value Dual Authority**<br>(SOP §6 Row 2) | Principal and Procurement Officer both hold ≤₹5,000 txn / ≤₹30,000 month small-value authority. Implemented as **First-Approver-Wins** (independent authorization). | `public.approval_matrix_rules` (separate rows for `principal` and `procurement_officer`) | Ensures zero workflow bottlenecks for small items. Confirm whether dual co-signing is required instead. | `PENDING REVIEW` |
| **D3** | **Monthly Aggregate Spend Scope**<br>(SOP §6) | Monthly aggregate spend caps are evaluated **per requesting department**. | `public.procurement_config` (`key = 'monthly_aggregation_dimension'`, `value = 'department'`) | Can be switched to `institution` or `approver` via config row update without code changes. | `PENDING REVIEW` |
| **D4** | **Director vs. Purchase Committee Checkpoints**<br>(SOP §4, §8.3, §8.4) | Modeled as two distinct stages: (a) Director / Purchase Committee reviews the **Requisition (PR)**; (b) Purchase Committee evaluates the **Comparative Statement (CS)**. | `public.pr_approvals.stage`, `public.comparative_statements` | Aligns committee oversight with quotation evaluation. Confirm if single-stage review is preferred. | `PENDING REVIEW` |
| **D5** | **Legacy Role Nomenclature Migration** | Stored `principle` role strings have been normalized to **`principal`** in schema triggers, auth context, and matrix rules. | `public.app_role` enum, `user_roles` table | Backward compatibility preserved. No new writes to deprecated alias. | `CONFIRMED` |
| **D6** | **Legacy Procure Tickets Disposition** | Historical `tickets` with `issue_category = 'procure'` were migrated to `purchase_requisitions` with `source = 'legacy_ticket'` and `status = 'archived'`. | `public.purchase_requisitions` | Preserves audit history without contaminating active approval queues or monthly spend aggregates. | `CONFIRMED` |
| **D7** | **General Ledger & Payment Scope**<br>(SOP §8.7, §11) | In-scope: Invoice 3-Way Match, Finance Approval, and Payment Logging with external UTR reference. Out-of-scope: Direct double-entry GL posting. | `public.payments` (`external_ref`, `payment_mode`) | Clean system boundary. General Ledger posting managed in external accounting software (e.g. Tally/SAP). | `CONFIRMED` |
| **D8** | **Rate Contract vs. Empanelment Validity**<br>(SOP §6, Annexure 1) | Tracked as two **independent** date fields: 6-month validity for rate contracts, 1-year validity for vendor empanelment. | `public.rate_contracts.valid_to`, `public.vendors.empanelment_expiry` | Empanelment renewal and rate contract renegotiation operate on distinct independent timelines. | `CONFIRMED` |
| **D9** | **RFQ Sourcing Email Dispatch**<br>(SOP §8.4) | Sourcing engine invokes existing `send-quotation-email` edge function with structured parameters (`rfq_id`, `vendor_id`, access token). | `src/server/procurement/rfq.functions.ts` | Maintains existing transactional email delivery infrastructure. | `CONFIRMED` |
| **D10** | **EVP Bi-Weekly Review Cadence**<br>(SOP §8.3) | "1st & 3rd Monday" EVP review cadence is treated as an **advisory grouping filter** in the EVP approvals inbox, rather than a hard programmatic blocking gate. | `src/pages/procurement/MyApprovals.tsx` | Allows emergency or high-priority EVP sign-offs on any business day without artificial time locks. | `CONFIRMED` |
| **D11** | **Emergency Procurement Hard Cap**<br>(SOP §9) | Strict statutory cap of **₹10,00,000 per Indian Financial Year (Apr 1 – Mar 31)**. Requests pushing total > ₹10 Lakhs are hard-blocked at server level. | `public.emergency_annual_ledger` | Unambiguous statutory enforcement. Any cap revision requires Trustee resolution update in ledger. | `CONFIRMED` |
| **D12** | **Vendor Performance Rating Section E (AMC)**<br>(Annexure 4) | If a vendor does not provide AMC services, Section E is marked N/A (`null`) and its 10% weight is **proportionally redistributed** over the remaining 90%. | `src/lib/procurement/vendorRating.functions.ts` | Prevents non-AMC vendors from being unfairly penalized with 0 scores on non-applicable sections. | `CONFIRMED` |

---

## 2. Sign-Off Authorization

**SOP Owner / Executive Reviewer:**

- **Name:** _______________________________________
- **Designation:** Executive Vice President / Trustee
- **Signature:** ___________________________________
- **Date:** _______________________________________
- **Comments / Overrides:** 
  __________________________________________________________________________________________________
  __________________________________________________________________________________________________
