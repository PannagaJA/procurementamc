# AMC Educational Institution — Inventory & Procure-to-Pay (P2P) Platform

## Client Handover & System Operations Document

**Document Version:** 1.0  
**Date of Release:** September 2026  
**Environment:** Staging / Production  
**Backend:** Supabase PostgreSQL Database (`ghbklleqjixslmdqjeub`)  
**Frontend:** React / Vite / TanStack Start

---

## 1. Executive Summary

This platform provides a complete **Procure-to-Pay (P2P)** governance system and **Centralized Inventory & Asset Management** platform tailored for academic institutions.

Key highlights:

- **Server-Governed Approval Matrix:** Enforces multi-tier approval delegation (Faculty → HOD → Principal → Purchase Committee → EVP) with strict limit validation.
- **Multi-Vendor Solicitations:** Enforces a minimum 3-vendor solicitation policy from empanelled vendor registers with technical compliance evaluation.
- **Three-Way Match Payment Gate:** Strict validation preventing financial disbursements without matching Purchase Order (PO), Goods Receipt Note (GRN), and Invoices.
- **Emergency Procurement Ceiling Ledger:** Real-time annual hard ceiling tracking (₹10,00,000 per financial year) with EVP authorization.
- **Vendor Performance Rating Matrix:** 6-pillar objective evaluation scorecard across Quality, Delivery, Price, Service, Safety, and Commercial compliance.

---

## 2. Master User Accounts & Login Credentials

All accounts are pre-configured in Supabase Authentication.

> **Default Password for All Accounts:** `Password@123`  
> **Login URL:** `/auth`

| Role / Authority          | Full Name & Title        | Email Address                         | Assigned Department     | Key Platform Responsibilities                                                                       |
| :------------------------ | :----------------------- | :------------------------------------ | :---------------------- | :-------------------------------------------------------------------------------------------------- |
| **Administrator**         | Dr. System Administrator | `admin@institution.edu`               | Central Administration  | Master access to user roles, departments, system categories, audit logs, and tickets.               |
| **Executive VP (EVP)**    | Dr. Rajesh Sharma        | `evp@institution.edu`                 | Central Administration  | Final sanction authority for capital expenditures (>₹5,00,000), Emergency Cap ledger, CS approvals. |
| **Principal**             | Dr. Anand Kumar          | `principal@institution.edu`           | Central Administration  | High-value academic PR approvals (up to ₹5,00,000), institutional PO sign-offs.                     |
| **HOD (CSE)**             | Prof. Vikram Seth        | `hod.cse@institution.edu`             | Computer Science & Engg | Departmental PR approvals (up to ₹2,00,000), Lab technical verification of delivered GRNs.          |
| **HOD (Mech)**            | Prof. Ramesh Gupta       | `hod.mech@institution.edu`            | Mechanical Engineering  | Workshop consumable PRs, mechanical equipment maintenance requests.                                 |
| **Purchase Committee**    | Prof. Sunita Rao (Chair) | `purchase.committee@institution.edu`  | Central Administration  | High-value RFQ evaluation, Comparative Statements multi-bid review, vendor rating sign-offs.        |
| **Procurement Officer**   | Suresh Menon             | `procurement.officer@institution.edu` | Central Administration  | Floats RFQs, logs vendor quotations, prepares Comparative Statements, issues POs.                   |
| **Finance Officer**       | Priya Nambiar            | `finance@institution.edu`             | Central Administration  | Three-Way Matching (PO ↔ GRN ↔ Invoice), payment authorization, NEFT/RTGS disbursements.            |
| **Central Stores Keeper** | Manoj Kumar              | `stores@institution.edu`              | Central Administration  | Inward Delivery Challan gate entry (`DC`), Goods Receipt Notes (`GRN`), stock ledger.               |
| **Faculty Requisitioner** | Dr. Ananya Roy           | `faculty.cse@institution.edu`         | Computer Science & Engg | Raises Purchase Requisitions (`PR`), raises maintenance and IT helpdesk tickets.                    |
| **Chief Librarian**       | Kavita Joshi             | `librarian@institution.edu`           | Central Library         | Library book catalog, library assets, departmental book requisitions.                               |

---

## 3. Seeded Database Records by Module

The database contains realistic, relational records spanning the full procurement and inventory lifecycle:

### A. Departments (`departments`)

1. **Computer Science & Engineering** (`CSE`)
2. **Electrical & Electronics Engineering** (`EEE`)
3. **Mechanical Engineering** (`MECH`)
4. **Civil Engineering** (`CIVIL`)
5. **Central Administration & Stores** (`ADMIN`)

### B. Locations (`locations`)

