# AMC Starlight P2P — UI-Level Real-World Walkthrough Document

This document provides a screen-by-screen, field-level operational walkthrough of the **AMC Starlight Procure-to-Pay (P2P) Application**. It documents the actual user interfaces—describing visible input fields, exact button labels, status badge colors, real-time calculation widgets, and alert banners as implemented in the codebase.

---

## Cycle 1 — Standard Procurement Track (IT Equipment / Laptops)

---

### Step 1 — Requester Raises Requisition (PR) with Line Items & Due Diligence

- **Route/URL:** `/procurement/raise-pr`
- **Role required to see this screen:** Any authenticated institutional user (`hod`, `principal`, `procurement_officer`, `admin`).
- **What the screen shows:**
  - **Header:** SOP §8.3 Compliance badge (`bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200`), title _"Raise Purchase Requisition (PR)"_, and description _"Create structured indent requests with server-enforced Authority Matrix routing and instant approval preview."_
  - **Card 1 (Requisition Metadata):**
    - `Requesting Department *` (Dropdown select populated dynamically from `departments` table).
    - `SOP Category *` (Select with options: `Small Value / Direct Purchase (≤ ₹5,000)`, `Routine Consumables (Rate Contract)`, `Equipment & Asset Procurement`, `Software & Cloud Licenses`, `Academic & Research Material`, `Services & Annual Maintenance (AMC)`, `Facility Maintenance & Repairs`).
    - `Procurement Scope *` (Dropdown: `Operational / Administrative`, `Academic / Teaching & Research`).
    - `Budget Head (Optional)` (Text input: placeholder `e.g. LAB-EQUIP-2026 / OPEX`).
  - **Card 2 (PR Line Items):**
    - Dynamic line item repeater with `Add Item` button.
    - Each line contains: `Description *` (Text input), `Unit` (Text input, default `pcs`), `Qty Req.` (Number input, min 1), `In Stock` (Number input, min 0), `Est. Unit Price (₹)` (Number input).
    - Real-time line calculations: `Net to Procure: N unit` (`qty_required - qty_in_stock`), `Line Total: ₹X`.
  - **Card 3 (Justification & Pre-Indent Due Diligence):**
    - `Procurement Necessity & Justification *` (Textarea, 3 rows, required).
    - `Pre-indent Market Survey Notes (Optional)` (Textarea, 2 rows).
    - Checkbox: `Emergency Procurement (§9)` with amber alert caption.
    - Checkbox: `Recurring Requirement` with conditional text input `recurringFrequency` (`e.g. Monthly, Quarterly`).
  - **Submit Button:** Full-width button with label `Submit Purchase Requisition (₹X)`.
- **What the user does:**
  1. Selects Requesting Department: `"Computer Science & Engineering"`.
  2. Selects SOP Category: `"Equipment & Asset Procurement"`.
  3. Selects Scope: `"Academic / Teaching & Research"`.
  4. Types Budget Head: `"COMP-LAB-EXP-2026"`.
  5. In Line Item 1: Types Description `"High-Performance Computing Laptops 32GB RAM"`, Unit `"pcs"`, Qty Req `"20"`, In Stock `"0"`, Est. Unit Price `"60000"`.
  6. Observes computed line total: `Net to Procure: 20 pcs`, `Line Total: ₹12,00,000`.
  7. In Justification textarea: Types `"Procurement of 20 high-performance computing laptops for the AI/ML and Advanced Data Science laboratory practical curriculum."`
  8. In Market Survey Notes: Types `"Surveyed Dell, Lenovo, and HP authorized education partners; estimated ₹60,000/unit base rate."`
  9. Clicks the button: **`Submit Purchase Requisition (₹12,00,000)`**.
- **What happens on submit:**
  - Button switches to loading state: `Validating & Submitting PR...` with `disabled` state.
  - Calls `createPr` RPC server function (`/api/procurement/pr/create`).
  - On success, displays a green confirmation card (`border-2 border-emerald-500 bg-emerald-50/70`) showing:
    - Title: `Requisition Submitted: PR-2026-0001`
    - Subtitle: `Authority Matrix engine successfully evaluated and routed this purchase request.`
    - Assigned Approver: `EVP`
    - Routing Status: `🚨 Escalated to EVP`
    - Min. Quotations: `3 Quotes Required`
    - Routing Reason: `Equipment & Asset Procurement transaction value ₹12,00,000 exceeds band ceiling of ₹10,000 → Escalated to EVP for approval.`
  - Toast notification fires: _"Requisition Raised Successfully! PR Number: PR-2026-0001 routed to EVP"_.
- **What changes elsewhere as a result:**
  - The PR record is created in `purchase_requisitions` table with `status = 'pending_approval'`, `assigned_approver_role = 'evp'`.
  - Dr. Mehta's **My Approvals** inbox (`/procurement/approvals`) immediately reflects **PR (1)** pending under the Requisitions tab.
- **Screenshot placeholder:** `![Step 1](./screenshots/step1.png)`

---

### Step 2 — Live Authority Matrix Preview Badge on PR Form

- **Route/URL:** `/procurement/raise-pr` (Sidebar Component)
- **Role required to see this screen:** All users on the PR creation page.
- **What the screen shows:**
  - **Sticky Right Sidebar Card:** Border styled with `border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50`.
  - Header with animated pulsing green dot (`w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse`) and badge `"SOP ENGINE"`.
  - Card Title: _"Authority Matrix Live Routing"_, Card Description: _"Server-enforced decision logic based on SOP §6 rules."_
  - **Requisition Value Display:** Styled currency card showing `Requisition Value: ₹12,00,000.00`.
  - **Target Approval Authority Banner:** High-contrast purple pill (`bg-indigo-600 text-white`) showing large title **`EVP`** with escalation badge: `🚨 Escalated (Exceeds Band Cap)`.
  - **SOP §6 Threshold Proofs Guide:** List of live rules:
    - `₹1,500 Small Value: Routes to HOD (≤ ₹2,000 txn limit)`
    - `₹4,500 Small Value: Routes to Principal (≤ ₹5,000 txn limit)`
    - `₹15,000 Equipment: Escalates to EVP (exceeds ₹10,000 cap)`
  - **Requisition Constraints Container:**
    - `Min. Quotations:` **`3 Quotes`**
    - `Rate Contract Required:` **`No`**
  - **Authority Rule Callout:** Amber callout box (`bg-amber-50 border-amber-200 text-amber-800`) displaying full rule evaluation text: _"Equipment & Asset Procurement transaction value ₹12,00,000 exceeds band ceiling of ₹10,000 → Escalated to EVP for approval."_
- **What the user does:**
  - As the user types quantities and unit prices in Step 1, the client-side `useMemo` immediately feeds `category`, `totalEstimatedValue`, and active `matrixRules` into `resolveApprover()`.
  - If user sets ₹1,800: Badge instantly flips to **`HOD`** (`✓ Within standard delegated approval band`, 1 quote).
  - If user sets ₹4,500: Badge instantly flips to **`PRINCIPAL`** (`✓ Within standard delegated approval band`, 1 quote).
  - If user sets ₹12,00,000: Badge instantly displays **`EVP`** (`🚨 Escalated (Exceeds Band Cap)`, 3 quotes).
- **What happens on submit:**
  - Visual preview locks in sync with the server response once the form is submitted.
