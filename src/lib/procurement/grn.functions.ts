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

async function getMutationDb(context: any) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin as any;
    } catch (err) {
      console.warn("[GRN] Failed to load supabaseAdmin, falling back to session client:", err);
    }
  }
  return context.supabase as any;
}

async function verifyCallerRole(context: any, allowed: string[], action: string) {
  const { getCallerRoles, requireAnyRole } = await import("@/server/procurement/roles");
  const callerRoles = await getCallerRoles(context.supabase, context.userId);
  requireAnyRole(callerRoles, allowed, action);
}

export const recordDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RecordDeliveryInput) => input)
  .handler(async ({ data, context }) => {
    // 1. Role verification: Only stores, procurement, and admin can log gate inwards
    try {
      await verifyCallerRole(
        context,
        ["stores", "procurement_officer", "procurement_executive", "admin"],
        "record delivery challans",
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message, code: "forbidden" };
    }

    const sessionDb = context.supabase as any;
    const mutationDb = await getMutationDb(context);

    const { data: po, error: poErr } = await sessionDb
      .from("purchase_orders")
      .select("id, po_number, vendor_id, status")
      .eq("id", data.po_id)
      .single();

    if (poErr || !po) {
      return { ok: false as const, error: "Purchase order not found", code: "po_not_found" };
    }

    const validPoStatuses = ["issued", "amended", "partially_closed"];
    if (!validPoStatuses.includes(po.status)) {
      return {
        ok: false as const,
        error: `Delivery challans can only be recorded for issued purchase orders. This PO is currently "${po.status}".`,
        code: "po_not_issued",
      };
    }

    if (data.vendor_id && data.vendor_id !== po.vendor_id) {
      return {
        ok: false as const,
        error: "Vendor does not match the vendor on the Purchase Order.",
        code: "vendor_mismatch",
      };
    }

    const { data: challan, error: cErr } = await mutationDb
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

export const deleteDeliveryChallan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { challan_id: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      await verifyCallerRole(
        context,
        ["stores", "procurement_officer", "procurement_executive", "admin"],
        "cancel or delete delivery challan",
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message, code: "forbidden" };
    }

    const mutationDb = await getMutationDb(context);

    // Verify no GRN has been linked to this challan
    const { data: grn } = await mutationDb
      .from("grns")
      .select("id, grn_number")
      .eq("delivery_challan_id", data.challan_id)
      .maybeSingle();

    if (grn) {
      return {
        ok: false as const,
        error: `Cannot dismiss challan: Goods Receipt Note ${grn.grn_number} is already generated for this challan.`,
        code: "grn_already_exists",
      };
    }

    const { error: delErr } = await mutationDb
      .from("delivery_challans")
      .delete()
      .eq("id", data.challan_id);

    if (delErr) {
      return { ok: false as const, error: delErr.message, code: "delete_failed" };
    }

    return { ok: true as const };
  });

