import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MermaidViewer } from "@/components/MermaidViewer";
import {
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  Users,
  Scale,
  ShoppingBag,
  Truck,
  Receipt,
  Zap,
  Award,
  UserCheck,
  CheckCircle2,
  Code2,
  Database,
  Layers,
  ArrowRight,
  Lock,
  GitBranch,
  Terminal,
  BookOpen,
  Info,
  Network,
  Activity,
  Workflow,
  Sparkles,
} from "lucide-react";

const DIAGRAM_1_P2P = `flowchart TD
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
    end`;

const DIAGRAM_2_MATRIX = `flowchart TD
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
    FallbackEVP --> End`;

const DIAGRAM_3_CYCLE1 = `sequenceDiagram
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
    Server-->>Finance: Invoice Paid & PO Closed`;

const DIAGRAM_4_EMERGENCY = `sequenceDiagram
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
    Server-->>EVP: Emergency Procurement Ratified & Ledger Incremented`;

const DIAGRAM_5_ERD = `erDiagram
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
    }`;

const DIAGRAM_6_PO_STATE = `stateDiagram-v2
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
    cancelled --> [*]`;

interface SystemReadmeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SystemReadmeModal: React.FC<SystemReadmeModalProps> = ({ open, onOpenChange }) => {
  const [activeTab, setActiveTab] = useState("diagrams");
  const [diagramSubTab, setDiagramSubTab] = useState("p2p");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[94vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5" /> SOP Compliant Enterprise P2P
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs font-mono border-indigo-400 text-indigo-700 dark:text-indigo-300"
                >
                  Version 2.4-Production
                </Badge>
              </div>
              <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Workflow className="w-6 h-6 text-indigo-600" /> System Workflows & Documentation
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                Interactive architecture, live rendered Mermaid workflow diagrams, 10-module
                lifecycle, and 59/59 compliance tests.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Navigation Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 bg-slate-200/70 dark:bg-slate-800/70">
              <TabsTrigger
                value="diagrams"
                className="gap-1.5 py-2 text-xs font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
              >
                <GitBranch className="w-3.5 h-3.5" /> 1. Workflow Diagrams (6)
              </TabsTrigger>
              <TabsTrigger value="modules" className="gap-1.5 py-2 text-xs font-semibold">
                <Building2 className="w-3.5 h-3.5" /> 2. Procurement Modules (10)
              </TabsTrigger>
              <TabsTrigger value="overview" className="gap-1.5 py-2 text-xs font-semibold">
                <Layers className="w-3.5 h-3.5" /> 3. Architecture & Principles
              </TabsTrigger>
              <TabsTrigger value="testing" className="gap-1.5 py-2 text-xs font-semibold">
                <Terminal className="w-3.5 h-3.5" /> 4. Audit & 59 Tests
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content Area */}
          <ScrollArea className="flex-1 p-6 overflow-y-auto">
            {/* TAB 1: WORKFLOW DIAGRAMS (MERMAID RENDERED) */}
            <TabsContent value="diagrams" className="space-y-6 mt-0">
              {/* Secondary sub-tabs for switching diagrams */}
              <Tabs value={diagramSubTab} onValueChange={setDiagramSubTab} className="space-y-4">
                <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto p-1 bg-slate-200 dark:bg-slate-800 text-[11px]">
                  <TabsTrigger value="p2p" className="py-1.5">
                    1. P2P Lifecycle
                  </TabsTrigger>
                  <TabsTrigger value="matrix" className="py-1.5">
                    2. Authority Matrix
                  </TabsTrigger>
                  <TabsTrigger value="cycle1" className="py-1.5">
                    3. Standard Cycle
                  </TabsTrigger>
                  <TabsTrigger value="emergency" className="py-1.5">
                    4. Emergency (§9)
                  </TabsTrigger>
                  <TabsTrigger value="erd" className="py-1.5">
                    5. Database ERD
                  </TabsTrigger>
                  <TabsTrigger value="postate" className="py-1.5">
                    6. PO States
                  </TabsTrigger>
                </TabsList>

                {/* 1. Overall P2P */}
                <TabsContent value="p2p">
                  <MermaidViewer
                    id="p2p-lifecycle"
                    title="Overall P2P Lifecycle Flowchart (SOP §8)"
                    description="Visualizes Requisitions, Quotations, Comparative Statements, POs, GRN dual sign-off, 3-Way Match, and Payments."
                    chart={DIAGRAM_1_P2P}
                    badgeText="Flowchart TD"
                    sourceFile="Derived from supabase/migrations/ schema definitions, src/server/procurement/*.functions.ts, and Starlight P2P SOP §8."
                  />
                </TabsContent>

                {/* 2. Authority Matrix */}
                <TabsContent value="matrix">
                  <MermaidViewer
                    id="authority-matrix"
                    title="Authority Matrix Decision Tree (SOP §6)"
                    description="Evaluates single transaction limits, category routing, and monthly cumulative budget caps."
                    chart={DIAGRAM_2_MATRIX}
                    badgeText="Flowchart TD"
                    sourceFile="Derived from src/server/procurement/authorityMatrix.ts and approval_matrix_rules database seed data."
                  />
                </TabsContent>

