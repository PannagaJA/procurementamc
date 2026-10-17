import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, X, Building2, CheckCircle2, ShieldCheck, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { numberToWordsInr } from "@/lib/numberToWords";
import { buildPoPdf, poLineRows } from "@/lib/procurement/poPdf";

const inr = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN")}`);

interface PoPrintPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: any | null;
}

export function PoPrintPreviewModal({ open, onOpenChange, po }: PoPrintPreviewModalProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (!po) return null;

  const pr = po.purchase_requisitions;
  const vendor = po.vendors;
  const bankDetails = vendor?.bank_details_json || {};

  const basePrice = Number(po.price || 0);
  const taxes = Number(po.taxes || 0);
  const totalValue = Number(po.total_value || basePrice + taxes);
  const amountWords = numberToWordsInr(totalValue);

  const poDateFormatted = po.created_at
    ? new Date(po.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-IN");

  const approvedDateFormatted = po.approved_at
    ? new Date(po.approved_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = await buildPoPdf(po);

      // Save
      const filename = `${po.po_number || "Purchase_Order"}.pdf`;
      doc.save(filename);
      toast({
        title: "PDF Generated Successfully",
        description: `Downloaded official institutional order ${filename}`,
      });
    } catch (e: any) {
      console.error("PDF generation error:", e);
      toast({
        title: "PDF Generation Failed",
        description: e.message || "Failed to render PDF document.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {/* Scoped CSS for browser printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #po-print-sheet, #po-print-sheet * {
            visibility: visible !important;
          }
          #po-print-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-900/90 backdrop-blur border-slate-700">
          {/* Header Action Bar */}
          <DialogHeader className="p-4 bg-slate-950 border-b border-slate-800 flex flex-row items-center justify-between no-print">
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Purchase Order Document Preview
              </DialogTitle>
              <p className="text-xs text-slate-400">
                Official Institutional Order copy for {po.po_number} with statutory header &
                signature blocks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrint}
                className="gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                {downloading ? "Generating..." : "Download Formal PDF"}
              </Button>
            </div>
          </DialogHeader>

          {/* Document Sheet Preview Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-800/50">
            <div
              id="po-print-sheet"
              ref={printRef}
              className="bg-white text-slate-900 p-6 sm:p-8 rounded-lg shadow-xl border border-slate-200 max-w-3xl mx-auto space-y-6 text-xs leading-relaxed font-sans"
            >
              {/* Formal Institutional Header */}
              <div className="border-b-2 border-indigo-900 pb-4">
                <div className="flex items-start gap-4">
                  <img
                    src="/amc.jpeg"
                    alt="AMC Logo"
                    className="w-16 h-16 object-contain rounded border border-slate-200 p-0.5 shrink-0"
                  />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                        AMC INSTITUTIONS & ENGINEERING COLLEGE
                      </h1>
                    </div>
                    <p className="text-[10px] text-slate-600 font-medium">
                      Approved by AICTE, New Delhi | Affiliated to VTU, Belagavi | Accredited by
                      NAAC & NBA
                    </p>
                    <p className="text-[10px] text-slate-600">
                      18th K.M. Bannerghatta Main Road, Kalkere, Bengaluru - 560083, Karnataka,
                      India
                    </p>
                    <p className="text-xs font-bold text-indigo-900 pt-0.5 uppercase tracking-wide">
                      CENTRAL PROCUREMENT CELL & CENTRAL STORES DIVISION
                    </p>
                    <p className="text-[9.5px] text-slate-500 font-mono">
                      GSTIN: 29AAAAA0000A1Z5 | PAN: AAAAA0000A | Email: procurement@amc.ac.in | Tel:
                      +91 80 2783 5555
                    </p>
                  </div>
                </div>
              </div>

              {/* Title & Document Badge */}
              <div className="bg-slate-100 p-2.5 rounded border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm tracking-wider text-slate-900">
                    PURCHASE ORDER
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-indigo-50 text-indigo-800 border-indigo-200 text-[10px] uppercase font-bold"
                  >
                    {(po.type || po.po_type || "regular").replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span>
                    PO Number:{" "}
                    <strong className="text-indigo-950 font-bold">{po.po_number || "DRAFT"}</strong>
                  </span>
                  <span className="text-slate-400">|</span>
                  <span>
                    Date: <strong>{poDateFormatted}</strong>
                  </span>
                  <span className="text-slate-400">|</span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px]">
                    {(po.status || "DRAFT").toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* 2-Column Info Grid: Order Details & Vendor Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Indent / PO Reference */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/60 space-y-1.5">
                  <div className="font-bold text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-700" /> Indent & Order Reference
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500 font-medium">Requisition (PR):</span>
                    <span className="col-span-2 font-mono font-semibold text-slate-800">
                      {pr?.pr_number || "Direct Indent"}
                      {pr?.approved_at && (
                        <span className="text-[10px] font-normal text-slate-500 block">
                          Approved on: {new Date(pr.approved_at).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </span>

                    <span className="text-slate-500 font-medium">Department:</span>
                    <span className="col-span-2 font-medium text-slate-800">
                      {pr?.departments?.name || "General Central Stores"}
                    </span>

                    <span className="text-slate-500 font-medium">Budget Head:</span>
                    <span className="col-span-2 text-slate-800">
                      {pr?.budget_head || "Procurement General Fund"}
                    </span>

                    <span className="text-slate-500 font-medium">Sanction Role:</span>
                    <span className="col-span-2 font-bold uppercase text-indigo-800">
                      {po.current_approver_role || "Executive Vice President"}
                    </span>

                    {po.rate_contract_id && (
                      <>
                        <span className="text-slate-500 font-medium">Rate Contract:</span>
                        <span className="col-span-2 font-mono font-semibold text-slate-800">
                          {po.rate_contracts?.contract_number || po.rate_contract_id}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Supplier / Vendor Master Details */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/60 space-y-1.5">
                  <div className="font-bold text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" /> Supplier / Vendor Master
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500 font-medium">Vendor Name:</span>
                    <span className="col-span-2 font-bold text-slate-900">
                      {vendor?.name || "N/A"}
                    </span>

                    <span className="text-slate-500 font-medium">GSTIN:</span>
                    <span className="col-span-2 font-mono font-semibold text-slate-800">
                      {vendor?.gst_number || "N/A"}
                    </span>

                    <span className="text-slate-500 font-medium">PAN:</span>
                    <span className="col-span-2 font-mono text-slate-800">
                      {vendor?.pan_number || "N/A"}
                    </span>

                    <span className="text-slate-500 font-medium">Address:</span>
                    <span className="col-span-2 text-slate-700">
                      {vendor?.registered_address || "On file in Vendor Master"}
                    </span>

                    {(bankDetails.contact_email || bankDetails.contact_phone) && (
                      <>
                        <span className="text-slate-500 font-medium">Contact:</span>
                        <span className="col-span-2 text-slate-700">
                          {bankDetails.contact_person || ""}{" "}
                          {bankDetails.contact_phone || bankDetails.contact_email || ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule of Supply & Deliverables Table */}
              <div className="space-y-1">
                <div className="font-bold text-slate-800 text-[11px] uppercase">
                  Schedule of Items & Committed Deliverables
                </div>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-indigo-900 text-white font-bold">
                      <tr>
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2.5">Description & Specifications</th>
                        <th className="py-2 px-2.5 w-20 text-center">Quantity</th>
                        <th className="py-2 px-2.5 w-24 text-right">Unit Rate (₹)</th>
                        <th className="py-2 px-2.5 w-20 text-right">Tax (₹)</th>
                        <th className="py-2 px-2.5 w-28 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {poLineRows(po).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2.5 text-center font-mono text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 font-medium text-slate-800">
                            {row.description}
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            {row.qty} {row.unit}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono">{inr(row.unitRate)}</td>
                          <td className="py-2 px-2.5 text-right font-mono">{inr(row.tax)}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold">
                            {inr(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-800 font-medium">
                      <tr>
                        <td colSpan={5} className="py-1.5 px-2.5 text-right font-semibold">
                          Base Price Subtotal:
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-semibold">
                          ₹{basePrice.toLocaleString("en-IN")}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="py-1.5 px-2.5 text-right font-semibold">
                          Additional Taxes (GST / Duties):
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-semibold">
                          ₹{taxes.toLocaleString("en-IN")}
                        </td>
                      </tr>
                      <tr className="bg-indigo-50/70 border-t border-indigo-200 text-indigo-950">
                        <td
                          colSpan={5}
                          className="py-2 px-2.5 text-right font-bold text-xs uppercase"
                        >
                          Total Committed PO Value:
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-extrabold text-sm text-indigo-900">
                          ₹{totalValue.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Amount in words banner */}
              <div className="p-2.5 bg-slate-100 rounded border border-slate-200 text-[11px] text-slate-800">
                <span className="font-bold text-slate-900">Amount in Words: </span>
                <span className="italic font-medium">{amountWords}</span>
              </div>

              {/* Commercial Terms & Statutory Conditions */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-1.5">
                <div className="font-bold text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1">
                  Commercial Terms & Statutory Conditions
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-900">Delivery Timeline: </span>
                    <span>{po.delivery_timeline || "Within 14 calendar days"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Delivery Destination: </span>
                    <span>Central Stores Warehouse, AMC Campus, Bengaluru</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-semibold text-slate-900">Payment Terms: </span>
                    <span>
                      {po.payment_terms ||
                        "100% after verification, physical GRN inspection, and 3-way match"}
                    </span>
                  </div>
                  <div className="md:col-span-2 text-[10px] text-slate-500 pt-1 space-y-0.5">
                    <p>
                      • Goods are subject to physical inspection and verification by Central Stores
                      and Department Technical Committee.
                    </p>
                    <p>
                      • Original Tax Invoice in triplicate mentioning PO Number, PR Number, and AMC
                      GSTIN must accompany delivery.
                    </p>
                    <p>
                      • Minimum 12 months comprehensive on-site warranty or manufacturer warranty
                      applies unless stated otherwise.
                    </p>
                  </div>
                </div>
              </div>

              {/* Formal Institutional Signatures Section */}
              <div className="border-t-2 border-slate-300 pt-6 mt-8">
                <div className="grid grid-cols-3 gap-6 text-center text-[10.5px]">
                  {/* Prepared */}
                  <div className="space-y-1">
                    <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                      <span className="font-mono text-[9px] text-slate-400">
                        Digitally Generated
                      </span>
                    </div>
                    <div className="font-bold text-slate-900">Procurement Officer</div>
                    <div className="text-[9.5px] text-slate-500">Central Procurement Cell</div>
                  </div>

                  {/* Verified */}
                  <div className="space-y-1">
                    <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                      <span className="font-mono text-[9px] text-slate-400">
                        Inward Budget Passed
                      </span>
                    </div>
                    <div className="font-bold text-slate-900">Finance & Accounts</div>
                    <div className="text-[9.5px] text-slate-500">Budget Clearance Division</div>
                  </div>

                  {/* Sanctioned */}
                  <div className="space-y-1">
                    <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                      <span className="font-semibold text-indigo-900 text-[10px]">
                        {approvedDateFormatted
                          ? `Approved on ${approvedDateFormatted}`
                          : "Sanctioned Digitally"}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 uppercase">
                      {po.current_approver_role || "Executive Vice President"}
                    </div>
                    <div className="text-[9.5px] text-slate-500">
                      Competent Sanctioning Authority
                    </div>
                  </div>
                </div>
              </div>

              {/* Circulation Copy Endorsement */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50/70 space-y-1.5 text-[10.5px]">
                <div className="font-bold text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-700" /> Formal Copy Circulation
                  Endorsement
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-600 pt-0.5">
                  <div>
                    <strong className="text-slate-800">1. Indenting User Dept:</strong>{" "}
                    {pr?.departments?.name || "User Department"} (Technical acceptance)
                  </div>
                  <div>
                    <strong className="text-slate-800">2. Central Stores & Inventory:</strong>{" "}
                    Delivery tracking, inspection & GRN
                  </div>
                  <div>
                    <strong className="text-slate-800">3. Finance & Accounts:</strong> 3-way match &
                    payment clearance
                  </div>
                  <div>
                    <strong className="text-slate-800">4. Supplier Master Record:</strong>{" "}
                    Procurement audit trail
                  </div>
                </div>
              </div>

              {/* Watermark/Footer Note */}
              <div className="text-center text-[9px] text-slate-400 pt-2 border-t border-slate-100">
                Official Institutional Instrument • AMC Institutions • Central Stores & Procurement
                Portal
              </div>
            </div>
          </div>

          <DialogFooter className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end no-print">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
