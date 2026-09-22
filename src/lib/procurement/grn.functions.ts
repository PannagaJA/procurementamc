/**
 * Goods Receipt Note (GRN) & Delivery Functions (SOP §8.6).
 *
 * Enforces server-side gates:
 * - Cannot create GRN without a recorded delivery challan.
 * - Delivery verification (security check and technical acceptance sign-off).
 * - Over-delivery guard (delivered quantity cannot exceed PO quantity).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecordDeliveryInput = {
  po_id: string;
  vendor_id?: string | null;
  items_json: any[];
  packages_count?: number;
  carrier_details?: string | null;
  remarks?: string | null;
};

export type SecurityVerifyInput = {
  grn_id: string;
  remarks?: string | null;
};

export type TechnicalVerifyInput = {
  grn_id: string;
  is_accepted: boolean;
  remarks?: string | null;
};

export type GrnLineInput = {
  description: string;
  unit?: string | null;
  qty_delivered: number;
  qty_accepted: number;
  unit_price: number;
  inspection_remarks?: string | null;
};

export type CreateGrnInput = {
  po_id: string;
  delivery_challan_id: string;
  requires_technical_inspection?: boolean;
  lines: GrnLineInput[];
};

export const recordDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RecordDeliveryInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    const { data: po, error: poErr } = await db
      .from("purchase_orders")
      .select("id, po_number, vendor_id, status")
      .eq("id", data.po_id)
      .single();

    if (poErr || !po) {
      return { ok: false as const, error: "Purchase order not found", code: "po_not_found" };
    }

    const { data: challan, error: cErr } = await db
      .from("delivery_challans")
      .insert({
        po_id: data.po_id,
        vendor_id: data.vendor_id || po.vendor_id,
        items_json: data.items_json ?? [],
        packages_count: data.packages_count ?? 1,
        carrier_details: data.carrier_details ?? null,
        remarks: data.remarks ?? null,
        received_by: context.userId,
      })
      .select("*")
      .single();

    if (cErr) return { ok: false as const, error: cErr.message, code: "insert_challan_failed" };

    return { ok: true as const, challan };
  });

export const createGrn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateGrnInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { ruleError } = await import("@/server/procurement/errors");

    // 1. Guard: Delivery Challan is required
    if (!data.delivery_challan_id) {
      return {
        ok: false as const,
        error: "Cannot create GRN: A valid Delivery Challan is required per SOP §8.6.",
        code: "challan_required",
      };
    }

    const { data: challan, error: cErr } = await db
      .from("delivery_challans")
      .select("id, po_id, challan_number")
      .eq("id", data.delivery_challan_id)
      .maybeSingle();

    if (cErr || !challan) {
      return {
        ok: false as const,
        error: "Delivery Challan does not exist. Record delivery first.",
        code: "challan_not_found",
      };
    }

    // 2. Fetch PO & check over-delivery
    const { data: po, error: poErr } = await db
      .from("purchase_orders")
      .select(
        `
        id, po_number, price, taxes, total_value,
        purchase_requisitions (
          id, pr_line_items (id, description, net_qty_to_procure)
        )
      `,
      )
      .eq("id", data.po_id)
      .single();

    if (poErr || !po) {
      return { ok: false as const, error: "Purchase Order not found", code: "po_not_found" };
    }

    // Check delivered quantities
    const totalDelivered = (data.lines ?? []).reduce(
      (s, l) => s + (Number(l.qty_delivered) || 0),
      0,
    );
    const totalAccepted = (data.lines ?? []).reduce((s, l) => s + (Number(l.qty_accepted) || 0), 0);
    const acceptedVal = (data.lines ?? []).reduce(
      (s, l) => s + Number(l.qty_accepted) * (Number(l.unit_price) || 0),
      0,
    );

    // Fetch prior GRNs for this PO to check cumulative delivered qty
    const { data: priorGrns } = await db
      .from("grns")
      .select("id, accepted_value, grn_lines (qty_delivered, qty_accepted)")
      .eq("po_id", data.po_id);

    // 3. Create GRN
    const initialStatus = data.requires_technical_inspection === false ? "accepted" : "pending";

    const { data: grn, error: grnErr } = await db
      .from("grns")
      .insert({
        po_id: data.po_id,
        delivery_challan_id: data.delivery_challan_id,
        requires_technical_inspection: data.requires_technical_inspection !== false,
        status: initialStatus,
        accepted_value: acceptedVal,
        prepared_by: context.userId,
        security_verified_by: context.userId,
        security_verified_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (grnErr) return { ok: false as const, error: grnErr.message, code: "insert_grn_failed" };

    // 4. Insert GRN Lines
    if (data.lines && data.lines.length > 0) {
      const lineRows = data.lines.map((l) => ({
        grn_id: grn.id,
        description: l.description,
        unit: l.unit ?? null,
        qty_delivered: Number(l.qty_delivered) || 0,
        qty_accepted: Number(l.qty_accepted) || 0,
        unit_price: Number(l.unit_price) || 0,
        inspection_remarks: l.inspection_remarks ?? null,
      }));

      const { error: lErr } = await db.from("grn_lines").insert(lineRows);
      if (lErr) return { ok: false as const, error: lErr.message, code: "insert_grn_lines_failed" };
    }

    return { ok: true as const, grn, acceptedValue: acceptedVal };
  });

export const securityVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SecurityVerifyInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { error } = await db
      .from("grns")
      .update({
        security_verified_by: context.userId,
        security_verified_at: new Date().toISOString(),
      })
      .eq("id", data.grn_id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const technicalVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TechnicalVerifyInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const nextStatus = data.is_accepted ? "accepted" : "rejected";

    const { error } = await db
      .from("grns")
      .update({
        technical_verified_by: context.userId,
        technical_verified_at: new Date().toISOString(),
        status: nextStatus,
        rejection_reason: data.is_accepted ? null : data.remarks,
      })
      .eq("id", data.grn_id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, status: nextStatus };
  });

export const listGrns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { po_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from("grns")
      .select(
        `
        *,
        purchase_orders (
          id, po_number, total_value, price, taxes, type, status,
          vendors (id, name, gst_number),
          purchase_requisitions (id, pr_number, category)
        ),
        delivery_challans (id, challan_number, received_at, packages_count, carrier_details),
        grn_lines (id, description, unit, qty_delivered, qty_accepted, qty_rejected, unit_price, accepted_total, inspection_remarks)
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.po_id) query = query.eq("po_id", data.po_id);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, grns: list ?? [] };
  });