                {/* 3. Cycle 1 Sequence */}
                <TabsContent value="cycle1">
                  <MermaidViewer
                    id="cycle1-sequence"
                    title="Standard Procurement Sequence Diagram (Laptops)"
                    description="Detailed message exchanges between Requester, EVP, Procurement Officer, Vendor, Stores, and Finance."
                    chart={DIAGRAM_3_CYCLE1}
                    badgeText="SequenceDiagram"
                    sourceFile="Derived from src/server/procurement/*.functions.ts, docs/E2E_WALKTHROUGH.md, and docs/UI_WALKTHROUGH.md."
                  />
                </TabsContent>

                {/* 4. Emergency Sequence */}
                <TabsContent value="emergency">
                  <MermaidViewer
                    id="emergency-sequence"
                    title="Emergency Procurement Sequence Diagram (SOP §9)"
                    description="Shows the annual ₹10,00,000 statutory cap verification, hard-block branch, and 48-hour post-facto ratification."
                    chart={DIAGRAM_4_EMERGENCY}
                    badgeText="SequenceDiagram"
                    sourceFile="Derived from src/server/procurement/emergency.functions.ts and 20260918000003_day3_fulfilment_payment_emergency_ratings.sql."
                  />
                </TabsContent>

                {/* 5. Database ERD */}
                <TabsContent value="erd">
                  <MermaidViewer
                    id="database-erd"
                    title="Procurement Schema Entity-Relationship Diagram (ERD)"
                    description="Covers the 19 procurement tables and relational foreign key constraints."
                    chart={DIAGRAM_5_ERD}
                    badgeText="erDiagram"
                    sourceFile="Derived from PostgreSQL migration files supabase/migrations/20260918000001_day1_procurement_foundation.sql, 20260918000002_day2_rfq_cs_po.sql, and 20260918000003_day3_fulfilment_payment_emergency_ratings.sql."
                  />
                </TabsContent>