export const createGrn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateGrnInput) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    // Role verification: Stores, Procurement, Admin can create GRN
    try {
      await verifyCallerRole(
        context,
        ["stores", "procurement_officer", "procurement_executive", "admin"],
        "create goods receipt notes",
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message, code: "forbidden" };
    }

    const sessionDb = context.supabase as any;
    const mutationDb = await getMutationDb(context);
    const { ruleError } = await import("@/server/procurement/errors");

    // 1. Guard: Delivery Challan is required
    if (!data.delivery_challan_id) {
      return {
        ok: false as const,
        error: "Record the delivery challan at the gate before creating a GRN.",
        code: "challan_required",
      };
    }

    // Check if a GRN already exists for this delivery challan
    const { data: existingChallanGrn } = await mutationDb
      .from("grns")
      .select("id, grn_number")
      .eq("delivery_challan_id", data.delivery_challan_id)
      .maybeSingle();

    if (existingChallanGrn) {
      return {
        ok: false as const,
        error: `A Goods Receipt Note (${existingChallanGrn.grn_number}) has already been generated for this Delivery Challan. Each challan can only be processed once.`,
        code: "challan_already_processed",
      };
    }

    const { data: challan, error: cErr } = await mutationDb
      .from("delivery_challans")
      .select("id, po_id, challan_number, packages_count")
      .eq("id", data.delivery_challan_id)
      .maybeSingle();

    if (cErr || !challan) {
      return {
        ok: false as const,
        error: "Delivery Challan does not exist. Record delivery first.",
        code: "challan_not_found",
      };
    }

    if (challan.po_id !== data.po_id) {
      return {
        ok: false as const,
        error: "This Delivery Challan was issued for a different Purchase Order.",
        code: "challan_po_mismatch",
      };
    }

    // 2. Fetch PO & check over-delivery
    const { data: po, error: poErr } = await mutationDb
      .from("purchase_orders")
      .select("id, po_number, pr_id, price, taxes, total_value, cs_id, vendor_id, status")
      .eq("id", data.po_id)
      .single();

    if (poErr || !po) {
      return { ok: false as const, error: "Purchase Order not found", code: "po_not_found" };
    }

    if (!["issued", "amended", "partially_closed"].includes(po.status)) {
      return {
        ok: false as const,
        error: `Goods receipt notes can only be issued for approved and issued purchase orders. This PO is currently "${po.status}".`,
        code: "po_not_issued",
      };
    }

    // Directly query PR line items to get the authoritative ordered quantity
    const { data: prLines } = await mutationDb
      .from("pr_line_items")
      .select("description, net_qty_to_procure, qty_required, est_unit_price, est_total")
      .eq("pr_id", po.pr_id);

    // Value received goods at the PO's own rates (never a client-entered price), so the
    // GRN accepted value is comparable with the PO and invoice in the three-way match.
    const { quotedLinesByPo } = await import("@/server/procurement/quotes");
    const quotedLines = (await quotedLinesByPo(mutationDb, [po])).get(po.id) ?? [];
    const { poUnitRate } = await import("@/lib/procurement/poRates");
    const rateCtx = {
      ...po,
      quoted_lines: quotedLines,
      purchase_requisitions: { pr_line_items: prLines ?? [] },
    };
    // No line data on the PO at all: fall back to the entered price (capped by the PO total below).
    const rateOf = (description: string, entered?: number) =>
      Math.round((poUnitRate(rateCtx, description) || Number(entered) || 0) * 100) / 100;

    let poOrderedQty = (prLines ?? []).reduce(
      (sum: number, item: any) => sum + (Number(item.net_qty_to_procure || item.qty_required) || 0),
      0,
    );

    // Fallback if PR line items was not found: derive from PO value / unit price
    if (poOrderedQty === 0 && data.lines && data.lines.length > 0) {
      const lineUnit = rateOf(data.lines[0].description, data.lines[0].unit_price);
      if (lineUnit > 0) {
        poOrderedQty = Math.round(Number(po.price || po.total_value || 0) / lineUnit);
      }
    }

    // Check delivered quantities
    const totalDelivered = (data.lines ?? []).reduce(
      (s, l) => s + (Number(l.qty_delivered) || 0),
      0,
    );
    const totalAccepted = (data.lines ?? []).reduce((s, l) => s + (Number(l.qty_accepted) || 0), 0);
    const acceptedVal = (data.lines ?? []).reduce(
      (s, l) => s + Number(l.qty_accepted) * rateOf(l.description, l.unit_price),
      0,
    );

    // Fetch prior GRNs for this PO to check cumulative delivered qty
    const { data: priorGrns } = await mutationDb
      .from("grns")
      .select("id, status, accepted_value, grn_lines (qty_delivered, qty_accepted)")
      .eq("po_id", data.po_id);

    const priorDelivered = (priorGrns ?? [])
      .filter((g: any) => g.status !== "rejected")
      .reduce((sum: number, g: any) => {
        return (
          sum +
          (g.grn_lines ?? []).reduce(
            (lSum: number, l: any) => lSum + (Number(l.qty_delivered) || 0),
            0,
          )
        );
      }, 0);

    const cumulativeDelivered = priorDelivered + totalDelivered;

    if (poOrderedQty > 0 && cumulativeDelivered > poOrderedQty) {
      return {
        ok: false as const,
        error: `This GRN would bring the total received quantity to ${cumulativeDelivered}, more than the ${poOrderedQty} ordered on the PO. Reduce the accepted quantity.`,
        code: "over_delivery_not_permitted",
      };
    }

    const priorAccepted = (priorGrns ?? [])
      .filter((g: any) => g.status !== "rejected")
      .reduce((s: number, g: any) => s + Number(g.accepted_value || 0), 0);
    if (priorAccepted + acceptedVal > Number(po.total_value || 0) + 1) {
      return {
        ok: false as const,
        error: `Goods accepted on this PO would be worth Rs. ${(priorAccepted + acceptedVal).toLocaleString("en-IN")}, more than the PO total of Rs. ${Number(po.total_value || 0).toLocaleString("en-IN")}. Check the accepted quantities.`,
        code: "grn_value_exceeds_po",
      };
    }

    // Validate each line:
    // 1. Delivered qty must be > 0
    // 2. Accepted qty cannot exceed Delivered qty (0 <= qty_accepted <= qty_delivered)
    // 3. Accepted qty cannot be negative
    for (const line of data.lines ?? []) {
      const delivered = Number(line.qty_delivered) || 0;
      const accepted = Number(line.qty_accepted) || 0;
      if (delivered <= 0) {
        return {
          ok: false as const,
          error: `Delivered quantity must be greater than zero for item "${line.description}".`,
          code: "invalid_delivered_quantity",
        };
      }
      if (accepted < 0) {
        return {
          ok: false as const,
          error: "Accepted quantity cannot be negative.",
          code: "negative_accepted_quantity",
        };
      }
      if (accepted > delivered) {
        return {
          ok: false as const,
          error: `Accepted quantity (${accepted}) cannot exceed delivered quantity (${delivered}) for item "${line.description}".`,
          code: "accepted_exceeds_delivered",
        };
      }
    }

    // 3. Create GRN
    const initialStatus = data.requires_technical_inspection === false ? "accepted" : "pending";

    const { data: grn, error: grnErr } = await mutationDb
      .from("grns")
      .insert({
        po_id: data.po_id,
        delivery_challan_id: data.delivery_challan_id,
        requires_technical_inspection: data.requires_technical_inspection !== false,
        status: initialStatus,
        accepted_value: acceptedVal,
        prepared_by: context.userId,
        security_verified_by: null,
        security_verified_at: null,
      })
      .select("*")
      .single();

    if (grnErr) return { ok: false as const, error: grnErr.message, code: "insert_grn_failed" };

    // 4. Insert GRN Lines (qty_rejected is GENERATED ALWAYS by PostgreSQL)
    if (data.lines && data.lines.length > 0) {
      const lineRows = data.lines.map((l) => {
        const del = Number(l.qty_delivered) || 0;
        const acc = Math.min(del, Math.max(0, Number(l.qty_accepted) || 0));
        const unitP = rateOf(l.description, l.unit_price);
        return {
          grn_id: grn.id,
          description: l.description,
          unit: l.unit ?? null,
          qty_delivered: del,
          qty_accepted: acc,
          unit_price: unitP,
          inspection_remarks: l.inspection_remarks ?? null,
        };
      });

      const { error: lErr } = await mutationDb.from("grn_lines").insert(lineRows);
      if (lErr) {
        await mutationDb.from("grns").delete().eq("id", grn.id);
        return { ok: false as const, error: lErr.message, code: "insert_grn_lines_failed" };
      }
    }

    return { ok: true as const, grn, acceptedValue: acceptedVal };
  });