- **What changes elsewhere as a result:**
  - Informs the requester upfront of the regulatory compliance requirements before physical submission.
- **Screenshot placeholder:** `![Step 2](./screenshots/step2.png)`

---

### Step 3 — EVP Approval Screen (Dr. Mehta's Authority Inbox)

- **Route/URL:** `/procurement/approvals`
- **Role required to see this screen:** Users with role `evp` or `admin`.
- **What the screen shows:**
  - **Header:** Title _"My Procurement Approvals"_, subtitle _"Requisitions, Comparative Statements, Purchase Orders, Invoices, and Emergency authorisations awaiting your role."_, and a `Refresh` button.
  - **Active Procurement Roles Banner:** Displays active user badges: `[EVP]` and pending badge: `Total Pending: 1`.
  - **Tab Bar (6 Tabs):** `PR (1)`, `CS (0)`, `PO (0)`, `Amend (0)`, `Invoices (0)`, `Emergency (0)`.
  - **Requisition Approval Card for `PR-2026-0001`:**
    - Card Title: `PR-2026-0001`, Badge `[equipment_asset]`, Status badge `[PENDING_APPROVAL]`.
    - Department: `Computer Science & Engineering • Est. Value: ₹12,00,000`.
    - Justification excerpt: `Procurement of 20 high-performance computing laptops for the AI/ML...`
    - Routing reason box: `Equipment & Asset Procurement transaction value ₹12,00,000 exceeds band ceiling of ₹10,000 → Escalated to EVP for approval.`
    - Action Buttons:
      1. Green button: **`Approve`** (`bg-emerald-600 hover:bg-emerald-700 text-white`)
      2. Red button: **`Reject`** (`variant="destructive"`)
      3. Outline button: **`Escalate`** (`variant="outline"`)
  - **Decision Modal (Popup):**
    - Dialog Title: `Approve Requisition` / `Reject Requisition`.
    - Textarea: `Approval / Rejection Remarks`.
    - Footer buttons: `Cancel` and `Confirm Decision`.
- **What the user does:**
  1. Navigates to `/procurement/approvals`.
  2. Clicks the green **`Approve`** button on PR-2026-0001 card.
  3. In the Decision Modal, types in the Remarks textarea: `"Approved under academic AI/ML laboratory upgrade budget. Proceed to RFQ with minimum 3 empanelled vendors."`
  4. Clicks **`Confirm Decision`**.
- **What happens on submit:**
  - Calls `approvePr` server function (`/api/procurement/approvals/approve-pr`).
  - Modal closes, toast displays: _"Requisition Approved: PR PR-2026-0001 approved."_
  - Requisition tab counter decrements to `PR (0)`.
- **What changes elsewhere as a result:**
  - Database row in `purchase_requisitions` transitions to `status = 'approved'`, `approval_date = NOW()`, `approved_by_id = <Dr. Mehta's user ID>`.
  - Procurement Officer Rajesh's RFQ Management screen (`/procurement/rfqs`) now displays PR-2026-0001 in the approved requisition dropdown selector.
- **Screenshot placeholder:** `![Step 3](./screenshots/step3.png)`

---

### Step 4 — Procurement Officer Solicits Quotes (RFQ Screen & Vendor Selection)

- **Route/URL:** `/procurement/rfqs`
- **Role required to see this screen:** `procurement_officer`, `procurement_executive`, `admin`.
- **What the screen shows:**
  - **Header:** SOP §8.4 Solicitations banner, title _"Request for Quotation (RFQ) Hub"_, subtitle _"Create multi-vendor solicitations from approved PRs, enforce minimum 3-quote rule (§8.4), and record quote lines."_
  - Action button: **`+ Create New RFQ`** (`bg-sky-600 hover:bg-sky-700 text-white`).
  - Active RFQ List showing columns/cards: `RFQ Number`, `PR Ref`, `Status`, `Vendor Count`, `Responses`, `Deadline`, `Actions`.
  - **Modal 1 (Create RFQ Dialog):**
    - `Approved Purchase Requisition *` (Dropdown select listing all PRs where `status = 'approved'`).
    - `Response Submission Deadline` (Date picker).
    - `Procurement / Sourcing Notes` (Textarea).
    - Submit button: `Create RFQ (Draft)`.
  - **Modal 2 (Send RFQ & Select Empanelled Vendors Dialog):**
    - Dialog Title: `Send RFQ to Empanelled Vendors`.
    - Warning banner: `SOP §8.4 Mandatory Rule: Requires minimum 3 empanelled vendors for Equipment & Asset Procurement.`
    - Multi-select Checkbox List of Empanelled Vendors: Each item shows Vendor Name, GST number, and Empanelled status badge.
    - Submit button: `Dispatch RFQ to N Vendors`.
- **What the user does:**
  1. Clicks **`+ Create New RFQ`**.
  2. Selects Approved Requisition: `"PR-2026-0001 — Equipment & Asset Procurement (₹12,00,000)"`.
  3. Sets Response Deadline: `"2026-10-15"`.
  4. Clicks **`Create RFQ (Draft)`**. System creates `RFQ-2026-0001` in `draft` status.
  5. Clicks the **`Send RFQ`** action button on the RFQ card.
  6. **Negative Test (Enforcement Check):** Selects only 2 vendors: `"Apex Infotech Pvt Ltd"` and `"ByteCore Systems Ltd"`. Clicks **`Dispatch RFQ to 2 Vendors`**.
     - System immediately blocks with red toast: _"Insufficient Vendors: SOP §8.4 requires at least 3 empanelled vendors (currently selected 2)."_
  7. **Positive Path:** Selects 3rd vendor: `"CompuServe Solutions Ltd"`. Total selected = 3.
  8. Clicks **`Dispatch RFQ to 3 Vendors`**.
- **What happens on submit:**
  - Calls `sendRfq` server function (`/api/procurement/rfqs/send`).
  - RFQ status changes from `draft` to `sent`.
  - Populates `rfq_vendors` join table with the 3 vendor IDs.
  - Toast displays: _"RFQ Sent: Sent to 3 empanelled vendors successfully."_
- **What changes elsewhere as a result:**
  - Status badge on RFQ-2026-0001 flips to `SENT` (`bg-sky-100 text-sky-800`).
  - Generates unique public quotation submission links for each invited vendor (`/quotation/<quotation_id>`).
- **Screenshot placeholder:** `![Step 4](./screenshots/step4.png)`

---

### Step 5 — Vendor Quotation Response Portal

- **Route/URL:** `/quotation/$id`
- **Role required to see this screen:** Public / Invited Vendor (no AMC staff login required).
- **What the screen shows:**
  - **Card Header:** Title _"Submit Quotation Response"_, Category badge, Requisition description, and Response Deadline indicator.
  - **Form Fields:**
    - `Detailed Description / Technical Specifications *` (Textarea, min 10 characters).
    - `Total Quoted Amount (₹) *` (Number input, must be > 0).
    - `Delivery Timeline *` (Text input, e.g. `14 Business Days`).
    - `Contact Person *` (Text input).
    - `Contact Phone *` (Text input, validated format).
    - `Payment Terms *` (Text input, e.g. `100% against delivery and physical verification`).
    - `Quotation Validity Date *` (Date input).
    - `Additional Notes / Special Conditions` (Textarea, optional).
    - Checkbox: `I accept the Institution Terms & Conditions and declare non-collusion *` (Required boolean).
  - **Submit Button:** `Submit Quotation Response` (`bg-blue-600 text-white`).
