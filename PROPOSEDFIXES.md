# Proposed Fixes & Implementation Documentation

**Document Purpose:** Complete specification and record of recent procurement workflow fixes and feature additions implemented across the application.

Please refer to the full documentation at: [docs/PROPOSEDFIXES.md](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/docs/PROPOSEDFIXES.md)

---

## Summary of Solutions Implemented:

### 1. Recurring Requisitions: Empty Frequency Validation
- **Problem:** Ticking "Recurring Requirement" submitted successfully even if the frequency was left blank.
- **Client Solution:** Added validation in `RaiseRequisition.tsx` blocking submission if frequency is empty, added standardized frequency dropdown (`Monthly`, `Quarterly`, `Annually`, etc.), and added SOP §8.2 guidance tip.
- **Server Solution:** Added guard in `pr.functions.ts` rejecting requests where `is_recurring = true` and `recurring_frequency` is empty.

### 2. In-App Rate Contract Registration Inside Purchase Orders
- **Problem:** Master Rate Contracts previously required direct SQL inserts in the database, with no UI for Procurement Officers to create them.
- **Solution in `PurchaseOrders.tsx`:**
  - Added **`+ New Rate Contract`** header button.
  - Added quick-action **`+ New Contract`** link inside the Create PO dialog.
  - Built full **Register Master Rate Contract** modal featuring:
    - Empanelled vendor selector (`status = 'empanelled'`).
    - Auto-generated contract number (`RC-YYYY-NNNN`).
    - 6-month validity period window per SOP §6 (`valid_from` to `valid_to`).
    - Interactive Schedule of Negotiated Rates multi-line table (Item description, Unit, Unit Rate).
  - Enhanced Rate Contract PO creation to allow selecting approved Requisitions (PR) and auto-binding contract vendor & scope of supply.

### 3. Location Charts: Cursor Background & Tooltip Contrast Fix
- **Problem:**
  - In "Inventory by Location", hovering over bars produced an unwanted white background rectangle.
  - In "Location Distribution", pointing at pie slices displayed tooltip text in dark near-black font (`rgb(51, 51, 51)`), making the item count illegible on dark backgrounds.
- **Solution in `Dashboard.tsx`:**
  - Added `cursor={{ fill: "transparent" }}` to `<Tooltip>` in `<BarChart>` to eliminate the white hover background.
  - Implemented high-contrast `LocationBarTooltip` and `LocationPieTooltip` components with theme-adaptive popover styling (`bg-popover text-popover-foreground border border-border shadow-xl px-3 py-2 rounded-lg`).
  - Added `nameKey="location"` to `<Pie>` and formatted `<Legend>` labels for crisp contrast in both dark and light modes.

### 4. Calendar / Date Picker Indicator Visibility Fix in Dark Mode
- **Problem:**
  - In dark mode, native calendar icons inside date inputs (`<input type="date">`, `<input type="datetime-local">`, etc.) rendered pitch-black, making them invisible against dark backgrounds across the application (e.g. `/add` Invoice Date, Approval Date, `/procurement/orders` Rate Contract validity dates).
- **Solution in `styles.css` & `input.tsx`:**
  - Applied `filter: brightness(0) invert(1) !important;` to `.dark input[type="date"]::-webkit-calendar-picker-indicator` (and time, datetime, month, week). This clamps any input color to black and flips it to pure crisp white (`#FFFFFF`) with 95% opacity.
  - Added hover drop-shadow glow for enhanced interactive contrast.
  - Added `dark:[color-scheme:dark]` to `src/components/ui/input.tsx`.

---

## SOP Compliance Missing Features Implemented:

### 5. Annual Departmental Budget Formulation & Consolidation UI (SOP §8.1 C1–C6)
- **Problem:** Requisitions previously accepted manually typed `budget_head` and `balance_available` strings without annual planning or automated spend deduction.
- **Implemented Solution:**
  - **Database & Schemas:** Created `annual_budget_proposals`, `department_budget_heads`, and `budget_spend_transactions` (`supabase/migrations/20261017000001_annual_budgets_and_escalations.sql`).
  - **Budget Functions (`budget.functions.ts`):** Complete workflow engine for HOD annual estimates (March), Finance institutional consolidation (April), Trustee / EVP sanction & locking (May), and real-time live balance deductions.
  - **Dedicated UI (`BudgetManagement.tsx` & `/procurement/budgets`):** 4-tab interactive dashboard:
    1. *Departmental Estimates (March - HOD):* Multi-line departmental proposal creation and submission.
    2. *Finance Consolidation (April - Finance):* Institutional rollup, review, and recommendation.
    3. *EVP / Trustee Sanction (May - Executive):* Formal sanction, allocation adjustment, and fiscal locking.
    4. *Live Spend & Ledger:* Real-time tracking of Allocated, Committed, Spent, and Balance Available with dynamic status badges.
  - **PR Integration (`RaiseRequisition.tsx`):** Dynamic dropdown selecting active budget heads with real-time balance display, automated deduction preview, and overdraft blocking warning.
  - **PO Integration (`po.functions.ts`):** Automatically registers a `COMMITTED` transaction against the requisition's budget head upon Purchase Order issuance.

