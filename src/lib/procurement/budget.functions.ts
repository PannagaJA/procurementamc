/**
 * Annual Departmental Budget Formulation & Consolidation (SOP §8.1 C1–C6).
 *
 * Operational Timeline:
 * - March: HODs formulate departmental requirements & submit proposed annual budgets.
 * - April: Finance compiles & consolidates all departmental budgets into an institutional proposal.
 * - May: Submission to EVP / Board of Trustees for formal sanction or rework review.
 * - Year-Round: Approved figures establish allocated budget heads. Every PR & PO
 *   automatically and dynamically deducts committed and spent amounts from balance_available.
 */
import { supabase } from "@/integrations/supabase/client";

export type BudgetStatus =
  | "draft"
  | "submitted_to_finance"
  | "under_consolidation"
  | "submitted_to_evp"
  | "sanctioned"
  | "rework_requested";

export type BudgetCategoryKey =
  | "academic_labs"
  | "routine_consumables"
  | "equipment_asset"
  | "software_cloud"
  | "services_amc"
  | "maintenance_repairs"
  | "library_resources";

export interface BudgetLineItem {
  id: string;
  category: BudgetCategoryKey;
  description: string;
  justification: string;
  qty: number;
  est_unit_cost: number;
  total_est: number;
  phasing: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
  };
}

export interface DepartmentBudgetProposal {
  id: string;
  financial_year: string;
  department_id: string;
  department_name?: string;
  status: BudgetStatus;
  total_proposed: number;
  category_allocations: Record<BudgetCategoryKey, number>;
  line_items: BudgetLineItem[];
  hod_remarks?: string | null;
  finance_remarks?: string | null;
  evp_remarks?: string | null;
  sanctioned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetHead {
  id: string;
  financial_year: string;
  department_id: string;
  department_name?: string;
  code: string;
  title: string;
  category: BudgetCategoryKey | string;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  balance_available: number;
  is_locked: boolean;
  updated_at: string;
}

export interface BudgetSpendTransaction {
  id: string;
  budget_head_id: string;
  budget_head_code?: string;
  pr_id?: string | null;
  pr_number?: string | null;
  po_id?: string | null;
  po_number?: string | null;
  amount: number;
  type: "commit" | "release" | "disburse";
  description: string;
  created_at: string;
}

export const BUDGET_CATEGORIES: { key: BudgetCategoryKey; label: string; desc: string }[] = [
  {
    key: "academic_labs",
    label: "Academic & Laboratory Consumables",
    desc: "Lab glassware, chemicals, test specimens, teaching consumables",
  },
  {
    key: "routine_consumables",
    label: "Routine Consumables & Stationery",
    desc: "Paper, printing cartridges, housekeeping, electricals",
  },
  {
    key: "equipment_asset",
    label: "Capital Equipment & Lab Machinery",
    desc: "Major laboratory rigs, testing instruments, capital hardware",
  },
  {
    key: "software_cloud",
    label: "Software Licenses & Cloud Subscriptions",
    desc: "CAD tools, MATLAB, cloud compute, LMS software",
  },
  {
    key: "services_amc",
    label: "Services & Annual Maintenance (AMC)",
    desc: "Equipment service contracts, UPS maintenance, calibrations",
  },
  {
    key: "maintenance_repairs",
    label: "Facility Maintenance & Repairs",
    desc: "Lab refurbishment, plumbing, classroom fixtures",
  },
  {
    key: "library_resources",
    label: "Library Resources & Subscriptions",
    desc: "Journals, reference books, IEEE/Springer databases",
  },
];

const LOCAL_STORAGE_BUDGET_PROPOSALS = "amc_annual_budget_proposals_v1";
const LOCAL_STORAGE_BUDGET_HEADS = "amc_department_budget_heads_v1";
const LOCAL_STORAGE_BUDGET_TXNS = "amc_budget_spend_transactions_v1";

function getFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn("Storage save error", e);
  }
}

