/**
 * Direct General Ledger (Tally / SAP / ERP) Accounting Connector (SOP §8.7, §11).
 *
 * Requirements:
 * - Handoff of approved invoices and capitalized asset tags directly into the
 *   institutional double-entry financial ledger.
 * - Automated accounting batch export for:
 *   1. Tally Prime / Tally.ERP 9 (XML & CSV)
 *   2. SAP ERP (BAPI / IDoc Accounting CSV)
 *   3. QuickBooks & Generic ERP Double-Entry Journal CSV
 *   4. Direct Webhook / REST JSON Payload Handoff
 * - Automatic double-entry balance: Debits (Expense / Capital Asset + Input GST) === Credits (Vendor / Bank Ledger).
 */

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  costCenter: string;
  narration: string;
  assetTag?: string | null;
}

export interface GlVoucher {
  voucherNumber: string;
  date: string;
  voucherType: "Journal" | "Payment";
  invoiceNumber: string;
  poNumber: string;
  prNumber: string;
  vendorName: string;
  vendorGstin?: string;
  totalAmount: number;
  lines: JournalEntryLine[];
  isCapitalizedAsset: boolean;
  assetTags: string[];
  paymentRef?: string | null;
  paymentMode?: string | null;
}

/**
 * Maps procurement items & categories to institutional Chart of Accounts (COA).
 */
export function mapToGlAccounts(category = "routine_consumable", isAsset = false): {
  expenseAccountCode: string;
  expenseAccountName: string;
  isCapitalAsset: boolean;
} {
  const norm = (category || "").toLowerCase();

  if (isAsset || norm.includes("equipment") || norm.includes("asset")) {
    return {
      expenseAccountCode: "1100-FA-EQUIP",
      expenseAccountName: "Capital Assets — Lab & Research Equipment A/c",
      isCapitalAsset: true,
    };
  }
  if (norm.includes("software") || norm.includes("license")) {
    return {
      expenseAccountCode: "5120-EXP-SW",
      expenseAccountName: "IT Software & Cloud Licenses Expense A/c",
      isCapitalAsset: false,
    };
  }
  if (norm.includes("amc") || norm.includes("service")) {
    return {
      expenseAccountCode: "5130-EXP-AMC",
      expenseAccountName: "Equipment AMC & Service Charges A/c",
      isCapitalAsset: false,
    };
  }
  if (norm.includes("academic") || norm.includes("research")) {
    return {
      expenseAccountCode: "5140-EXP-LAB",
      expenseAccountName: "Academic & Laboratory Consumables A/c",
      isCapitalAsset: false,
    };
  }
  if (norm.includes("maintenance") || norm.includes("repair")) {
    return {
      expenseAccountCode: "5150-EXP-MAINT",
      expenseAccountName: "Facility Maintenance & Repairs A/c",
      isCapitalAsset: false,
    };
  }

  // Default: Routine Consumables & Stationery
  return {
    expenseAccountCode: "5110-EXP-CONS",
    expenseAccountName: "Departmental Consumables & Stationery A/c",
    isCapitalAsset: false,
  };
}

/**
 * Transforms an invoice and its payment/GRN records into a balanced double-entry voucher.
 */
