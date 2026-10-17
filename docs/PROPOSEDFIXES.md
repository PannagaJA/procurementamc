# Proposed Fixes & Implementation Documentation

**Document Purpose:** Complete specification and record of recent procurement workflow fixes and feature additions implemented across the application.

---

## 1. Recurring Requisitions: Empty Frequency Submission Fix

### Problem Statement
When raising a Purchase Requisition (`/procurement/raise-pr`), users could check the **"Recurring Requirement"** checkbox and leave the recurrence frequency text input completely blank. The form would successfully submit without prompting for frequency, generating ambiguous recurring requisitions in the database with `is_recurring = true` and `recurring_frequency = ""` or `null`.

### Root Cause
1. **Client-Side:** In [RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx), `handleSubmit()` checked required fields for `departmentId`, `justification`, and `lineItems`, but lacked a validation guard for `isRecurring && !recurringFrequency.trim()`.
2. **Server-Side:** In [pr.functions.ts](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/lib/procurement/pr.functions.ts), the `createPr` RPC accepted `recurring_frequency: string | null` without validating that recurring requisitions must declare a valid frequency under SOP §8.1.
3. **UX Gap:** The free-text input allowed unstructured input like `"1m"` or `"every few weeks"`, leading to inconsistent reporting.

### Implemented Solution
1. **Client-Side Form Validation ([RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx)):**
   - Added validation check before submission:
     ```typescript
     if (isRecurring && (!recurringFrequency || !recurringFrequency.trim())) {
       toast({
         title: "Recurring Frequency Required",
         description: "Please specify the frequency (e.g. Monthly, Quarterly) for this recurring requisition.",
         variant: "destructive",
       });
       return;
     }
     ```
   - Auto-clears `recurringFrequency` if the user unchecks the checkbox.
2. **Standardized Frequency Selector ([RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx)):**
   - Replaced raw free-text box with a preset dropdown containing:
     - `Monthly (12x / year)`
     - `Bi-Monthly (Every 2 months)`
     - `Quarterly (Every 3 months)`
     - `Half-Yearly (Every 6 months)`
     - `Annually (Once a year)`
     - `Custom frequency...` (reveals text input for non-standard intervals).
   - Added contextual SOP guidance banner informing requesters that routine recurring consumables qualify for a 6-month Master Rate Contract under SOP §8.2.
3. **Server-Side API Guard ([pr.functions.ts](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/lib/procurement/pr.functions.ts)):**
   - Added server-side validation:
     ```typescript
     if (data.is_recurring && (!data.recurring_frequency || !data.recurring_frequency.trim())) {
       return {
         ok: false as const,
         error: "Recurring frequency is required when Recurring Requirement is enabled (SOP §8.1).",
         code: "recurring_frequency_required",
       };
     }
     ```

---

## 2. In-App Rate Contract Registration Inside Purchase Orders

### Problem Statement
The database table `rate_contracts` and backend server guards (`createPo` in `po.functions.ts`) supported issuing Rate Contract POs, but there was no user interface to create or manage Master Rate Contracts. Users had to manually run SQL queries in the database to insert agreements. Additionally, when attempting to create a Rate Contract PO, the modal lacked a dropdown to bind approved Purchase Requisitions.

### Implemented Solution

#### A. In-App "Create Rate Contract" Modal ([PurchaseOrders.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/PurchaseOrders.tsx))
Built a dedicated modal and header action for Procurement Officers and Admins:
1. **Header Action:** Added **`+ New Rate Contract`** button alongside `Create PO`.
2. **Quick-Link inside PO Creation:** When switching PO type to `Rate Contract Order`, a **`+ New Contract`** shortcut allows instant agreement creation without leaving the flow.
3. **Form Fields:**
   - **Contract Number:** Auto-generated sequence (`RC-YYYY-NNNN`) with manual override.
   - **Empanelled Vendor:** Selectable dropdown filtered strictly by active, empanelled suppliers (`status = 'empanelled'`).
   - **Category:** SOP category selector (`routine_consumable`, `services_amc`, `maintenance`).
   - **Agreement Title:** Descriptive contract label.
   - **Validity Window:** Start date (`valid_from`) and Expiry date (`valid_to`), defaulting to the SOP §6 mandatory **6-month validity period**.
   - **Schedule of Negotiated Rates:** Interactive multi-line items table with item description, unit of measure, and fixed unit rate (₹). Supports dynamic addition and deletion of item rows.
4. **Auto-Binding:** Submitting the modal immediately refreshes the active contracts list and automatically selects the newly created contract in the PO creation dialog.

