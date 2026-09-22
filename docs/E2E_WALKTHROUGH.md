# End-to-End Procurement Lifecycle Walkthrough & Staging UAT Script

**Date:** 2026-09-18  
**Verification Target:** SOP §4, §5, §6, §7, §8.1–§8.7, §9, §11, §13, Annexures 1–4  
**Test Suite:** `scripts/verify_day4_compliance.mjs` (59/59 Automated Tests Passed)

---

## 1. Executive Summary & Core Procurement Principle

In an institutional Procure-to-Pay workflow, there is a fundamental distinction between:

1. **The Pre-Procurement Budgeted Estimate (PR Phase)**: Raised by the department based on pre-indent market surveys (e.g. ₹12,00,000 for 20 laptops).
2. **The Final Competitively Negotiated Value (PO Phase)**: Determined through competitive RFQ bidding among empanelled vendors (e.g. Lowest compliant quote L1 comes in lower at ₹11,40,000).

> **Key Matrix Compliance Rule**: The Authority Matrix evaluates spend authorization at **both** milestones:
>
> - **Milestone 1 (PR Authorization)**: Requisition raised at ₹12,00,000 estimate $\rightarrow$ Escalates to EVP ($> ₹10,000$ Equipment threshold).
> - **Milestone 2 (Comparative Statement & PO Issuance)**: Final negotiated PO value finalized at ₹11,40,000 $\rightarrow$ Re-evaluated by matrix $\rightarrow$ Sanctioned by EVP ($> ₹10,000$).
> - **Milestone 3 (3-Way Match & Payment Gate)**: Strict mathematical equality enforced between PO Committed (₹11.40L) == GRN Accepted (₹11.40L) == Claimed Invoice (₹11.40L).

---

## 2. PART 1 — Happy-Path Operational Lifecycles

### Cycle 1: Standard Goods Procurement Workflow

**Scenario**: Computer Science Department requisitions 20 High-Performance Workstation Laptops.

- **Department Requisition Estimate (PR)**: ₹12,00,000 (Category: `equipment_asset`)
- **Final Negotiated Vendor Bid (PO)**: ₹11,40,000 (Vendor: `Lenovo Enterprise` via competitive RFQ)

```
[ 1. Requisition ] ──► [ 2. Matrix Routing ] ──► [ 3. RFQ Sourcing ] ──► [ 4. Comparative Statement ]
  PR-2026-0101           Auto-Escalates to         Rajesh invites 3          Committee scores 4 pillars;
  Est: ₹12,00,000        EVP (> ₹10,000 limit)     empanelled vendors        L1 Lenovo chosen (₹11,40,000)
                                                                                         │
[ 8. PO Closed ]   ◄── [ 7. Payment ]        ◄── [ 6. 3-Way Match ]  ◄── [ 5. Purchase Order ]
  Status: closed         Neha logs UTR via         PO == GRN == Invoice      PO-2026-0401 issued
  Asset tags created     NEFT disbursement         (All ₹11,40,000)          at ₹11,40,000 (Lenovo)
```

| Step    | User & Action                                           | Payload / Inputs                                                                                           | Expected System State                                 | Compliance Gate          |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ |
| **1.1** | **Prof. Sharma (Faculty)**<br>Raise Requisition         | Scope: `equipment_asset`, Qty: 20, Est: ₹12,00,000, Budget Head: `CAPEX-IT-2026`                           | `PR-2026-0101` created with status `pending_approval` | SOP §6 B4 & §8.3 E6      |
| **1.2** | **Dr. Mehta (EVP)**<br>PR Approval                      | Logs in as EVP $\rightarrow$ `/procurement/approvals` $\rightarrow$ Approve PR                             | Status changes to `approved` for sourcing             | SOP §8.3 E6              |
| **1.3** | **Rajesh (Procurement)**<br>RFQ Dispatch                | Selects 3 approved vendors (`Dell`, `Lenovo`, `HP`) with 7-day deadline                                    | `RFQ-2026-0201` status: `sent`                        | SOP §8.4 F4 & §13 N1, N2 |
| **1.4** | **Vendors**<br>Quotation Submission                     | Dell: ₹11.80L, Lenovo: ₹11.40L (L1), HP: ₹12.20L                                                           | Itemized quotation lines recorded                     | SOP §8.4 F5, F6          |
| **1.5** | **Purchase Committee**<br>CS Evaluation                 | Recommends L1 Lenovo (₹11.40L) with 4-pillar scores (Price 98, Tech 95, Delivery 90, Warranty 95)          | `CS-2026-0301` approved by EVP                        | SOP §8.4 F8, F9, F11     |
| **1.6** | **Rajesh (Procurement)**<br>PO Issuance                 | Creates Regular PO for Lenovo Enterprise at ₹11,40,000                                                     | `PO-2026-0401` issued to vendor                       | SOP §8.5 G1, G4, G9      |
| **1.7** | **Subhash (Gate)** & **Ankit (Tech)**<br>Delivery & GRN | Gate inward stamp on `DC-LN-9921` + Tech inspection sign-off for 20 units                                  | `GRN-2026-0601` status: `accepted` (Value: ₹11.40L)   | SOP §8.6 H2, H3, H6, H7  |
| **1.8** | **Neha (Finance)**<br>3-Way Match & Payment             | Claimed Invoice: ₹11,40,000 $\rightarrow$ Match passes $\rightarrow$ Disburse NEFT ₹11,40,000 (UTR logged) | Invoice `paid`, `PO-2026-0401` status: `closed`       | SOP §8.7 I2, I6, I7      |

