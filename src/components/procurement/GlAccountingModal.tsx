import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  buildGlVoucher,
  generateTallyXml,
  generateSapCsv,
  generateGenericGlCsv,
  type GlVoucher,
} from "@/lib/procurement/accountingConnector";
import {
  FileCode,
  Download,
  Send,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  Database,
  Building,
} from "lucide-react";

interface GlAccountingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: any[];
}

type ExportFormat = "tally_xml" | "sap_csv" | "generic_csv" | "webhook_json";

export function GlAccountingModal({ open, onOpenChange, invoices }: GlAccountingModalProps) {
  const { toast } = useToast();
  const [targetFormat, setTargetFormat] = useState<ExportFormat>("tally_xml");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [transmitting, setTransmitting] = useState(false);
  const [webhookResponse, setWebhookResponse] = useState<any | null>(null);

  // Eligible invoices: approved or paid
  const eligibleInvoices = useMemo(() => {
    return (invoices || []).filter(
      (inv) => inv.match_status === "approved" || inv.match_status === "paid" || inv.payments?.length > 0,
    );
  }, [invoices]);

  // Transform eligible into balanced GlVouchers
  const vouchers: GlVoucher[] = useMemo(() => {
    return eligibleInvoices.map((inv) => buildGlVoucher(inv));
  }, [eligibleInvoices]);

  // Selected vouchers
  const activeVouchers = useMemo(() => {
    if (selectedInvoiceIds.length === 0) return vouchers;
    return vouchers.filter((v) => selectedInvoiceIds.includes(v.invoiceNumber));
  }, [vouchers, selectedInvoiceIds]);

  // Double-entry validation checks
  const doubleEntryCheck = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let capitalizedCount = 0;

    activeVouchers.forEach((v) => {
      if (v.isCapitalizedAsset) capitalizedCount++;
      v.lines.forEach((l) => {
        if (l.type === "DEBIT") totalDebit += l.amount;
        if (l.type === "CREDIT") totalCredit += l.amount;
      });
    });

    const isBalanced = Math.abs(totalDebit - totalCredit) < 1; // within rounding precision
    return { totalDebit, totalCredit, isBalanced, capitalizedCount };
  }, [activeVouchers]);

  // Handle Download File
  const handleDownload = () => {
    if (activeVouchers.length === 0) {
      toast({ title: "No Vouchers Selected", description: "Select at least one invoice voucher to export.", variant: "destructive" });
      return;
    }

    let fileContent = "";
    let mimeType = "text/plain";
    let fileName = `GL_Handoff_${new Date().toISOString().split("T")[0]}`;

    if (targetFormat === "tally_xml") {
      fileContent = generateTallyXml(activeVouchers);
      mimeType = "application/xml";
      fileName += "_TallyPrime.xml";
    } else if (targetFormat === "sap_csv") {
      fileContent = generateSapCsv(activeVouchers);
      mimeType = "text/csv;charset=utf-8;";
      fileName += "_SAP_BAPI.csv";
    } else if (targetFormat === "generic_csv") {
      fileContent = generateGenericGlCsv(activeVouchers);
      mimeType = "text/csv;charset=utf-8;";
      fileName += "_DoubleEntry_Journal.csv";
    } else if (targetFormat === "webhook_json") {
      fileContent = JSON.stringify({ batchTimestamp: new Date().toISOString(), institutionalCode: "AMC", vouchers: activeVouchers }, null, 2);
      mimeType = "application/json";
      fileName += "_ERP_Payload.json";
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "General Ledger Batch Exported",
      description: `Exported ${activeVouchers.length} vouchers to ${fileName} for direct ingestion into institutional ERP.`,
    });
  };

  // Handle Webhook Transmission Simulation
  const handleWebhookHandoff = () => {
    setTransmitting(true);
    setWebhookResponse(null);

    setTimeout(() => {
      setTransmitting(false);
      setWebhookResponse({
        status: 200,
        erpSystem: "SAP / Tally ERP Gateway",
        batchId: `BATCH-AMC-${Date.now()}`,
        vouchersPosted: activeVouchers.length,
        totalDebits: doubleEntryCheck.totalDebit,
        totalCredits: doubleEntryCheck.totalCredit,
        capitalizedAssetTags: activeVouchers.flatMap((v) => v.assetTags),
        message: "Double-entry vouchers accepted into Institutional General Ledger. Capitalized asset tags registered in Fixed Asset register.",
      });

      toast({
        title: "ERP Webhook Handoff Successful",
        description: `Posted ${activeVouchers.length} double-entry vouchers to institutional accounting database.`,
      });
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-xl">General Ledger (Tally / SAP / ERP) Accounting Connector</DialogTitle>
              <DialogDescription>
                Direct handoff of approved invoices and capitalized asset tags into institutional double-entry financial ledger.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format Selection & Target Systems */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target Accounting / ERP System</Label>
              <Select value={targetFormat} onValueChange={(v: any) => setTargetFormat(v)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tally_xml">Tally Prime / Tally.ERP 9 (XML Voucher Batch)</SelectItem>
                  <SelectItem value="sap_csv">SAP ERP (BAPI / IDoc Accounting CSV)</SelectItem>
                  <SelectItem value="generic_csv">Generic Double-Entry / QuickBooks (CSV)</SelectItem>
                  <SelectItem value="webhook_json">ERP Webhook / REST JSON Payload</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <span className="text-[11px] text-slate-500 font-semibold uppercase">Double-Entry Balance Verification</span>
              <div className="flex items-center gap-2">
                {doubleEntryCheck.isBalanced ? (
                  <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Balanced: Debits = Credits (₹{doubleEntryCheck.totalDebit.toLocaleString("en-IN")})
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertCircle className="w-3.5 h-3.5" /> Imbalance Detected
                  </Badge>
                )}
                {doubleEntryCheck.capitalizedCount > 0 && (
                  <Badge variant="outline" className="text-indigo-600 border-indigo-400 text-xs">
                    {doubleEntryCheck.capitalizedCount} Capitalized Assets
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Vouchers Overview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Ready for General Ledger Handoff ({activeVouchers.length} vouchers)
              </h4>
              <span className="text-xs text-slate-500 font-mono">
                Total Batch Value: ₹{doubleEntryCheck.totalDebit.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="border rounded-lg overflow-x-auto max-h-64">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-900 border-b sticky top-0">
                  <tr>
                    <th className="p-2.5 font-semibold">Voucher Ref</th>
                    <th className="p-2.5 font-semibold">Date</th>
                    <th className="p-2.5 font-semibold">Vendor / Creditor</th>
                    <th className="p-2.5 font-semibold">Cost Center</th>
                    <th className="p-2.5 font-semibold text-right">Amount (₹)</th>
                    <th className="p-2.5 font-semibold">Asset Tags</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeVouchers.map((v) => (
                    <tr key={v.voucherNumber} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {v.voucherNumber}
                      </td>
                      <td className="p-2.5">{v.date}</td>
                      <td className="p-2.5 font-medium">{v.vendorName}</td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">{v.lines[0]?.costCenter}</td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        ₹{v.totalAmount.toLocaleString("en-IN")}
                      </td>
                      <td className="p-2.5">
                        {v.assetTags.length > 0 ? (
                          <Badge variant="outline" className="font-mono text-[10px] text-indigo-600 border-indigo-400">
                            {v.assetTags[0]}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Expense (Consumable)</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge variant="secondary" className="text-[10px]">
                          {v.voucherType.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Webhook Response Preview */}
          {webhookResponse && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> ERP Handoff Acknowledgment (Batch #{webhookResponse.batchId})
              </div>
              <p className="text-slate-700 dark:text-slate-300">{webhookResponse.message}</p>
              {webhookResponse.capitalizedAssetTags?.length > 0 && (
                <div className="pt-1 text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                  Fixed Asset Tags Capitalized: {webhookResponse.capitalizedAssetTags.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleWebhookHandoff}
              disabled={transmitting || activeVouchers.length === 0}
              className="gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-300 hover:bg-indigo-50"
            >
              <Send className="w-3.5 h-3.5" />
              {transmitting ? "Posting to ERP..." : "Transmit to ERP Webhook"}
            </Button>

            <Button
              onClick={handleDownload}
              disabled={activeVouchers.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export Batch File
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