- **What the user (Vendor) does:**
  1. Opens vendor link: `/quotation/q-apex-001`.
  2. In Technical Description: Types `"Supply of 20 units Dell Latitude 5540, Intel Core i7-1370P, 32GB DDR5 RAM, 1TB NVMe SSD, 3-Year Onsite ProSupport Plus Warranty."`
  3. In Total Quoted Amount: Types `"1140000"` (unit rate ₹57,000 × 20).
  4. In Delivery Timeline: Types `"14 Business Days"`.
  5. In Contact Person & Phone: Types `"Amit Verma"`, `"+91 98765 43210"`.
  6. In Payment Terms: Types `"30 Days post-delivery and GRN sign-off"`.
  7. In Quotation Validity: Enters `"2026-11-30"`.
  8. Checks `I accept the Institution Terms & Conditions...`.
  9. Clicks **`Submit Quotation Response`**.
  10. (Vendors ByteCore and CompuServe submit their quotes: ByteCore quotes ₹11,80,000; CompuServe quotes ₹12,20,000).
- **What happens on submit:**
  - Inserts row into `quotation_responses` and updates parent quotation `status = 'responded'`.
  - Form switches to read-only success view showing green checkmark and message: _"Your quotation response has been submitted successfully!"_
- **What changes elsewhere as a result:**
  - RFQ-2026-0001 on `/procurement/rfqs` updates response tally to **3 of 3 Quotes Received**.
  - Sourcing officer can now initialize Comparative Statement evaluation.
- **Screenshot placeholder:** `![Step 5](./screenshots/step5.png)`

---

### Step 6 — Comparative Statement (CS) Evaluation & Scoring

- **Route/URL:** `/procurement/cs`
- **Role required to see this screen:** `procurement_officer`, `purchase_committee`, `evp`, `admin`.
- **What the screen shows:**
  - **Header:** SOP §8.5 Comparative Statement banner, title _"Comparative Statements & Evaluation Hub"_, subtitle _"Evaluate multi-vendor quotes, score 4 pillars (Price, Technical, Delivery, Warranty), and enforce non-lowest rationale."_
  - Action button: **`+ Prepare Comparative Statement`** (`bg-emerald-600 hover:bg-emerald-700 text-white`).
  - **Prepare CS Modal:**
    - `Select RFQ *` (Dropdown select listing sent RFQs).
    - **Live Bid Evaluation Table:**
      - Columns: `Vendor Name`, `Quoted Total (₹)`, `Delivery Days`, `Warranty (Mo)`, `Tech Spec Met?`, `Price Score`, `Total Score`, `Rank`.
      - Auto-ranks bidders: Rank 1 (L1) = Apex Infotech (₹11,40,000), Rank 2 (L2) = ByteCore (₹11,80,000), Rank 3 (L3) = CompuServe (₹12,20,000).
    - `Recommended Vendor *` (Dropdown select, defaults to L1 bidder).
    - **Conditional Non-Lowest Rationale Field:**
      - If Recommended Vendor is L1: Hidden or displays _"Recommended vendor is the lowest compliant bidder (L1)."_
      - If user selects L2/L3 (e.g. ByteCore): Textarea automatically appears with mandatory label: `Non-Lowest Price Rationale * (SOP §7.2 mandatory justification for bypassing L1)`.
    - `Negotiation Notes` (Textarea: e.g. details on final price reductions).
    - `Price Reasonableness Notes` (Textarea).
    - Submit button: `Submit CS for Approval`.
- **What the user does:**
  1. Clicks **`+ Prepare Comparative Statement`**.
  2. Selects RFQ: `"RFQ-2026-0001 (PR-2026-0001 Equipment & Asset Procurement)"`.
  3. Verifies bidder comparison table: Apex Infotech is L1 at ₹11,40,000 (Compliant).
  4. Selects Recommended Vendor: `"Apex Infotech Pvt Ltd"`.
  5. In Negotiation Notes: Types `"Negotiated price down from initial catalog rate of ₹60,000/unit to ₹57,000/unit all-inclusive."`
  6. In Price Reasonableness: Types `"Rate is 5% lower than current GeM portal rate for identical OEM configuration."`
  7. Clicks **`Submit CS for Approval`**.
- **What happens on submit:**
  - Calls `prepareComparativeStatement` RPC (`/api/procurement/cs/prepare`).
  - Evaluates authority routing based on recommended value (₹11,40,000 → routes to `evp`).
  - System generates `CS-2026-0001` with `status = 'submitted'`, `assigned_approver_role = 'evp'`.
  - Toast fires: _"Comparative Statement Prepared: Routed to EVP for authority review."_
- **What changes elsewhere as a result:**
  - EVP Dr. Mehta's approval inbox (`/procurement/approvals`) receives **CS (1)** under the Comparative Statements tab.
  - Upon EVP clicking `Approve` on CS-2026-0001, status transitions to `status = 'approved'`.
- **Screenshot placeholder:** `![Step 6](./screenshots/step6.png)`

---

### Step 7 — Purchase Order (PO) Creation, Approval & Issuance

- **Route/URL:** `/procurement/orders`
- **Role required to see this screen:** `procurement_officer`, `purchase_committee`, `evp`, `admin`.
- **What the screen shows:**
  - **Header:** SOP §8.5 PO Generation banner, title _"Purchase Orders Management"_, subtitle _"Draft, authorize, issue, and amend purchase orders with server-enforced authority re-evaluation."_
  - Action button: **`+ Create Purchase Order`** (`bg-indigo-600 hover:bg-indigo-700 text-white`).
  - **Create PO Modal:**
    - `PO Type` (Select: `Standard PO (from Approved CS)` / `Rate Contract PO`).
    - `Approved Comparative Statement *` (Dropdown listing CSs where `status = 'approved'`).
    - Auto-populated fields from selected CS: `Vendor: Apex Infotech Pvt Ltd`, `Base Price: ₹11,40,000`, `Taxes: ₹0`, `Total Value: ₹11,40,000`.
    - `Scope of Supply *` (Textarea, pre-filled with RFQ reference).
    - `Delivery Timeline *` (Text input, default `30 days`).
    - `Payment Terms *` (Text input, default `100% on delivery and inspection`).
    - Submit button: `Create Purchase Order`.
  - **Purchase Orders Table:**
    - Columns: `PO Number`, `Vendor`, `Committed Total`, `Approver Role`, `Status Badge`, `Actions`.
- **What the user does:**
  1. Clicks **`+ Create Purchase Order`**.
  2. Selects Approved CS: `"CS-2026-0001 — Apex Infotech Pvt Ltd (₹11,40,000)"`.
  3. Confirms Base Price: `1140000`, Scope of Supply: `"Supply, installation, and testing of 20 Dell Latitude 5540 laptops as per CS-2026-0001."`
  4. Clicks **`Create Purchase Order`**.
     - Server creates `PO-2026-0001` with `status = 'pending_approval'`, `assigned_approver_role = 'evp'`.
  5. Dr. Mehta (EVP) approves PO-2026-0001 in `/procurement/approvals` tab `PO (1)`. PO status changes to `approved`.
  6. Sourcing Officer Rajesh returns to `/procurement/orders` and clicks the blue button: **`Issue PO`** on `PO-2026-0001`.
