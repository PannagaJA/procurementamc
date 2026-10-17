/**
 * Quarterly Emergency Register Review & Pattern Anomaly Detection Engine (SOP §9 J7, J8).
 *
 * Requirements:
 * - §9 J7: Formal quarterly Emergency Procurement Register reporting to Director/PC/EVP.
 * - §9 J8: Repeat-pattern detection flagging whether a department repeatedly uses emergency
 *   procurement for identical routine items to bypass standard RFQ/PR competition.
 * - One-click quarterly audit export in PDF and Excel/CSV.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface EmergencyAnomaly {
  id: string;
  departmentId: string;
  departmentName: string;
  itemKeyword: string;
  matchedCount: number;
  totalCost: number;
  severity: "critical" | "warning" | "advisory";
  ruleViolation: string;
  details: string;
  recommendedAction: string;
  incidentNumbers: string[];
}

export type FiscalQuarter = "Q1 (Apr–Jun)" | "Q2 (Jul–Sep)" | "Q3 (Oct–Dec)" | "Q4 (Jan–Mar)";

export interface QuarterDateRange {
  name: FiscalQuarter;
  startMonth: number; // 0-indexed
  endMonth: number;
  label: string;
}

export const FISCAL_QUARTERS: QuarterDateRange[] = [
  { name: "Q1 (Apr–Jun)", startMonth: 3, endMonth: 5, label: "Q1: 1 April – 30 June" },
  { name: "Q2 (Jul–Sep)", startMonth: 6, endMonth: 8, label: "Q2: 1 July – 30 September" },
  { name: "Q3 (Oct–Dec)", startMonth: 9, endMonth: 11, label: "Q3: 1 October – 31 December" },
  { name: "Q4 (Jan–Mar)", startMonth: 0, endMonth: 2, label: "Q4: 1 January – 31 March" },
];

/**
 * Anomaly detector implementing SOP §9 J8 pattern analysis.
 * Analyzes items over a rolling 90-day window.
 */
export function detectEmergencyAnomalies(
  records: any[],
  departments: { id: string; name: string }[],
): EmergencyAnomaly[] {
  const anomalies: EmergencyAnomaly[] = [];
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Filter approved or active emergency procurements within last 90 days
  const recentRecords = (records || []).filter((r) => {
    const d = new Date(r.created_at);
    return !isNaN(d.getTime()) && d >= ninetyDaysAgo;
  });

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  // Group by department
  const byDept = new Map<string, any[]>();
  recentRecords.forEach((r) => {
    const deptId = r.department_id || "general";
    if (!byDept.has(deptId)) byDept.set(deptId, []);
    byDept.get(deptId)!.push(r);
  });

  // Common keywords to detect identical routine items
  const ROUTINE_KEYWORDS = [
    "toner",
    "paper",
    "cartridge",
    "cleaning",
    "cable",
    "multimeter",
    "beaker",
    "sanitizer",
    "keyboard",
    "mouse",
    "switch",
    "filter",
    "oil",
    "chemical",
    "probe",
  ];

  byDept.forEach((deptRecords, deptId) => {
    const deptName = deptMap.get(deptId) || "General / Central Department";

    // 1. Quota Hogging check: Department consuming > ₹4,00,000 (40% of statutory cap) in 90 days
    const totalDeptCost = deptRecords.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
    if (totalDeptCost >= 400000) {
      anomalies.push({
        id: `quota_${deptId}`,
        departmentId: deptId,
        departmentName: deptName,
        itemKeyword: "Departmental Emergency Quota",
        matchedCount: deptRecords.length,
        totalCost: totalDeptCost,
        severity: "warning",
        ruleViolation: "Excessive emergency allocation concentration",
        details: `${deptName} accounted for ₹${totalDeptCost.toLocaleString("en-IN")} across ${deptRecords.length} emergency requests within 90 days (40%+ of statutory annual ceiling).`,
        recommendedAction: "Review departmental planning with HOD. Transition recurring requirements into annual PR cycle.",
        incidentNumbers: deptRecords.map((r) => r.emergency_number || r.id),
      });
    }

    // 2. Keyword clustering for repeat item circumvention
    ROUTINE_KEYWORDS.forEach((kw) => {
      const matching = deptRecords.filter((r) =>
        (r.description || "").toLowerCase().includes(kw),
      );

      if (matching.length >= 2) {
        const itemTotal = matching.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
        anomalies.push({
          id: `repeat_${deptId}_${kw}`,
          departmentId: deptId,
          departmentName: deptName,
          itemKeyword: kw.toUpperCase(),
          matchedCount: matching.length,
          totalCost: itemTotal,
          severity: "critical",
          ruleViolation: "Repeat Emergency Procurement for Identical Routine Item",
          details: `${deptName} has raised ${matching.length} separate emergency procurements for "${kw}" items within 90 days totaling ₹${itemTotal.toLocaleString("en-IN")}.`,
          recommendedAction:
            "Mandate transition to Master Rate Contract. Prohibit further emergency purchases for this category.",
          incidentNumbers: matching.map((r) => r.emergency_number || r.id),
        });
      }
    });

    // 3. Rapid consecutive emergency purchases (< 14 days apart)
    if (deptRecords.length >= 3) {
      const sorted = [...deptRecords].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      let closeCount = 0;
      for (let i = 1; i < sorted.length; i++) {
        const diffDays =
          (new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) /
          (1000 * 3600 * 24);
        if (diffDays <= 14) closeCount++;
      }
      if (closeCount >= 2) {
        anomalies.push({
          id: `frequency_${deptId}`,
          departmentId: deptId,
          departmentName: deptName,
          itemKeyword: "Rapid Consecutive Requisitions",
          matchedCount: deptRecords.length,
          totalCost: totalDeptCost,
          severity: "warning",
          ruleViolation: "SOP 9 J8: Clustered emergency purchases bypassing standard PR review",
          details: `${deptName} submitted ${deptRecords.length} emergency requests within 14 days of each other.`,
          recommendedAction: "Audit emergency justifications with Procurement Committee.",
          incidentNumbers: deptRecords.map((r) => r.emergency_number || r.id),
        });
      }
    }
  });

  return anomalies;
}