---

### Cycle 2: Emergency Procurement Track

**Scenario**: Main Substation Transformer oil leak repair (Estimated Cost: ₹1,75,000).

```
[ Emergency Requisition ] ──► [ Annual Cap Ledger Check ] ──► [ Post-Facto 48h Window ] ──► [ EVP Authorization ]
      EP-2026-0901               Current Spend: ₹6.50L            Elapsed: 18.0 Hours            Ledger Updated:
    (Safety Critical)             Headroom: ₹3.50L (OK)             (<= 48h Statutory)          ₹6.50L + ₹1.75L = ₹8.25L
```

| Step    | User & Action                                  | Payload / Inputs                                                                 | Expected System State                        | Compliance Gate |
| ------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | --------------- |
| **2.1** | **Electrical Supervisor**<br>Emergency Request | Cost: ₹1,75,000, Reason: _"Campus blackout risk in 4h; standard RFQ impossible"_ | `EP-2026-0901` registered                    | SOP §9 J1       |
| **2.2** | **System Engine**<br>Statutory Cap Check       | Running Total: ₹6.50L + ₹1.75L = ₹8.25L $\le$ ₹10.0L Statutory Cap               | Headroom validated (Remaining: ₹1.75L)       | SOP §9 J4       |
| **2.3** | **Dr. Mehta (EVP)**<br>Ratification            | Ratification within 18h ($\le 48\text{h}$) $\rightarrow$ Approve                 | Status: `approved`, Ledger updated to ₹8.25L | SOP §9 J2, J6   |

---

### Cycle 3: Vendor Empanelment & Performance Debarment (Annexure 4)

**Scenario**: _Substandard Facilities Pvt Ltd_ undergoes annual evaluation and is debarred.

```
[ Vendor Application ] ──► [ Committee Evaluation ] ──► [ EVP Empanelment ] ──► [ Annual Rating ] ──► [ EVP Debarment & Lock ]
  Substandard Facilities       Score: 63.75 (>= 60)        Status: empanelled       Weighted Score: 23.75     Status: blacklisted;
                                                           (1-Year Validity)         Outcome: DEBARRED (<40)   Blocked from new RFQs
```

| Step    | User & Action                             | Payload / Inputs                                            | Expected System State                                          | Compliance Gate       |
| ------- | ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- | --------------------- |
| **3.1** | **Vendor / Rajesh**<br>Empanelment        | Submits statutory registration documents (GST, PAN, Bank)   | `vendors.status = 'pending'`                                   | SOP §8.2 D2, D7       |
| **3.2** | **Committee & EVP**<br>Approval           | Committee scores 63.75 $\ge$ 60 $\rightarrow$ EVP signs off | Status: `empanelled` (1-Year Validity)                         | SOP §8.2 D3, D5, D8   |
| **3.3** | **Rajesh (Procurement)**<br>Annual Rating | Scores: 25, 20, 30, 25, 20, 20 across 6 sections            | Weighted Score: $23.75 < 40.0 \rightarrow$ Outcome: `debarred` | Annexure 4 M1, M2, M3 |
| **3.4** | **Dr. Mehta (EVP)**<br>Debarment Sign-off | Countersigns debarment order                                | Status: `blacklisted`, debarred in system                      | Annexure 4 M4, M5     |

