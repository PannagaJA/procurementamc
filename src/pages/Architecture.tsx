import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MermaidViewer } from "@/components/MermaidViewer";
import { ThemeToggle } from "@/components/theme-toggle";
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
  ArrowLeft,
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
  ExternalLink,
  Home,
  AlertOctagon,
} from "lucide-react";

const DIAGRAM_1_P2P = `flowchart TD
    subgraph Sourcing ["1. Requisition & Sourcing"]
        PR_Draft["PR: draft / pending_approval"] -->|"resolveApprover"| PR_Approved["PR: approved"]
        PR_Approved -->|"Min 3 Quotations Rule"| RFQ_Sent["RFQ: sent"]
        RFQ_Sent -->|"quotation_responses"| CS_Sub["CS: submitted"]
        CS_Sub -->|"CS Evaluation & 4-Pillar Scoring"| CS_App["CS: approved"]
    end

    subgraph Emergency ["Emergency Fast-Track"]
        PR_Emergency["Emergency Requisition"] -->|"Cap Check <= ₹10L"| EP_Pending["Emergency Procurement: pending"]
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
    MaxEVP --> End`;

const DIAGRAM_3_THREE_WAY_MATCH = `flowchart TD
    Inv_In["Incoming Invoice (Amount, Qty, Line Items)"] --> Check_PO{"1. PO Verification"}
    Check_PO -->|"PO Exists & Status == issued"| Check_GRN{"2. GRN Verification"}
    Check_PO -->|"PO Invalid / Closed"| Fail_PO["Match Failed: PO_NOT_VALID"]

    Check_GRN -->|"GRN Exists & Status == accepted"| Check_Qty{"3. Quantity Match"}
    Check_GRN -->|"GRN Missing / Rejected"| Fail_GRN["Match Failed: GOODS_NOT_ACCEPTED"]

    Check_Qty -->|"Invoice Qty <= GRN Accepted Qty"| Check_Price{"4. Price Tolerance"}
    Check_Qty -->|"Invoice Qty > Accepted Qty"| Fail_Qty["Match Failed: OVER_DELIVERY_BILLED"]

    Check_Price -->|"Invoice Price <= PO Unit Price"| Check_Dup{"5. Duplicate Audit"}
    Check_Price -->|"Invoice Price > PO Unit Price"| Fail_Price["Match Failed: PRICE_EXCEEDS_PO"]

    Check_Dup -->|"Invoice No. Unique for Vendor"| Success["Result: 'matched'<br/>Eligible for Payment"]
    Check_Dup -->|"Invoice No. Already Logged"| Fail_Dup["Match Failed: DUPLICATE_INVOICE"]

    Fail_PO --> Hold["Status: 'on_hold' + Audit Note"]
    Fail_GRN --> Hold
    Fail_Qty --> Hold
    Fail_Price --> Hold
    Fail_Dup --> Hold`;

const DIAGRAM_4_EMERGENCY = `flowchart TD
    EP_Req["Emergency Procurement Raised"] --> Led_Check{"Check emergency_annual_ledger"}
    Led_Check -->|"Running Total + Amount <= ₹10L"| EVP_Auth{"EVP Approval Gate"}
    Led_Check -->|"Running Total + Amount > ₹10L"| Hard_Block["Hard Error: ANNUAL_CAP_EXCEEDED<br/>SOP §9 Mandate"]

    EVP_Auth -->|"EVP Approves"| Update_Led["Update Ledger Running Total"]
    EVP_Auth -->|"EVP Rejects"| EP_Rej["Status: 'rejected'"]

    Update_Led --> Gen_PO["Generate Emergency PO (Status: issued)"]
    Gen_PO --> Stores_Rec["Direct Vendor Supply & Fast-Track GRN"]
    Stores_Rec --> Fin_Pay["Expedited Settlement"]`;

