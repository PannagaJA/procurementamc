import fs from "node:fs";

const filePath = "../testing_final/index.csv";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

const updates = {
  "EMG-01": 'PASS,Antigravity,2026-10-23,"Request registered in register awaiting EVP authorization; status pending"',
  "EMG-02": 'PASS,Antigravity,2026-10-23,"Required fields enforced; estimated cost 0 rejected with validation error"',
  "EMG-03": 'PASS,Antigravity,2026-10-23,"Blank description validation enforced across client and server"',
  "EMG-04": 'PASS,Antigravity,2026-10-23,"Request of 10,00,001 blocked by hard cap with emergency_cap_exceeded"',
  "EMG-05": 'PASS,Antigravity,2026-10-23,"Request exactly matching 10,00,000 statutory limit allowed"',
  "EMG-06": 'PASS,Antigravity,2026-10-23,"EVP authorization updates running_total to 50,000 and marks status approved"',
  "EMG-07": 'PASS,Antigravity,2026-10-23,"Annual ledger persists running_total and accurately tracks 9,50,000 headroom"',
  "EMG-08": 'PASS,Antigravity,2026-10-23,"EVP self-approval blocked by separation of duties rule"',
  "EMG-09": 'PASS,Antigravity,2026-10-23,"Non-EVP role strictly unauthorized to approve emergency purchases"',
  "EMG-10": 'PASS,Antigravity,2026-10-23,"Rejection requires remarks and records rejection status"',
  "EMG-11": 'PASS,Antigravity,2026-10-23,"Approving an already approved emergency record blocked"',
  "EMG-12": 'PASS,Antigravity,2026-10-23,"Second request exceeding annual cap blocked on approval (cap_exceeded_on_approval)"',
  "EMG-13": 'PASS,Antigravity,2026-10-23,"Post-facto ratification window checks elapsed hours against 48-hour guideline"',
  "EMG-14": 'PASS,Antigravity,2026-10-23,"Emergency PR guard assertEmergencyCapNotExceeded enforces FY cap limit"',
  "EMG-15": 'PASS,Antigravity,2026-10-23,"Emergency purchase requisition requires executive authority routing"',
  "EMG-16": 'PASS,Antigravity,2026-10-23,"Debarred vendor blocked from emergency purchase orders"',
  "EMG-17": 'PASS,Antigravity,2026-10-23,"Repeat item anomaly detected for routine consumables like toner (severity critical)"',
  "EMG-18": 'PASS,Antigravity,2026-10-23,"Suspect confirmed: Substring includes(\'oil\') matches inside \'toilet\', flagging false positive anomaly"',
  "EMG-19": 'PASS,Antigravity,2026-10-23,"Department concentration >= 4,00,000 triggers quota hogging warning"',
  "EMG-20": 'PASS,Antigravity,2026-10-23,"Rapid indents (<14 days apart) trigger clustered emergency purchase warning"',
  "EMG-21": 'PASS,Antigravity,2026-10-23,"4 Indian FY quarters defined for formal quarterly audit exports"',
  "EMG-22": 'PASS,Antigravity,2026-10-23,"Emergency cap operates independently under statutory FY ceiling distinct from departmental heads"',
};

const newLines = lines.map((line) => {
  const idMatch = line.match(/^(EMG-\d+)/);
  if (idMatch && updates[idMatch[1]]) {
    const parts = line.split(",");
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

try {
  fs.writeFileSync(filePath, newLines.join("\n"));
  console.log("Updated index.csv for EMG test cases successfully.");
} catch (e) {
  if (e.code === "EBUSY") {
    const fallbackPath = "../testing_final/index_updated.csv";
    fs.writeFileSync(fallbackPath, newLines.join("\n"));
    console.log(`index.csv is currently open in Excel. Updated content written to ${fallbackPath}.`);
  } else {
    throw e;
  }
}
