/**
 * Emergency Procurement Server Functions (SOP §9).
 *
 * Enforces server-side gates:
 * - Hard Annual Ledger Cap of ₹10,00,000 per Financial Year (HARD BLOCK if exceeded).
 * - EVP-Only Approval gate (non-EVP users strictly rejected).
 * - Post-Facto Ratification 2-day window validation (§9.3).
 * - Transactional ledger updates upon EVP authorization.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EMERGENCY_CAP_LIMIT = 1000000; // ₹10,00,000 Annual Cap (SOP §9)

export function getCurrentFinancialYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0 is Jan, 3 is April)
  if (month >= 3) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

export type RequestEmergencyInput = {
  department_id?: string | null;
  description: string;
  estimated_cost: number;
  reason_standard_process_failed: string;
  is_post_facto?: boolean;
  quotations_obtained_count?: number;
  price_reasonableness_note?: string | null;
  vendor_id?: string | null;
};

export type ApproveEmergencyInput = {
  emergency_id: string;
  decision: "approved" | "rejected";
  rejection_remarks?: string | null;
};

export const checkAnnualCap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { financial_year?: string; new_amount?: number }) => input)
  .handler(async ({ data, context }) => {
    const fy = data?.financial_year || getCurrentFinancialYear();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emergencyCapStatus } = await import("@/server/procurement/guards");
    // Register approvals and emergency-flag PRs share one counter (DECISIONS Q16).
    const cap = await emergencyCapStatus(supabaseAdmin as any, Number(data?.new_amount) || 0, fy);

    return {
      financialYear: fy,
      runningTotal: cap.used,
      capLimit: cap.capLimit,
      remaining: cap.remaining,
      projected: cap.projected,
      allowed: cap.allowed,
    };
  });

export const requestEmergencyProcurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RequestEmergencyInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const fy = getCurrentFinancialYear();
    const cost = Number(data.estimated_cost) || 0;

    if (cost <= 0) {
      return {
        ok: false as const,
        error: "Estimated cost must be greater than zero.",
        code: "invalid_cost",
      };
    }

    // 1. Guard: Check Annual Hard Cap (₹10,00,000), shared with emergency-flag PRs
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emergencyCapStatus } = await import("@/server/procurement/guards");
    const capStatus = await emergencyCapStatus(supabaseAdmin as any, cost, fy);

    if (!capStatus.allowed) {
      const { used: currentTotal, capLimit: cap, remaining, projected: projectedTotal } = capStatus;
      return {
        ok: false as const,
        error:
          `This emergency request of ₹${cost.toLocaleString("en-IN")} can't be approved: it would bring ${fy} emergency spending to ₹${projectedTotal.toLocaleString("en-IN")}, ` +
          `above the annual limit of ₹${cap.toLocaleString("en-IN")} (₹${remaining.toLocaleString("en-IN")} remaining). ` +
          `Raise a regular purchase requisition instead.`,
        code: "emergency_cap_exceeded",
        currentTotal,
        capLimit: cap,
        remaining,
      };
    }

    // 2. Insert Emergency Procurement Record
    const { data: ep, error: epErr } = await db
      .from("emergency_procurements")
      .insert({
        // pr_id is set only by createEmergencyPo; a client-sent link would hide a PR from the counter.
        pr_id: null,
        department_id: data.department_id ?? null,
        requested_by: context.userId,
        description: data.description,
        estimated_cost: cost,
        reason_standard_process_failed: data.reason_standard_process_failed,
        is_post_facto: data.is_post_facto ?? false,
        quotations_obtained_count: data.quotations_obtained_count ?? 1,
        price_reasonableness_note: data.price_reasonableness_note ?? null,
        vendor_id: data.vendor_id ?? null,
        financial_year: fy,
        evp_approval_status: "pending",
        register_entry_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (epErr) return { ok: false as const, error: epErr.message, code: "insert_failed" };

    return { ok: true as const, emergencyProcurement: ep, financialYear: fy };
  });

export const approveEmergency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ApproveEmergencyInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { ForbiddenError } = await import("@/server/procurement/errors");

    // 1. Guard: EVP Only Authorization
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("admin") && !held.includes("evp")) {
      throw new ForbiddenError(
        `Only the Executive Vice President (EVP) can authorize emergency purchases.`,
      );
    }

    const { data: ep, error: epErr } = await db
      .from("emergency_procurements")
      .select("*")
      .eq("id", data.emergency_id)
      .single();

    if (epErr || !ep)
      return { ok: false as const, error: "Emergency procurement record not found" };
    if (ep.requested_by && ep.requested_by === context.userId) {
      return {
        ok: false as const,
        error: "You raised this emergency purchase, so another approver must decide it.",
      };
    }
    // A decided entry stays decided: approving twice would count its cost twice.
    if (ep.evp_approval_status !== "pending") {
      return {
        ok: false as const,
        error: `${ep.emergency_number ?? "This emergency purchase"} is already ${ep.evp_approval_status}.`,
      };
    }

    // 2. Post-Facto 2-Day Rule Check (§9.3)
    if (ep.is_post_facto && data.decision === "approved") {
      const entryTime = new Date(ep.register_entry_at).getTime();
      const now = Date.now();
      const diffHours = (now - entryTime) / (1000 * 60 * 60);

      // Check 2 working days (48 hours)
      if (diffHours > 48) {
        console.warn(
          `Post-facto ratification warning: Approved ${diffHours.toFixed(1)} hours after register entry (exceeds 48h guideline).`,
        );
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.decision === "rejected") {
      await (supabaseAdmin as any)
        .from("emergency_procurements")
        .update({
          evp_approval_status: "rejected",
          evp_approved_by: context.userId,
          rejection_remarks: data.rejection_remarks || "Rejected by EVP",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ep.id);
      return { ok: true as const, status: "rejected" };
    }

    // 3. Approved: Transactionally update Emergency Annual Ledger
    const cost = Number(ep.estimated_cost) || 0;
    const fy = ep.financial_year || getCurrentFinancialYear();

    const { emergencyCapStatus } = await import("@/server/procurement/guards");
    const cap = await emergencyCapStatus(supabaseAdmin as any, cost, fy);

    // Hard check again before commit, across the register and emergency-flag PRs
    if (!cap.allowed) {
      return {
        ok: false as const,
        error: `Cannot approve: Annual ledger for ${fy} would reach ₹${cap.projected.toLocaleString("en-IN")}, exceeding ₹${cap.capLimit.toLocaleString("en-IN")}.`,
        code: "cap_exceeded_on_approval",
      };
    }

    // The ledger holds the register's own total; create the FY row if it's missing.
    await (supabaseAdmin as any).from("emergency_annual_ledger").upsert(
      {
        financial_year: fy,
        running_total: cap.registerTotal + cost,
        cap_limit: cap.capLimit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "financial_year" },
    );

    // Update emergency record
    const { error: upErr } = await (supabaseAdmin as any)
      .from("emergency_procurements")
      .update({
        evp_approval_status: "approved",
        evp_approved_by: context.userId,
        evp_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ep.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return {
      ok: true as const,
      status: "approved",
      runningTotal: cap.projected,
      financialYear: fy,
    };
  });

export const listEmergencyProcurements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { financial_year?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const fy = data?.financial_year || getCurrentFinancialYear();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emergencyCapStatus } = await import("@/server/procurement/guards");

    const [epRes, cap] = await Promise.all([
      db
        .from("emergency_procurements")
        .select(
          `
          *,
          departments (id, name),
          vendors (id, name, gst_number),
          purchase_requisitions (pr_number, purchase_orders (id, po_number, status))
        `,
        )
        .order("created_at", { ascending: false }),
      emergencyCapStatus(supabaseAdmin as any, 0, fy),
    ]);

    return {
      ok: true as const,
      financialYear: fy,
      // running_total is the shared counter: register approvals + emergency-flag PRs.
      ledger: { financial_year: fy, running_total: cap.used, cap_limit: cap.capLimit },
      emergencyProcurements: epRes.data || [],
    };
  });

export type EmergencyPoLine = {
  description: string;
  unit?: string | null;
  qty: number;
  unit_price: number;
  item_group?: string | null;
};

export type CreateEmergencyPoInput = {
  emergency_id: string;
  vendor_id: string;
  category: string;
  lines: EmergencyPoLine[];
  taxes?: number;
  delivery_timeline?: string | null;
  payment_terms?: string | null;
};

/**
 * Purchase order for an EVP-authorised emergency register entry (SOP §IX: the EVP approves before
 * any commitment to the vendor). The EVP's authorisation is the approval, so the PO is created
 * approved, backed by an emergency PR with no budget head: emergency spend is kept out of
 * department budgets and monthly caps (DECISIONS Q16). One PO per entry.
 */