1. **Main Server Room (Room 101)** — Academic Block A
2. **CSE Advanced Computing Lab** — Tech Block 2
3. **Mechanical CAD/CAM Center** — Workshop Wing
4. **Central Stores Warehouse** — Admin Annex
5. **Central Library First Floor** — Library Complex

### C. Empanelled Vendor Master (`vendors`)

1. **Apex Tech Solutions Pvt Ltd** (GST: `29ABCDE1234F1Z5`) — _Status: Empanelled_ (IT & Servers)
2. **Dell Technologies India** (GST: `29AABCD5678G1Z9`) — _Status: Empanelled_ (OEM Hardware)
3. **Lenovo Enterprise Solutions** (GST: `29BBBBB9999K1ZQ`) — _Status: Empanelled_ (OEM Workstations)
4. **Prime Office Supplies & Stationery** (GST: `29CCCCC1111L1ZX`) — _Status: Empanelled_ (Consumables)
5. **Precision Lab Instruments Corp** (GST: `29DDDDD5555M1ZA`) — _Status: Empanelled_ (Lab Equipment)
6. **Substandard Facilities & Maintenance** (GST: `29EEEEE2222M1ZY`) — _Status: Debarred / Blacklisted_

---

### D. Purchase Requisitions (`purchase_requisitions`)

| PR Number        | Department | Title / Item                                       | Value (₹)  | Status         | Current Action / Approver                                                                      |
| :--------------- | :--------- | :------------------------------------------------- | :--------- | :------------- | :--------------------------------------------------------------------------------------------- |
| **PR-2026-0001** | CSE        | 10x Intel Xeon AI Workstations (RTX 4080 16GB)     | ₹12,00,000 | `approved`     | Progressed to RFQ, CS, PO, GRN, and Invoice.                                                   |
| **PR-2026-0002** | CSE        | 2x 75" 4K Interactive Flat Panels for Seminar Hall | ₹2,50,000  | `submitted`    | **Pending Approval:** Log in as **Principal** (`principal@institution.edu`).                   |
| **PR-2026-0003** | ADMIN      | MATLAB & Simulink Campus-Wide Suite (500 Seats)    | ₹8,00,000  | `under_review` | **Pending Approval:** Log in as **Purchase Committee** (`purchase.committee@institution.edu`). |
| **PR-2026-0004** | MECH       | CNC Carbide Milling & Lathe Tooling Sets           | ₹1,75,000  | `submitted`    | **Pending Approval:** Log in as **HOD Mech** (`hod.mech@institution.edu`).                     |
| **PR-2026-0005** | ADMIN      | 30 Cartons JK Copier A4 Paper for Examination Cell | ₹45,000    | `approved`     | Progressed to PO-2026-0002.                                                                    |

---

### E. RFQs & Solicitations (`rfqs`, `quotation_lines`)

- **RFQ-2026-0001:** Floated for PR-2026-0001 (10x AI Workstations).
  - **Bid 1 (Apex Tech):** ₹1,17,500/unit (Total: ₹11,75,000) — _Delivery: 14 Days, 3-Yr Warranty, Compliant_
  - **Bid 2 (Dell India):** ₹1,22,000/unit (Total: ₹12,20,000) — _Delivery: 21 Days, 3-Yr Warranty, Compliant_
  - **Bid 3 (Lenovo):** ₹1,24,500/unit (Total: ₹12,45,000) — _Delivery: 18 Days, 3-Yr Warranty, Compliant_

---

### F. Comparative Statement (`comparative_statements`, `cs_line_scores`)

- **CS-2026-0001:** Multi-Factor Evaluation Matrix.
  - **Rank 1 (Apex Tech):** Composite Score **94.2/100** (Recommended L1 Bidder).
  - **Rank 2 (Dell India):** Composite Score **90.4/100**.
  - **Rank 3 (Lenovo):** Composite Score **89.0/100**.
  - **Sign-off:** Approved by EVP (`evp@institution.edu`).

---

### G. Purchase Orders & Amendments (`purchase_orders`, `po_amendments`)

- **PO-2026-0001:** Issued to Apex Tech Solutions for ₹11,75,000 + 18% GST (Total: ₹13,86,500).
  - _Amendment Record:_ Approved delivery schedule extension (chipset customs clearance).
- **PO-2026-0002:** Issued to Prime Office Supplies for ₹45,000 + 18% GST (Total: ₹53,100).

---

### H. Goods Receipt & Inward Inspection (`delivery_challans`, `grns`, `grn_lines`)

- **DC-2026-0001:** Delivery Challan inwarded at Central Stores gate by Stores Keeper.
- **GRN-2026-0001:** Technical inspection and stress test benchmark verified by HOD CSE. All 10 units accepted.

