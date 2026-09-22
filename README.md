# AMC Inventory & Starlight Procure-to-Pay (P2P) Enterprise System

A modern, compliant Procure-to-Pay (P2P) and Inventory Management web application built with **TanStack Start (React 19, Vite 7)**, **Supabase PostgreSQL**, **Tailwind CSS**, and **TypeScript**.

The system fully enforces the **Starlight P2P Standard Operating Procedure (SOP)** with server-authoritative approval routing, statutory expenditure caps, three-way matching, and vendor governance.

---

## 1. System Architecture

The architecture enforces a strict **three-tier boundary**:

```
┌─────────────────────────────────────────────────────────┐
│                    React UI Screens                     │
│  (PR Raise, Vendor Empanelment, RFQ, CS, PO, GRN, Inv)  │
└────────────────────────────┬────────────────────────────┘
                             │  Typed RPC Invocations
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Server Functions Tier (RPCs)               │
│         (src/server/procurement/*.functions.ts)         │
│  • Role Re-derivation from verified auth session        │
│  • Pure Domain Logic (authorityMatrix.ts, guards.ts)   │
└────────────────────────────┬────────────────────────────┘
                             │  Direct SQL / Service Role
                             ▼
┌─────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                   │
│  • 19 Procurement Tables with Default-DENY RLS          │
│  • Atomic Number Sequences (PR-, RFQ-, CS-, PO-, GRN-)  │
│  • Strongly-typed Schema (types.ts with 0 any types)    │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Server-Side Enforcement**: No client component performs direct mutations (`insert`, `update`, `delete`) on procurement tables. All writes go through `src/server/procurement/*` server functions.
2. **Pure Rules Engine**: `src/lib/procurement/authorityMatrix.ts` is table-driven with zero hardcoded thresholds.
3. **Default-DENY Security**: Every procurement table is locked with Default-DENY Row Level Security (RLS).
4. **Segregation of Duties**: Requisition (HOD) ≠ Sourcing (Procurement) ≠ Inspection (Stores/Security) ≠ Payment (Finance).

---

## 2. Procurement Modules & Lifecycle

1. **Requisitions (`/procurement/raise-pr`)**: Dynamic line items, net quantity auto-calculation against store inventory, Annexure-2 metadata, live matrix preview, and non-conflict declaration.
2. **Vendor Empanelment (`/procurement/vendors`)**: Statutory registration application, 4-pillar committee evaluation (Technical, Experience, Support, Financials), and strict EVP approval gate with 1-year validity.
3. **RFQ & Quotation Sourcing (`/procurement/rfqs`)**: Minimum 3 empanelled vendors selection, quotation response portal (`/quotation/$id`), line-item pricing, warranty/delivery capture, and technical specification compliance checks.
4. **Comparative Statements (`/procurement/cs`)**: 4-pillar vendor scoring, automated ranking, mandatory non-lowest rationale enforcement when bypassing L1 bidder, and committee/EVP authority routing.
5. **Purchase Orders (`/procurement/orders`)**: Regular and 6-month rate contract POs, automated distribution, amendment history with automatic tier escalation re-approval, and 30-day PO-splitting window guards.
6. **Delivery & GRN Hub (`/procurement/grns`)**: Delivery Challan registration at security gate, dual-stage sign-off (Security Gate Inward + Inspecting Engineer Technical sign-off), and cumulative overdelivery prevention.
7. **Invoices & 3-Way Match (`/procurement/invoices`)**: Automated pure 3-way match comparator (PO committed value ↔ GRN accepted value ↔ Claimed invoice amount). Mismatches transition to `on_hold` with legible discrepancy notes. Service PO completion certificate exception (§I2). Finance payment logging with external UTR reference.
8. **Emergency Procurement (`/procurement/emergency`)**: Hard-blocked at **₹10,00,000 per Indian Financial Year**, EVP-only authorization, and 48-hour post-facto ratification enforcement.
9. **Vendor Performance Ratings (`/procurement/vendor-ratings`)**: Annexure 4 6-weighted sections evaluation, Section E N/A proportional redistribution, 5 outcome bands (`Preferred`, `Active`, `Active Notice`, `Suspended`, `Debarred`), and EVP debarment sign-off.
10. **Unified Approvals Inbox (`/procurement/approvals`)**: Centralized multi-role authorization queue for PRs, CSs, POs, Amendments, Invoices, and Emergency Requests.

---

## 3. Database Migrations

Database definitions are versioned under `supabase/migrations/`:

- `20260918000001_day1_procurement_foundation.sql`: Roles, Vendors, PRs, Matrix Rules, Monthly Spend, Deviation Approvals.
- `20260918000002_day2_rfq_cs_po.sql`: Rate Contracts, RFQs, RFQ Vendors, Quotation Lines, CS, CS Scores, POs, PO Amendments.
- `20260918000003_day3_fulfilment_payment_emergency_ratings.sql`: Delivery Challans, GRNs, GRN Lines, Invoices, Payments, Emergency Ledger, Emergency Procurements, Vendor Ratings.

---

## 4. Getting Started & Verification

### Prerequisites

- Node.js 20+
- npm or bun

### Local Development

```sh
# Install dependencies
npm install

# Run development server
npm run dev

# Run TypeScript type check (0 errors required)
npx tsc --noEmit

# Run Vite production build
npm run build
```

### Running the Compliance Test Suites

```sh
# Day 1 & Day 2 Foundation & Sourcing Tests
node scripts/verify_day1.mjs
node scripts/verify_day2.mjs

# Day 3 Fulfilment, 3-Way Match & Ratings Tests
node scripts/verify_day3.mjs

# Day 4 Full Comprehensive Compliance Test Suite (59 Tests)
node scripts/verify_day4_compliance.mjs
```

---

## 5. Audit & Compliance Documentation

- [`docs/UI_WALKTHROUGH.md`](docs/UI_WALKTHROUGH.md) — Screen-by-screen, field-level real-world operational UI walkthrough across all 20 steps.
- [`docs/P2P_SOP_Audit_FINAL.md`](docs/P2P_SOP_Audit_FINAL.md) — Complete 42-area traceability matrix and scorecard comparing Day 0 vs. Day 4.
- [`docs/E2E_WALKTHROUGH.md`](docs/E2E_WALKTHROUGH.md) — Step-by-step logs and state progression of 3 end-to-end cycles.
- [`docs/OPEN_DECISIONS_FOR_SIGNOFF.md`](docs/OPEN_DECISIONS_FOR_SIGNOFF.md) — Operational and financial decisions presented for SOP Owner / EVP sign-off.
- [`docs/KNOWN_GAPS.md`](docs/KNOWN_GAPS.md) — Prioritized backlog for secondary UI screens and background cron jobs.
- [`DAY1_LOG.md`](DAY1_LOG.md), [`DAY2_LOG.md`](DAY2_LOG.md), [`DAY3_LOG.md`](DAY3_LOG.md) — Daily execution logs.

---

## 6. System Workflow Diagrams

### Diagram 1: Overall P2P Lifecycle Flowchart

The following flowchart illustrates the complete procure-to-pay lifecycle across standard and emergency paths, using the database status enum values (`draft`, `pending_approval`, `approved`, `sent`, `submitted`, `issued`, `matched`, `on_hold`, `paid`, `closed`).

```mermaid
flowchart TD
    subgraph Sourcing ["1. Requisition & Sourcing"]
        PR_Draft["PR: draft / pending_approval"] -->|"resolveApprover"| PR_Approved["PR: approved"]
        PR_Approved -->|"SOP §8.4: Min 3 Quotes"| RFQ_Sent["RFQ: sent"]
        RFQ_Sent -->|"quotation_responses"| CS_Sub["CS: submitted"]
        CS_Sub -->|"CS Evaluation & 4-Pillar Scoring"| CS_App["CS: approved"]
    end

    subgraph Emergency ["Emergency Fast-Track (§9)"]
        PR_Emergency["Emergency Requisition (§9)"] -->|"Cap Check <= ₹10L"| EP_Pending["Emergency Procurement: pending"]
        EP_Pending -->|"EVP Authorization / 48h Ratification"| EP_Approved["Emergency Procurement: approved"]
        EP_Pending -->|"Cap Exceeded > ₹10L"| EP_Blocked["Hard Block: EMERGENCY_CAP_EXCEEDED"]
    end

    subgraph Commitment ["2. PO Commitment"]
        CS_App -->|"createPo"| PO_Pending["PO: pending_approval"]
        EP_Approved -->|"createPo"| PO_Pending
        PO_Pending -->|"Authority Matrix Approval"| PO_Approved["PO: approved"]
        PO_Approved -->|"issuePo & Vendor Notification"| PO_Issued["PO: issued"]
        PO_Issued -.->|"amendPo: Value Increase"| PO_Amended["PO: amended"]
        PO_Amended -.->|"Crosses Tier Limit"| PO_Pending
    end

    subgraph Fulfilment ["3. Goods Receipt & Inspection"]
        PO_Issued -->|"recordDelivery"| DC_Rec["Delivery Challan: recorded"]
        DC_Rec -->|"createGrn & Stores Check"| GRN_Pending["GRN: pending"]
        GRN_Pending -->|"technicalVerify: Inspecting HOD"| GRN_Accepted["GRN: accepted"]
    end

    subgraph Settlement ["4. Three-Way Match & Settlement"]
        GRN_Accepted -->|"submitInvoice"| Inv_Match["3-Way Match Validation"]
        Inv_Match -->|"PO == GRN == Invoice"| Inv_Matched["Invoice: matched"]
        Inv_Match -->|"Discrepancy / Over-Billing"| Inv_Hold["Invoice: on_hold"]
        Inv_Matched -->|"Finance Approval"| Inv_Approved["Invoice: approved"]
        Inv_Approved -->|"recordPayment & UTR"| Inv_Paid["Invoice: paid"]
        Inv_Paid -->|"Auto PO Closure"| PO_Closed["PO: closed"]
    end
```

_Derived from `supabase/migrations/` schema definitions, `src/server/procurement/*.functions.ts`, and Starlight P2P SOP §8._

---

### Diagram 2: Authority Matrix Decision Flowchart

The following decision tree shows how `resolveApprover` evaluates transaction category, single transaction ceilings, and cumulative monthly spend caps to determine the approval authority role and escalation requirement.

```mermaid
flowchart TD
    Start(["Input: category, totalValue, monthlySpent, matrixRules"]) --> Norm["Normalize Category"]
    Norm --> MatchRules{"Find Active Rule in approval_matrix_rules"}
    MatchRules -->|Rule Found| CheckTxn{"totalValue <= single_transaction_limit?"}
    MatchRules -->|No Rule| FallbackEVP["Role: evp (Fallback Safety)"]

    CheckTxn -->|Yes| CheckMonthly{"monthlySpent + totalValue <= monthly_budget_cap?"}
    CheckTxn -->|No| CheckUpper{"Next Tier Available?"}

    CheckMonthly -->|Yes| AssignRole["Role: rule.approver_role<br/>Escalate: false<br/>Min Quotes: rule.min_quotations"]
    CheckMonthly -->|No| EscalateMonthly["Escalate: monthly_cap_exceeded<br/>Role: evp<br/>Escalate: true"]

    CheckUpper -->|Yes| AssignUpper["Role: higher_tier_role<br/>Escalate: true"]
    CheckUpper -->|No| MaxEVP["Role: evp (Institutional Ceiling)<br/>Escalate: true"]

    AssignRole --> End(["Output Routing Decision"])
    EscalateMonthly --> End
    AssignUpper --> End
    MaxEVP --> End
    FallbackEVP --> End
```

_Derived from `src/server/procurement/authorityMatrix.ts` and `approval_matrix_rules` database seed data._

---

### Diagram 3: Cycle 1 Standard Procurement Sequence Diagram

The following sequence diagram details the complete message exchanges, RPC calls, and database mutations between all eight procurement actors for an IT equipment purchase exceeding standard limits.

```mermaid
sequenceDiagram
    autonumber
    actor Requester as Requester (Prof. Sharma / HOD)
    actor EVP as EVP (Dr. Mehta)
    actor PO_User as Procurement Officer (Rajesh)
    actor Vendor as Empanelled Vendor (Apex Infotech)
    actor Stores as Stores & Security (Ramesh)
    actor Finance as Finance Officer (Sunita)
    participant Server as Server RPC Functions
    participant DB as PostgreSQL Database

    Requester->>Server: createPr(category='equipment_asset', est_val=₹12,00,000, line_items)
    Server->>DB: INSERT INTO purchase_requisitions (status='pending_approval', assigned_approver_role='evp')
    Server-->>Requester: PR-2026-0001 Created (Escalated to EVP)

    EVP->>Server: approvePr(pr_id, remarks)
    Server->>DB: UPDATE purchase_requisitions SET status='approved'
    Server-->>EVP: PR Approved

    PO_User->>Server: createRfq(pr_id) & sendRfq(rfq_id, 3 vendor_ids)
    Server->>DB: INSERT INTO rfqs & rfq_vendors (status='sent')
    Server-->>PO_User: RFQ-2026-0001 Dispatched to 3 Vendors

    Vendor->>Server: recordQuotationResponse(rfq_id, unit_price=₹57,000, total=₹11,40,000)
    Server->>DB: INSERT INTO quotation_responses / quotation_lines
    Server-->>Vendor: Quotation Logged

    PO_User->>Server: prepareComparativeStatement(rfq_id, recommended_vendor_id, line_scores)
    Server->>DB: INSERT INTO comparative_statements (status='submitted', assigned_approver_role='evp')
    Server-->>PO_User: CS-2026-0001 Prepared

    EVP->>Server: approveCs(cs_id)
    Server->>DB: UPDATE comparative_statements SET status='approved'
    Server-->>EVP: CS Approved

    PO_User->>Server: createPo(cs_id, price=₹11,40,000)
    Server->>DB: INSERT INTO purchase_orders (status='pending_approval', assigned_approver_role='evp')
    EVP->>Server: approvePo(po_id)
    Server->>DB: UPDATE purchase_orders SET status='approved'
    PO_User->>Server: issuePo(po_id)
    Server->>DB: UPDATE purchase_orders SET status='issued'
    Server-->>PO_User: PO-2026-0001 Issued

    Stores->>Server: recordDelivery(po_id, packages=20, challan_number)
    Server->>DB: INSERT INTO delivery_challans
    Stores->>Server: createGrn(po_id, challan_id, delivered_qty=20, accepted_qty=20)
    Server->>DB: INSERT INTO grns (status='pending')
    Requester->>Server: technicalVerify(grn_id, is_accepted=true)
    Server->>DB: UPDATE grns SET status='accepted', accepted_value=₹11,40,000

    Finance->>Server: submitInvoice(po_id, grn_id, amount=₹11,40,000)
    Server->>Server: Run 3-Way Match (PO: ₹11.4L == GRN: ₹11.4L == Inv: ₹11.4L)
    Server->>DB: INSERT INTO invoices (match_status='matched')
    Finance->>Server: approveInvoice(invoice_id)
    Server->>DB: UPDATE invoices SET match_status='approved'
    Finance->>Server: recordPayment(invoice_id, amount=₹11,40,000, utr='UTR-HDFC-9928172634')
    Server->>DB: INSERT INTO payments & UPDATE purchase_orders SET status='closed'
    Server-->>Finance: Invoice Paid & PO Closed
```

_Derived from `src/server/procurement/*.functions.ts`, `docs/E2E_WALKTHROUGH.md`, and `docs/UI_WALKTHROUGH.md`._

---

### Diagram 4: Cycle 2 Emergency Procurement Sequence Diagram

The following sequence diagram demonstrates the annual statutory cap verification, the hard-block branch, and the 48-hour post-facto ratification mechanism under SOP §9.

```mermaid
sequenceDiagram
    autonumber
    actor Requester as Requester / Estate Manager
    actor EVP as Executive Vice President (EVP)
    participant Server as Server RPC (emergency.functions.ts)
    participant DB as PostgreSQL Database

    Requester->>Server: requestEmergencyProcurement(cost=₹4,50,000, reason_failed, is_post_facto=true)
    Server->>DB: SELECT running_total, cap_limit FROM emergency_procurement_ledger FOR UPDATE

    alt Cap Exceeded: running_total + cost > 10,00,000
        Server-->>Requester: Hard Block: EMERGENCY_CAP_EXCEEDED (Ceiling Reached)
    else Spend within Headroom: running_total + cost <= 10,00,000
        Server->>DB: INSERT INTO emergency_procurements (status='pending', is_post_facto=true)
        Server-->>Requester: Emergency Request EP-2026-0001 Created (48h Window Active)
    end

    EVP->>Server: approveEmergency(emergency_id, decision='approved')
    Server->>DB: UPDATE emergency_procurements SET evp_approval_status='approved', ratified_at=NOW()
    Server->>DB: UPDATE emergency_procurement_ledger SET running_total = running_total + ₹4,50,000
    Server-->>EVP: Emergency Procurement Ratified & Ledger Incremented
```

_Derived from `src/server/procurement/emergency.functions.ts` and `20260918000003_day3_fulfilment_payment_emergency_ratings.sql`._

---

### Diagram 5: Entity-Relationship Diagram (ERD)

The following entity-relationship diagram illustrates the core procurement database entities, their primary/foreign keys, and relational constraints across the entire schema.

```mermaid
erDiagram
    DEPARTMENTS ||--o{ PURCHASE_REQUISITIONS : places
    PURCHASE_REQUISITIONS ||--|{ PR_LINE_ITEMS : contains
    PURCHASE_REQUISITIONS ||--o{ RFQS : sources
    VENDORS ||--o{ RFQ_VENDORS : invited_to
    RFQS ||--|{ RFQ_VENDORS : solicits
    RFQS ||--o{ QUOTATION_LINES : receives
    VENDORS ||--o{ QUOTATION_LINES : quotes
    RFQS ||--o{ COMPARATIVE_STATEMENTS : evaluated_in
    COMPARATIVE_STATEMENTS ||--|{ COMPARATIVE_STATEMENT_SCORES : scores
    VENDORS ||--o{ COMPARATIVE_STATEMENT_SCORES : graded
    PURCHASE_REQUISITIONS ||--o{ PURCHASE_ORDERS : fulfills
    COMPARATIVE_STATEMENTS ||--o{ PURCHASE_ORDERS : originates
    VENDORS ||--o{ PURCHASE_ORDERS : awarded_to
    PURCHASE_ORDERS ||--o{ PO_AMENDMENTS : tracks_changes
    PURCHASE_ORDERS ||--o{ DELIVERY_CHALLANS : receives_at_gate
    DELIVERY_CHALLANS ||--o{ GRNS : verified_in
    PURCHASE_ORDERS ||--o{ GRNS : acknowledges
    GRNS ||--|{ GRN_LINES : details
    PURCHASE_ORDERS ||--o{ INVOICES : bills
    GRNS ||--o{ INVOICES : matches
    INVOICES ||--o{ PAYMENTS : settles
    EMERGENCY_PROCUREMENT_LEDGER ||--o{ EMERGENCY_PROCUREMENTS : caps
    VENDORS ||--o{ VENDOR_RATINGS : evaluated_by

    PURCHASE_REQUISITIONS {
        uuid id PK
        string pr_number UK
        uuid department_id FK
        string category
        decimal estimated_value
        string status
        string assigned_approver_role
    }

    PURCHASE_ORDERS {
        uuid id PK
        string po_number UK
        uuid pr_id FK
        uuid cs_id FK
        uuid vendor_id FK
        decimal total_value
        string status
        string assigned_approver_role
    }

    GRNS {
        uuid id PK
        string grn_number UK
        uuid po_id FK
        uuid delivery_challan_id FK
        decimal accepted_value
        string status
    }

    INVOICES {
        uuid id PK
        string invoice_number
        uuid po_id FK
        uuid grn_id FK
        decimal invoice_amount
        string match_status
    }

    EMERGENCY_PROCUREMENTS {
        uuid id PK
        string emergency_number UK
        decimal estimated_cost
        string reason_standard_process_failed
        boolean is_post_facto
        string evp_approval_status
    }

    VENDOR_RATINGS {
        uuid id PK
        uuid vendor_id FK
        decimal weighted_score
        string outcome
        string review_period
    }
```

_Derived from PostgreSQL migration files `supabase/migrations/20260918000001_day1_procurement_foundation.sql`, `20260918000002_day2_rfq_cs_po.sql`, and `20260918000003_day3_fulfilment_payment_emergency_ratings.sql`._

---

### Diagram 6: Purchase Order State Transition Diagram

The following state transition diagram depicts the lifecycle states of a Purchase Order, including the amendment and tier escalation re-approval loop.

```mermaid
stateDiagram-v2
    [*] --> draft: Prepare PO
    draft --> pending_approval: createPo
    pending_approval --> approved: approvePo
    pending_approval --> cancelled: rejectPo
    approved --> issued: issuePo

    issued --> amended: amendPo
    amended --> issued: Within Same Tier
    amended --> pending_approval: Exceeds Tier Limit

    issued --> partially_closed: Partial GRN Delivery
    partially_closed --> closed: Full GRN Accepted and Paid
    issued --> closed: Full GRN Accepted and Paid
    issued --> cancelled: Cancelled by Institution
    closed --> [*]
    cancelled --> [*]
```

_Derived from `src/server/procurement/po.functions.ts` and SOP §8.5._