#### B. Rate Contract PO Binding
Enhanced the **Create Purchase Order** modal:
1. When `poType === "rate_contract"`, selecting an agreement automatically sets:
   - `selectedVendorId` to the contract's vendor.
   - `scopeOfSupply` to `Supply against Rate Contract {contract_number} ({title})`.
2. Added an **Approved Purchase Requisition (PR)** selector, allowing the Procurement Officer to select which approved requisition this contract order fulfills (satisfying SOP §8.5 G5 requirement that all POs must reference an approved PR).
3. Pre-populates the order price from the PR's estimated value for faster entry.

---

## 3. Verification & Compliance Checklist

| Feature | SOP Requirement | Verification Status |
| :--- | :--- | :--- |
| **Recurring PR Validation** | SOP §8.1: PR completeness and necessity | ✅ Validated on client & server (empty frequency blocked) |
| **Rate Contract Validity** | SOP §6: 6-month validity window for rate contracts | ✅ Defaulted & enforced on registration |
| **Vendor Empanelment Gate**| SOP §8.2: Only empanelled vendors may hold contracts | ✅ Strictly filtered by `status = 'empanelled'` |
| **PO Linking Rule** | SOP §8.5 G5: Every PO must reference an approved PR | ✅ Required PR dropdown active on Rate Contract POs |
| **Chart Hover & Tooltip Contrast** | High-contrast dark mode visualization | ✅ Removed white cursor background & fixed tooltip contrast |
| **Date Picker Invert Fix** | Dark mode input control visibility | ✅ Brightness(0) invert(1) applied application-wide |
| **Annual Budget Formulation & Consolidation** | SOP §8.1 C1–C6: March estimates, April consolidation, May lock, real-time PR deduction | ✅ 4-Tab workflow dashboard + live ledger + PO deduction |
| **Background SLA Daemon & Escalation** | SOP §8.3 E12, §8.4 F5, §8.5 G12: Working-day turnaround & escalation digests | ✅ Working-day SLA engine + Edge Function daemon + UI widget |
| **Historical Rate Benchmarking Widget** | SOP §10 K1: Reasonable price assessment against 6-month PO averages | ✅ 6-month rolling average calculator + interactive widget |
| **Quarterly Emergency Register & Anomaly Detection** | SOP §9 J7, J8: Quarterly review to Trustees & 90-day repeat pattern bypass detector | ✅ One-click PDF/CSV quarterly report + repeat-pattern detector banner |
| **Direct GL Accounting Connector** | SOP §8.7, §11: Direct handoff to institutional double-entry ledger | ✅ Multi-format exporter (Tally XML, SAP BAPI CSV, QuickBooks, Webhook) |
| **Build & Type Safety** | Zero TypeScript / Vite compilation errors | ✅ `tsc --noEmit` passed (0 errors), `vite build` clean |

---

## 4. Location Charts: Cursor Background & Tooltip Text Contrast Fix

### Problem Statement
1. **White Cursor Background on Bar Hover:** When hovering over columns in **Inventory by Location** (`Dashboard.tsx`), Recharts rendered a prominent white/light-grey rectangle behind the hovered bar, which looked jarring against the dark theme card.
2. **Invisible Tooltip Text in Location Distribution:** When pointing the cursor at slices in the **Location Distribution** pie chart, Recharts rendered tooltip item text using hardcoded near-black styling (`rgb(51, 51, 51)`), making the item count (`Count : 311 items`) illegible against the dark popover background. Furthermore, the location name was omitted.

### Implemented Solution
1. **`src/pages/Dashboard.tsx`**:
   - Added `cursor={{ fill: "transparent" }}` to `<Tooltip>` in `<BarChart>`, completely removing the white cursor background highlight on hover.
   - Built custom high-contrast tooltip components `LocationBarTooltip` and `LocationPieTooltip` using Tailwind classes (`bg-popover text-popover-foreground border border-border shadow-xl px-3 py-2 rounded-lg`).
   - Slices now display the location name in bold (`text-sm font-semibold`), alongside a slice-matching color indicator dot and bright, readable count text (`text-foreground`).
   - Added `nameKey="location"` to `<Pie>` to ensure location names are correctly bound to tooltips and legends.
   - Formatted `<Legend>` labels to render in `text-card-foreground text-xs font-medium`.
2. **`src/pages/ViewerDashboard.tsx`**:
   - Added `cursor={{ fill: "transparent" }}` to `<ReTooltip>` on the location bar chart for application-wide consistency.

---