### 6. Background SLA Reminder & Escalation Daemon (SOP §8.3 E12, §8.4 F5, §8.5 G12)
- **Problem:** No automated background service monitored pending procurement approvals against working-day turnaround SLAs or escalated overdue items to higher authorities.
- **Implemented Solution:**
  - **SLA Calculation Engine (`slaDaemon.ts`):** Working-day calculation utility measuring age excluding weekends across all procurement stages:
    - PR Review: 1–2 days (Escalates to Principal / Purchase Committee)
    - RFQ Quotation Window: 7 days (Escalates to Procurement Head)
    - PO Issuance: 1 day (Escalates to Finance Officer)
    - GRN Inspection: 1–2 days (Escalates to Store Superintendent)
    - Invoice Processing: 3–5 days (Escalates to Finance Officer / EVP)
  - **Supabase Edge Function (`supabase/functions/sla-reminder-daemon/index.ts`):** Automated cron daemon querying overdue records across PRs, RFQs, POs, and Invoices, dispatching notification digests and logging escalations to `sla_escalation_logs`.
  - **Approvals SLA Widget (`SlaDaemonWidget.tsx`):** Interactive status banner on `/procurement/approvals` showing SLA compliance rate, overdue task counts, escalation tier alerts, and a manual "Run SLA Scan" trigger for immediate audits.

### 7. Value-for-Money Historical Rate Benchmarking Widget (SOP §10 K1)
- **Problem:** PR reviews and CS evaluations lacked historical pricing context, requiring officers to manually search past purchase orders.
- **Implemented Solution:**
  - **Benchmarking Engine (`rateBenchmarking.ts`):** Queries previous 6 months of issued PO line items to compute rolling moving averages for routine consumables (stationery, housekeeping, lab consumables, electrical, IT peripherals).
  - **Interactive Widget (`RateBenchmarkingWidget.tsx`):** Renders contextual benchmark comparisons:
    - Calculates exact percentage variance against 6-month average (e.g. *"Rate ₹120 is 8% below 6-month avg ₹130"*).
    - Status badges: `Below Average (Favorable)`, `Normal / At Market`, or `Above Average (Requires Review)`.
    - One-click **"Auto-Fill SOP §10 K1 Justification"** button copying standard compliance text directly into the evaluation notes.
  - **Cross-App Integration:** Embedded in `RaiseRequisition.tsx`, `ComparativeStatements.tsx` (CS quote review), and `MyApprovals.tsx` (approver verification).

### 8. Quarterly Emergency Register Review & Anomaly Detection (SOP §9 J7, J8)
- **Problem:** Emergency procurement lacked statutory quarterly audit reporting to Trustees/EVP and repeat-pattern anomaly detection to prevent bypassing standard competition.
- **Implemented Solution:**
  - **Anomaly Detection Engine (`emergencyAnomalyDetector.ts`):**
    - Scans 90-day rolling window for identical routine items repeatedly procured under emergency status by the same department.
    - Computes repeat frequency and risk level (`HIGH`, `MEDIUM`, `LOW`).
  - **Quarterly Audit Reporter:** Generates one-click quarterly emergency reports formatted per SOP §9 J7 requirements for Director / Purchase Committee / EVP review, exportable in both PDF and Excel/CSV formats.
  - **Emergency UI Integration (`EmergencyProcurement.tsx`):**
    - High-visibility amber **Repeat Pattern Anomaly Banner** warning admins and approvers of bypass attempts.
    - **"Quarterly Audit Report"** dialog with quarter selector (Q1, Q2, Q3, Q4) and instant PDF / CSV export actions.

### 9. Direct General Ledger (Tally / SAP / ERP) Accounting Connector (SOP §8.7, §11)
- **Problem:** Approved and paid invoices had to be manually re-entered into institutional double-entry financial software with no direct batch export.
- **Implemented Solution:**
  - **Double-Entry Voucher Generator (`accountingConnector.ts`):** Automatically maps approved/paid invoices to standard double-entry accounting transactions:
    - **Debit:** Departmental Expense or Fixed Asset Capitalization Account.
    - **Credit:** Sundry Creditors (Vendor Ledger) and Bank/Disbursement Account.
  - **Multi-Format Ingestion Support:**
    - **Tally XML:** Native `<ENVELOPE>` voucher format ready for direct import via Tally Gateway.
    - **SAP BAPI CSV:** Standard SAP format with Document Type `KR` (Vendor Invoice).
    - **Generic Accounting CSV:** Compatible with QuickBooks, Zoho Books, and Microsoft Dynamics.
    - **Live ERP Webhook:** Sends direct signed JSON payload to institution ERP endpoints.
  - **Invoice UI Integration (`InvoiceManagement.tsx` & `GlAccountingModal.tsx`):** Added **"GL Handoff (Tally / SAP)"** action button in invoice management providing filterable invoice selection, format picker, preview tabs, and one-click file download or webhook dispatch.