/** Initial baseline data generator if empty */
export function initializeBaselineBudgetData(departments: { id: string; name: string }[]) {
  const existingHeads = getFromStorage<BudgetHead[]>(LOCAL_STORAGE_BUDGET_HEADS, []);
  if (existingHeads.length > 0) return;

  const fy = "2026-27";
  const heads: BudgetHead[] = [];
  const proposals: DepartmentBudgetProposal[] = [];

  const defaultAllocations: Record<string, { title: string; category: BudgetCategoryKey; amount: number; codeSuffix: string }[]> = {
    default: [
      { title: "Lab Equipment & Infrastructure", category: "equipment_asset", amount: 1200000, codeSuffix: "LAB-EQUIP" },
      { title: "Routine Departmental Consumables", category: "routine_consumables", amount: 350000, codeSuffix: "CONSUMABLES" },
      { title: "Software & Cloud Services", category: "software_cloud", amount: 500000, codeSuffix: "SOFTWARE" },
      { title: "Equipment AMC & Servicing", category: "services_amc", amount: 250000, codeSuffix: "AMC" },
      { title: "Academic & Research Material", category: "academic_labs", amount: 400000, codeSuffix: "RESEARCH" },
    ],
  };

  departments.forEach((dept) => {
    const prefix = dept.name.split(" ")[0].toUpperCase().slice(0, 4);
    const deptAllocations = defaultAllocations.default;
    let deptTotal = 0;

    const catAlloc: Record<BudgetCategoryKey, number> = {
      academic_labs: 400000,
      routine_consumables: 350000,
      equipment_asset: 1200000,
      software_cloud: 500000,
      services_amc: 250000,
      maintenance_repairs: 100000,
      library_resources: 100000,
    };

    deptAllocations.forEach((alloc) => {
      deptTotal += alloc.amount;
      const code = `${prefix}-${alloc.codeSuffix}-26`;
      heads.push({
        id: `head_${prefix}_${alloc.codeSuffix}`,
        financial_year: fy,
        department_id: dept.id,
        department_name: dept.name,
        code,
        title: `${dept.name} — ${alloc.title}`,
        category: alloc.category,
        allocated_amount: alloc.amount,
        committed_amount: Math.round(alloc.amount * 0.15), // realistic active spend
        spent_amount: Math.round(alloc.amount * 0.25),
        balance_available: alloc.amount - Math.round(alloc.amount * 0.4),
        is_locked: false,
        updated_at: new Date().toISOString(),
      });
    });

    proposals.push({
      id: `prop_${dept.id}_2026`,
      financial_year: fy,
      department_id: dept.id,
      department_name: dept.name,
      status: "sanctioned",
      total_proposed: deptTotal + 200000,
      category_allocations: catAlloc,
      line_items: [
        {
          id: `item_${dept.id}_1`,
          category: "equipment_asset",
          description: "High-performance computing workstations & testing instruments",
          justification: "Required for AI and hardware embedded systems lab per NBA guidelines",
          qty: 10,
          est_unit_cost: 120000,
          total_est: 1200000,
          phasing: { q1: 600000, q2: 600000, q3: 0, q4: 0 },
        },
        {
          id: `item_${dept.id}_2`,
          category: "routine_consumables",
          description: "Annual stationery, printer toners, lab component kits",
          justification: "Day-to-day academic teaching consumables and semester exams",
          qty: 1,
          est_unit_cost: 350000,
          total_est: 350000,
          phasing: { q1: 100000, q2: 90000, q3: 80000, q4: 80000 },
        },
      ],
      hod_remarks: "Annual requirement prepared in March per SOP §8.1. Endorsed by Department Academic Advisory Board.",
      finance_remarks: "Compiled in April consolidation. Verified against prior year utilization.",
      evp_remarks: "Approved and formally sanctioned for FY 2026-27 under institutional budget allocation.",
      sanctioned_at: "2026-05-15T10:00:00Z",
      created_at: "2026-03-15T09:30:00Z",
      updated_at: "2026-05-15T10:00:00Z",
    });
  });

  saveToStorage(LOCAL_STORAGE_BUDGET_HEADS, heads);
  saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, proposals);
}