## 5. Calendar / Date Picker Indicator Visibility Fix in Dark Mode

### Problem Statement
In dark mode, the browser's native calendar icon inside date inputs (`<input type="date">`, `<input type="datetime-local">`, etc.) rendered pitch-black or nearly invisible across the app (such as `/add` for Invoice Date and Approval Date, and `/procurement/orders` for Rate Contract validity dates). This made it difficult for users to see or trigger the calendar picker.

### Root Cause
1. **WebKit Double-Inversion:**
   - Applying `color-scheme: dark` in Chrome/Chromium causes the browser to automatically render the picker glyph in white.
   - The preexisting stylesheet also applied `filter: invert(1)`, which inverted the white icon into pitch-black (`#000000`).
   - On dark navy and slate backgrounds (`#0f172a`, `#1e293b`), black on black was invisible.
2. **Component Color-Scheme Default:**
   - Reusable `<Input>` components did not explicitly declare dark color scheme utility classes.

### Implemented Solution
1. **`src/styles.css`**:
   - Implemented `filter: brightness(0) invert(1) !important;` for all date, datetime, time, month, and week native picker indicators:
     - `brightness(0)` reliably maps all color channels to black `(0, 0, 0)`.
     - `invert(1)` then flips black into pure crisp white `(255, 255, 255)`.
     - This guarantees the icon is 100% white regardless of whether the browser drew it black or white originally.
   - Added hover state with drop shadow (`drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))`) and `opacity: 1 !important;` for interactive feedback.
2. **`src/components/ui/input.tsx`**:
   - Added `dark:[color-scheme:dark]` to ensure native browser controls inside `<Input>` properly respond to dark mode.

---

## 6. Annual Departmental Budget Formulation & Consolidation UI (SOP §8.1 C1–C6)

### Problem Statement
Requisitions previously accepted manually typed `budget_head` and `balance_available` strings without any link to institutional annual budgeting. In addition, there was no interface for HODs to submit departmental estimates, no consolidation dashboard for Finance, no EVP/Trustee sanction workflow, and no automated deduction of committed amounts upon Purchase Order generation.

### SOP Requirements
- **March (SOP §8.1 C1–C2):** HODs formulate annual departmental requirements and submit proposed budgets categorised by Capex, Opex, Consumables, and AMC.
- **April (SOP §8.1 C3–C4):** Finance compiles and consolidates all departmental estimates into an institutional draft budget.
- **May (SOP §8.1 C5):** Institutional budget submitted to EVP / Board of Trustees for formal sanction, adjustment, and fiscal locking.
- **Year-Round (SOP §8.1 C6):** Approved budget figures form allocated budget heads where each PR validates against live balance, and generated POs deduct committed spend in real-time.

### Implemented Solution

#### A. Database Schema (`supabase/migrations/20261017000001_annual_budgets_and_escalations.sql`)
1. **`annual_budget_proposals`**: Captures annual departmental proposals by fiscal year (`FY 2026-27`), breakdown lines, status (`DRAFT`, `SUBMITTED`, `CONSOLIDATED`, `APPROVED`, `REWORK_REQUESTED`), and timestamps.
2. **`department_budget_heads`**: Stores sanctioned budget heads per department (`allocated_amount`, `committed_amount`, `spent_amount`, `balance_available`, and `is_locked`).
3. **`budget_spend_transactions`**: Double-entry ledger recording every spend action (`COMMITTED` on PO issuance, `DISBURSED` on payment completion, or `RELEASED` on cancellation).
4. **Row Level Security (RLS):** Fully configured for role-based view and edit permissions.

#### B. Workflow Engine (`src/lib/procurement/budget.functions.ts`)
- `submitDepartmentBudgetProposal()`: Validates and transitions HOD proposals to Finance.
- `consolidateBudgets()`: Compiles institutional rollup across all departments for Board presentation.
- `sanctionAnnualBudget()`: Sanctions proposals, instantiates official `department_budget_heads`, and locks the fiscal period.
- `deductBudgetSpend()`: Dynamically verifies availability and logs committed transactions.
- Seeded baseline data for instant demo and local storage fallback.

#### C. Dedicated UI Dashboard (`src/pages/procurement/BudgetManagement.tsx` & `/procurement/budgets`)
A 4-tab interactive interface:
1. **Departmental Estimates (March - HOD):** Interactive multi-item proposal builder with Capex/Opex category tags, justification notes, and status trackers.
2. **Finance Consolidation (April - Finance):** Full institutional consolidation matrix, department-level comparisons, and submission to Board.
3. **Executive Sanction (May - Trustees / EVP):** Executive review panel with one-click **"Sanction & Lock Annual Budget"** action.
4. **Live Spend & Ledger:** Real-time visibility into allocated, committed, spent, and balance available per head with visual progress bars and transaction history.