export default function Architecture() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("p2p");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col w-full overflow-x-hidden">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-[56px] sm:min-h-[64px] py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => navigate({ to: "/" })}
              className="p-1.5 sm:p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              title="Return to App"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-md shrink-0">
                P2P
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                  Architecture & Governance
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 hidden md:block truncate">
                  Institutional Procure-to-Pay Lifecycle Reference
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <ThemeToggle />
            <Button
              size="sm"
              onClick={() => navigate({ to: "/procurement" })}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs font-semibold rounded-lg shadow-sm h-8 sm:h-9 px-2.5 sm:px-3.5"
            >
              <Home className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Enter Platform</span>
              <span className="sm:hidden">App</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Hero Header */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 text-white p-4 sm:p-8 shadow-xl border border-indigo-900/50 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 max-w-full">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SOP Compliance Engine & Execution Blueprint</span>
          </div>
          <h2 className="text-lg sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-snug">
            Institutional Procurement Architecture
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed">
            Comprehensive system documentation covering the server-side approval matrix, minimum
            3-quotation multi-vendor solicitations, three-way match payment gate, ₹10 Lakh emergency
            budget ledger, and 6-pillar vendor evaluation scorecard.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 pt-3 sm:pt-4 border-t border-slate-700/60 text-[11px] sm:text-xs">
            <div className="p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-0.5">
              <span className="text-slate-400 block font-medium">Database Layer:</span>
              <span className="font-bold text-white">43 Relational Tables</span>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-0.5">
              <span className="text-slate-400 block font-medium">Security Model:</span>
              <span className="font-bold text-white">PostgreSQL RLS</span>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-0.5">
              <span className="text-slate-400 block font-medium">Delegation Tiers:</span>
              <span className="font-bold text-white">5-Level Authority Matrix</span>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-0.5">
              <span className="text-slate-400 block font-medium">Payment Gate:</span>
              <span className="font-bold text-white">3-Way Match (PO↔GRN↔Inv)</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-1 scrollbar-thin">
            <TabsList className="inline-flex w-max min-w-full md:w-full md:grid md:grid-cols-5 h-auto p-1.5 gap-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-xl">
              <TabsTrigger
                value="p2p"
                className="font-semibold text-xs sm:text-sm py-2 px-3 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                1. P2P Lifecycle
              </TabsTrigger>
              <TabsTrigger
                value="matrix"
                className="font-semibold text-xs sm:text-sm py-2 px-3 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                2. Approval Matrix
              </TabsTrigger>
              <TabsTrigger
                value="match"
                className="font-semibold text-xs sm:text-sm py-2 px-3 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                3. Three-Way Match
              </TabsTrigger>
              <TabsTrigger
                value="emergency"
                className="font-semibold text-xs sm:text-sm py-2 px-3 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                4. Emergency Cap
              </TabsTrigger>
              <TabsTrigger
                value="accounts"
                className="font-semibold text-xs sm:text-sm py-2 px-3 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                5. Demo Accounts
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: FULL P2P LIFECYCLE */}
          <TabsContent value="p2p" className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Workflow className="w-5 h-5" />
                  <CardTitle className="text-base sm:text-lg">
                    End-to-End Procure-to-Pay (P2P) Flowchart
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  State transitions from requisition creation, multi-vendor solicitations, and
                  comparative statement evaluation through purchase order issuance, inward goods
                  receipt, and payment settlement.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="p-2 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto w-full">
                  <MermaidViewer code={DIAGRAM_1_P2P} id="diagram-p2p" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-1">
                    <span className="font-bold text-blue-900 dark:text-blue-200 block text-sm">
                      1. Sourcing Gate
                    </span>
                    <p className="text-slate-600 dark:text-slate-400">
                      Requisitions check current stock availability to compute net purchase
                      quantities. Solicitations enforce a minimum of 3 empanelled vendor bids.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 space-y-1">
                    <span className="font-bold text-purple-900 dark:text-purple-200 block text-sm">
                      2. PO Commitment
                    </span>
                    <p className="text-slate-600 dark:text-slate-400">
                      POs inherit vendor rates from Comparative Statements. Scope alterations and
                      cost variations trigger re-approval routing.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 space-y-1">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 block text-sm">
                      3. Goods Receipt
                    </span>
                    <p className="text-slate-600 dark:text-slate-400">
                      Two-step verification: Central Stores physical gate inwarding (Delivery
                      Challan) followed by inspecting department technical verification (GRN).
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-1">
                    <span className="font-bold text-amber-900 dark:text-amber-200 block text-sm">
                      4. 3-Way Match
                    </span>
                    <p className="text-slate-600 dark:text-slate-400">
                      Finance payment gate verifies that invoiced item pricing and billed quantities
                      match accepted GRNs and issued PO lines before payout.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: APPROVAL MATRIX */}
          <TabsContent value="matrix" className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Activity className="w-5 h-5 shrink-0" />
                  <CardTitle className="text-base sm:text-lg">
                    Delegated Authority Matrix & Escalation Engine
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  Server-side deterministic rule resolution based on item category, single
                  transaction ceilings, and departmental monthly budget caps.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="p-2 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto w-full">
                  <MermaidViewer code={DIAGRAM_2_MATRIX} id="diagram-matrix" />
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold uppercase border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">Category</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Single Txn Limit</th>
                        <th className="p-3">Monthly Cap</th>
                        <th className="p-3">Approving Role</th>
                        <th className="p-3">Min Quotes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
                      <tr>
                        <td className="p-3 font-sans font-medium">small_value</td>
                        <td className="p-3">petty_cash</td>
                        <td className="p-3">₹2,000</td>
                        <td className="p-3">₹20,000</td>
                        <td className="p-3 font-bold text-blue-600">hod</td>
                        <td className="p-3">0</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans font-medium">small_value</td>
                        <td className="p-3">direct_purchase</td>
                        <td className="p-3">₹5,000</td>
                        <td className="p-3">₹50,000</td>
                        <td className="p-3 font-bold text-indigo-600">principal</td>
                        <td className="p-3">1</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans font-medium">routine_consumable</td>
                        <td className="p-3">rate_contract</td>
                        <td className="p-3">₹2,00,000</td>
                        <td className="p-3">₹10,00,000</td>
                        <td className="p-3 font-bold text-blue-600">hod</td>
                        <td className="p-3">1</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans font-medium">equipment_asset</td>
                        <td className="p-3">limited_tender</td>
                        <td className="p-3">₹5,00,000</td>
                        <td className="p-3">₹25,00,000</td>
                        <td className="p-3 font-bold text-purple-600">purchase_committee</td>
                        <td className="p-3">3</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans font-medium">equipment_asset</td>
                        <td className="p-3">open_tender</td>
                        <td className="p-3">No Limit (&gt;₹5L)</td>
                        <td className="p-3">No Limit</td>
                        <td className="p-3 font-bold text-amber-600">evp</td>
                        <td className="p-3">3</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden space-y-2.5">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">
                        Petty Cash (small_value)
                      </span>
                      <Badge className="bg-blue-600 text-white text-[10px]">HOD</Badge>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Txn Limit: ₹2,000</span>
                      <span>Monthly Cap: ₹20,000</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">
                        Direct Purchase (small_value)
                      </span>
                      <Badge className="bg-indigo-600 text-white text-[10px]">Principal</Badge>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Txn Limit: ₹5,000</span>
                      <span>Monthly Cap: ₹50,000</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">
                        Rate Contract (Consumables)
                      </span>
                      <Badge className="bg-blue-600 text-white text-[10px]">HOD</Badge>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Txn Limit: ₹2,00,000</span>
                      <span>Monthly Cap: ₹10,00,000</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">
                        Limited Tender (Assets)
                      </span>
                      <Badge className="bg-purple-600 text-white text-[10px]">Purchase Comm.</Badge>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Txn Limit: ₹5,00,000 (Min 3 Quotes)</span>
                      <span>Monthly Cap: ₹25,00,000</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">Open Tender (&gt;₹5L)</span>
                      <Badge className="bg-amber-600 text-white text-[10px]">EVP</Badge>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Ceiling: Institutional Cap</span>
                      <span>Mandate: Min 3 Quotes</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: THREE-WAY MATCH */}
          <TabsContent value="match" className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Receipt className="w-5 h-5 shrink-0" />
                  <CardTitle className="text-base sm:text-lg">
                    Three-Way Match Payment Validation Gate
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  Automated financial security gate cross-checking Purchase Order lines, Goods
                  Receipt Notes, and Vendor Invoices before funds disbursement.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="p-2 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto w-full">
                  <MermaidViewer code={DIAGRAM_3_THREE_WAY_MATCH} id="diagram-match" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="font-bold text-slate-900 dark:text-white block text-sm">
                      1. Quantity Tolerance
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Billed invoice quantity must be less than or equal to the accepted goods
                      quantity recorded on the technical GRN.
                    </p>
                  </div>
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="font-bold text-slate-900 dark:text-white block text-sm">
                      2. Rate Verification
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Unit price billed on the vendor invoice cannot exceed the agreed contractual
                      purchase order rate.
                    </p>
                  </div>
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="font-bold text-slate-900 dark:text-white block text-sm">
                      3. Duplicate Protection
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Unique database constraint on{" "}
                      <code className="text-blue-600 dark:text-blue-400 font-mono font-semibold">
                        (vendor_id, invoice_number)
                      </code>{" "}
                      blocks duplicate submissions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: EMERGENCY CAP LEDGER */}
          <TabsContent value="emergency" className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Zap className="w-5 h-5 shrink-0" />
                  <CardTitle className="text-base sm:text-lg">
                    Emergency Fast-Track & Annual Cap Ledger
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  Emergency procurement workflow with hard annual spending limits (₹10,00,000 per
                  financial year) and EVP authorization.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="p-2 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto w-full">
                  <MermaidViewer code={DIAGRAM_4_EMERGENCY} id="diagram-emergency" />
                </div>

                <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-sm">
                    <AlertOctagon className="w-4 h-4 shrink-0" /> Statutory Emergency Rules
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                    <li>
                      Emergency procedures are restricted to sudden failures threatening campus
                      safety, academic continuity, or major infrastructure breakdown.
                    </li>
                    <li>
                      All emergency procurements deduct from the annual ledger in real-time. Any
                      transaction exceeding the ₹10 Lakh cap is strictly rejected by server
                      triggers.
                    </li>
                    <li>
                      Requires EVP written authorization or formal ratification within 48 hours of
                      emergency engagement.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: DEMO ACCOUNTS */}
          <TabsContent value="accounts" className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Users className="w-5 h-5 shrink-0" />
                  <CardTitle className="text-base sm:text-lg">
                    Demo Accounts & Pre-Configured Test Personas
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  All accounts use default password{" "}
                  <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-slate-900 dark:text-white">
                    Password@123
                  </code>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold uppercase border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">Role</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Persona Name</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Key Focus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="p-3 font-bold text-blue-600">Admin</td>
                        <td className="p-3 font-mono font-medium">admin@institution.edu</td>
                        <td className="p-3">Dr. System Administrator</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">User management & system settings</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-amber-600">EVP</td>
                        <td className="p-3 font-mono font-medium">evp@institution.edu</td>
                        <td className="p-3">Dr. Rajesh Sharma</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">CapEx (&gt;₹5L) & Emergency ledger</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-indigo-600">Principal</td>
                        <td className="p-3 font-mono font-medium">principal@institution.edu</td>
                        <td className="p-3">Dr. Anand Kumar</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">High-value academic requisitions</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-purple-600">HOD (CSE)</td>
                        <td className="p-3 font-mono font-medium">hod.cse@institution.edu</td>
                        <td className="p-3">Prof. Vikram Seth</td>
                        <td className="p-3">CSE</td>
                        <td className="p-3 text-slate-500">Dept PRs & Lab technical GRN</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-purple-600">Purchase Committee</td>
                        <td className="p-3 font-mono font-medium">
                          purchase.committee@institution.edu
                        </td>
                        <td className="p-3">Prof. Sunita Rao</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">RFQ & CS evaluations</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-sky-600">Procurement Officer</td>
                        <td className="p-3 font-mono font-medium">
                          procurement.officer@institution.edu
                        </td>
                        <td className="p-3">Suresh Menon</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">RFQ creation & PO issuance</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-emerald-600">Finance Officer</td>
                        <td className="p-3 font-mono font-medium">finance@institution.edu</td>
                        <td className="p-3">Priya Nambiar</td>
                        <td className="p-3">Central Admin</td>
                        <td className="p-3 text-slate-500">3-Way Match & NEFT payouts</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-teal-600">Stores Keeper</td>
                        <td className="p-3 font-mono font-medium">stores@institution.edu</td>
                        <td className="p-3">Manoj Kumar</td>
                        <td className="p-3">Central Stores</td>
                        <td className="p-3 text-slate-500">Delivery Challans & GRN entries</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-600">Faculty Requisitioner</td>
                        <td className="p-3 font-mono font-medium">faculty.cse@institution.edu</td>
                        <td className="p-3">Dr. Ananya Roy</td>
                        <td className="p-3">CSE</td>
                        <td className="p-3 text-slate-500">Raise PRs & Helpdesk tickets</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Persona Cards */}
                <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      role: "Admin",
                      email: "admin@institution.edu",
                      name: "Dr. System Administrator",
                      dept: "Central Admin",
                      color: "bg-blue-600",
                    },
                    {
                      role: "EVP",
                      email: "evp@institution.edu",
                      name: "Dr. Rajesh Sharma",
                      dept: "Central Admin",
                      color: "bg-amber-600",
                    },
                    {
                      role: "Principal",
                      email: "principal@institution.edu",
                      name: "Dr. Anand Kumar",
                      dept: "Central Admin",
                      color: "bg-indigo-600",
                    },
                    {
                      role: "HOD (CSE)",
                      email: "hod.cse@institution.edu",
                      name: "Prof. Vikram Seth",
                      dept: "Computer Science",
                      color: "bg-purple-600",
                    },
                    {
                      role: "Purchase Committee",
                      email: "purchase.committee@institution.edu",
                      name: "Prof. Sunita Rao",
                      dept: "Central Admin",
                      color: "bg-purple-600",
                    },
                    {
                      role: "Procurement Officer",
                      email: "procurement.officer@institution.edu",
                      name: "Suresh Menon",
                      dept: "Central Admin",
                      color: "bg-sky-600",
                    },
                    {
                      role: "Finance Officer",
                      email: "finance@institution.edu",
                      name: "Priya Nambiar",
                      dept: "Central Admin",
                      color: "bg-emerald-600",
                    },
                    {
                      role: "Stores Keeper",
                      email: "stores@institution.edu",
                      name: "Manoj Kumar",
                      dept: "Central Stores",
                      color: "bg-teal-600",
                    },
                    {
                      role: "Faculty",
                      email: "faculty.cse@institution.edu",
                      name: "Dr. Ananya Roy",
                      dept: "CSE Dept",
                      color: "bg-slate-600",
                    },
                  ].map((p) => (
                    <div
                      key={p.email}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={`${p.color} text-white text-[10px]`}>{p.role}</Badge>
                        <span className="text-[11px] text-slate-500 truncate">{p.dept}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {p.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                          {p.email}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(p.email);
                        }}
                        className="w-full py-1.5 px-2 text-[11px] font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-center"
                      >
                        Copy Email
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