---

## 3. PART 2 — Staging UAT Failure-Path & Security Checks

These 7 negative compliance checks verify that the system **actively refuses unauthorized or non-compliant actions**:

### Check 5: Minimum 3 Vendors RFQ Sourcing Gate

- **Actor**: Rajesh (Procurement Officer)
- **Action**: In `/procurement/rfqs`, attempt to dispatch an RFQ to only **2 vendors**.
- **Expected Result**: Server throws `ProcurementRuleError [MIN_QUOTATIONS_NOT_MET]`. Submission is blocked with the message: _"Category requires solicitation of at least 3 empanelled vendors (SOP §8.4)"_.

### Check 6: Non-Lowest Price (Non-L1) Comparative Statement Rationale Gate

- **Actor**: Purchase Committee Member
- **Action**: In `/procurement/cs`, select Dell (₹11.80L, higher price) instead of Lenovo (₹11.40L, lowest compliant bidder) while leaving the **Non-Lowest Rationale** field empty.
- **Expected Result**: Server throws `ProcurementRuleError [NON_LOWEST_RATIONALE_REQUIRED]`. CS approval is blocked until a detailed commercial justification is provided.

### Check 7: Stores GRN Over-Delivery Prevention

- **Actor**: Ramesh (Stores Executive)
- **Action**: In `/procurement/grns`, attempt to create a GRN accepting **22 units** against `PO-2026-0401` (ordered for 20 units).
- **Expected Result**: Server throws `ProcurementRuleError [CUMULATIVE_OVERDELIVERY]`. Creation is rejected with: _"Cumulative delivered quantity (22) exceeds PO ordered quantity (20)"_.

### Check 8: Non-EVP Unauthorized Requisition Approval Gate

- **Actor**: Dr. Patel (HOD) — Non-EVP
- **Action**: Attempt to approve the ₹12,00,000 Equipment PR directly via API or button click.
- **Expected Result**: Server throws `ProcurementRuleError [FORBIDDEN_ROLE]`. Rejection message: _"This requisition routes to 'evp'. You hold: hod"_.

### Check 9: Emergency Procurement Hard Annual Cap Enforcement

- **Actor**: Electrical Supervisor
- **Action**: In `/procurement/emergency`, submit a second emergency request for **₹2,25,000** when current FY spend is already **₹8,25,000** (Total = ₹10,50,000 $> ₹10,00,000 cap).
- **Expected Result**: Server hard-blocks the request with `ProcurementRuleError [EMERGENCY_CAP_EXCEEDED]`: _"HARD BLOCK: Emergency procurement of ₹2,25,000 exceeds statutory cap of ₹10,00,000 for FY 2026-27. Current spend: ₹8,25,000, Remaining headroom: ₹1,75,000"_.

### Check 10: Unapproved / Mismatched Invoice Payment Gate

- **Actor**: Neha (Finance Officer)
- **Action**: In `/procurement/invoices`, attempt to call `recordPayment` on an invoice currently in `'on_hold'` status (due to price mismatch).
- **Expected Result**: Server throws `ProcurementRuleError [UNAPPROVED_INVOICE_PAYMENT_BLOCKED]`: _"Cannot record payment on invoice. Invoice must be in 'approved' status (Current status: 'on_hold')"_.

### Check 11: Debarred Vendor RFQ Sourcing Lock

- **Actor**: Rajesh (Procurement Officer)
- **Action**: In `/procurement/rfqs`, attempt to select the debarred vendor _Substandard Facilities Pvt Ltd_ (`status = 'blacklisted'`) for a brand new RFQ.
- **Expected Result**: Server throws `ProcurementRuleError [VENDOR_BLACKLISTED]`: _"Vendor is debarred/blacklisted and cannot participate in RFQs"_.

---

## 4. Staging Test Session Execution Protocol

1. **Back-to-Back Execution**: Run the happy-path cycles (Part 1) and failure-path checks (Part 2) in the **same staging session** with real pilot users.
2. **Role Verification**: Ensure users log in with their actual assigned credentials (Faculty $\rightarrow$ HOD $\rightarrow$ Procurement $\rightarrow$ Stores $\rightarrow$ Finance $\rightarrow$ EVP).
3. **Audit Sign-off**: Record any discrepancy between the expected behavior above and the real screen response in the staging pilot log.
