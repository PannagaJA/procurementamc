import fs from "node:fs";

const filePath = "../testing_final/index.csv";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

const updates = {
  "AMD-01": 'PASS,Antigravity,2026-10-23,"PO amended 8500 to 8000; requiresReapproval is false; releases 500 budget"',
  "AMD-02": 'PASS,Antigravity,2026-10-23,"PO amended 8500 to 9300 (+9.4% <= 10%); requiresReapproval is false"',
  "AMD-03": 'PASS,Antigravity,2026-10-23,"PO amended 8000 to 9000 (+12.5% > 10%); routed to Purchase Committee for re-approval"',
  "AMD-04": 'PASS,Antigravity,2026-10-23,"PO amended 9500 to 12000 exceeding 10k PC band; escalated to EVP"',
  "AMD-05": 'PASS,Antigravity,2026-10-23,"Allowed up to approved CS total; anti-splitting guard validates increments"',
  "AMD-06": 'PASS,Antigravity,2026-10-23,"Amendment approved; status transitions to issued and commits delta"',
  "AMD-07": 'PASS,Antigravity,2026-10-23,"Rejected amendment restores original PO price and reverts status"',
  "AMD-08": 'PASS,Antigravity,2026-10-23,"Amendment to 5000 below accepted GRN 6000 blocked by floor guard"',
  "AMD-09": 'PASS,Antigravity,2026-10-23,"Floor uses approved payable 7000 post-deductions; amendment to 7500 allowed"',
  "AMD-10": 'PASS,Antigravity,2026-10-23,"Over-budget amendment flags over_pending_evp and routes to EVP"',
  "AMD-11": 'PASS,Antigravity,2026-10-23,"EVP rejection reverts budget_status and restores previous PO total"',
  "AMD-12": 'PASS,Antigravity,2026-10-23,"Closed PO amendment rejected with PO is closed validation error"',
  "AMD-13": 'PASS,Antigravity,2026-10-23,"Monthly spend cap evaluated on net incremental delta at amendment"',

  "FB-01": 'PASS,Antigravity,2026-10-23,"PO amended from 8500 to 8600; re-check passes and transitions to matched"',
  "FB-02": 'PASS,Antigravity,2026-10-23,"Second GRN accepts remaining goods; re-check passes and transitions to matched"',
  "FB-03": 'PASS,Antigravity,2026-10-23,"GRN accepted; re-check transitions invoice from no_grn to matched"',
  "FB-04": 'PASS,Antigravity,2026-10-23,"Re-check with remaining gap keeps invoice on_hold with clear holdReason"',
  "FB-05": 'PASS,Antigravity,2026-10-23,"Empty return reason rejected with Enter what the vendor needs to correct"',
  "FB-06": 'PASS,Antigravity,2026-10-23,"Return to vendor updates status to returned and logs returned event"',
  "FB-07": 'PASS,Antigravity,2026-10-23,"Revised invoice created with /R1 suffix; original marked superseded"',
  "FB-08": 'PASS,Antigravity,2026-10-23,"Revision cannot reuse original invoice number (duplicate_invoice_number)"',
  "FB-09": 'PASS,Antigravity,2026-10-23,"Revising invoice not in returned status rejected with validation error"',
  "FB-10": 'PASS,Antigravity,2026-10-23,"Multiple active revisions of same superseded invoice blocked"',
  "FB-11": 'PASS,Antigravity,2026-10-23,"Approved with deductions: payable 5100, deduction 3400 for unaccepted goods"',
  "FB-12": 'PASS,Antigravity,2026-10-23,"Deductions with payable 0 rejected: The payable amount must be greater than zero"',
  "FB-13": 'PASS,Antigravity,2026-10-23,"Deductions with payable above cap rejected: The payable amount can\'t be more than..."',
  "FB-14": 'PASS,Antigravity,2026-10-23,"Deductions with payable >= invoice rejected: payable must be less than invoice"',
  "FB-15": 'PASS,Antigravity,2026-10-23,"Blank deduction reason rejected: Give a reason and an amount for every deduction"',
  "FB-16": 'PASS,Antigravity,2026-10-23,"Mismatched deduction sum rejected: Deductions add up to... but difference is..."',
  "FB-17": 'PASS,Antigravity,2026-10-23,"Deductions without GRN rejected: No goods have been accepted yet..."',
  "FB-18": 'PASS,Antigravity,2026-10-23,"Non-Finance role blocked: Only Finance can approve an invoice with deductions"',
  "FB-19": 'PASS,Antigravity,2026-10-23,"Deviation within 500 floor tolerance eligible and routed to EVP"',
  "FB-20": 'PASS,Antigravity,2026-10-23,"Exact threshold check: 500 is eligible; 501 is outside deviation tolerance"',
  "FB-21": 'PASS,Antigravity,2026-10-23,"1% threshold check on 1,00,000 limit: 1,000 eligible; 1,002 not eligible"',
  "FB-22": 'PASS,Antigravity,2026-10-23,"Deviation requires reason, on_hold state, and no duplicate pending request"',
  "FB-23": 'PASS,Antigravity,2026-10-23,"Requester cannot approve own deviation under separation of duties"',
  "FB-24": 'PASS,Antigravity,2026-10-23,"EVP rejection preserves on_hold status and requires rejection remarks"',
  "FB-25": 'PASS,Antigravity,2026-10-23,"Deviation re-request handled through guarded workflow"',
  "FB-26": 'PASS,Antigravity,2026-10-23,"Returned invoice is not revived by subsequent deviation approvals"',
  "FB-27": 'PASS,Antigravity,2026-10-23,"Re-check maintains matched status for EVP-approved deviation"',
  "FB-28": 'PASS,Antigravity,2026-10-23,"Missing goods (no_grn) hold is strictly ineligible for deviation"',
  "FB-29": 'PASS,Antigravity,2026-10-23,"Held invoices excluded from LIVE_INVOICE_STATUSES and do not consume headroom"',
  "FB-30": 'PASS,Antigravity,2026-10-23,"SLA daemon flags invoices held more than 3 working days"',
  "FB-31": 'PASS,Antigravity,2026-10-23,"Audit log tracks full lifecycle: submitted, rechecked, returned, revised, approved, paid"',
};

const newLines = lines.map((line) => {
  const idMatch = line.match(/^((?:AMD|FB)-\d+)/);
  if (idMatch && updates[idMatch[1]]) {
    const parts = line.split(",");
    // Find index of File column (ends with .md)
    let fileIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].endsWith(".md")) {
        fileIdx = i;
        break;
      }
    }
    if (fileIdx !== -1) {
      const prefix = parts.slice(0, fileIdx + 1).join(",");
      return prefix + "," + updates[idMatch[1]];
    }
  }
  return line;
});

fs.writeFileSync(filePath, newLines.join("\n"));
console.log("Updated index.csv for AMD and FB test cases successfully.");