#### D. End-to-End System Integration
- **PR Creation ([RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx)):** Dynamic dropdown populated from live `department_budget_heads`, showing real-time balance available, projected remaining balance, and overdraft blocking banner.
- **PO Issuance ([po.functions.ts](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/lib/procurement/po.functions.ts)):** When a PO is issued via `issuePo()`, `deductBudgetSpend()` commits the PO value from the linked PR's budget head.

---

## 7. Background SLA Reminder & Escalation Daemon (SOP §8.3 E12, §8.4 F5, §8.5 G12)

### Problem Statement
Procurement items sat in approval queues indefinitely without proactive alerts, resulting in turnaround delays. Approvers only saw static age badges without automated escalation or digest notifications to higher authorities.

### SOP Requirements
Strict working-day turnaround SLAs across all stages:
- **PR Review (SOP §8.3 E12):** 1–2 working days. Overdue items escalate to Principal / Purchase Committee.
- **RFQ Quotation Window (SOP §8.4 F5):** 7 working days. Overdue items escalate to Procurement Head.
- **PO Issuance (SOP §8.5 G12):** 1 working day. Overdue items escalate to Finance Officer.
- **GRN Inspection:** 1–2 working days. Overdue items escalate to Store Superintendent.
- **Invoice Processing:** 3–5 working days. Overdue items escalate to Finance Officer / EVP.

### Implemented Solution

#### A. Working-Day SLA Calculation Engine (`src/lib/procurement/slaDaemon.ts`)
- Evaluates working days (excluding Saturdays and Sundays) between creation/submission and current date.
- Classifies items as `ON_TIME`, `WARNING` (approaching 80% SLA), or `BREACHED` (overdue).
- Assigns designated escalation tiers and specific SOP clause references.

#### B. Supabase Edge Function Daemon (`supabase/functions/sla-reminder-daemon/index.ts`)
- Automated background worker callable via Supabase Cron (`pg_cron` / Edge Function).
- Scans `purchase_requisitions`, `rfqs`, `purchase_orders`, and `invoices` for SLA breaches.
- Logs breaches to `sla_escalation_logs` to maintain institutional auditability.
- Dispatches digest payload to pending approvers and designated escalation authorities.

#### C. Approvals SLA Widget (`src/components/procurement/SlaDaemonWidget.tsx`)
- Rendered on [MyApprovals.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/MyApprovals.tsx) for all approvers and administrators.
- Displays current SLA compliance percentage, active overdue counts, and escalation authority tiers.
- Includes a **"Run SLA Audit Scan"** button providing immediate on-demand SLA diagnostics.

---

## 8. Value-for-Money Historical Rate Benchmarking Widget (SOP §10 K1)

### Problem Statement
Requisition reviews and Comparative Statement (CS) quote evaluations lacked automated pricing context. Procurement Officers had to rely on memory or manual lookups to justify rate reasonableness.

### SOP Requirements
- **SOP §10 K1:** Price reasonableness must be evaluated against historical institutional purchase rates and rolling moving averages for routine consumables (stationery, housekeeping, lab consumables, electrical, IT accessories).

### Implemented Solution

#### A. Rate Benchmarking Engine (`src/lib/procurement/rateBenchmarking.ts`)
- Queries prior purchase orders within a 6-month rolling window.
- Computes baseline statistics: 6-month average rate, min rate, max rate, and order count.
- Evaluates variance percentage:
  $$\text{Variance \%} = \frac{\text{Current Rate} - \text{Benchmark Rate}}{\text{Benchmark Rate}} \times 100$$
- Classifies rates into:
  - `Below Average (Favorable)`: Current unit rate is below historical average.
  - `Normal / At Market`: Current rate within $\pm 5\%$ of benchmark.
  - `Above Average (Requires Review)`: Current rate exceeds historical average by $>5\%$.

#### B. Interactive Benchmarking Widget (`src/components/procurement/RateBenchmarkingWidget.tsx`)
- Displays benchmark comparison badge, historical PO count, min/max price range, and variance metric.
- Includes one-click **"Auto-Fill SOP §10 K1 Justification"** button copying formal audit text:
  *"Requested item rate ₹120 is 8% below the 6-month average of ₹130 from 4 prior POs. Rate is reasonable under SOP §10 K1."*