- **What happens on submit:**
  - Calls `issuePo` RPC (`/api/procurement/orders/issue`).
  - PO status transitions from `approved` to `issued`.
  - System logs audit entry and sets `issued_at = NOW()`.
  - Toast fires: _"Purchase Order Issued: Order PO-2026-0001 issued. Notifications dispatched to User Dept, Stores, and Finance."_
- **What changes elsewhere as a result:**
  - Status badge on PO flips to **`ISSUED`** (`bg-emerald-600 text-white`).
  - Stores Goods Receipt Hub (`/procurement/grns`) now allows recording physical deliveries against `PO-2026-0001`.
- **Screenshot placeholder:** `![Step 7](./screenshots/step7.png)`

---

### Step 8 — Goods Receipt Note (GRN) & Dual Sign-Off (Security + Technical)

- **Route/URL:** `/procurement/grns`
- **Role required to see this screen:** `stores`, `hod` (for technical inspection), `admin`.
- **What the screen shows:**
  - **Header:** SOP §8.6 Stores Fulfilment banner, title _"Delivery Challans & Goods Receipt Notes (GRN)"_, subtitle _"Enforce physical delivery receipt, security check, technical inspection sign-off, and accepted value ledger."_
  - Action buttons:
    1. **`+ Record Delivery (Security Gate)`** (`bg-emerald-600 text-white`).
    2. **`+ Create GRN`** (`bg-blue-600 text-white`).
  - **Modal 1 (Record Delivery Challan):**
    - `Issued Purchase Order *` (Dropdown select).
    - `Packages Count` (Number input, min 1).
    - `Carrier / Transporter Details` (Text input, e.g. `BlueDart Express AWB# 88719283`).
    - `Security Gate Remarks` (Textarea).
    - Submit button: `Record Delivery Challan`.
  - **Modal 2 (Create GRN):**
    - `Purchase Order *` & `Linked Delivery Challan *` (Dropdowns).
    - Checkbox: `Requires Technical Inspection Sign-Off` (Checked for equipment).
    - Line Items: `Description`, `Qty Delivered`, `Qty Accepted`, `Unit Price`, `Inspection Remarks`.
    - Over-Delivery Hard Guard: Validates that cumulative delivered qty across all GRNs does not exceed PO quantity.
    - Submit button: `Generate GRN`.
  - **Modal 3 (Technical Acceptance Sign-Off Dialog):**
    - Radio buttons: `[x] Accept Material (Meets Technical Specs)` / `[ ] Reject Material`.
    - `Inspection & Testing Remarks *` (Textarea).
    - Submit button: `Record Technical Sign-Off`.
- **What the user does:**
  1. Stores Officer Ramesh receives the delivery truck at Gate 1. Clicks **`+ Record Delivery (Security Gate)`**.
  2. Selects PO: `"PO-2026-0001 — Apex Infotech Pvt Ltd"`. Packages Count: `20`. Carrier: `"BlueDart Express AWB# 99120481"`.
  3. Clicks **`Record Delivery Challan`**. Generates `DC-2026-0001`.
  4. Clicks **`+ Create GRN`**. Links `PO-2026-0001` and `DC-2026-0001`.
  5. Verifies line: Delivered `20`, Accepted `20`, Unit Price `57000`. Leaves `Requires Technical Inspection` checked.
  6. Clicks **`Generate GRN`**. Creates `GRN-2026-0001` with `status = 'pending'`.
  7. Prof. Sharma (Inspecting HOD) opens `/procurement/grns`, locates `GRN-2026-0001`, and clicks **`Technical Verify`**.
  8. Selects `Accept Material`, enters remarks: `"Physical inspection complete. Boot test successful on all 20 units; BIOS asset tagging completed."`
  9. Clicks **`Record Technical Sign-Off`**.
- **What happens on submit:**
  - Calls `technicalVerify` RPC (`/api/procurement/grns/technical-verify`).
  - GRN status transitions from `pending` to `accepted`.
  - Sets `accepted_value = ₹11,40,000`, `technical_signoff_by_id = <Prof. Sharma's ID>`.
  - Toast fires: _"Technical Acceptance Recorded: GRN status updated to 'accepted'."_
- **What changes elsewhere as a result:**
  - Status badge on `GRN-2026-0001` flips to **`ACCEPTED`** (`bg-emerald-100 text-emerald-800`).
  - Invoice submission against `PO-2026-0001` is now unlocked for Finance.
- **Screenshot placeholder:** `![Step 8](./screenshots/step8.png)`

---

### Step 9 — Invoice Submission, Visual Three-Way Match & Payment Gate

- **Route/URL:** `/procurement/invoices`
- **Role required to see this screen:** `finance`, `admin`.
- **What the screen shows:**
  - **Header:** SOP §8.7 Finance Payment Gate banner, title _"Invoices & Three-Way Match Verification"_, subtitle _"Verify Purchase Order (PO) ↔ Goods Receipt Note (GRN) ↔ Invoice agreement before payment release."_
  - Action button: **`+ Submit Invoice`** (`bg-emerald-600 hover:bg-emerald-700 text-white`).
  - **Submit Invoice Modal:**
    - `Issued Purchase Order *` (Dropdown select).
    - `Accepted GRN *` (Dropdown select, auto-selected).
    - `Vendor Invoice Number *` (Text input, e.g. `INV-APEX-2026-881`).
    - `Claimed Invoice Amount (₹) *` (Number input).
    - Checkbox: `Service PO (§I2 Exception - No GRN Required)`.
    - Submit button: `Submit & Run 3-Way Match`.
  - **Visual Three-Way Match Comparator Card:**
    - Header: Badge `[MATCHED]` (or `[ON_HOLD]` / `[APPROVED]` / `[PAID]`), Title: `Invoice: INV-APEX-2026-881`, Vendor: `Apex Infotech Pvt Ltd`.
    - **Three-Way Verification Matrix (3-Column Grid):**
      - **Column 1 (PO Value):** `₹11,40,000` (PO: `PO-2026-0001`).
      - **Column 2 (GRN Accepted Value):** `₹11,40,000` (GRN: `GRN-2026-0001 (accepted)`).
      - **Column 3 (Claimed Invoice Amount):** `₹11,40,000` (Invoice: `INV-APEX-2026-881`).
    - Reconciliation Indicator: `✅ Fully Reconciled` (green text).
    - **How Mismatch is Displayed (Hold State):** If invoice claimed amount was ₹12,00,000 instead:
      - Status badge flips to red: `[ON_HOLD]`.
      - Reconciliation indicator shows: `⚠️ Verification Hold`.
      - Red discrepancy alert box appears below grid (`bg-red-50 border-red-300 text-red-900`):
        `[AlertOctagon Icon] Match Discrepancy / Hold: Invoice amount (₹12,00,000) exceeds GRN accepted value (₹11,40,000) by ₹60,000. Approval blocked until credit note or revision.`
  - Action buttons:
    - If Matched: **`Approve Invoice`** (`bg-emerald-600 text-white`).
    - If Approved: **`Record Payment`** (`bg-indigo-600 text-white`).