                {/* 6. PO State Transitions */}
                <TabsContent value="postate">
                  <MermaidViewer
                    id="po-states"
                    title="Purchase Order Lifecycle State Diagram"
                    description="Shows draft, pending_approval, approved, issued, amended (with tier re-evaluation), and closed states."
                    chart={DIAGRAM_6_PO_STATE}
                    badgeText="stateDiagram-v2"
                    sourceFile="Derived from src/server/procurement/po.functions.ts and SOP §8.5."
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* TAB 2: PROCUREMENT MODULES */}
            <TabsContent value="modules" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* 1. PR */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
                        <FileSpreadsheet className="w-4 h-4" /> 1. Requisitions (PR)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/raise-pr
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Dynamic line items with inventory stock deduction, Annexure-2 due diligence,
                      non-conflict declaration, and live authority matrix preview.
                    </p>
                  </CardContent>
                </Card>

                {/* 2. Vendor Empanelment */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <Users className="w-4 h-4" /> 2. Vendor Empanelment
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/vendors
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Statutory intake (GST, PAN, Bank), 4-pillar committee evaluation (Technical,
                      Experience, Support, Financials), and 1-year EVP approval gate.
                    </p>
                  </CardContent>
                </Card>

                {/* 3. RFQ */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-sky-600">
                        <Building2 className="w-4 h-4" /> 3. Solicitations (RFQ)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/rfqs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Enforces minimum 3 empanelled vendors (§8.4), public quotation portal (
                      <code>/quotation/$id</code>), pricing capture, and specification verification.
                    </p>
                  </CardContent>
                </Card>

                {/* 4. CS */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                        <Scale className="w-4 h-4" /> 4. Comparative Statements
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/cs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Automated L1 ranking, 4-pillar score matrix, mandatory non-lowest price
                      rationale gate when bypassing L1, and Committee/EVP authority routing.
                    </p>
                  </CardContent>
                </Card>

                {/* 5. PO */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-indigo-600">
                        <ShoppingBag className="w-4 h-4" /> 5. Purchase Orders (PO)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/orders
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Standard and 6-month Rate Contract POs, amendment re-approval loop when value
                      crosses tier limits, and 30-day PO-splitting guards.
                    </p>
                  </CardContent>
                </Card>

                {/* 6. GRN */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                        <Truck className="w-4 h-4" /> 6. Goods Receipt (GRN)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/grns
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Delivery Challan security gate inward entry, dual sign-off (Security +
                      Technical inspection by HOD), and cumulative overdelivery block.
                    </p>
                  </CardContent>
                </Card>

                {/* 7. Invoices */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <Receipt className="w-4 h-4" /> 7. Invoices & 3-Way Match
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/invoices
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Automated 3-way match (PO ↔ GRN ↔ Invoice), mismatch hold state, Service PO
                      completion certificate exception (§I2), and payment UTR logging.
                    </p>
                  </CardContent>
                </Card>

                {/* 8. Emergency */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                        <Zap className="w-4 h-4" /> 8. Emergency Track (§9)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/emergency
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Hard statutory ceiling of ₹10,00,000 per Indian Financial Year, exclusive EVP
                      authorization, and 48-hour post-facto ratification rule.
                    </p>
                  </CardContent>
                </Card>

                {/* 9. Ratings */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-purple-600">
                        <Award className="w-4 h-4" /> 9. Vendor Ratings
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/vendor-ratings
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Annexure 4 6-weighted sections evaluation (A:25%, B:20%, C:15%, D:20%, E:10%,
                      F:10%), Section E N/A scaling, and 5 outcome bands.
                    </p>
                  </CardContent>
                </Card>

                {/* 10. Approvals */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-purple-700">
                        <UserCheck className="w-4 h-4" /> 10. Unified Approvals
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        /procurement/approvals
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      Centralized authorization inbox for PRs, CSs, POs, Amendments, Invoices, and
                      Emergency Requests matching the logged-in user's roles.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB 3: OVERVIEW & ARCHITECTURE */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Architecture 3-Tier Card */}
              <Card className="border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <CardTitle className="text-base font-bold">
                      Strict Three-Tier Security Architecture
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Client components cannot perform direct database mutations. All writes execute
                    through strongly-typed RPC server functions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
                      <div className="font-bold text-blue-900 dark:text-blue-200 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                          1
                        </span>
                        React UI Screens (Tier 1)
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        TanStack Start, React 19, Tailwind CSS. Form validation, live Authority
                        Matrix resolver preview, real-time 3-way match comparator.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/30">
                      <div className="font-bold text-purple-900 dark:text-purple-200 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">
                          2
                        </span>
                        Server RPC Functions (Tier 2)
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        <code>src/server/procurement/*</code>. Re-derives user role from verified
                        session, enforces SOP guards, transaction locks, and audit logging.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <div className="font-bold text-emerald-900 dark:text-emerald-200 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                          3
                        </span>
                        Supabase PostgreSQL (Tier 3)
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        19 procurement tables with Default-DENY RLS policies. Atomic sequence
                        generators for PR, RFQ, CS, PO, and GRN numbers.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 4 Core Principles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                    <ShieldCheck className="w-4 h-4" /> 1. Server-Side Enforcement
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Zero direct client mutation bypass. All approval state transitions and budget
                    updates are evaluated by server-side domain logic.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    <Scale className="w-4 h-4" /> 2. Table-Driven Rules Engine
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <code>authorityMatrix.ts</code> is dynamically driven by{" "}
                    <code>approval_matrix_rules</code> without hardcoded monetary amounts.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                    <Lock className="w-4 h-4" /> 3. Default-DENY RLS Policies
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Direct update mutations to approval, status, and financial columns are revoked
                    for clients to prevent RLS bypass attempts.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <UserCheck className="w-4 h-4" /> 4. Segregation of Duties
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Requisition (HOD) ≠ Sourcing (Procurement) ≠ Inspection (Stores/Security) ≠
                    Payment (Finance).
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: TESTING & AUDIT */}
            <TabsContent value="testing" className="space-y-4 mt-0">
              <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <CardTitle className="text-base font-bold text-emerald-900 dark:text-emerald-100">
                      Automated Compliance Test Suite: 59 / 59 Passed (100%)
                    </CardTitle>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-xs">Zero Failures</Badge>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-emerald-900 dark:text-emerald-200 space-y-3">
                  <p>
                    All boundary thresholds, guards, rolling 30-day PO split detection, 3-way match,
                    emergency cap, and 3 complete lifecycle simulations have been verified against
                    active PostgreSQL state.
                  </p>
                  <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] space-y-1">
                    <div className="text-slate-400"># Run comprehensive compliance test suite</div>
                    <div className="text-emerald-400">node scripts/verify_day4_compliance.mjs</div>
                  </div>
                </CardContent>
              </Card>

              {/* Documentation Artifacts List */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">
                  Audit & Reference Documents:
                </span>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      docs/UI_WALKTHROUGH.md
                    </span>{" "}
                    — 20-step field-level operational walkthrough.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      docs/P2P_SOP_Audit_FINAL.md
                    </span>{" "}
                    — 42-area traceability scorecard.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      docs/E2E_WALKTHROUGH.md
                    </span>{" "}
                    — 3 simulated end-to-end cycles.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      docs/OPEN_DECISIONS_FOR_SIGNOFF.md
                    </span>{" "}
                    — Policy questions for SOP owner.
                  </li>
                </ul>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer with I Understand button at bottom right */}
        <DialogFooter className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-blue-500" />
            <span>Interactive SOP System Workflows & Documentation</span>
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 shadow-md flex items-center gap-1.5 transition-all duration-200 hover:scale-105"
          >
            <CheckCircle2 className="w-4 h-4" /> I Understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export default SystemReadmeModal;
