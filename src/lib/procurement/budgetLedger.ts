/**
 * Budget arithmetic (SOP §8.1, PR form Section B). Pure — shared by the server and the tests.
 *
 *   commit  — PO issued (or amended up)            committed += amount
 *   spend   — invoice paid                         committed −= amount, spent += amount
 *   release — PO cancelled / closed under value /  committed −= amount
 *             amended down
 *   balance = allocated − Σcommit + Σrelease  (money committed stays used until released)
 *
 * The authoritative commit runs in the database (budget_commit) with the head row locked;
 * its balance formula must match headTotals().
 */

/** Budget heads use the same categories as requisitions. */
export const BUDGET_CATEGORIES = [
  { value: "small_value", label: "Small Value Orders (Direct Purchase)" },
  { value: "routine_consumable", label: "Routine Consumables (Rate Contract)" },
  { value: "equipment_asset", label: "Equipment & Assets / Lab Equipment" },
  { value: "software", label: "Software Licenses & Cloud Subscriptions" },
  { value: "academic_research", label: "Academic & Research Material" },
  { value: "services_amc", label: "Services (AMC / Contractual Agreements)" },
  { value: "maintenance", label: "Maintenance & Repairs" },
] as const;

export const categoryLabel = (c: string) =>
  BUDGET_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export type LedgerEntry = {
  /** commit | spend | release (enforced by the table check). */
  entry_type: string;
  amount: number | string;
  po_id?: string | null;
  created_at?: string;
};

const TOLERANCE = 1;

export function headTotals(allocated: number | string, entries: LedgerEntry[]) {
  let commit = 0;
  let spend = 0;
  let release = 0;
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.entry_type === "commit") commit += a;
    else if (e.entry_type === "spend") spend += a;
    else if (e.entry_type === "release") release += a;
  }
  const alloc = Number(allocated) || 0;
  return {
    allocated: alloc,
    committed: round(commit - spend - release),
    spent: round(spend),
    balance: round(alloc - commit + release),
  };
}

/** Section B "Is budget available?": over when the amount exceeds the balance by more than Rs. 1. */
export function isOverBudget(balance: number, amount: number): boolean {
  return (Number(amount) || 0) > (Number(balance) || 0) + TOLERANCE;
}

/** What a PO still holds against its head: committed − spent − released for that PO. */
export function poOutstanding(entries: LedgerEntry[], poId: string): number {
  const own = entries.filter((e) => e.po_id === poId);
  return headTotals(0, own).committed;
}

/** Indian financial year (April–March) a date falls in, e.g. "2026-27". */
export function financialYear(d: Date = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Quarter of the financial year: Q1 Apr–Jun … Q4 Jan–Mar (SOP quarterly review). */
export function fyQuarter(d: Date): 1 | 2 | 3 | 4 {
  const m = d.getMonth();
  return m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 && m <= 11 ? 3 : 4;
}

/** Committed and spent per quarter for one head (for the variance view). */
export function quarterlyVariance(allocated: number | string, entries: LedgerEntry[]) {
  const quarters = [1, 2, 3, 4].map((q) => ({ quarter: q, committed: 0, spent: 0, released: 0 }));
  for (const e of entries) {
    if (!e.created_at) continue;
    const row = quarters[fyQuarter(new Date(e.created_at)) - 1];
    const a = Number(e.amount) || 0;
    if (e.entry_type === "commit") row.committed += a;
    else if (e.entry_type === "spend") row.spent += a;
    else if (e.entry_type === "release") row.released += a;
  }
  const plannedPerQuarter = round((Number(allocated) || 0) / 4);
  return quarters.map((q) => ({
    ...q,
    planned: plannedPerQuarter,
    net: round(q.committed - q.released),
  }));
}

/** Stable head code, e.g. CSE-EQUIPMENT-2627. */
export function headCode(deptName: string, category: string, fy: string): string {
  const dept =
    deptName
      .split(/[^A-Za-z]+/)
      .filter((w) => w && !["and", "of", "the"].includes(w.toLowerCase()))
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "DEPT";
  return `${dept}-${category.toUpperCase().replace(/_/g, "")}-${fy.replace("-", "")}`;
}

const round = (n: number) => Math.round(n * 100) / 100;