export const securityVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SecurityVerifyInput) => input)
  .handler(async ({ data, context }) => {
    // Role verification: Stores, Admin can verify security gate inward
    try {
      await verifyCallerRole(context, ["stores", "admin"], "sign off security verification on GRN");
    } catch (e: any) {
      return { ok: false as const, error: e.message, code: "forbidden" };
    }

    const mutationDb = await getMutationDb(context);
    const { error } = await mutationDb
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
    // Role verification: HOD, Stores, Admin can sign off technical inspection
    try {
      await verifyCallerRole(
        context,
        ["hod", "stores", "admin"],
        "sign off technical inspection on GRN",
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message, code: "forbidden" };
    }

    const mutationDb = await getMutationDb(context);
    const nextStatus = data.is_accepted ? "accepted" : "rejected";

    if (!data.is_accepted && (!data.remarks || !data.remarks.trim())) {
      return {
        ok: false as const,
        error: "A rejection reason is required when rejecting goods during technical inspection.",
        code: "remarks_required",
      };
    }

    // Separation of duties & state checks
    const { supabaseAdmin: sodDb } = await import("@/integrations/supabase/client.server");
    const { data: grn } = await sodDb
      .from("grns")
      .select(`
        id, status, prepared_by, technical_verified_at, po_id,
        purchase_orders (
          id, status, department_id,
          purchase_requisitions (id, department_id)
        )
      `)
      .eq("id", data.grn_id)
      .maybeSingle();

    if (!grn) return { ok: false as const, error: "Goods receipt not found." };

    if (grn.status === "accepted" || grn.status === "rejected" || grn.technical_verified_at) {
      return {
        ok: false as const,
        error: `This goods receipt has already been ${grn.status === "rejected" ? "rejected" : "accepted"} and its technical inspection cannot be changed.`,
        code: "grn_already_decided",
      };
    }

    if (grn.prepared_by && grn.prepared_by === context.userId) {
      return {
        ok: false as const,
        error: "You prepared this goods receipt, so someone else must do the technical inspection.",
        code: "separation_of_duties",
      };
    }

    const poStatus = grn.purchase_orders?.status;
    if (poStatus === "pending_approval" || poStatus === "rejected" || poStatus === "draft") {
      return {
        ok: false as const,
        error: `Cannot inspect GRN: the Purchase Order is not yet approved (currently "${poStatus}").`,
        code: "po_not_approved",
      };
    }

    const { getCallerRoles } = await import("@/server/procurement/roles");
    const callerRoles = await getCallerRoles(sodDb, context.userId);
    const isHod = callerRoles.some((r) => r.role === "hod");
    const isAdminOrStores = callerRoles.some((r) => r.role === "admin" || r.role === "stores");
    if (isHod && !isAdminOrStores) {
      const poDeptId =
        grn.purchase_orders?.department_id ||
        grn.purchase_orders?.purchase_requisitions?.department_id;
      const hodDepts = callerRoles
        .filter((r) => r.role === "hod")
        .map((r) => r.department_id)
        .filter(Boolean);
      if (poDeptId && !hodDepts.includes(poDeptId)) {
        return {
          ok: false as const,
          error: "You can only perform technical inspection for your own department.",
          code: "cross_department_forbidden",
        };
      }
    }

    const { error } = await mutationDb
      .from("grns")
      .update({
        technical_verified_by: context.userId,
        technical_verified_at: new Date().toISOString(),
        status: nextStatus,
        rejection_reason: data.is_accepted ? null : data.remarks,
      })
      .eq("id", data.grn_id);

    if (error) return { ok: false as const, error: error.message };

    // When rejected, notify vendor via SMTP
    if (!data.is_accepted) {
      mutationDb
        .from("grns")
        .select("grn_number, po_id, purchase_orders (po_number, vendor_id)")
        .eq("id", data.grn_id)
        .maybeSingle()
        .then(({ data: grnWithPo }: any) => {
          if (grnWithPo?.purchase_orders?.vendor_id) {
            import("@/server/email/notificationDispatcher")
              .then(({ notifyVendorMaterialDiscrepancy }) =>
                notifyVendorMaterialDiscrepancy({
                  vendorId: grnWithPo.purchase_orders.vendor_id,
                  poNumber: grnWithPo.purchase_orders.po_number,
                  grnNumber: grnWithPo.grn_number,
                  reason: data.remarks || "Goods rejected during technical inspection.",
                }),
              )
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    // When GRN is accepted, ensure underlying PO status is issued if it was approved
    if (data.is_accepted && grn.purchase_orders?.status === "approved") {
      try {
        await mutationDb
          .from("purchase_orders")
          .update({
            status: "issued",
            issued_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", grn.po_id);
      } catch (poErr) {
        console.warn("[GRN] Failed to sync PO status to issued on technical acceptance:", poErr);
      }
    }

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