- **What the user does:**
  1. Finance Officer Sunita clicks **`+ Submit Invoice`**.
  2. Selects PO: `"PO-2026-0001 — Apex Infotech Pvt Ltd"`.
  3. System automatically selects `GRN-2026-0001` and sets Invoice Amount to `1140000`.
  4. Enters Vendor Invoice Number: `"INV-APEX-2026-881"`.
  5. Clicks **`Submit & Run 3-Way Match`**.
  6. Observes that all 3 values match exactly (₹11,40,000 = ₹11,40,000 = ₹11,40,000). Match status becomes `matched`.
  7. Clicks **`Approve Invoice`**. Status changes to `approved`.
  8. Clicks **`Record Payment`**. Payment dialog opens:
     - Payment Mode: `RTGS`.
     - Payment Amount: `1140000`.
     - External Bank UTR Reference: `"UTR-HDFC-9928172634"`.
     - Payment Terms Ref: `"Immediate RTGS"`.
  9. Clicks **`Confirm Payment Recording`**.
- **What happens on submit:**
  - Calls `recordPayment` RPC (`/api/procurement/invoices/record-payment`).
  - Invoice status changes to `paid`. Inserts row into `payments` table.
  - Automatically transitions parent `purchase_orders` row status to `closed`.
  - Toast fires: _"Payment Recorded & Settled: Payment of ₹11,40,000 logged. PO settlement status updated to CLOSED."_
- **What changes elsewhere as a result:**
  - Invoice card displays badge `[PAID]` (`bg-slate-900 text-white`).
  - Purchase Order `PO-2026-0001` is marked fully closed in the PO master register.
- **Screenshot placeholder:** `![Step 9](./screenshots/step9.png)`

---

### Step 10 — Final Purchase Order Status & Linked Document Audit View

- **Route/URL:** `/procurement/orders`
- **Role required to see this screen:** All procurement roles & finance.
- **What the screen shows:**
  - **Closed PO Record Card for `PO-2026-0001`:**
    - Status Badge: **`CLOSED`** (`bg-slate-800 text-white`).
    - Vendor: `Apex Infotech Pvt Ltd` • Total Value: `₹11,40,000.00`.
    - **Audit Trail & Linked Documents Badges:**
      - Requisition: `PR-2026-0001 (Approved by EVP)`
      - Solicitation: `RFQ-2026-0001 (3 Empanelled Quotes)`
      - Evaluation: `CS-2026-0001 (L1 Bidder Apex Infotech)`
      - Fulfilment: `DC-2026-0001 • GRN-2026-0001 (Accepted by CSE HOD)`
      - Financial Settlement: `INV-APEX-2026-881 • UTR-HDFC-9928172634 (Paid ₹11,40,000 via RTGS)`
- **What the user does:**
  - Inspects the complete, immutable transaction chain verifying 100% SOP compliance from requisition to settlement.
- **What happens on submit:** N/A (Read-only settled state).
- **What changes elsewhere as a result:** Institutional ledger reflects committed and disbursed expenditure against department budget.
- **Screenshot placeholder:** `![Step 10](./screenshots/step10.png)`

---

## Cycle 2 — Emergency Procurement Track (§9)

---

### Step 11 — Emergency Procurement Request Form

- **Route/URL:** `/procurement/emergency`
- **Role required to see this screen:** `hod`, `principal`, `procurement_officer`, `admin`.
- **What the screen shows:**
  - **Header:** SOP §9 Governance badge (`bg-amber-100 text-amber-900`), title _"Emergency Procurement Register"_, subtitle _"Hard statutory annual cap of ₹10,00,000, post-facto 48-hour ratification rule, and exclusive EVP authorization."_
  - Action button: **`+ Request Emergency Procurement`** (`bg-amber-600 hover:bg-amber-700 text-white`).
  - **Request Modal (Dialog):**
    - `Department` (Dropdown select).
    - `Vendor (If selected / direct purchase)` (Dropdown select of active vendors).
    - `Item Description & Emergency Nature *` (Textarea, required).
    - `Estimated Cost (₹) *` (Number input, must be > 0).
    - `Failure of Standard Process Justification *` (Textarea: mandatory explanation why standard 3-quote PR/RFQ workflow could not be followed due to imminent danger, health & safety, or system outage).
    - `Quotations Obtained Count` (Number input, default `1`).
    - `Price Reasonableness Note` (Textarea: comparison against past purchases or list prices).
    - Checkbox: `Post-Facto Ratification (§9.3)` (Checked if purchase was executed immediately to avert catastrophe and ratification is requested within 48 hours).
  - Submit button: `Submit Emergency Request`.
- **What the user does:**
  1. Estate Manager / IT Head clicks **`+ Request Emergency Procurement`**.
  2. Selects Department: `"Campus IT & Network Infrastructure"`.
  3. Selects Vendor: `"Apex Infotech Pvt Ltd"`.
  4. In Item Description: Types `"Emergency replacement of fried core campus firewall & optical switch after severe lightning strike."`
  5. In Estimated Cost: Types `"450000"`.
  6. In Failure Justification: Types `"Entire campus intranet, exam servers, and hospital connectivity down. Standard 3-week RFQ turnaround would halt operations."`
  7. In Quotations Count: Types `"1"`.
  8. In Price Reasonableness: Types `"OEM standard replacement list price with 15% educational emergency discount."`
  9. Checks `Post-Facto Ratification (§9.3)`.
  10. Clicks **`Submit Emergency Request`**.
- **What happens on submit:**
  - Calls `requestEmergencyProcurement` RPC (`/api/procurement/emergency/request`).
  - Validates cost against remaining statutory headroom in `emergency_procurement_ledger`.
  - Inserts row with `status = 'pending'`, `is_post_facto = true`, and sets `register_entry_at = NOW()`.
  - Toast fires: _"Emergency Request Submitted: Logged in register (EP-2026-0001). Awaiting EVP authorization."_
- **What changes elsewhere as a result:**
  - Item appears on the Emergency Procurement Register with purple badge `[POST-FACTO RATIFICATION (§9.3)]`.
  - EVP Dr. Mehta's approval inbox receives **Emergency (1)** under the Emergency tab.
- **Screenshot placeholder:** `![Step 11](./screenshots/step11.png)`

---

### Step 12 — Live ₹10,00,000 Statutory Annual Cap Gauge Display

- **Route/URL:** `/procurement/emergency` (Top Banner)
- **Role required to see this screen:** All users on the Emergency page.
- **What the screen shows:**
  - **Card Container:** Styled with gradient background `bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-red-50/40 border-amber-300 dark:border-amber-900`.
  - Header with shield alert icon (`ShieldAlert text-amber-600`), title: _"Statutory Annual Emergency Ledger — FY 2026-27"_, and badge: `Hard Cap: ₹10,00,000`.
  - Subtitle: _"Institution-wide aggregate spend ceiling across all departments under SOP §9."_
  - **Live Progress & Metrics Bar:**
    - Left label: `Used: ₹4,50,000 (45%)` (slate text).
    - Right label: `Remaining Balance: ₹5,50,000` (bold emerald text).
    - Visual Progress Bar: `Progress value={45}` rendered with amber/orange bar (`h-3 bg-amber-200 dark:bg-amber-950`).
- **What the user does:**
  - Observes the real-time consumption of institutional emergency headroom before initiating any emergency requisitions.
- **What happens on submit:** N/A (Passive real-time monitoring widget).
- **What changes elsewhere as a result:** Automatically updates whenever an emergency procurement is authorized by the EVP.
- **Screenshot placeholder:** `![Step 12](./screenshots/step12.png)`