/** List all departmental budget proposals for a fiscal year */
export async function listBudgetProposals(financialYear = "2026-27"): Promise<{
  ok: boolean;
  proposals: DepartmentBudgetProposal[];
}> {
  try {
    const { data: dbData, error } = await (supabase as any)
      .from("annual_budget_proposals")
      .select("*, departments(id, name)")
      .eq("financial_year", financialYear);

    if (!error && dbData && dbData.length > 0) {
      const formatted = dbData.map((d: any) => ({
        ...d,
        department_name: d.departments?.name,
      }));
      return { ok: true, proposals: formatted };
    }
  } catch (e) {
    // fallback to storage
  }

  const stored = getFromStorage<DepartmentBudgetProposal[]>(LOCAL_STORAGE_BUDGET_PROPOSALS, []);
  const filtered = stored.filter((p) => p.financial_year === financialYear);
  return { ok: true, proposals: filtered };
}

/** Save or update a departmental proposal (HOD Draft / Submission) */
export async function saveDepartmentProposal(proposal: Partial<DepartmentBudgetProposal>): Promise<{
  ok: boolean;
  proposal?: DepartmentBudgetProposal;
  error?: string;
}> {
  try {
    const stored = getFromStorage<DepartmentBudgetProposal[]>(LOCAL_STORAGE_BUDGET_PROPOSALS, []);
    const now = new Date().toISOString();
    let existingIndex = stored.findIndex(
      (p) =>
        (proposal.id && p.id === proposal.id) ||
        (p.department_id === proposal.department_id && p.financial_year === proposal.financial_year),
    );

    const fullProposal: DepartmentBudgetProposal = {
      id: proposal.id || `prop_${proposal.department_id}_${Date.now()}`,
      financial_year: proposal.financial_year || "2026-27",
      department_id: proposal.department_id || "",
      department_name: proposal.department_name,
      status: proposal.status || "draft",
      total_proposed: proposal.total_proposed || 0,
      category_allocations: proposal.category_allocations || ({} as any),
      line_items: proposal.line_items || [],
      hod_remarks: proposal.hod_remarks || null,
      finance_remarks: proposal.finance_remarks || null,
      evp_remarks: proposal.evp_remarks || null,
      sanctioned_at: proposal.sanctioned_at || null,
      created_at: existingIndex >= 0 ? stored[existingIndex].created_at : now,
      updated_at: now,
    };

    if (existingIndex >= 0) {
      stored[existingIndex] = fullProposal;
    } else {
      stored.push(fullProposal);
    }
    saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, stored);

    // Attempt DB sync
    try {
      await (supabase as any).from("annual_budget_proposals").upsert({
        id: fullProposal.id.startsWith("prop_") && !fullProposal.id.includes("-") ? undefined : fullProposal.id,
        financial_year: fullProposal.financial_year,
        department_id: fullProposal.department_id,
        status: fullProposal.status,
        total_proposed: fullProposal.total_proposed,
        category_allocations: fullProposal.category_allocations,
        line_items: fullProposal.line_items,
        hod_remarks: fullProposal.hod_remarks,
        finance_remarks: fullProposal.finance_remarks,
        evp_remarks: fullProposal.evp_remarks,
        sanctioned_at: fullProposal.sanctioned_at,
      });
    } catch {
      // safe fallback
    }

    return { ok: true, proposal: fullProposal };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Consolidate Department Budgets by Finance */
export async function consolidateDepartmentBudgets(
  financialYear: string,
  financeNotes: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const stored = getFromStorage<DepartmentBudgetProposal[]>(LOCAL_STORAGE_BUDGET_PROPOSALS, []);
    let updatedCount = 0;
    const now = new Date().toISOString();

    const updated = stored.map((p) => {
      if (p.financial_year === financialYear && (p.status === "submitted_to_finance" || p.status === "draft")) {
        updatedCount++;
        return {
          ...p,
          status: "under_consolidation" as BudgetStatus,
          finance_remarks: financeNotes,
          updated_at: now,
        };
      }
      return p;
    });

    saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, updated);
    return { ok: true, count: updatedCount };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message };
  }
}