export const createEmergencyPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateEmergencyPoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(db, context.userId)).map((r) => r.role);
    if (!held.includes("admin") && !held.includes("procurement_officer")) {
      return {
        ok: false as const,
        error: "Only Procurement Officers can create Purchase Orders.",
        code: "unauthorized",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: ep } = await admin
      .from("emergency_procurements")
      .select(
        "id, emergency_number, department_id, requested_by, description, reason_standard_process_failed, estimated_cost, evp_approval_status, evp_approved_by, pr_id",
      )
      .eq("id", data.emergency_id)
      .maybeSingle();
    if (!ep) return { ok: false as const, error: "Emergency procurement record not found" };
    const epNo = ep.emergency_number ?? "This emergency purchase";
    if (ep.evp_approval_status !== "approved")
      return {
        ok: false as const,
        error: `${epNo} is "${ep.evp_approval_status}". A purchase order needs the EVP's authorisation first.`,
        code: "emergency_not_approved",
      };
    if (ep.pr_id)
      return {
        ok: false as const,
        error: `${epNo} already has a purchase order.`,
        code: "emergency_already_ordered",
      };
    if (!ep.department_id)
      return {
        ok: false as const,
        error: `${epNo} has no department, so it can't be ordered.`,
        code: "emergency_no_department",
      };

    const { normalizeCategory } = await import("@/lib/procurement/authorityMatrix");
    const { BUDGET_CATEGORIES } = await import("@/lib/procurement/budgetLedger");
    const category = normalizeCategory(data.category);
    if (!BUDGET_CATEGORIES.some((c) => c.value === category))
      return {
        ok: false as const,
        error: "Choose the purchase category.",
        code: "category_required",
      };

    const lines = (data.lines ?? [])
      .filter((l) => l.description?.trim())
      .map((l) => ({
        description: l.description.trim(),
        unit: l.unit?.trim() || null,
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        item_group: l.item_group || null,
      }));
    if (!lines.length || lines.some((l) => !(l.qty > 0) || !(l.unit_price > 0)))
      return {
        ok: false as const,
        error: "Every line needs a description, a quantity and a unit price.",
        code: "lines_required",
      };
    const price = Math.round(lines.reduce((s, l) => s + l.qty * l.unit_price, 0) * 100) / 100;
    const taxes = Math.max(0, Number(data.taxes) || 0);
    const { emergencyPoTotalError } = await import("@/lib/procurement/emergencyCap");
    const totalError = emergencyPoTotalError(Number(ep.estimated_cost) || 0, price + taxes);
    if (totalError)
      return { ok: false as const, error: totalError, code: "emergency_total_exceeded" };

    const { assertVendorEmpanelled } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");
    try {
      await assertVendorEmpanelled(admin, data.vendor_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    const reason = `Emergency purchase — authorised by the EVP on ${epNo}.`;
    const { data: pr, error: prErr } = await admin
      .from("purchase_requisitions")
      .insert({
        department_id: ep.department_id,
        requested_by: ep.requested_by,
        category,
        scope: "operational",
        status: "approved",
        is_emergency: true,
        budget_head_id: null,
        budget_status: "none",
        estimated_value: price + taxes,
        justification: [ep.description, ep.reason_standard_process_failed]
          .filter(Boolean)
          .join(" — "),
        current_approver_role: "evp",
        routing_reason: reason,
        source: "emergency",
      })
      .select("id, pr_number")
      .single();
    if (prErr || !pr)
      return {
        ok: false as const,
        error: prErr?.message ?? "Couldn't record the order.",
        code: "insert_pr_failed",
      };

    // Claim the entry: a second click or a parallel request finds pr_id already set.
    const { data: claimed } = await admin
      .from("emergency_procurements")
      .update({ pr_id: pr.id, updated_at: new Date().toISOString() })
      .eq("id", ep.id)
      .is("pr_id", null)
      .select("id");
    if (!claimed?.length) {
      await admin.from("purchase_requisitions").delete().eq("id", pr.id);
      return {
        ok: false as const,
        error: `${epNo} already has a purchase order.`,
        code: "emergency_already_ordered",
      };
    }

    await admin.from("pr_line_items").insert(
      lines.map((l) => ({
        pr_id: pr.id,
        description: l.description,
        unit: l.unit,
        qty_required: l.qty,
        qty_in_stock: 0,
        net_qty_to_procure: l.qty,
        est_unit_price: l.unit_price,
        est_total: Math.round(l.qty * l.unit_price * 100) / 100,
        item_group: l.item_group,
      })),
    );
    await admin.from("pr_approvals").insert({
      pr_id: pr.id,
      stage: "evp",
      approver_role: "evp",
      approver_id: ep.evp_approved_by,
      decision: "approved",
      remarks: reason,
    });

    const now = new Date().toISOString();
    const { data: po, error: poErr } = await admin
      .from("purchase_orders")
      .insert({
        pr_id: pr.id,
        vendor_id: data.vendor_id,
        department_id: ep.department_id,
        type: "regular",
        scope_of_supply: lines
          .map((l) => `${l.description} × ${l.qty}${l.unit ? ` ${l.unit}` : ""}`)
          .join("; "),
        price,
        taxes,
        delivery_timeline: data.delivery_timeline ?? null,
        payment_terms: data.payment_terms ?? null,
        status: "approved",
        original_approver_role: "evp",
        current_approver_role: "evp",
        approved_by: ep.evp_approved_by,
        approved_at: now,
        routing_reason: reason,
        budget_status: "none",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (poErr || !po) {
      // Undo the claim so the officer can try again.
      await admin.from("emergency_procurements").update({ pr_id: null }).eq("id", ep.id);
      await admin.from("purchase_requisitions").delete().eq("id", pr.id);
      return {
        ok: false as const,
        error: poErr?.message ?? "Couldn't create the purchase order.",
        code: "insert_po_failed",
      };
    }

    return { ok: true as const, po, prNumber: pr.pr_number };
  });