---

### Step 13 — Statutory Cap Hard-Block UI (When Headroom is Exceeded)

- **Route/URL:** `/procurement/emergency` (Submit Modal & Server Response)
- **Role required to see this screen:** Any user attempting to exceed the annual ₹10,00,000 ceiling.
- **What the screen shows:**
  - **Client-Side Pre-Validation Error Toast:**
    - Toast variant: `destructive` (red banner).
    - Title: _"Statutory Cap Exceeded"_.
    - Description: _"Cost ₹6,00,000 exceeds remaining annual headroom ₹5,50,000."_
  - **Server-Side Hard Block (Defense in Depth):**
    - If bypassed on client, server RPC `requestEmergencyProcurement` executes SQL transaction lock: `IF (v_current_spent + p_cost) > 1000000 THEN RAISE EXCEPTION 'EMERGENCY_CAP_EXCEEDED'`.
    - Server returns `{ ok: false, error: "EMERGENCY_CAP_EXCEEDED: Requested ₹6,00,000 exceeds remaining institutional cap of ₹5,50,000 for FY 2026-27 (§9.1)" }`.
    - Modal displays red error alert preventing database insertion.
- **What the user does:**
  1. Opens Emergency Request Modal when remaining headroom is ₹5,50,000.
  2. Enters Estimated Cost: `"600000"`.
  3. Clicks **`Submit Emergency Request`**.
  4. System immediately halts submission, displays the hard-block error, and keeps the transaction out of the database.
- **What happens on submit:** Submission is blocked; no database mutation occurs.
- **What changes elsewhere as a result:** Ledger remains secure at ₹4,50,000.
- **Screenshot placeholder:** `![Step 13](./screenshots/step13.png)`

---

### Step 14 — EVP Post-Facto Ratification Screen (48-Hour Window)

- **Route/URL:** `/procurement/approvals` (Tab: Emergency) & `/procurement/emergency`
- **Role required to see this screen:** `evp`, `admin`.
- **What the screen shows:**
  - **Emergency Authorization Card for `EP-2026-0001`:**
    - Title: `EP-2026-0001`, Badge `[PENDING]`, Badge `[Post-Facto Ratification (§9.3)]` (purple outline).
    - Department: `Campus IT & Network Infrastructure • Vendor: Apex Infotech Pvt Ltd`.
    - Metrics row: `Estimated Cost: ₹4,50,000`, `Quotes: 1 Quote(s)`, `Register Entry Time: 18/09/2026, 09:15 AM`.
    - **48-Hour Ratification Indicator:**
      - Visual callout: `⏰ 48-Hour Ratification Window: Registered 4.5 hours ago (Within statutory window)`.
    - Justification Box (`bg-amber-50/60 border-amber-200 text-amber-900`):
      `Failure of Standard Process Justification: Entire campus intranet, exam servers, and hospital connectivity down...`
    - Action Buttons:
      1. Green button: **`EVP Authorize`** (`bg-emerald-600 text-white`).
      2. Red button: **`Reject`** (`variant="destructive"`).
- **What the user (EVP Dr. Mehta) does:**
  1. Opens `/procurement/approvals` and clicks tab **`Emergency (1)`**.
  2. Reviews the 48-hour timestamp and failure justification.
  3. Clicks **`EVP Authorize`**.
- **What happens on submit:**
  - Calls `approveEmergency` RPC (`/api/procurement/emergency/approve`) with `decision = 'approved'`.
  - Atomically increments `emergency_procurement_ledger.running_total` by ₹4,50,000 (new total = ₹4,50,000).
  - Emergency record transitions to `evp_approval_status = 'approved'`, `ratified_at = NOW()`.
  - Toast fires: _"Emergency Procurement Authorized: EVP approval recorded. Annual ledger updated to ₹4,50,000."_
- **What changes elsewhere as a result:**
  - Cap gauge at `/procurement/emergency` instantly reflects `Used: ₹4,50,000 (45%)`, `Remaining: ₹5,50,000`.
- **Screenshot placeholder:** `![Step 14](./screenshots/step14.png)`

---

## Cycle 3 — Vendor Lifecycle, Empanelment & Performance Ratings

---

### Step 15 — Vendor Empanelment Application Form

- **Route/URL:** `/procurement/vendors` (Tab: Apply)
- **Role required to see this screen:** Open entry for vendor intake / Admin onboarding (`procurement_officer`, `admin`).
- **What the screen shows:**
  - **Header:** SOP §5 Vendor Empanelment banner, title _"Vendor Management & Empanelment Hub"_, subtitle _"Manage vendor lifecycle: statutory registration, 4-pillar committee evaluation, and EVP approval."_
  - **Tabs Bar:** `1. Application Form`, `2. Committee Evaluation (N)`, `3. EVP Approval Gate (N)`, `4. Empanelled Directory (N)`.
  - **Application Form Card (Statutory Registration):**
    - `Vendor Legal Name *` (Text input).
    - `Registered Business Address` (Textarea).
    - `GST Identification Number (GSTIN)` (Text input, uppercase format).
    - `Permanent Account Number (PAN)` (Text input, uppercase format).
    - **Bank Details Sub-Section:**
      - `Bank Account Number` (Text input).
      - `Bank IFSC Code` (Text input, uppercase).
      - `Bank & Branch Name` (Text input).
    - Submit button: `Submit Empanelment Application`.
- **What the user does:**
  1. Types Legal Name: `"Zenith Laboratory Supplies LLP"`.
  2. Types Address: `"Plot 42, Peenya Industrial Area, Bangalore 560058"`.
  3. Enters GSTIN: `"29AAACZ1234F1Z5"`, PAN: `"AAACZ1234F"`.
  4. Enters Bank Account: `"99102847192"`, IFSC: `"HDFC0001234"`, Bank Name: `"HDFC Bank, Peenya Branch"`.
  5. Clicks **`Submit Empanelment Application`**.
- **What happens on submit:**
  - Calls `applyEmpanelment` RPC (`/api/procurement/vendors/apply`).
  - Creates row in `vendors` table with `status = 'applied'`.
  - Form resets and automatically navigates to Tab `2. Committee Evaluation`.
  - Toast fires: _"Vendor Application Submitted! Vendor 'Zenith Laboratory Supplies LLP' registered in 'applied' status. Proceed to Evaluation."_
- **What changes elsewhere as a result:**
  - Evaluation tab badge increments: `Committee Evaluation (1)`.
- **Screenshot placeholder:** `![Step 15](./screenshots/step15.png)`

---

### Step 16 — Vendor Committee Evaluation Screen (4-Pillar Scoring)

- **Route/URL:** `/procurement/vendors` (Tab: Committee Evaluation)
- **Role required to see this screen:** `purchase_committee`, `procurement_officer`, `admin`.
- **What the screen shows:**
  - **Select Vendor Dropdown:** Lists all vendors with `status = 'applied'`.
  - **4-Pillar Evaluation Card (Annexure 1):**
    - `Pillar 1: Technical & Production Capability (0–100) *` (Number input, e.g. `88`).
    - `Pillar 2: Past Experience & Institutional Track Record (0–100) *` (Number input, e.g. `82`).
    - `Pillar 3: Service Support & Warranty Responsiveness (0–100) *` (Number input, e.g. `90`).
    - `Pillar 4: Financial Stability & Price Reasonableness (0–100) *` (Number input, e.g. `85`).
    - `Committee Recommendation Decision *` (Select: `Recommend for Empanelment` / `Do Not Recommend`).
    - `Committee Evaluation Notes` (Textarea).
  - Submit button: `Record Committee Evaluation`.