/** Submit Consolidated Institutional Budget to EVP / Board of Trustees */
export async function submitConsolidatedToEvp(
  financialYear: string,
  submissionRemarks: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const stored = getFromStorage<DepartmentBudgetProposal[]>(LOCAL_STORAGE_BUDGET_PROPOSALS, []);
    let updatedCount = 0;
    const now = new Date().toISOString();

    const updated = stored.map((p) => {
      if (p.financial_year === financialYear && (p.status === "under_consolidation" || p.status === "submitted_to_finance")) {
        updatedCount++;
        return {
          ...p,
          status: "submitted_to_evp" as BudgetStatus,
          finance_remarks: submissionRemarks,
          updated_at: now,
        };
      }
      return p;
    });

    saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, updated);
    return { ok: true, count: updatedCount };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message };
  }
}

/** Trustee / EVP Sanction & Lock or Rework */
export async function sanctionAnnualBudget(params: {
  financialYear: string;
  decision: "approved" | "rework";
  remarks: string;
  sanctionedByRole?: string;
}): Promise<{ ok: boolean; message: string; error?: string }> {
  try {
    const stored = getFromStorage<DepartmentBudgetProposal[]>(LOCAL_STORAGE_BUDGET_PROPOSALS, []);
    const heads = getFromStorage<BudgetHead[]>(LOCAL_STORAGE_BUDGET_HEADS, []);
    const now = new Date().toISOString();

    if (params.decision === "rework") {
      const updated = stored.map((p) => {
        if (p.financial_year === params.financialYear && p.status === "submitted_to_evp") {
          return {
            ...p,
            status: "rework_requested" as BudgetStatus,
            evp_remarks: params.remarks,
            updated_at: now,
          };
        }
        return p;
      });
      saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, updated);
      return { ok: true, message: "Budget returned to Finance & Departments for rework with governance remarks." };
    }

    // Decision is APPROVED -> Sanction & Lock
    const updated = stored.map((p) => {
      if (p.financial_year === params.financialYear) {
        return {
          ...p,
          status: "sanctioned" as BudgetStatus,
          evp_remarks: params.remarks,
          sanctioned_at: now,
          updated_at: now,
        };
      }
      return p;
    });
    saveToStorage(LOCAL_STORAGE_BUDGET_PROPOSALS, updated);

    // Generate or unlock live Budget Heads ledger for sanctioned proposals
    updated.forEach((prop) => {
      if (prop.financial_year !== params.financialYear) return;
      const deptPrefix = (prop.department_name || "DEPT").split(" ")[0].toUpperCase().slice(0, 4);

      Object.entries(prop.category_allocations).forEach(([catKey, amount]) => {
        if (!amount || amount <= 0) return;
        const code = `${deptPrefix}-${catKey.toUpperCase().slice(0, 8)}-${params.financialYear.slice(-2)}`;
        const existingIdx = heads.findIndex((h) => h.code === code && h.financial_year === params.financialYear);
        const catInfo = BUDGET_CATEGORIES.find((c) => c.key === catKey);

        if (existingIdx >= 0) {
          heads[existingIdx].allocated_amount = Number(amount);
          heads[existingIdx].balance_available =
            heads[existingIdx].allocated_amount - (heads[existingIdx].committed_amount + heads[existingIdx].spent_amount);
          heads[existingIdx].is_locked = false;
          heads[existingIdx].updated_at = now;
        } else {
          heads.push({
            id: `head_${code}`,
            financial_year: params.financialYear,
            department_id: prop.department_id,
            department_name: prop.department_name,
            code,
            title: `${prop.department_name} — ${catInfo?.label || catKey}`,
            category: catKey,
            allocated_amount: Number(amount),
            committed_amount: 0,
            spent_amount: 0,
            balance_available: Number(amount),
            is_locked: false,
            updated_at: now,
          });
        }
      });
    });

    saveToStorage(LOCAL_STORAGE_BUDGET_HEADS, heads);

    return {
      ok: true,
      message: `Annual Budget for FY ${params.financialYear} sanctioned and locked by Executive Leadership / Board of Trustees. Active budget heads ledger is live.`,
    };
  } catch (e: any) {
    return { ok: false, message: "", error: e.message };
  }
}

