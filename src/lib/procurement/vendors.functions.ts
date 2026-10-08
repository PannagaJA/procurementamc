/** Vendor empanelment server functions (SOP §8.2). */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorApplicationInput = {
  name: string;
  registered_address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  contact_person?: string | null;
  categories?: string[] | null;
  bank_details: Record<string, any> | null;
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
    if (!data.name?.trim()) return { ok: false as const, error: "Vendor name is required." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Consolidate bank details, contact person, and categories into JSON
    const mergedDetails = {
      ...(data.bank_details ?? {}),
      contact_person: data.contact_person || (data.bank_details as any)?.contact_person || null,
      categories: data.categories || (data.bank_details as any)?.categories || [],
    };

    const { data: vendor, error } = await supabaseAdmin
      .from("vendors")
      .insert({
        name: data.name.trim(),
        registered_address: data.registered_address,
        gst_number: data.gst_number,
        pan_number: data.pan_number,
        bank_details_json: mergedDetails,
        status: "applied",
        created_by: context.userId,
      })
      .select("id, name, status, registered_address, gst_number, pan_number, bank_details_json, created_at")
      .single();

    if (error) return { ok: false as const, error: error.message };

    if (data.documents?.length) {
      await supabaseAdmin
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
    const { held } = await rolesOf(context);
    const d = deny(
      held,
      ["procurement_officer", "procurement_executive", "purchase_committee", "evp"],
      "evaluate vendors",
    );
    if (d) return d;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("vendor_evaluations").insert({
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

    const { error: updateError } = await supabaseAdmin
      .from("vendors")
      .update({ status: "under_review", updated_at: new Date().toISOString() })
      .eq("id", data.vendor_id);
    if (updateError) return { ok: false as const, error: updateError.message };

    return { ok: true as const };
  });

/** EVP only — grants 1-year empanelment validity (SOP §8.2). */
export const approveEmpanelment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; notes?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { held } = await rolesOf(context);
    const d = deny(held, ["evp"], "approve vendor empanelment");
    if (d) return d;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If vendor was not previously evaluated, auto-record EVP recommendation
    const { data: existing } = await supabaseAdmin
      .from("vendor_evaluations")
      .select("id")
      .eq("vendor_id", data.vendor_id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabaseAdmin.from("vendor_evaluations").insert({
        vendor_id: data.vendor_id,
        technical_capability: 85,
        experience_past_performance: 85,
        service_support: 85,
        financial_reasonableness: 85,
        decision: "recommend",
        decided_by: context.userId,
        notes: data.notes || "Approved directly by EVP",
      });
    }

    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(expiry.getFullYear() + 1);

    const { data: updated, error } = await supabaseAdmin
      .from("vendors")
      .update({
        status: "empanelled",
        empanelled_on: today.toISOString().slice(0, 10),
        empanelment_expiry: expiry.toISOString().slice(0, 10),
        updated_at: today.toISOString(),
      })
      .eq("id", data.vendor_id)
      .select("id, name, status, empanelled_on, empanelment_expiry")
      .single();

    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      vendor: updated,
      empanelled_on: today.toISOString().slice(0, 10),
      empanelment_expiry: expiry.toISOString().slice(0, 10),
    };
  });

export const rejectEmpanelment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { held } = await rolesOf(context);
    const d = deny(held, ["evp"], "reject vendor empanelment");
    if (d) return d;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("vendors")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };

    await supabaseAdmin.from("vendor_evaluations").insert({
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
    const { held } = await rolesOf(context);
    const d = deny(held, ["evp", "director_admin_finance"], "suspend a vendor");
    if (d) return d;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vendors")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const blacklistVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vendor_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { held } = await rolesOf(context);
    const d = deny(held, ["evp"], "debar or blacklist a vendor");
    if (d) return d;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vendors")
      .update({ status: "debarred", updated_at: new Date().toISOString() })
      .eq("id", data.vendor_id);
    if (error) return { ok: false as const, error: error.message };

    await supabaseAdmin.from("vendor_blacklist").insert({
      vendor_id: data.vendor_id,
      reason: data.reason,
      blacklisted_by: context.userId,
    });
    return { ok: true as const };
  });

export const listVendorsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendors, error } = await supabaseAdmin
      .from("vendors")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch vendors:", error.message);
    }

    // Also fetch evaluations so UI knows if an applied vendor has been evaluated
    const { data: evals } = await supabaseAdmin
      .from("vendor_evaluations")
      .select("id, vendor_id, technical_capability, experience_past_performance, service_support, financial_reasonableness, decision, notes, created_at, decided_at")
      .order("created_at", { ascending: false });

    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(context.supabase as any, context.userId);

    return {
      vendors: vendors ?? [],
      evaluations: evals ?? [],
      roles: roles.map((r) => r.role),
    };
  });