- **What the user does:**
  1. Selects Vendor: `"Zenith Laboratory Supplies LLP (applied)"`.
  2. Enters Pillar scores: Tech `88`, Experience `82`, Support `90`, Financial `85`.
  3. Selects Recommendation: `"Recommend for Empanelment"`.
  4. Enters Notes: `"Verified GST filing history and OEM direct authorization certificates. Recommended for 1-year empanelment."`
  5. Clicks **`Record Committee Evaluation`**.
- **What happens on submit:**
  - Calls `evaluateVendor` RPC (`/api/procurement/vendors/evaluate`).
  - Inserts row into `vendor_evaluations` and updates vendor status to `status = 'under_review'`.
  - Navigates to Tab `3. EVP Approval Gate`.
  - Toast fires: _"Evaluation Recorded! Vendor status changed to 'under_review'. Ready for EVP Approval."_
- **What changes elsewhere as a result:**
  - EVP Approval tab badge increments: `EVP Approval Gate (1)`.
- **Screenshot placeholder:** `![Step 16](./screenshots/step16.png)`

---

### Step 17 — EVP Empanelment Approval Screen

- **Route/URL:** `/procurement/vendors` (Tab: EVP Approval Gate)
- **Role required to see this screen:** `evp`, `admin`.
- **What the screen shows:**
  - **Pending Vendors List for EVP Sign-Off:**
    - Card: `Zenith Laboratory Supplies LLP`, GST: `29AAACZ1234F1Z5`, Status: `[UNDER_REVIEW]`.
    - Evaluation Summary: `Tech: 88/100 • Exp: 82/100 • Support: 90/100 • Financial: 85/100`.
    - Committee Recommendation: `RECOMMEND` (green badge).
    - `EVP Approval Notes (Optional)` (Text input).
    - Action Buttons:
      1. Green button: **`Approve Empanelment`** (`bg-emerald-600 text-white`).
      2. Red button: **`Reject`** (`variant="destructive"`).
- **What the user (EVP Dr. Mehta) does:**
  1. Enters Notes: `"Empanelment authorized for FY 2026-27 under Laboratory Consumables & Equipment panel."`
  2. Clicks **`Approve Empanelment`**.
- **What happens on submit:**
  - Calls `approveEmpanelment` RPC (`/api/procurement/vendors/approve`).
  - Sets `status = 'empanelled'`, `empanelled_on = CURRENT_DATE`, `empanelment_expiry = CURRENT_DATE + 365 days`.
  - Toast fires: _"Vendor Empanelled Successfully! Vendor is now empanelled for 1 year."_
- **What changes elsewhere as a result:**
  - Vendor appears in the active directory under Tab `4. Empanelled Directory` with green badge `[EMPANELLED]` and expiry date.
  - Zenith Laboratory Supplies LLP is now selectable in RFQ multi-vendor pickers.
- **Screenshot placeholder:** `![Step 17](./screenshots/step17.png)`

---

### Step 18 — Vendor Performance Rating Form (6-Pillar Formula & Outcome Bands)

- **Route/URL:** `/procurement/vendor-ratings`
- **Role required to see this screen:** `procurement_officer`, `purchase_committee`, `admin`.
- **What the screen shows:**
  - **Header:** SOP Annexure 4 Vendor Performance banner, title _"Vendor Ratings & Performance Governance"_, subtitle _"6-Pillar weighted scoring, automated outcome banding, and automatic vendor suspension / debarment gates."_
  - Action button: **`+ Evaluate Vendor`** (`bg-purple-600 hover:bg-purple-700 text-white`).
  - **Evaluate Vendor Modal (Dialog):**
    - `Vendor *` (Dropdown select of vendors).
    - `Review Period *` (Text input, e.g. `FY2026-Q2`).
    - **Live Weighted Score Preview Header:**
      - Left: `Computed Weighted Score:` **`82.5 / 100`** (large font).
      - Right: `Outcome Band:` **`Active (Standard)`** (Badge: `bg-blue-600 text-white`).
    - **6 Interactive Section Sliders (0–100):**
      - `Section A: Quality & Technical Spec Compliance (Weight 25%)` (Slider, value display).
      - `Section B: Delivery Timeline & Schedule Adherence (Weight 20%)` (Slider).
      - `Section C: Commercial Terms & Price Stability (Weight 15%)` (Slider).
      - `Section D: Warranty & Technical Support (Weight 20%)` (Slider).
      - `Section E: Safety & Statutory Compliance (Weight 10%)` with checkbox `[x] Included in Review`. (If unchecked, displays `N/A (Weight Redistributed)` and formula scales remaining 5 sections over 90%).
      - `Section F: Responsiveness & Relationship (Weight 10%)` (Slider).
    - `Evaluation Notes & Summary` (Textarea).
    - Submit button: `Record Rating & Apply Status`.
- **What the user does:**
  1. Clicks **`+ Evaluate Vendor`**.
  2. Selects Vendor: `"Apex Infotech Pvt Ltd"`.
  3. Sets Sliders: Section A = `95`, Section B = `90`, Section C = `85`, Section D = `95`, Section E = `90`, Section F = `90`.
  4. Observes live calculation: `Computed Weighted Score: 91.5 / 100` → `Outcome Band: Preferred (Fast-Track)` (Emerald badge).
  5. Enters Notes: `"Flawless delivery of 20 Dell Laptops with 0 DOA items and proactive BIOS configuration support."`
  6. Clicks **`Record Rating & Apply Status`**.
- **What happens on submit:**
  - Calls `submitVendorRating` RPC (`/api/procurement/ratings/submit`).
  - Computes weighted score, maps to outcome band, and updates `vendors.status`.
  - Toast fires: _"Vendor Performance Rating Recorded: Weighted Score: 91.5 → Outcome: PREFERRED"_.
- **What changes elsewhere as a result:**
  - Vendor rating card is added to the list showing 6-pillar breakdown badges.
  - In Vendor Master, Apex Infotech status is tagged as `preferred`.
- **Screenshot placeholder:** `![Step 18](./screenshots/step18.png)`

---

### Step 19 — Vendor Debarment / Suspension Trigger Screen

- **Route/URL:** `/procurement/vendor-ratings` (Modal & Table)
- **Role required to see this screen:** `purchase_committee`, `evp`, `admin`.
- **What the screen shows:**
  - **Low-Score Debarment Scenario:**
    - If a vendor scores below threshold (e.g. Weighted Score < 50), the live outcome calculator immediately switches to **`Debarred / Blacklisted`** (`bg-red-600 text-white`).
    - Warning banner appears: `🚨 Severe Non-Performance Trigger: Score < 50 triggers institutional debarment in Master Register.`
  - **Rating Summary Card for Debarred Vendor (`BadVendor Ltd`):**
    - Vendor: `BadVendor Ltd`, Badge: `[DEBARRED / BLACKLISTED]` (red).
    - Weighted Score: `32.0 / 100` (dark red font).
    - Pillar breakdown: `Quality: 20 • Delivery: 10 • Pricing: 40 • Support: 20 • Safety: 50 • Relations: 20`.
    - Committee Remarks: `Severe breach of delivery timelines (+90 days overdue) and counterfeit component delivery.`
