/**
 * Budget hooks used by the PR, PO and invoice server functions (SOP §8.1, Section B).
 * Decisions recorded in DECISIONS.md:
 *  - A PR over its head's balance is allowed with a justification, but needs the EVP.
 *  - Money is committed when the PO is issued (nothing is held at PR approval); a PO that
 *    no longer fits the balance at issue goes to the EVP unless its PR was EVP-approved.
 * Arithmetic lives in src/lib/procurement/budgetLedger.ts; the commit itself runs in the
 * database (budget_commit) with the head row locked.
 */
import { financialYear, headTotals, isOverBudget } from "@/lib/procurement/budgetLedger";
import { normalizeCategory } from "@/lib/procurement/authorityMatrix";

type Db = any;
type Fail = { ok: false; error: string; code: string };
const fail = (error: string, code: string): Fail => ({ ok: false, error, code });
const inr = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
const round = (n: number) => Math.round(n * 100) / 100;

export async function headWithBalance(admin: Db, headId: string) {
  const [{ data: head }, { data: entries }] = await Promise.all([
    admin.from("budget_heads").select("*").eq("id", headId).maybeSingle(),
    admin.from("budget_ledger").select("entry_type, amount, po_id").eq("budget_head_id", headId),
  ]);
  if (!head) return null;
  return { head, ...headTotals(head.allocated_amount, entries ?? []) };
}

/**
 * PR Section B: validate the chosen head and say whether the amount fits.
 * A department with heads this year must charge PRs to one; without heads, budget is "none".
 */
export async function prBudgetCheck(
  admin: Db,
  input: { headId: string | null | undefined; departmentId: string | null; amount: number },
): Promise<
  | Fail
  | {
      ok: true;
      status: "within" | "over" | "none";
      headId: string | null;
      balance: number | null;
      code?: string;
    }
> {
  const fy = financialYear();
  if (!input.headId) {
    if (!input.departmentId) return { ok: true, status: "none", headId: null, balance: null };
    const { count } = await admin
      .from("budget_heads")
      .select("id", { count: "exact", head: true })
      .eq("department_id", input.departmentId)
      .eq("financial_year", fy);
    return count
      ? fail("Choose the budget head this requisition is charged to.", "budget_head_required")
      : { ok: true, status: "none", headId: null, balance: null };
  }
  const h = await headWithBalance(admin, input.headId);
  if (!h || h.head.department_id !== input.departmentId)
    return fail("That budget head doesn't belong to this department.", "budget_head_mismatch");
  if (h.head.financial_year !== fy)
    return fail(
      `That budget head is for FY ${h.head.financial_year}, not ${fy}.`,
      "budget_head_wrong_year",
    );
  return {
    ok: true,
    status: isOverBudget(h.balance, input.amount) ? "over" : "within",
    headId: h.head.id,
    balance: h.balance,
    code: h.head.code,
  };
}

/** Sum a PO's own ledger entries. */
async function poEntries(admin: Db, poId: string) {
  const { data } = await admin
    .from("budget_ledger")
    .select("budget_head_id, entry_type, amount")
    .eq("po_id", poId);
  let commit = 0;
  let spend = 0;
  let release = 0;
  for (const e of data ?? []) {
    const a = Number(e.amount) || 0;
    if (e.entry_type === "commit") commit += a;
    else if (e.entry_type === "spend") spend += a;
    else release += a;
  }
  return { headId: (data ?? [])[0]?.budget_head_id as string | undefined, commit, spend, release };
}

/**
 * Bring a PO's commitment in line with its current total (first issue, re-issue after an
 * amendment). Commits the increase or releases the decrease. An increase that doesn't fit the
 * balance needs the EVP unless the PR or the PO already has the EVP's budget approval.
 */
export async function syncPoCommitment(
  admin: Db,
  input: {
    po: {
      id: string;
      po_number: string;
      pr_id: string | null;
      total: number;
      budget_status?: string | null;
    };
    pr: { budget_head_id: string | null; budget_status: string | null } | null;
    actorId: string;
  },
): Promise<{ ok: true; status: string } | { ok: false; needsEvp: true; balance: number }> {
  const headId = input.pr?.budget_head_id;
  if (!headId) return { ok: true, status: "none" };
  const own = await poEntries(admin, input.po.id);
  const delta = round(input.po.total - (own.commit - own.release));
  if (Math.abs(delta) < 0.01) return { ok: true, status: input.po.budget_status ?? "within" };

  if (delta < 0) {
    await admin.from("budget_ledger").insert({
      budget_head_id: own.headId ?? headId,
      entry_type: "release",
      amount: -delta,
      po_id: input.po.id,
      pr_id: input.po.pr_id,
      actor_id: input.actorId,
      notes: `${input.po.po_number} value reduced`,
    });
    return { ok: true, status: input.po.budget_status ?? "within" };
  }

  const evpApproved =
    input.pr?.budget_status === "evp_approved" || input.po.budget_status === "evp_approved";
  const { data: balanceAfter, error } = await admin.rpc("budget_commit", {
    _head_id: own.headId ?? headId,
    _amount: delta,
    _po_id: input.po.id,
    _pr_id: input.po.pr_id,
    _actor: input.actorId,
    _notes: own.commit ? `${input.po.po_number} value increased` : `${input.po.po_number} issued`,
    _allow_over: evpApproved,
  });
  if (error) throw new Error(error.message);
  if (balanceAfter === null) {
    const h = await headWithBalance(admin, own.headId ?? headId);
    return { ok: false, needsEvp: true, balance: h?.balance ?? 0 };
  }
  return { ok: true, status: evpApproved ? "evp_approved" : "within" };
}

/** PO closed or cancelled: give back whatever it still holds (committed − spent − released). */
export async function releasePoRemainder(admin: Db, poId: string, actorId: string, notes: string) {
  const own = await poEntries(admin, poId);
  const outstanding = round(own.commit - own.spend - own.release);
  if (!own.headId || outstanding <= 0) return 0;
  await admin.from("budget_ledger").insert({
    budget_head_id: own.headId,
    entry_type: "release",
    amount: outstanding,
    po_id: poId,
    actor_id: actorId,
    notes,
  });
  return outstanding;
}

/** Invoice paid: the money moves from committed to spent on the PO's head. */
export async function spendForPayment(
  admin: Db,
  input: { poId: string; invoiceId: string; amount: number; actorId: string; notes: string },
) {
  const own = await poEntries(admin, input.poId);
  if (!own.headId || !(input.amount > 0)) return;
  await admin.from("budget_ledger").insert({
    budget_head_id: own.headId,
    entry_type: "spend",
    amount: round(input.amount),
    po_id: input.poId,
    invoice_id: input.invoiceId,
    actor_id: input.actorId,
    notes: input.notes,
  });
}

/** Month-to-date spend for the authority matrix's monthly caps (per department and category). */
export async function addMonthlySpend(
  admin: Db,
  input: { departmentId: string | null; category: string | null; amount: number },
) {
  if (!input.departmentId || !(input.amount > 0)) return;
  const d = new Date();
  await admin.rpc("add_department_monthly_spend", {
    _department_id: input.departmentId,
    _month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    _category: normalizeCategory(input.category ?? "routine_consumable"),
    _amount: round(input.amount),
  });
}

export const overBudgetReason = (balance: number, amount: number) =>
  `Over the budget head balance (${inr(amount)} against ${inr(Math.max(0, balance))} available) — needs EVP approval.`;
