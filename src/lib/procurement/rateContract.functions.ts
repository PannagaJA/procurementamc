/**
 * Rate contracts (SOP Section VI, Routine Consumables): "Rate Contract with Vendors approved by
 * EVP/Trustees (Minimum 3 quotations at the time of rate finalisation), Validity: 6 months".
 *
 * A contract is created from a rate finalisation RFQ with at least three complete quotes, using
 * the chosen vendor's quoted rates, and waits for the EVP. Only an approved contract covers
 * purchases (`isActiveRateContract`). Rules live in src/lib/procurement/rateContracts.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  contractRates,
  rankRateQuotes,
  rateContractValidity,
  type RateItem,
} from "@/lib/procurement/rateContracts";

const CREATOR_ROLES = ["admin", "procurement_officer", "procurement_executive"];

export type CreateRateContractInput = {
  rfq_id: string;
  vendor_id: string;
  title: string;
  valid_from: string;
  valid_to: string;
  contract_number?: string | null;
  /** Required when the vendor isn't the lowest quote. */
  justification?: string | null;
};

export const createRateContractFromRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateRateContractInput) => input)
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    const fail = (error: string, code: string) => ({ ok: false as const, error, code });
    if (!CREATOR_ROLES.some((r) => held.includes(r)))
      return fail("Only procurement can create rate contracts.", "unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rfq }, { data: lines }, { data: existing }] = await Promise.all([
      supabaseAdmin
        .from("rfqs")
        .select("id, rfq_number, purpose, status, category, rate_items_json")
        .eq("id", data.rfq_id)
        .maybeSingle(),
      supabaseAdmin
        .from("quotation_lines")
        .select("vendor_id, rate_item_no, unit_price")
        .eq("rfq_id", data.rfq_id),
      supabaseAdmin
        .from("rate_contracts")
        .select("contract_number, status")
        .eq("rfq_id", data.rfq_id)
        .neq("status", "rejected"),
    ]);
    if (!rfq || rfq.purpose !== "rate_contract")
      return fail("That isn't a rate finalisation RFQ.", "not_rate_rfq");
    if ((existing ?? []).length)
      return fail(
        `${rfq.rfq_number} already has rate contract ${existing![0].contract_number}.`,
        "rc_exists",
      );
    if (rfq.status !== "sent")
      return fail(`${rfq.rfq_number} is ${rfq.status}; quotes can't be used.`, "rfq_not_open");

    const items = (rfq.rate_items_json ?? []) as unknown as RateItem[];
    const ranking = rankRateQuotes(items, lines ?? []);
    if (!ranking.ok) return fail(ranking.error, "min_quotations_not_met");
    const chosen = ranking.ranked.find((q) => q.vendor_id === data.vendor_id);
    if (!chosen) return fail("This vendor didn't quote a rate for every item.", "vendor_not_quoted");
    const isLowest = chosen === ranking.ranked[0];
    if (!isLowest && !data.justification?.trim())
      return fail(
        "This vendor isn't the lowest quote. Give a justification for choosing them.",
        "justification_required",
      );

    const validity = rateContractValidity(data.valid_from, data.valid_to);
    if (validity) return fail(validity, "invalid_validity");
    if (!data.title?.trim()) return fail("Give the contract a title.", "title_required");

    const { assertVendorEmpanelled } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");
    try {
      await assertVendorEmpanelled(supabaseAdmin, data.vendor_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError) return fail(e.message, e.code);
      throw e;
    }

    const { data: rc, error } = await supabaseAdmin
      .from("rate_contracts")
      .insert({
        contract_number:
          data.contract_number?.trim() || (rfq.rfq_number ?? "").replace(/^RFQ-/, "RC-") || null,
        vendor_id: data.vendor_id,
        category: rfq.category ?? "routine_consumable",
        title: data.title.trim(),
        approved_rates_json: contractRates(items, chosen.rates),
        valid_from: data.valid_from,
        valid_to: data.valid_to,
        status: "pending_approval",
        rfq_id: rfq.id,
        selection_note: isLowest ? null : data.justification!.trim(),
        created_by: context.userId,
      })
      .select("id, contract_number")
      .single();
    if (error) return fail(error.message, "insert_failed");

    await supabaseAdmin.from("rfqs").update({ status: "closed" }).eq("id", rfq.id);
    return { ok: true as const, contract: rc };
  });

export const decideRateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { id: string; decision: "approved" | "rejected"; remarks?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    if (!held.includes("admin") && !held.includes("evp"))
      return { ok: false as const, error: "Only the EVP approves rate contracts." };
    if (data.decision === "rejected" && !data.remarks?.trim())
      return { ok: false as const, error: "Give a reason for rejecting this rate contract." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rc } = await supabaseAdmin
      .from("rate_contracts")
      .select("id, contract_number, status, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!rc) return { ok: false as const, error: "Rate contract not found." };
    if (rc.status !== "pending_approval")
      return { ok: false as const, error: `${rc.contract_number} is already ${rc.status}.` };
    if (rc.created_by && rc.created_by === context.userId)
      return {
        ok: false as const,
        error: "You created this rate contract, so someone else must decide it.",
      };

    const { error } = await supabaseAdmin
      .from("rate_contracts")
      .update({
        status: data.decision === "approved" ? "active" : "rejected",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        decision_remarks: data.remarks?.trim() || null,
      })
      .eq("id", rc.id)
      .eq("status", "pending_approval");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, status: data.decision === "approved" ? "active" : "rejected" };
  });