---

### I. Invoices & Three-Way Match Payment (`invoices`, `payments`)

- **INV-2026-0901:** ₹13,86,500 from Apex Tech Solutions.
  - **Three-Way Match Verification:** PO-2026-0001 ↔ GRN-2026-0001 ↔ INV-2026-0901 passed with zero discrepancy (`match_status: 'matched'`).
  - **Disbursement:** NEFT Ref `HDFC-NEFT-20260922-993810` authorized by Finance Officer.

---

### J. Emergency Procurement Register & Annual Ledger (`emergency_procurements`, `emergency_annual_ledger`)

- **FY 2026-27 Ledger:** Running Total: ₹85,000 / Hard Cap: ₹10,00,000.
- **EP-2026-0001:** Campus Optical Fiber Splicing & Trenching Emergency Repair (₹85,000, Approved by EVP Dr. Rajesh Sharma).

---

### K. Vendor Performance Ratings (`vendor_ratings`)

- **Apex Tech Solutions:** Score **96.5%** (_Outcome: Preferred Vendor_)
- **Dell Technologies:** Score **91.0%** (_Outcome: Active Vendor_)
- **Precision Lab Corp:** Score **91.0%** (_Outcome: Active Vendor_)
- **Prime Office Supplies:** Score **90.5%** (_Outcome: Active Vendor_)

---

### L. Fixed Assets & Inventory (`inventory`)

1. `AMC-IT-2026-001` — Dell PowerEdge R750 2U Server (Server Room)
2. `AMC-IT-2026-002` — Intel Xeon AI Workstation 10x (CSE Lab)
3. `AMC-LAB-2026-003` — Keysight 200MHz Oscilloscopes 8x (CSE Lab)
4. `AMC-LAB-2026-004` — CNC 3-Axis Vertical Machining Station (Mech Workshop)
5. `AMC-STAT-2026-005` — JK Copier A4 Paper 250 Reams (Stores)
6. `AMC-FURN-2026-006` — Ergonomic Mesh Faculty Chairs 40x (Library)

---

### M. Maintenance & Helpdesk Tickets (`tickets`)

1. `TCK-2026-101` — CSE AI Lab Workstation Node #04 Diagnostic (_Status: In-Progress_)
2. `TCK-2026-102` — Workshop CNC Bay 3-Phase Stabilizer Voltage Fluctuation (_Status: Pending_)
3. `TCK-2026-103` — Library Wi-Fi Access Point Intermittent Reset (_Status: Resolved_)

---

## 4. Step-by-Step Client Testing & Demonstration Guide

### Scenario 1: Authorizing Pending Approvals in the Inbox

1. Log in as **Principal** (`principal@institution.edu` / `Password@123`).
2. Go to **My Approvals** (`/procurement/approvals`).
3. View the tab **PR (1)** to see `PR-2026-0002` (Smart Interactive Displays ₹2,50,000).
4. Click **Approve** to record the digital sanction with audit comments.

### Scenario 2: Multi-Vendor RFQ to Comparative Statement

1. Log in as **Procurement Officer** (`procurement.officer@institution.edu` / `Password@123`).
2. Navigate to **RFQs & Quotes** (`/procurement/rfqs`).
3. Click **Create RFQ** for an approved PR, select 3 empanelled vendors, and submit bids.
4. Navigate to **Comparative (CS)** (`/procurement/cs`) to view scoring matrices and formulate L1 recommendations.

### Scenario 3: Three-Way Match Payment Verification

1. Log in as **Finance Officer** (`finance@institution.edu` / `Password@123`).
2. Navigate to **Invoices & Match** (`/procurement/invoices`).
3. View the automated 3-Way Match validation card verifying matching quantities and amounts between the Purchase Order, GRN, and Vendor Invoice before authorizing payout.

### Scenario 4: Emergency Procurement & Budget Cap

1. Log in as **EVP** (`evp@institution.edu` / `Password@123`).
2. Navigate to **Emergency Procurement** (`/procurement/emergency`).
3. Monitor the live **FY 2026-27 Cap Ledger** showing remaining ceiling funds under the ₹10,00,000 threshold.

---

## 5. Technical Configuration & Build Verification

- **TypeScript Compilation:** `npx tsc --noEmit` passing with **0 errors**.
- **Production Build:** `npm run build` compiled into optimized client and SSR bundles.
- **Browser Client Security Guard:** Guaranteed usage of Supabase publishable keys in web clients to avoid 401 unauthorized errors.
- **UI Responsiveness:** Verified on 375px (Mobile), 768px (Tablet), 1024px (Laptop), and 1440px+ (Desktop).
