/**
 * Turnaround times (SOP §8.3–§8.7): how long each open item has been waiting, against the
 * SOP's target in working days. Read-only — it reports, it doesn't escalate or notify.
 * Queries run as the signed-in user, so each person only sees what they're allowed to.
 */
import { supabase } from "@/integrations/supabase/client";
import { roleLabel } from "@/lib/procurement/labels";

/** Whole working days (Mon–Fri) since a timestamp. */
export function workingDaysSince(iso: string | null | undefined, now = new Date()): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  let days = 0;
  while (d < now) {
    d.setDate(d.getDate() + 1);
    if (d <= now && d.getDay() !== 0 && d.getDay() !== 6) days++;
  }
  return days;
}

export type TurnaroundStatus = "on_time" | "due_today" | "overdue";

export function turnaroundStatus(daysWaiting: number, targetDays: number): TurnaroundStatus {
  return daysWaiting > targetDays
    ? "overdue"
    : daysWaiting === targetDays
      ? "due_today"
      : "on_time";
}

export type TurnaroundItem = {
  id: string;
  number: string;
  /** What is waiting, in plain words. */
  step: string;
  waitingOn: string;
  daysWaiting: number;
  targetDays: number;
  status: TurnaroundStatus;
  /** Where to act on it. */
  path: string;
};

const who = (role: string | null | undefined, fallback: string) =>
  role ? roleLabel(role) : fallback;

/** SOP targets, in working days. */
export const TARGETS = {
  prApproval: 2, // §8.3
  quotes: 7, // §8.4, unless the RFQ has its own deadline
  poApproval: 1, // §8.5
  poIssue: 1, // §8.5
  goodsInspection: 2, // §8.6
  invoice: 5, // §8.7
  invoiceHold: 3, // §8.7 discrepancies: 2–3 working days
};

export async function loadTurnaround(now = new Date()): Promise<TurnaroundItem[]> {
  const db = supabase as any;
  const [prs, rfqs, pos, grns, invs] = await Promise.all([
    db
      .from("purchase_requisitions")
      .select("id, pr_number, status, current_approver_role, created_at")
      .in("status", ["submitted", "under_review", "escalated_to_evp"])
      .limit(200),
    db
      .from("rfqs")
      .select("id, rfq_number, response_deadline, created_at")
      .eq("status", "sent")
      .limit(200),
    db
      .from("purchase_orders")
      .select("id, po_number, status, current_approver_role, created_at, approved_at")
      .in("status", ["pending_approval", "approved"])
      .limit(200),
    db.from("grns").select("id, grn_number, created_at").eq("status", "pending").limit(200),
    db
      .from("invoices")
      .select("id, invoice_number, match_status, created_at, held_at")
      .in("match_status", ["pending", "matched", "on_hold"])
      .limit(200),
  ]);

  const items: TurnaroundItem[] = [];
  const add = (i: Omit<TurnaroundItem, "status">) =>
    items.push({ ...i, status: turnaroundStatus(i.daysWaiting, i.targetDays) });

  for (const pr of prs.data ?? []) {
    add({
      id: pr.id,
      number: pr.pr_number,
      step: "Requisition approval",
      waitingOn: who(
        pr.status === "escalated_to_evp" ? "evp" : pr.current_approver_role,
        "Approver",
      ),
      daysWaiting: workingDaysSince(pr.created_at, now),
      targetDays: TARGETS.prApproval,
      path: "/procurement/approvals",
    });
  }
  for (const r of rfqs.data ?? []) {
    // With a deadline, the target is the working days from sending to that deadline.
    const target = r.response_deadline
      ? Math.max(1, workingDaysSince(r.created_at, new Date(`${r.response_deadline}T23:59:59`)))
      : TARGETS.quotes;
    add({
      id: r.id,
      number: r.rfq_number,
      step: "Vendor quotations",
      waitingOn: "Vendors",
      daysWaiting: workingDaysSince(r.created_at, now),
      targetDays: target,
      path: "/procurement/rfqs",
    });
  }
  for (const po of pos.data ?? []) {
    const awaitingIssue = po.status === "approved";
    add({
      id: po.id,
      number: po.po_number,
      step: awaitingIssue ? "Issue purchase order" : "Purchase order approval",
      waitingOn: awaitingIssue ? "Procurement Officer" : who(po.current_approver_role, "Approver"),
      daysWaiting: workingDaysSince(
        awaitingIssue ? (po.approved_at ?? po.created_at) : po.created_at,
        now,
      ),
      targetDays: awaitingIssue ? TARGETS.poIssue : TARGETS.poApproval,
      path: awaitingIssue ? "/procurement/orders" : "/procurement/approvals",
    });
  }
  for (const g of grns.data ?? []) {
    add({
      id: g.id,
      number: g.grn_number,
      step: "Goods inspection",
      waitingOn: "Stores / inspection",
      daysWaiting: workingDaysSince(g.created_at, now),
      targetDays: TARGETS.goodsInspection,
      path: "/procurement/grns",
    });
  }
  for (const inv of invs.data ?? []) {
    const held = inv.match_status === "on_hold";
    add({
      id: inv.id,
      number: inv.invoice_number,
      step: held ? "Invoice on hold" : "Invoice approval",
      waitingOn: "Finance",
      daysWaiting: workingDaysSince(held ? (inv.held_at ?? inv.created_at) : inv.created_at, now),
      targetDays: held ? TARGETS.invoiceHold : TARGETS.invoice,
      path: "/procurement/invoices",
    });
  }

  const rank = { overdue: 0, due_today: 1, on_time: 2 };
  return items.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.daysWaiting - b.targetDays - (a.daysWaiting - a.targetDays),
  );
}