export function buildGlVoucher(invoice: any): GlVoucher {
  const po = invoice.purchase_orders || {};
  const pr = po.purchase_requisitions || {};
  const payment = invoice.payments && invoice.payments.length > 0 ? invoice.payments[0] : null;
  const isPaid = !!payment || invoice.match_status === "paid";

  const total = Number(invoice.approved_amount ?? invoice.invoice_amount ?? po.total_value ?? 0);
  const taxes = Number(po.taxes || Math.round(total * 0.18 / 1.18));
  const baseAmount = total - taxes;

  const poNumber = po.po_number || "PO-GENERIC";
  const prNumber = pr.pr_number || "PR-GENERIC";
  const invNumber = invoice.invoice_number || "INV-GENERIC";
  const vendorName = invoice.vendors?.name || po.vendors?.name || "Empanelled Vendor";
  const vendorGstin = invoice.vendor_gstin || po.vendors?.gst_number || "29AAACA1234A1Z5";
  const deptName = pr.departments?.name || "Institutional General Fund";

  const category = pr.category || "routine_consumable";
  const isAsset = category.includes("equipment") || category.includes("asset");
  const { expenseAccountCode, expenseAccountName, isCapitalAsset } = mapToGlAccounts(category, isAsset);

  // Asset Tags generated if capital equipment
  const assetTags = isCapitalAsset
    ? [`AMC-EC-EQ-26-${invNumber.replace(/[^0-9]/g, "").slice(-4) || "0101"}`]
    : [];

  const lines: JournalEntryLine[] = [];

  // 1. DEBIT: Base Expense or Fixed Asset Capitalization
  lines.push({
    accountCode: expenseAccountCode,
    accountName: expenseAccountName,
    type: "DEBIT",
    amount: baseAmount,
    costCenter: deptName,
    narration: `${isCapitalAsset ? "Asset Capitalization" : "Procurement"} against PO ${poNumber} (PR: ${prNumber}). Inv: ${invNumber}`,
    assetTag: assetTags[0] || null,
  });

  // 2. DEBIT: Input Tax Accounts (CGST & SGST for Karnataka / IGST interstate)
  const isInterState = !vendorGstin.startsWith("29");
  if (isInterState) {
    lines.push({
      accountCode: "1250-TAX-IGST",
      accountName: "Input Tax Credit — IGST (18%)",
      type: "DEBIT",
      amount: taxes,
      costCenter: deptName,
      narration: `Input IGST on Invoice ${invNumber} from ${vendorName}`,
    });
  } else {
    const halfTax = Math.round(taxes / 2);
    lines.push({
      accountCode: "1251-TAX-CGST",
      accountName: "Input Tax Credit — CGST (9%)",
      type: "DEBIT",
      amount: halfTax,
      costCenter: deptName,
      narration: `Input CGST on Invoice ${invNumber}`,
    });
    lines.push({
      accountCode: "1252-TAX-SGST",
      accountName: "Input Tax Credit — SGST (9%)",
      type: "DEBIT",
      amount: taxes - halfTax,
      costCenter: deptName,
      narration: `Input SGST on Invoice ${invNumber}`,
    });
  }

  // 3. CREDIT: Vendor Sundry Creditors or Bank Disbursement Ledger
  if (isPaid) {
    lines.push({
      accountCode: "1010-BANK-SBI",
      accountName: "State Bank of India — Current A/c 10928347201",
      type: "CREDIT",
      amount: total,
      costCenter: "Central Accounts Division",
      narration: `Direct Disbursement via ${payment?.payment_mode?.toUpperCase() || "RTGS"} (Ref: ${payment?.external_ref || "UTR-VERIFIED"}) for Inv ${invNumber}`,
    });
  } else {
    lines.push({
      accountCode: `2100-VEND-${vendorName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}`,
      accountName: `Sundry Creditors — ${vendorName}`,
      type: "CREDIT",
      amount: total,
      costCenter: deptName,
      narration: `Bill booked for ${vendorName} against PO ${poNumber}`,
    });
  }

  const voucherNumber = isPaid ? `PMT-${invNumber.replace(/[^a-zA-Z0-9]/g, "")}` : `JV-${invNumber.replace(/[^a-zA-Z0-9]/g, "")}`;
  const dateStr = payment?.paid_at || invoice.created_at || new Date().toISOString();

  return {
    voucherNumber,
    date: dateStr.split("T")[0],
    voucherType: isPaid ? "Payment" : "Journal",
    invoiceNumber: invNumber,
    poNumber,
    prNumber,
    vendorName,
    vendorGstin,
    totalAmount: total,
    lines,
    isCapitalizedAsset: isCapitalAsset,
    assetTags,
    paymentRef: payment?.external_ref || null,
    paymentMode: payment?.payment_mode || null,
  };
}

/**
 * Generates Tally Prime / Tally.ERP 9 XML import batch.
 */