- **What the user does:**
  1. Opens Evaluate Vendor dialog for an offending supplier.
  2. Adjusts sliders to reflect failure: Quality `20`, Delivery `10`, Pricing `40`, Support `20`, Safety `50`, Relations `20`.
  3. Live preview shows `32.0 / 100` → `Debarred / Blacklisted`.
  4. Enters failure remarks and clicks **`Record Rating & Apply Status`**.
- **What happens on submit:**
  - Server function sets `vendors.status = 'debarred'`.
  - Toast fires: _"Vendor Performance Rating Recorded: Weighted Score: 32 → Outcome: DEBARRED"_.
- **What changes elsewhere as a result:**
  - Database row in `vendors` table is set to `status = 'debarred'`.
- **Screenshot placeholder:** `![Step 19](./screenshots/step19.png)`

---

### Step 20 — RFQ Vendor Picker Debarment Exclusion Verification

- **Route/URL:** `/procurement/rfqs` (Send RFQ Modal)
- **Role required to see this screen:** `procurement_officer`, `procurement_executive`, `admin`.
- **What the screen shows:**
  - **Send RFQ Modal (Empanelled Vendor Picker):**
    - The vendor picker query explicitly filters: `SELECT * FROM vendors WHERE status = 'empanelled'`.
    - Debarred vendors (`status = 'debarred'`), suspended vendors (`status = 'suspended'`), or un-empanelled applicants (`status = 'applied'`) do NOT appear in the selection list.
    - Verified Vendor Picker List shows only clean, empanelled vendors:
      - `[x] Apex Infotech Pvt Ltd (GST: 29AAACA1234A1Z1) — Status: empanelled`
      - `[x] ByteCore Systems Ltd (GST: 29AAACB5678B1Z2) — Status: empanelled`
      - `[x] CompuServe Solutions Ltd (GST: 29AAACC9012C1Z3) — Status: empanelled`
      - `[x] Zenith Laboratory Supplies LLP (GST: 29AAACZ1234F1Z5) — Status: empanelled`
    - Any debarred vendor (e.g. `BadVendor Ltd`) is completely excluded, preventing illicit bid invitations.
- **What the user does:**
  - Sourcing officer opens the Send RFQ dialog and confirms that debarred or non-compliant suppliers cannot be selected.
- **What happens on submit:**
  - Guarantees RFQ distribution solely to verified, high-performing suppliers.
- **What changes elsewhere as a result:**
  - Enforces SOP §5 and Annexure 4 vendor governance at the sourcing gate.
- **Screenshot placeholder:** `![Step 20](./screenshots/step20.png)`

---

## Role → Route Access Matrix (Code-Verified)

The following access matrix is generated directly from inspection of client route guards (`src/routes/*`, `src/components/Layout.tsx`) and RPC server authorization checks (`src/server/procurement/guards.ts`):

| Screen / Route             | Route URL                     | Allowed User Roles                                                                    | Server-Side Mutation Authorization Guard                                                                   |
| :------------------------- | :---------------------------- | :------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| **Procurement Hub**        | `/procurement`                | All authenticated users                                                               | Read-only portal overview                                                                                  |
| **My Approvals**           | `/procurement/approvals`      | `hod`, `principal`, `purchase_committee`, `evp`, `finance`, `admin`                   | `assertRole(ctx, [assigned_approver_role, 'admin'])`                                                       |
| **Requisitions (PR)**      | `/procurement/raise-pr`       | `hod`, `principal`, `procurement_officer`, `admin`, all authenticated staff           | `createPr` allows any verified session user; matrix dictates approver                                      |
| **RFQ Management**         | `/procurement/rfqs`           | `procurement_officer`, `procurement_executive`, `admin`                               | `assertRole(ctx, ['procurement_officer', 'procurement_executive', 'admin'])`                               |
| **Quotation Portal**       | `/quotation/$id`              | Public / Invited Vendor (Token/UUID keyed)                                            | Public insert to `quotation_responses` when quotation is active                                            |
| **Comparative (CS)**       | `/procurement/cs`             | `procurement_officer`, `purchase_committee`, `director_admin_finance`, `evp`, `admin` | `prepareCs`: Procurement; `approveCs`: Matrix assigned role (`purchase_committee`, `evp`, `admin`)         |
| **Purchase Orders**        | `/procurement/orders`         | `procurement_officer`, `procurement_executive`, `purchase_committee`, `evp`, `admin`  | `createPo`/`issuePo`: Procurement; `approvePo`: Matrix assigned role; `amendPo`: Procurement + re-approval |
| **Goods Receipt (GRN)**    | `/procurement/grns`           | `stores`, `hod`, `admin`                                                              | `recordDelivery`/`createGrn`: `stores`, `admin`; `technicalVerify`: `hod`, `admin`                         |
| **Invoices & 3-Way Match** | `/procurement/invoices`       | `finance`, `admin`, `procurement_officer`                                             | `submitInvoice`: Finance/Procurement; `approveInvoice`/`recordPayment`: `finance`, `admin`                 |
| **Emergency (§9)**         | `/procurement/emergency`      | `hod`, `principal`, `procurement_officer`, `evp`, `admin`                             | `requestEmergency`: All roles; `approveEmergency`: `evp`, `admin` only                                     |
| **Vendor Master**          | `/procurement/vendors`        | Open intake / `procurement_officer`, `purchase_committee`, `evp`, `admin`             | `apply`: Public/Admin; `evaluate`: `purchase_committee`, `admin`; `approve`: `evp`, `admin` only           |
| **Vendor Ratings**         | `/procurement/vendor-ratings` | `procurement_officer`, `purchase_committee`, `admin`                                  | `submitVendorRating`: `procurement_officer`, `purchase_committee`, `admin`                                 |

---

## Known UI Gaps

In the spirit of complete transparency, the following minor UI details differ between the business specification and the current codebase implementation:

1. **Step 5 (`/quotation/$id` Public Vendor Form):** The quotation response page is currently configured with `ssr: false` in TanStack Router. When accessed via direct URL, it loads cleanly on the client; however, individual vendor line items are captured as a combined structured description payload rather than a multi-row interactive table in the public view.
2. **Step 8 (GRN Over-Delivery Visual Alert):** The overdelivery block is enforced synchronously on the server (rejecting with error if cumulative accepted quantity exceeds PO quantity) and caught via a toast alert, rather than an inline red form input border validation on the `Qty Accepted` number field prior to submission.
3. **Step 19 (Debarment Countersign Dedicated View):** The debarment status is triggered automatically upon recording a weighted score below 50 in `VendorRatings.tsx` or rejecting in `VendorManagement.tsx`. A separate standalone "Debarment Countersignature" modal is not a distinct route; it is integrated directly into the EVP Approval tab of the Vendor Management hub.
4. **Step 3 (PR Return-for-Clarification Action):** In `MyApprovals.tsx`, the action buttons for pending PRs are currently `Approve`, `Reject`, and `Escalate`. While the database schema supports `returned_for_clarification`, the UI routes this flow via the `Reject` dialog remarks or `Escalate` dialog rather than a dedicated yellow `Return` button.
