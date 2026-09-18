import { useNavigate } from '@tanstack/react-router';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  FileSpreadsheet,
  Users,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Scale,
  ShoppingBag,
  UserCheck,
  Truck,
  Receipt,
  Zap,
  Award,
} from 'lucide-react';

export default function ProcurementHub() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> SOP Compliant Procure-to-Pay (P2P) Platform
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Procurement Lifecycle & Governance
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Server-governed approval matrix, multi-vendor solicitations, three-way match payment gate, emergency cap ledger, and performance ratings.
          </p>
        </div>

        {/* Quick Access to Unified Approvals */}
        <Card className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 dark:from-purple-950/40 dark:via-indigo-950/40 dark:to-blue-950/40 border-purple-200 dark:border-purple-900">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Unified Approvals Inbox</CardTitle>
                <CardDescription>
                  Review and authorize PRs, Comparative Statements, POs, Invoices, and Emergency requests based on your matrix roles.
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={() => navigate({ to: '/procurement/approvals' })}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shrink-0"
            >
              Open My Approvals <ArrowRight className="w-4 h-4" />
            </Button>
          </CardHeader>
        </Card>

        {/* Workflow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. PR Card */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-blue-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-1.5">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">1. Requisitions (PR)</CardTitle>
              <CardDescription className="text-xs">
                Create PR with net quantity check & matrix routing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/raise-pr' })} className="w-full gap-1.5 text-xs h-8">
                Raise PR <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 2. RFQ Card */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-sky-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-600 dark:text-sky-400 mb-1.5">
                <FileText className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">2. Solicitations (RFQ)</CardTitle>
              <CardDescription className="text-xs">
                Invite empanelled vendors (min count enforced) & quotes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/rfqs' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Manage RFQs <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 3. CS Card */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-emerald-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5">
                <Scale className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">3. Statements (CS)</CardTitle>
              <CardDescription className="text-xs">
                Evaluate bids & enforce non-lowest rationale gate.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/cs' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Comparative CS <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 4. PO Card */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-indigo-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-1.5">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">4. Purchase Orders</CardTitle>
              <CardDescription className="text-xs">
                Issue POs with PO-splitting & amendment tier checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/orders' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Purchase Orders <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 5. GRN Card */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-emerald-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5">
                <Truck className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">5. Goods Receipt (GRN)</CardTitle>
              <CardDescription className="text-xs">
                Stores package verification & technical sign-off.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/grns' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Stores Receipts <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 6. Invoice & 3-Way Match */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-emerald-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5">
                <Receipt className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">6. 3-Way Match & Pay</CardTitle>
              <CardDescription className="text-xs">
                PO ↔ GRN ↔ Invoice match gate before payment release.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/invoices' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Invoices & Match <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 7. Emergency Procurement */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-amber-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-1.5">
                <Zap className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">7. Emergency (§9)</CardTitle>
              <CardDescription className="text-xs">
                Hard ₹10L annual cap ledger & EVP authorization.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/emergency' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Emergency Register <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* 8. Vendor Ratings */}
          <Card className="hover:shadow-lg transition-all duration-200 border-2 hover:border-purple-500/50 flex flex-col justify-between">
            <CardHeader className="p-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-1.5">
                <Award className="w-4 h-4" />
              </div>
              <CardTitle className="text-base">8. Vendor Ratings</CardTitle>
              <CardDescription className="text-xs">
                6-Pillar scoring (Annexure 4) & debarment gates.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Button onClick={() => navigate({ to: '/procurement/vendor-ratings' })} variant="outline" className="w-full gap-1.5 text-xs h-8">
                Performance Ratings <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
