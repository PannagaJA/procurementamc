/**
 * Annual budget (SOP §8.1): HOD proposes (March) → Finance consolidates and sends to the EVP
 * (April) → EVP approves or sends back (May, before June). Approval creates the budget heads
 * that PRs are charged to; Finance can also enter an opening budget for the current year.
 * Every write is a server function; roles are re-derived from the session.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FINANCE = ["admin", "finance", "director_admin_finance"];
const EVP = ["admin", "evp"];
const STAFF = [
  "admin",
  "evp",
  "director_admin_finance",
  "purchase_committee",
  "principal",
  "procurement_officer",
  "procurement_executive",
  "finance",
  "stores",
];

export type BudgetLineItem = {
  category: string;
  description: string;
  justification: string;
  amount: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
};

async function caller(context: any) {
  const { getCallerRoles } = await import("@/server/procurement/roles");
  const roles = await getCallerRoles(context.supabase as any, context.userId);
  const held = roles.map((r) => r.role);
  return {
    held,
    isStaff: held.some((r) => STAFF.includes(r)),
    isFinance: held.some((r) => FINANCE.includes(r)),
    isEvp: held.some((r) => EVP.includes(r)),
    isAdmin: held.includes("admin"),
    hodDeptIds: roles
      .filter((r) => r.role === "hod" && r.department_id)
      .map((r) => r.department_id!),
    myDeptIds: roles.map((r) => r.department_id).filter(Boolean) as string[],
  };
}

const fyOk = (fy: string) => /^\d{4}-\d{2}$/.test(fy ?? "");
const nonNeg = (n: unknown) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);

/** Everything the budget page shows for a financial year, limited to what the caller may see. */
export const getBudgetOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { financial_year: string }) => input)
  .handler(async ({ data, context }) => {
    if (!fyOk(data.financial_year))
      return { ok: false as const, error: "Choose a financial year." };
    const me = await caller(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { headTotals, quarterlyVariance } = await import("@/lib/procurement/budgetLedger");

    const [{ data: depts }, { data: heads }, { data: proposals }] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name").order("name"),
      supabaseAdmin
        .from("budget_heads")
        .select("*")
        .eq("financial_year", data.financial_year)
        .order("code"),
      supabaseAdmin.from("budget_proposals").select("*").eq("financial_year", data.financial_year),
    ]);
    const visible = (deptId: string) => me.isStaff || me.myDeptIds.includes(deptId);
    const myHeads = (heads ?? []).filter((h: any) => visible(h.department_id));
    const { data: entries } = myHeads.length
      ? await supabaseAdmin
          .from("budget_ledger")
          .select("budget_head_id, entry_type, amount, po_id, created_at")
          .in(
            "budget_head_id",
            myHeads.map((h: any) => h.id),
          )
      : { data: [] as any[] };
    const byHead = new Map<string, any[]>();
    for (const e of entries ?? []) {
      byHead.set(e.budget_head_id, [...(byHead.get(e.budget_head_id) ?? []), e]);
    }
    const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    return {
      ok: true as const,
      me: {
        isStaff: me.isStaff,
        isFinance: me.isFinance,
        isEvp: me.isEvp,
        hodDeptIds: me.isAdmin ? (depts ?? []).map((d: any) => d.id) : me.hodDeptIds,
      },
      departments: (depts ?? []).filter((d: any) => visible(d.id) || me.hodDeptIds.includes(d.id)),
      heads: myHeads.map((h: any) => ({
        ...h,
        department_name: deptName.get(h.department_id) ?? "Department",
        ...headTotals(h.allocated_amount, byHead.get(h.id) ?? []),
        quarters: quarterlyVariance(h.allocated_amount, byHead.get(h.id) ?? []),
      })),
      proposals: (proposals ?? [])
        .filter((p: any) => me.isStaff || me.hodDeptIds.includes(p.department_id))
        .map((p: any) => ({
          ...p,
          department_name: deptName.get(p.department_id) ?? "Department",
        })),
    };
  });

/** Ledger lines for one head, with the PO / PR / invoice they came from. */
export const getHeadLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { head_id: string }) => input)
  .handler(async ({ data, context }) => {
    const me = await caller(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: head } = await supabaseAdmin
      .from("budget_heads")
      .select("id, department_id")
      .eq("id", data.head_id)
      .maybeSingle();
    if (!head || !(me.isStaff || me.myDeptIds.includes(head.department_id)))
      return { ok: false as const, error: "Budget head not found." };
    const { data: entries } = await supabaseAdmin
      .from("budget_ledger")
      .select(
        "id, entry_type, amount, notes, created_at, purchase_orders (po_number), purchase_requisitions (pr_number), invoices (invoice_number)",
      )
      .eq("budget_head_id", head.id)
      .order("created_at", { ascending: false });
    return { ok: true as const, entries: entries ?? [] };
  });

