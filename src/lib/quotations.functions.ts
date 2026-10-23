/**
 * Legacy quotation requests (/request-quotation → /quotation/$id?token=…).
 * Vendors aren't users, so the quotation and their response are read and written here with the
 * service role after the private link's token is checked — never directly from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "procurement_officer", "procurement_executive"];

/** Private link for the vendor of one quotation request (its creator or procurement staff). */
export const getQuotationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { quotation_id: string; origin?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: q } = await supabaseAdmin
      .from("quotations")
      .select("id, company_email, created_by")
      .eq("id", data.quotation_id)
      .maybeSingle();
    if (!q) return { ok: false as const, error: "Quotation request not found." };

    if (q.created_by !== context.userId) {
      const { getCallerRoles } = await import("@/server/procurement/roles");
      const held = (await getCallerRoles(context.supabase as any, context.userId)).map(
        (r) => r.role,
      );
      if (!STAFF_ROLES.some((r) => held.includes(r))) {
        return {
          ok: false as const,
          error: "Only whoever raised this request can share its link.",
        };
      }
    }
    try {
      const { linkOrigin, quotationVendorLink } = await import("@/server/quoteLinks");
      return {
        ok: true as const,
        url: quotationVendorLink(linkOrigin(data.origin), q.id, q.company_email),
      };
    } catch (e: any) {
      return { ok: false as const, error: e.message };
    }
  });

async function loadByToken(id: string, token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { verifyQuoteToken } = await import("@/server/quoteLinks");
  const { data: quotation } = await supabaseAdmin
    .from("quotations")
    .select("*, categories (name)")
    .eq("id", id)
    .maybeSingle();
  if (!quotation || !verifyQuoteToken(quotation.id, quotation.company_email, token)) return null;
  return { supabaseAdmin, quotation };
}

/** Vendor view of a quotation request via its private link. */
export const getQuotationForVendor = createServerFn({ method: "POST" })
  .validator((input: { quotation_id: string; token: string }) => input)
  .handler(async ({ data }) => {
    const found = await loadByToken(data.quotation_id, data.token);
    if (!found) return { ok: false as const, error: "Invalid or unauthorized quotation link." };
    const { data: response } = await found.supabaseAdmin
      .from("quotation_responses")
      .select("*")
      .eq("quotation_id", found.quotation.id)
      .maybeSingle();
    return { ok: true as const, quotation: found.quotation as any, response: response ?? null };
  });

/** Vendor submits their response; one response per request. */
export const submitQuotationResponse = createServerFn({ method: "POST" })
  .validator(
    (input: {
      quotation_id: string;
      token: string;
      description: string;
      total_amount: number;
      quotation_validity?: string | null;
      terms_accepted: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const found = await loadByToken(data.quotation_id, data.token);
    if (!found) return { ok: false as const, error: "Invalid or unauthorized quotation link." };
    const { supabaseAdmin, quotation } = found;
    if (quotation.status !== "sent") {
      return { ok: false as const, error: "This quotation has already been answered or closed." };
    }
    const amount = Number(data.total_amount);
    if (!(amount > 0)) return { ok: false as const, error: "Enter the total amount." };
    if (!data.terms_accepted) return { ok: false as const, error: "Accept the terms to submit." };

    const { data: response, error } = await supabaseAdmin
      .from("quotation_responses")
      .insert({
        quotation_id: quotation.id,
        company_email: quotation.company_email,
        description: String(data.description ?? "").slice(0, 5000),
        total_amount: amount,
        quotation_validity: data.quotation_validity || null,
        terms_accepted: true,
      })
      .select()
      .single();
    if (error) {
      return {
        ok: false as const,
        error:
          error.code === "23505"
            ? "You have already submitted a response for this quotation."
            : error.message,
      };
    }
    await supabaseAdmin
      .from("quotations")
      .update({ status: "responded", updated_at: new Date().toISOString() })
      .eq("id", quotation.id);
    return { ok: true as const, response };
  });