export function generateTallyXml(vouchers: GlVoucher[]): string {
  const voucherXmls = vouchers.map((v) => {
    const tallyDate = v.date.replace(/-/g, ""); // YYYYMMDD
    const tallyLines = v.lines.map((l) => {
      const isDebit = l.type === "DEBIT";
      return `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(l.accountName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${isDebit ? -Math.abs(l.amount) : Math.abs(l.amount)}</AMOUNT>
          <COSTCENTRENAME>${escapeXml(l.costCenter)}</COSTCENTRENAME>
          <NARRATION>${escapeXml(l.narration)}</NARRATION>
        </ALLLEDGERENTRIES.LIST>`;
    }).join("\n");

    return `      <VOUCHER VCHTYPE="${v.voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tallyDate}</DATE>
        <VOUCHERTYPENAME>${v.voucherType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${v.voucherNumber}</VOUCHERNUMBER>
        <REFERENCE>${v.invoiceNumber}</REFERENCE>
        <NARRATION>AMC Procurement Handoff: PO ${v.poNumber}, Inv ${v.invoiceNumber}, Vendor: ${escapeXml(v.vendorName)}</NARRATION>
${tallyLines}
      </VOUCHER>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>AMC Group of Institutions</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherXmls}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates SAP ERP (BAPI / IDoc Accounting Format) CSV batch.
 */
export function generateSapCsv(vouchers: GlVoucher[]): string {
  const headers = [
    "DOC_TYPE",
    "DOC_DATE",
    "PSTNG_DATE",
    "COMP_CODE",
    "REF_DOC_NO",
    "HEADER_TXT",
    "ITEM_NUM",
    "PSTNG_KEY",
    "GL_ACCOUNT",
    "AMOUNT_DOC_CURR",
    "CURRENCY",
    "COST_CENTER",
    "ITEM_TEXT",
    "ASSET_NO",
  ];

  const rows: (string | number)[][] = [];

  vouchers.forEach((v) => {
    const sapDate = v.date.replace(/-/g, "");
    v.lines.forEach((l, idx) => {
      rows.push([
        v.voucherType === "Payment" ? "KZ" : "KR",
        sapDate,
        sapDate,
        "AMC1",
        v.invoiceNumber,
        `PO:${v.poNumber}`,
        idx + 1,
        l.type === "DEBIT" ? "40" : "50",
        l.accountCode,
        l.amount.toFixed(2),
        "INR",
        `CC_${l.costCenter.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase()}`,
        `"${l.narration.replace(/"/g, '""')}"`,
        l.assetTag || "",
      ]);
    });
  });

  return "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

/**
 * Generates Generic Double-Entry / QuickBooks Journal CSV.
 */
export function generateGenericGlCsv(vouchers: GlVoucher[]): string {
  const headers = [
    "Voucher_Ref",
    "Date",
    "Voucher_Type",
    "PO_Number",
    "PR_Number",
    "Invoice_Number",
    "Vendor_Name",
    "Vendor_GSTIN",
    "Account_Code",
    "Account_Name",
    "Debit_INR",
    "Credit_INR",
    "Cost_Center_Department",
    "Narration",
    "Capitalized_Asset_Tag",
  ];

  const rows: (string | number)[][] = [];

  vouchers.forEach((v) => {
    v.lines.forEach((l) => {
      rows.push([
        v.voucherNumber,
        v.date,
        v.voucherType,
        v.poNumber,
        v.prNumber,
        v.invoiceNumber,
        `"${v.vendorName.replace(/"/g, '""')}"`,
        v.vendorGstin || "",
        l.accountCode,
        `"${l.accountName.replace(/"/g, '""')}"`,
        l.type === "DEBIT" ? l.amount.toFixed(2) : "0.00",
        l.type === "CREDIT" ? l.amount.toFixed(2) : "0.00",
        `"${l.costCenter.replace(/"/g, '""')}"`,
        `"${l.narration.replace(/"/g, '""')}"`,
        l.assetTag || "",
      ]);
    });
  });

  return "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
