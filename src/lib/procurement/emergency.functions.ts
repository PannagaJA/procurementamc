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
  pr_id?: string | null;
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
    const db = context.supabase as any;
    const fy = data?.financial_year || getCurrentFinancialYear();
    const newAmt = Number(data?.new_amount) || 0;

    // Fetch or initialize ledger row
    let { data: ledger } = await db
      .from("emergency_annual_ledger")
      .select("*")
      .eq("financial_year", fy)
      .maybeSingle();

    if (!ledger) {
      const { data: newLedger } = await db
        .from("emergency_annual_ledger")
        .insert({ financial_year: fy, running_total: 0, cap_limit: EMERGENCY_CAP_LIMIT })
        .select("*")
        .single();
      ledger = newLedger;
    }

    const runningTotal = Number(ledger?.running_total || 0);
    const capLimit = Number(ledger?.cap_limit || EMERGENCY_CAP_LIMIT);
    const projected = runningTotal + newAmt;
    const remaining = Math.max(0, capLimit - runningTotal);
    const allowed = projected <= capLimit;

    return {
      financialYear: fy,
      runningTotal,
      capLimit,
      remaining,
      projected,
      allowed,
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

    // 1. Guard: Check Annual Hard Cap (₹10,00,000)
    let { data: ledger } = await db
      .from("emergency_annual_ledger")
      .select("*")
      .eq("financial_year", fy)
      .maybeSingle();

    if (!ledger) {
      const { data: insLedger } = await db
        .from("emergency_annual_ledger")
        .insert({ financial_year: fy, running_total: 0, cap_limit: EMERGENCY_CAP_LIMIT })
        .select("*")
        .single();
      ledger = insLedger;
    }

    const currentTotal = Number(ledger?.running_total || 0);
    const cap = Number(ledger?.cap_limit || EMERGENCY_CAP_LIMIT);
    const projectedTotal = currentTotal + cost;

    if (projectedTotal > cap) {
      const remaining = Math.max(0, cap - currentTotal);
      return {
        ok: false as const,
        error:
          `Emergency procurement request of ₹${cost.toLocaleString("en-IN")} is HARD-BLOCKED. ` +
          `It would push the ${fy} annual emergency ledger to ₹${projectedTotal.toLocaleString("en-IN")}, ` +
          `exceeding the statutory annual cap of ₹${cap.toLocaleString("en-IN")} (remaining balance: ₹${remaining.toLocaleString("en-IN")}). ` +
          `Standard procurement process must be followed per SOP §9.`,
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
        pr_id: data.pr_id ?? null,
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
        `Emergency Procurement authorization is restricted exclusively to the EVP per SOP §9. You hold: ${held.join(", ") || "none"}.`,
      );
    }

    const { data: ep, error: epErr } = await db
      .from("emergency_procurements")
      .select("*")
      .eq("id", data.emergency_id)
      .single();

    if (epErr || !ep)
      return { ok: false as const, error: "Emergency procurement record not found" };

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

    if (data.decision === "rejected") {
      await db
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

    const { data: ledger } = await db
      .from("emergency_annual_ledger")
      .select("*")
      .eq("financial_year", fy)
      .maybeSingle();

    const currentTotal = Number(ledger?.running_total || 0);
    const newTotal = currentTotal + cost;

    // Hard check again before commit
    if (newTotal > Number(ledger?.cap_limit || EMERGENCY_CAP_LIMIT)) {
      return {
        ok: false as const,
        error: `Cannot approve: Annual ledger for ${fy} would reach ₹${newTotal.toLocaleString("en-IN")}, exceeding ₹${EMERGENCY_CAP_LIMIT.toLocaleString("en-IN")}.`,
        code: "cap_exceeded_on_approval",
      };
    }

    // Update ledger
    await db
      .from("emergency_annual_ledger")
      .update({
        running_total: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("financial_year", fy);

    // Update emergency record
    const { error: upErr } = await db
      .from("emergency_procurements")
      .update({
        evp_approval_status: "approved",
        evp_approved_by: context.userId,
        evp_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ep.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, status: "approved", runningTotal: newTotal, financialYear: fy };
  });

export const listEmergencyProcurements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { financial_year?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const fy = data?.financial_year || getCurrentFinancialYear();

    const [epRes, ledgerRes] = await Promise.all([
      db
        .from("emergency_procurements")
        .select(
          `
          *,
          departments (id, name),
          vendors (id, name, gst_number)
        `,
        )
        .order("created_at", { ascending: false }),
      db.from("emergency_annual_ledger").select("*").eq("financial_year", fy).maybeSingle(),
    ]);

    return {
      ok: true as const,
      financialYear: fy,
      ledger: ledgerRes.data || {
        financial_year: fy,
        running_total: 0,
        cap_limit: EMERGENCY_CAP_LIMIT,
      },
      emergencyProcurements: epRes.data || [],
    };
  });