/**
 * Exports formal Quarterly Emergency Procurement Audit Report (PDF or CSV) per SOP §9 J7.
 */
export function exportQuarterlyEmergencyAuditReport(params: {
  quarter: FiscalQuarter;
  financialYear: string;
  records: any[];
  ledger: any;
  departments: { id: string; name: string }[];
  anomalies: EmergencyAnomaly[];
  format: "pdf" | "csv";
}) {
  const { quarter, financialYear, records, ledger, departments, anomalies, format } = params;
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  // 1. CSV Export
  if (format === "csv") {
    const headers = [
      "Sl No",
      "Emergency Number",
      "Date",
      "Department",
      "Vendor",
      "Description",
      "Reason Standard Process Failed",
      "Post-Facto?",
      "Estimated Cost (INR)",
      "Status",
      "EVP Ratification",
    ];

    const rows = records.map((r, i) => [
      i + 1,
      r.emergency_number || "—",
      r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
      deptMap.get(r.department_id) || "General",
      r.vendors?.name || "Direct Vendor",
      `"${(r.description || "").replace(/"/g, '""')}"`,
      `"${(r.reason_standard_process_failed || "").replace(/"/g, '""')}"`,
      r.is_post_facto ? "YES (Within 48h)" : "NO (Advance)",
      Number(r.estimated_cost || 0),
      r.status,
      r.status === "approved" ? "RATIFIED BY EVP" : r.status.toUpperCase(),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Emergency_Procurement_Audit_${financialYear}_${quarter.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  // 2. PDF Export (jsPDF + autoTable)
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 842, 50, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("AMC GROUP OF INSTITUTIONS — CENTRAL PROCUREMENT DIVISION", 36, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("QUARTERLY EMERGENCY PROCUREMENT AUDIT & RATIFICATION REGISTER", 36, 40);

  // Governance Metadata Banner
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");

  const runningTotal = Number(ledger?.running_total || 0);
  const capLimit = Number(ledger?.cap_limit || 1000000);
  const totalQuarterSpend = records.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);

  doc.text(`Financial Year: ${financialYear}`, 36, 70);
  doc.text(`Audit Quarter: ${quarter}`, 180, 70);
  doc.text(`Quarter Emergency Spend: INR ${totalQuarterSpend.toLocaleString("en-IN")}`, 340, 70);
  doc.text(`Annual Running Cap Total: INR ${runningTotal.toLocaleString("en-IN")} / INR ${capLimit.toLocaleString("en-IN")}`, 540, 70);

  // Table
  const tableData = records.map((r, i) => [
    i + 1,
    r.emergency_number || "—",
    r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
    deptMap.get(r.department_id) || "General",
    r.vendors?.name || "Direct Vendor",
    r.description ? r.description.slice(0, 40) + (r.description.length > 40 ? "..." : "") : "—",
    r.reason_standard_process_failed ? r.reason_standard_process_failed.slice(0, 40) + "..." : "—",
    r.is_post_facto ? "Yes (48h)" : "No",
    `INR ${Number(r.estimated_cost || 0).toLocaleString("en-IN")}`,
    (r.status || "").toUpperCase(),
  ]);

  autoTable(doc, {
    startY: 85,
    head: [
      [
        "Sl",
        "Reg No",
        "Date",
        "Department",
        "Vendor",
        "Description",
        "Standard Process Failed Rationale",
        "Post-Facto?",
        "Value",
        "EVP Status",
      ],
    ],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 65, fontStyle: "bold" },
      2: { cellWidth: 50 },
      3: { cellWidth: 80 },
      4: { cellWidth: 85 },
      5: { cellWidth: 120 },
      6: { cellWidth: 120 },
      7: { cellWidth: 45 },
      8: { cellWidth: 65, halign: "right" },
      9: { cellWidth: 60, halign: "center" },
    },
    styles: { overflow: "linebreak", cellPadding: 3 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 350;

  // Anomaly Audit Summary Section (if anomalies detected)
  if (anomalies.length > 0 && finalY < 480) {
    doc.setFillColor(254, 242, 242); // red-50
    doc.rect(36, finalY + 15, 770, 45, "F");

    doc.setTextColor(153, 27, 27); // red-800
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PATTERN ANOMALY DETECTION FINDINGS (AUDIT WARNING):", 45, finalY + 30);

    doc.setFont("helvetica", "normal");
    const anomalyText = anomalies
      .slice(0, 2)
      .map((a) => `[${a.severity.toUpperCase()}] ${a.details} -> Action: ${a.recommendedAction}`)
      .join(" | ");
    doc.text(doc.splitTextToSize(anomalyText, 750), 45, finalY + 45);
  }

  // Signatures block
  const signY = 530;
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");

  doc.text("PREPARED BY:", 50, signY);
  doc.text("Central Procurement Officer", 50, signY + 30);

  doc.text("REVIEWED & CONSOLIDATED BY:", 320, signY);
  doc.text("Director of Administration & Finance", 320, signY + 30);

  doc.text("RATIFIED & APPROVED BY:", 600, signY);
  doc.text("Executive Vice President (EVP)", 600, signY + 30);

  doc.save(`Emergency_Procurement_Audit_${financialYear}_${quarter.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