/** HOD saves (or submits) the department's proposal. Editable only as draft or after send-back. */
export const saveBudgetProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      financial_year: string;
      department_id: string;
      category_allocations: Record<string, number>;
      line_items: BudgetLineItem[];
      hod_remarks?: string | null;
      submit: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!fyOk(data.financial_year))
      return { ok: false as const, error: "Choose a financial year." };
    const me = await caller(context);
    if (!me.isAdmin && !me.hodDeptIds.includes(data.department_id))
      return { ok: false as const, error: "Only the department's HOD can prepare its budget." };
    const { BUDGET_CATEGORIES } = await import("@/lib/procurement/budgetLedger");
    const valid = new Set<string>(BUDGET_CATEGORIES.map((c) => c.value));
    const allocations = Object.fromEntries(
      Object.entries(data.category_allocations ?? {})
        .filter(([k, v]) => valid.has(k) && nonNeg(v) > 0)
        .map(([k, v]) => [k, nonNeg(v)]),
    );
    const total = Object.values(allocations).reduce((s, v) => s + v, 0);
    if (data.submit && total <= 0)
      return { ok: false as const, error: "Enter an amount for at least one category." };
    const items = (data.line_items ?? [])
      .filter((l) => l.description?.trim())
      .map((l) => ({
        category: valid.has(l.category) ? l.category : "small_value",
        description: l.description.trim().slice(0, 500),
        justification: (l.justification ?? "").trim().slice(0, 1000),
        amount: nonNeg(l.amount),
        q1: nonNeg(l.q1),
        q2: nonNeg(l.q2),
        q3: nonNeg(l.q3),
        q4: nonNeg(l.q4),
      }));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("budget_proposals")
      .select("id, status")
      .eq("financial_year", data.financial_year)
      .eq("department_id", data.department_id)
      .maybeSingle();
    if (existing && !["draft", "rework"].includes(existing.status))
      return {
        ok: false as const,
        error: `This budget is "${existing.status.replace("_", " ")}" and can't be edited now.`,
      };
    const now = new Date().toISOString();
    const row = {
      financial_year: data.financial_year,
      department_id: data.department_id,
      category_allocations: allocations,
      line_items: items,
      total_proposed: total,
      hod_remarks: data.hod_remarks?.trim() || null,
      status: data.submit ? "submitted" : (existing?.status ?? "draft"),
      ...(data.submit ? { submitted_by: context.userId, submitted_at: now } : {}),
      updated_at: now,
    };
    const { data: saved, error } = existing
      ? await supabaseAdmin
          .from("budget_proposals")
          .update(row)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabaseAdmin.from("budget_proposals").insert(row).select().single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, proposal: saved };
  });

/** Finance consolidates every submitted proposal for the year and sends them to the EVP. */
export const consolidateBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { financial_year: string; remarks?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const me = await caller(context);
    if (!me.isFinance)
      return { ok: false as const, error: "Only Finance can consolidate budgets." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: moved, error } = await supabaseAdmin
      .from("budget_proposals")
      .update({
        status: "with_evp",
        finance_remarks: data.remarks?.trim() || null,
        consolidated_by: context.userId,
        consolidated_at: now,
        updated_at: now,
      })
      .eq("financial_year", data.financial_year)
      .eq("status", "submitted")
      .select("id");
    if (error) return { ok: false as const, error: error.message };
    if (!moved?.length)
      return { ok: false as const, error: "No submitted department budgets to consolidate." };
    return { ok: true as const, count: moved.length };
  });

