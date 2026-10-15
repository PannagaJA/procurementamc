/**
 * Builds the official Purchase Order PDF. Shared by the print/download modal and
 * the "Issue to Vendor" email. jsPDF core fonts have no ₹ glyph, so amounts use "Rs.".
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { numberToWordsInr } from "@/lib/numberToWords";

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

export async function buildPoPdf(po: any): Promise<jsPDF> {
  const pr = po.purchase_requisitions;
  const vendor = po.vendors;
  const lineItems = pr?.pr_line_items || [];
  const bankDetails = vendor?.bank_details_json || {};
  const basePrice = Number(po.price || 0);
  const taxes = Number(po.taxes || 0);
  const totalValue = Number(po.total_value || basePrice + taxes);
  const amountWords = numberToWordsInr(totalValue);
  const poDateFormatted = fmtDate(po.created_at) ?? new Date().toLocaleDateString("en-IN");
  const approvedDateFormatted = fmtDate(po.approved_at);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // 1. Load institutional logo (/amc.jpeg)
  let logoData: string | null = null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/amc.jpeg";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(img, 0, 0);
    logoData = canvas.toDataURL("image/jpeg");
  } catch (e) {
    console.warn("Could not load /amc.jpeg logo into PDF canvas:", e);
  }

  // Add logo if available
  if (logoData) {
    doc.addImage(logoData, "JPEG", 14, 10, 22, 22);
  }

  // Institutional Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text("AMC INSTITUTIONS & ENGINEERING COLLEGE", 40, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(
    "Approved by AICTE, New Delhi | Affiliated to VTU, Belagavi | Accredited by NAAC & NBA",
    40,
    20.5,
  );
  doc.text(
    "18th K.M. Bannerghatta Main Road, Kalkere, Bengaluru - 560083, Karnataka, India",
    40,
    24.5,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138); // blue-900
  doc.text("CENTRAL PROCUREMENT CELL & CENTRAL STORES DIVISION", 40, 29);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("GSTIN: 29AAAAA0000A1Z5 | PAN: AAAAA0000A | Email: procurement@amc.ac.in", 40, 33);

  // Separator line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.8);
  doc.line(14, 36, 196, 36);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(14, 37.5, 196, 37.5);

  // Document Title Bar
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 40, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("PURCHASE ORDER", 18, 45.5);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 138);
  doc.text(`PO No: ${po.po_number || "DRAFT"}`, 120, 45.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Status: ${(po.status || "DRAFT").toUpperCase()}`, 168, 45.5);

  // Metadata 2-Column Box
  const prApprovalDate = pr?.approved_at
    ? new Date(pr.approved_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  const orderInfoBody = [
    [
      `PO Date: ${poDateFormatted}\nPO Type: ${(po.po_type || "regular").toUpperCase().replace("_", " ")}\nPR Ref: ${pr?.pr_number || "Direct"}${prApprovalDate ? ` (Apprv: ${prApprovalDate})` : ""}\nDept: ${pr?.departments?.name || "General Central Stores"}\nApprover: ${(po.current_approver_role || "Competent Authority").toUpperCase()}`,
      `SUPPLIER / VENDOR DETAILS:\n${vendor?.name || "N/A"}\nGSTIN: ${vendor?.gst_number || "N/A"}\nPAN: ${vendor?.pan_number || "N/A"}\nAddress: ${vendor?.registered_address || "Registered Address on file"}\nContact: ${[bankDetails.email, bankDetails.phone].filter(Boolean).join(", ") || "On File"}`,
    ],
  ];

  autoTable(doc, {
    startY: 50,
    margin: { left: 14, right: 14 },
    body: orderInfoBody,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.3,
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 90, fillColor: [248, 250, 252] },
      1: { cellWidth: 92, fillColor: [255, 255, 255] },
    },
  });

  // Line items table
  const currentY = (doc as any).lastAutoTable.finalY + 4;

  const tableRows: any[] = [];
  if (lineItems.length > 0) {
    lineItems.forEach((item: any, idx: number) => {
      const qty = Number(item.net_qty_to_procure || item.qty_required || 1);
      const unitRate = Number(item.est_unit_price || 0);
      const total = Number(item.est_total || qty * unitRate);
      tableRows.push([
        idx + 1,
        item.description,
        `${qty} ${item.unit || "pcs"}`,
        `Rs. ${unitRate.toLocaleString("en-IN")}`,
        `Rs. ${total.toLocaleString("en-IN")}`,
      ]);
    });
  } else {
    tableRows.push([
      1,
      po.scope_of_supply || "Standard institutional procurement scope.",
      "1 Lot",
      `Rs. ${basePrice.toLocaleString("en-IN")}`,
      `Rs. ${basePrice.toLocaleString("en-IN")}`,
    ]);
  }

  // Add subtotal and taxes rows
  tableRows.push([
    "",
    {
      content: "Subtotal / Base Value",
      colSpan: 3,
      styles: { halign: "right", fontStyle: "bold" },
    },
    `Rs. ${basePrice.toLocaleString("en-IN")}`,
  ]);
  tableRows.push([
    "",
    {
      content: "Applicable Taxes & GST",
      colSpan: 3,
      styles: { halign: "right", fontStyle: "bold" },
    },
    `Rs. ${taxes.toLocaleString("en-IN")}`,
  ]);
  tableRows.push([
    "",
    {
      content: "TOTAL COMMITTED PO VALUE",
      colSpan: 3,
      styles: { halign: "right", fontStyle: "bold", textColor: [30, 58, 138] },
    },
    {
      content: `Rs. ${totalValue.toLocaleString("en-IN")}`,
      styles: { fontStyle: "bold", textColor: [30, 58, 138] },
    },
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["#", "Item Description & Scope of Supply", "Quantity", "Unit Rate", "Total Amount"]],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 92 },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
  });

  // Amount in words
  let afterTableY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, afterTableY, 182, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`Amount in Words: ${amountWords}`, 17, afterTableY + 4.8);

  // Terms & Conditions Block
  afterTableY += 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138);
  doc.text("COMMERCIAL TERMS & STATUTORY CONDITIONS:", 14, afterTableY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const terms = [
    `1. Delivery Timeline: ${po.delivery_timeline || "Within 14 calendar days"} at Central Stores, AMC Campus.`,
    `2. Payment Terms: ${po.payment_terms || "100% after verification, physical GRN inspection, and 3-way match"}.`,
    "3. Quality & Inspection: Goods are subject to strict quality verification by Central Stores & Department Technical Committee.",
    "4. Tax Invoicing: Original Tax Invoice quoting this PO Number, PR Number, and AMC GSTIN must accompany the consignment.",
    "5. Warranty Clause: 12 months comprehensive on-site warranty from date of acceptance unless specified otherwise.",
  ];
  terms.forEach((term, idx) => {
    doc.text(term, 14, afterTableY + 4.5 + idx * 3.8);
  });

  // Signatures Block
  const sigY = Math.max(afterTableY + 22, 228);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(14, sigY, 196, sigY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  // Col 1: Prepared
  doc.text("Prepared & Issued By", 20, sigY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Central Procurement Cell", 20, sigY + 10);
  doc.text("Procurement Officer", 20, sigY + 14);

  // Col 2: Verified
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text("Finance & Inward Verification", 80, sigY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Finance & Accounts Division", 80, sigY + 10);
  doc.text("Budget Head Cleared", 80, sigY + 14);

  // Col 3: Approved
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text("Sanctioned & Approved By", 145, sigY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Competent Sanctioning Authority", 145, sigY + 10);
  doc.text(
    `Role: ${(po.current_approver_role || "Executive Vice President").toUpperCase()}`,
    145,
    sigY + 14,
  );
  if (approvedDateFormatted) {
    doc.text(`Approved Date: ${approvedDateFormatted}`, 145, sigY + 18);
  }

  // Circulation Copy Endorsement (SOP §8.5, Page 20)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("CIRCULATION COPY ENDORSEMENT:", 14, sigY + 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `1. Indenting User Department (${pr?.departments?.name || "User Dept"}) — for user technical verification & acceptance`,
    14,
    sigY + 27,
  );
  doc.text(
    "2. Central Stores & Inventory Division — for delivery tracking, inward inspection, and GRN preparation",
    14,
    sigY + 30.5,
  );
  doc.text(
    "3. Finance & Accounts Division — for 3-way match (PO / DC / GRN / Invoice) and payment clearance",
    14,
    sigY + 34,
  );
  doc.text("4. Supplier Master Record — procurement compliance audit trail", 14, sigY + 37.5);

  // Footer note
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("This is an official computer-generated document issued by AMC Institutions.", 14, 285);
  doc.text(`Generated on: ${new Date().toLocaleString("en-IN")}`, 145, 285);

  return doc;
}