#### C. Cross-App Integration
- **[RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx):** Displays widget next to unit price input for immediate rate feedback during requisition entry.
- **[ComparativeStatements.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/ComparativeStatements.tsx):** Displays widget on L1 vendor quotations during CS committee evaluation.
- **[MyApprovals.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/MyApprovals.tsx):** Embedded inside the pending requisition approval drawer.

---

## 9. Quarterly Emergency Register Review & Pattern Anomaly Detection (SOP §9 J7, J8)

### Problem Statement
Emergency procurements lacked statutory quarterly reporting to the Director, Purchase Committee, and EVP. Furthermore, departments could repeatedly place emergency orders for identical routine items without detection, bypassing standard competitive bidding.

### SOP Requirements
- **SOP §9 J7:** Mandatory quarterly Emergency Procurement Register reporting submitted to Director / Purchase Committee / EVP.
- **SOP §9 J8:** Repeat-pattern detection to flag whether a department repeatedly utilizes emergency procurement for identical routine items within 90 days.

### Implemented Solution

#### A. 90-Day Anomaly Detection Engine (`src/lib/procurement/emergencyAnomalyDetector.ts`)
- Analyzes all emergency orders within a rolling 90-day window grouped by department and item title.
- Flags instances where the same department placed 2 or more emergency orders for identical items.
- Assigns risk levels:
  - `HIGH`: 3+ emergency orders within 90 days (Definite bypass risk).
  - `MEDIUM`: 2 emergency orders within 90 days (Repeated emergency).
  - `LOW`: Single isolated emergency order.

#### B. Statutory Quarterly Audit Report Generator
- Filters orders by fiscal quarter (Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar).
- Calculates total emergency expenditure, statutory cap utilization (₹10,00,000 ceiling), and post-facto ratification compliance rate.
- Exports formatted reports via:
  - **PDF Export:** Formal tabular report formatted with header, compliance signatures, and audit summary.
  - **CSV / Excel Export:** Structured dataset for institutional finance archives.

#### C. Emergency Procurement Integration (`src/pages/procurement/EmergencyProcurement.tsx`)
- **Anomaly Alert Banner:** Prominent warning at the top of the Emergency Procurement Hub displaying all detected repeat-order anomalies.
- **Quarterly Audit Report Action:** Header button opening a dedicated audit modal with quarter selector and one-click PDF/CSV export buttons.

---

## 10. Direct General Ledger (Tally / SAP / ERP) Accounting Connector (SOP §8.7, §11)

### Problem Statement
Approved and paid invoices required manual double entry into external financial systems (Tally, SAP, QuickBooks), causing accounting backlogs and human entry errors.

### SOP Requirements
- **SOP §8.7 & §11:** Direct handoff of verified purchase invoices and asset tags into the institutional double-entry financial ledger upon payment release.

### Implemented Solution

#### A. Double-Entry Voucher Engine (`src/lib/procurement/accountingConnector.ts`)
- Converts approved and paid invoices into standard balanced accounting vouchers:
  - **Debit:** Department Expense Ledger or Fixed Asset Capitalization Account (`Asset Tag` referenced).
  - **Debit:** Input GST / Tax Ledger (if applicable).
  - **Credit:** Sundry Creditors (Vendor Ledger).
  - **Credit:** Institutional Bank / Payment Disbursement Account.

#### B. Multi-System Export Formats
1. **Tally Prime / ERP 9 XML:** Native `<ENVELOPE>` containing `<VOUCHER VCHTYPE="Payment">` or `"Purchase"` ready for direct import via Tally Gateway.
2. **SAP BAPI Format (CSV):** Pre-formatted with SAP Document Type `KR` (Vendor Invoice), Document Number, Posting Date, Cost Center, and GL Account Codes.
3. **Generic Double-Entry CSV:** Compatible with QuickBooks, Zoho Books, and Microsoft Dynamics 365.
4. **Institutional ERP Webhook:** Sends authenticated, signed JSON payloads to institutional ERP endpoints.

#### C. Invoice Management UI Integration (`src/pages/procurement/InvoiceManagement.tsx` & `src/components/procurement/GlAccountingModal.tsx`)
- Added **"GL Handoff (Tally / SAP)"** action button in the Invoice Management header.
- Interactive modal supporting:
  - Invoice filtering by status (`Approved`, `Paid`, or `All`).
  - Target system selector (Tally XML, SAP CSV, Generic CSV, Webhook JSON).
  - Live syntax-highlighted voucher preview.
  - One-click batch export download and live webhook transmission.