/** Create or update a head; codes are unique, so a clash gets a numeric suffix. */
async function upsertHead(
  admin: any,
  h: {
    financial_year: string;
    department_id: string;
    department_name: string;
    category: string;
    amount: number;
    source: "sanctioned" | "opening";
    proposal_id?: string | null;
    actor: string;
  },
) {
  const { headCode, categoryLabel } = await import("@/lib/procurement/budgetLedger");
  const { data: existing } = await admin
    .from("budget_heads")
    .select("id")
    .eq("financial_year", h.financial_year)
    .eq("department_id", h.department_id)
    .eq("category", h.category)
    .maybeSingle();
  const now = new Date().toISOString();
  if (existing) {
    return admin
      .from("budget_heads")
      .update({
        allocated_amount: h.amount,
        source: h.source,
        proposal_id: h.proposal_id ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
  }
  const base = headCode(h.department_name, h.category, h.financial_year);
  for (let n = 1; n < 20; n++) {
    const code = n === 1 ? base : `${base}-${n}`;
    const res = await admin.from("budget_heads").insert({
      financial_year: h.financial_year,
      department_id: h.department_id,
      category: h.category,
      code,
      title: `${h.department_name} — ${categoryLabel(h.category)}`,
      allocated_amount: h.amount,
      source: h.source,
      proposal_id: h.proposal_id ?? null,
      created_by: h.actor,
    });
    if (!res.error || res.error.code !== "23505") return res;
  }
  return { error: { message: "Couldn't create a unique budget head code." } };
}

/** EVP approves a department's budget (creating its heads) or sends it back to the HOD. */
export const decideBudgetProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { proposal_id: string; approve: boolean; remarks?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const me = await caller(context);
    if (!me.isEvp) return { ok: false as const, error: "Only the EVP can approve budgets." };
    if (!data.approve && !data.remarks?.trim())
      return { ok: false as const, error: "Say what needs to change before sending it back." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("budget_proposals")
      .select("*, departments (name)")
      .eq("id", data.proposal_id)
      .maybeSingle();
    if (!p) return { ok: false as const, error: "Budget proposal not found." };
    if (p.status !== "with_evp")
      return { ok: false as const, error: "This budget isn't waiting for the EVP." };

    if (data.approve) {
      for (const [category, amount] of Object.entries(
        (p.category_allocations ?? {}) as Record<string, number>,
      )) {
        if (!(Number(amount) > 0)) continue;
        const res = await upsertHead(supabaseAdmin, {
          financial_year: p.financial_year,
          department_id: p.department_id,
          department_name: (p as any).departments?.name ?? "Department",
          category,
          amount: Number(amount),
          source: "sanctioned",
          proposal_id: p.id,
          actor: context.userId,
        });
        if (res.error) return { ok: false as const, error: res.error.message };
      }
    }
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("budget_proposals")
      .update({
        status: data.approve ? "sanctioned" : "rework",
        evp_remarks: data.remarks?.trim() || null,
        decided_by: context.userId,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", p.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/**
 * Finance enters the approved figures for a year that wasn't budgeted in the app (the opening
 * budget). Heads already approved through the EVP cycle aren't overwritten.
 */
export const setOpeningBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      financial_year: string;
      department_id: string;
      allocations: Record<string, number>;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!fyOk(data.financial_year))
      return { ok: false as const, error: "Choose a financial year." };
    const me = await caller(context);
    if (!me.isFinance)
      return { ok: false as const, error: "Only Finance can enter the opening budget." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BUDGET_CATEGORIES } = await import("@/lib/procurement/budgetLedger");
    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .eq("id", data.department_id)
      .maybeSingle();
    if (!dept) return { ok: false as const, error: "Department not found." };
    const { data: approved } = await supabaseAdmin
      .from("budget_heads")
      .select("category")
      .eq("financial_year", data.financial_year)
      .eq("department_id", dept.id)
      .eq("source", "sanctioned");
    const locked = new Set((approved ?? []).map((h: any) => h.category));

    let saved = 0;
    const skipped: string[] = [];
    for (const c of BUDGET_CATEGORIES) {
      const amount = nonNeg(data.allocations?.[c.value]);
      if (!(amount > 0)) continue;
      if (locked.has(c.value)) {
        skipped.push(c.label);
        continue;
      }
      const res = await upsertHead(supabaseAdmin, {
        financial_year: data.financial_year,
        department_id: dept.id,
        department_name: dept.name,
        category: c.value,
        amount,
        source: "opening",
        actor: context.userId,
      });
      if (res.error) return { ok: false as const, error: res.error.message };
      saved++;
    }
    if (!saved && !skipped.length)
      return { ok: false as const, error: "Enter an amount for at least one category." };
    return { ok: true as const, saved, skipped };
  });

/** Budget heads a PR in this department can be charged to (current year), with balances. */
export const listPrBudgetHeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { department_id: string }) => input)
  .handler(async ({ data, context }) => {
    const me = await caller(context);
    if (!me.isStaff && !me.myDeptIds.includes(data.department_id))
      return { ok: true as const, heads: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { financialYear, headTotals } = await import("@/lib/procurement/budgetLedger");
    const { data: heads } = await supabaseAdmin
      .from("budget_heads")
      .select("id, code, title, category, allocated_amount, financial_year")
      .eq("department_id", data.department_id)
      .eq("financial_year", financialYear())
      .order("code");
    if (!heads?.length) return { ok: true as const, heads: [] };
    const { data: entries } = await supabaseAdmin
      .from("budget_ledger")
      .select("budget_head_id, entry_type, amount")
      .in(
        "budget_head_id",
        heads.map((h: any) => h.id),
      );
    return {
      ok: true as const,
      heads: heads.map((h: any) => ({
        ...h,
        ...headTotals(
          h.allocated_amount,
          (entries ?? []).filter((e: any) => e.budget_head_id === h.id),
        ),
      })),
    };
  });