/** List active sanctioned budget heads with real-time spend deductions */
export async function listActiveBudgetHeads(params?: {
  departmentId?: string | null;
  financialYear?: string;
}): Promise<{ ok: boolean; budgetHeads: BudgetHead[] }> {
  try {
    const fy = params?.financialYear || "2026-27";
    const heads = getFromStorage<BudgetHead[]>(LOCAL_STORAGE_BUDGET_HEADS, []);
    let filtered = heads.filter((h) => h.financial_year === fy);
    if (params?.departmentId) {
      filtered = filtered.filter((h) => h.department_id === params.departmentId);
    }
    return { ok: true, budgetHeads: filtered };
  } catch (e) {
    return { ok: false, budgetHeads: [] };
  }
}

/**
 * Deduct committed spend against an active budget head.
 * Called when a PR is raised/approved or when a PO is issued.
 */
export function recordBudgetSpendDeduction(params: {
  budgetHeadCode: string;
  departmentId?: string | null;
  amount: number;
  type: "commit" | "release" | "disburse";
  prId?: string | null;
  prNumber?: string | null;
  poId?: string | null;
  poNumber?: string | null;
  description?: string;
}): { ok: boolean; newBalance?: number; error?: string } {
  try {
    const heads = getFromStorage<BudgetHead[]>(LOCAL_STORAGE_BUDGET_HEADS, []);
    const txns = getFromStorage<BudgetSpendTransaction[]>(LOCAL_STORAGE_BUDGET_TXNS, []);
    const headIndex = heads.findIndex((h) => h.code.toLowerCase() === params.budgetHeadCode.toLowerCase().trim());

    if (headIndex < 0) {
      return { ok: false, error: `Budget head '${params.budgetHeadCode}' not found in active sanctioned ledger.` };
    }

    const head = heads[headIndex];
    const amount = Number(params.amount) || 0;

    if (params.type === "commit") {
      if (amount > head.balance_available) {
        return {
          ok: false,
          error: `Commitment ₹${amount.toLocaleString("en-IN")} exceeds available budget balance ₹${head.balance_available.toLocaleString("en-IN")} for head ${head.code}.`,
        };
      }
      head.committed_amount += amount;
    } else if (params.type === "release") {
      head.committed_amount = Math.max(0, head.committed_amount - amount);
    } else if (params.type === "disburse") {
      // Disburse moves amount from committed into spent
      head.committed_amount = Math.max(0, head.committed_amount - amount);
      head.spent_amount += amount;
    }

    head.balance_available = head.allocated_amount - (head.committed_amount + head.spent_amount);
    head.updated_at = new Date().toISOString();
    heads[headIndex] = head;

    txns.unshift({
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      budget_head_id: head.id,
      budget_head_code: head.code,
      pr_id: params.prId || null,
      pr_number: params.prNumber || null,
      po_id: params.poId || null,
      po_number: params.poNumber || null,
      amount,
      type: params.type,
      description:
        params.description ||
        `${params.type.toUpperCase()}: ${params.prNumber || params.poNumber || "Requisition spend"} (₹${amount.toLocaleString("en-IN")})`,
      created_at: new Date().toISOString(),
    });

    saveToStorage(LOCAL_STORAGE_BUDGET_HEADS, heads);
    saveToStorage(LOCAL_STORAGE_BUDGET_TXNS, txns.slice(0, 100)); // keep last 100 txns

    return { ok: true, newBalance: head.balance_available };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Get spend transaction history */
export function getBudgetTransactions(budgetHeadCode?: string): BudgetSpendTransaction[] {
  const txns = getFromStorage<BudgetSpendTransaction[]>(LOCAL_STORAGE_BUDGET_TXNS, []);
  if (budgetHeadCode) {
    return txns.filter((t) => t.budget_head_code === budgetHeadCode);
  }
  return txns;
}
