/** Vendor empanelment server functions (SOP §8.2). */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorApplicationInput = {
  name: string;
  registered_address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_details: Record<string, string> | null;
  documents?: { doc_type: string; file_url: string }[];
};

async function rolesOf(context: any) {
  const db = context.supabase as any;
  const { getCallerRoles } = await import("@/server/procurement/roles");
  const roles = await getCallerRoles(db, context.userId);
  return { db, held: roles.map((r) => r.role) };
}

function deny(held: string[], allowed: string[], action: string) {
  if (held.includes("admin")) return null;
  if (allowed.some((a) => held.includes(a))) return null;
  return {
    ok: false as const,
    error: `You are not permitted to ${action}. Required role: ${allowed.join(" or ")}. You hold: ${held.join(", ") || "none"}.`,
  };
}

export const applyEmpanelment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: VendorApplicationInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    if (!data.name?.trim()) return { ok: false as const, error: "Vendor name is required." };

    const { data: vendor, error } = await db
      .from("vendors")
      .insert({
        name: data.name.trim(),
        registered_address: data.registered_address,
        gst_number: data.gst_number,
        pan_number: data.pan_number,
        bank_details_json: data.bank_details ?? {},
        status: "applied",
        created_by: context.userId,
      })
      .select("id, name, status")
      .single();
    if (error) return { ok: false as const, error: error.message };

    if (data.documents?.length) {
      await db
        .from("vendor_documents")
        .insert(
          data.documents.map((d) => ({
            vendor_id: vendor.id,
            doc_type: d.doc_type,
            file_url: d.file_url,
          })),
        );
    }
    return { ok: true as const, vendor };
  });

export const evaluateVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      vendor_id: string;
      technical_capability: number;
      experience_past_performance: number;
      service_support: number;
      financial_reasonableness: number;
      decision: "recommend" | "not_recommend";
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { db, held } = await rolesOf(context);
    const d = deny(
      held,
      ["procurement_officer", "procurement_executive", "purchase_committee"],
      "evaluate vendors",
    );
    if (d) return d;

    const { error } = await db.from("vendor_evaluations").insert({
      vendor_id: data.vendor_id,
      technical_capability: data.technical_capability,
      experience_past_performance: data.experience_past_performance,
      service_support: data.service_support,
      financial_reasonableness: data.financial_reasonableness,
      decision: data.decision,
      decided_by: context.userId,
      notes: data.notes ?? null,
    });
    if (error) return { ok: false as const, error: error.message };

    await db.from("vendors").update({ status: "under_review" }).eq("id", data.vendor_id);
    return { ok: true as const };
  });

/** EVP only — a non-EVP attempt is rejected server-side and by RLS. */
export const approveEmpanelment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; notes?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { db, held } = await rolesOf(context);
    const d = deny(held, ["evp"], "approve vendor empanelment");
    if (d) return d;

    const { data: existing } = await db
      .from("vendor_evaluations")
      .select("id")
      .eq("vendor_id", data.vendor_id)
      .limit(1);
    if (!existing || existing.length === 0) {
      return {
        ok: false as const,
        error: "This vendor has not been evaluated yet. Evaluation must precede empanelment.",
      };
    }

    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(expiry.getFullYear() + 1);

    const { error } = await db
      .from("vendors")
      .update({
        status: "empanelled",
        empanelled_on: today.toISOString().slice(0, 10),
        empanelment_expiry: expiry.toISOString().slice(0, 10),
      })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, empanelled_on: today.toISOString().slice(0, 10) };
  });

export const rejectEmpanelment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, held } = await rolesOf(context);
    const d = deny(held, ["evp"], "reject vendor empanelment");
    if (d) return d;
    const { error } = await db
      .from("vendors")
      .update({ status: "rejected" })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };
    await db.from("vendor_evaluations").insert({
      vendor_id: data.vendor_id,
      decision: "not_recommend",
      decided_by: context.userId,
      notes: data.reason,
    });
    return { ok: true as const };
  });

export const suspendVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, held } = await rolesOf(context);
    const d = deny(held, ["evp", "director_admin_finance"], "suspend a vendor");
    if (d) return d;
    const { error } = await db
      .from("vendors")
      .update({ status: "suspended" })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const blacklistVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, held } = await rolesOf(context);
    const d = deny(held, ["evp"], "debar or blacklist a vendor");
    if (d) return d;
    const { error } = await db
      .from("vendors")
      .update({ status: "debarred" })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };
    await db.from("vendor_blacklist").insert({
      vendor_id: data.vendor_id,
      reason: data.reason,
      blacklisted_by: context.userId,
    });
    return { ok: true as const };
  });

export const listVendorsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data } = await db
      .from("vendors")
      .select(
        "id, name, status, gst_number, pan_number, empanelled_on, empanelment_expiry, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    return { vendors: data ?? [], roles: roles.map((r) => r.role) };
  });
