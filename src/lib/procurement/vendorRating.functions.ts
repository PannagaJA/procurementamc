/**
 * Vendor Performance Rating Functions (SOP Annexure 4).
 *
 * Implements:
 * - 6-Section weighted evaluation formula:
 *   A (Quality) * 0.25 + B (Delivery) * 0.20 + C (Price) * 0.15 + D (Support) * 0.20 + E (Safety) * 0.10 + F (Relations) * 0.10
 *   (Redistributed proportionally if Section E is N/A).
 * - 5 Performance Outcome Bands:
 *   - ≥ 85: 'preferred'
 *   - 70–84.99: 'active'
 *   - 55–69.99: 'active_notice'
 *   - 40–54.99: 'suspended'
 *   - < 40: 'debarred' (Requires EVP sign-off)
 * - Automatic vendor status transition on suspension / debarment.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RatingScores = {
  section_a_score: number; // Quality & Spec (25%)
  section_b_score: number; // Delivery & Timeline (20%)
  section_c_score: number; // Price & Commercial (15%)
  section_d_score: number; // Support & Service (20%)
  section_e_score?: number | null; // Safety / Statutory (10% or null)
  section_f_score: number; // Responsiveness & Relations (10%)
};

export type SubmitRatingInput = RatingScores & {
  vendor_id: string;
  review_period: string; // e.g. 'FY2026-Q2' or 'Annual 2026'
  notes?: string | null;
  countersigned_by?: string | null;
  evp_approved_by?: string | null;
  submit_for_countersignature?: boolean;
};

export function computeWeightedScore(scores: RatingScores): number {
  const a = Math.min(100, Math.max(0, Number(scores.section_a_score) || 0));
  const b = Math.min(100, Math.max(0, Number(scores.section_b_score) || 0));
  const c = Math.min(100, Math.max(0, Number(scores.section_c_score) || 0));
  const d = Math.min(100, Math.max(0, Number(scores.section_d_score) || 0));
  const f = Math.min(100, Math.max(0, Number(scores.section_f_score) || 0));

  const hasE = scores.section_e_score !== null && scores.section_e_score !== undefined;

  if (hasE) {
    const e = Math.min(100, Math.max(0, Number(scores.section_e_score) || 0));
    const total = a * 0.25 + b * 0.2 + c * 0.15 + d * 0.2 + e * 0.1 + f * 0.1;
    return Number(total.toFixed(2));
  } else {
    // Redistribute weight across remaining 90%
    const unscaled = a * 0.25 + b * 0.2 + c * 0.15 + d * 0.2 + f * 0.1;
    const scaled = unscaled / 0.9;
    return Number(scaled.toFixed(2));
  }
}

export function deriveOutcome(
  weightedScore: number,
): "preferred" | "active" | "active_notice" | "suspended" | "debarred" {
  if (weightedScore >= 85) return "preferred";
  if (weightedScore >= 70) return "active";
  if (weightedScore >= 55) return "active_notice";
  if (weightedScore >= 40) return "suspended";
  return "debarred";
}

export const submitVendorRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SubmitRatingInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { ForbiddenError } = await import("@/server/procurement/errors");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);
    const isEvpOrAdmin = held.includes("evp") || held.includes("admin");

    // Compute weighted score & outcome
    const weightedScore = computeWeightedScore(data);
    const outcome = deriveOutcome(weightedScore);

    // Guard: Debarment requires explicit EVP authorization before final recording (SOP Annexure 4)
    if (outcome === "debarred") {
      if (!isEvpOrAdmin) {
        if (!data.submit_for_countersignature) {
          return {
            ok: false as const,
            error: `A score below 40 debars this vendor, which only the Executive Vice President (EVP) can authorize. Send this rating to the EVP for countersignature.`,
            code: "evp_debarment_authorization_required",
            weightedScore,
            outcome,
          };
        }
      } else {
        if (!data.evp_approved_by?.trim()) {
          return {
            ok: false as const,
            error: `Debarment outcome requires an EVP authorization reference or order number (e.g. EVP/AUTH/2026-10).`,
            code: "evp_reference_required",
            weightedScore,
            outcome,
          };
        }
      }
    }

    const isUuid = (val?: string | null) =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    let evpApproverUuid: string | null = null;
    if (outcome === "debarred" && isEvpOrAdmin) {
      evpApproverUuid = context.userId;
    }

    // Preserve notes or reference string
    let finalNotes = data.notes ?? null;
    if (outcome === "debarred") {
      if (evpApproverUuid && data.evp_approved_by && !isUuid(data.evp_approved_by)) {
        finalNotes = finalNotes
          ? `${finalNotes}\n[EVP Authorization Reference: ${data.evp_approved_by.trim()}]`
          : `[EVP Authorization Reference: ${data.evp_approved_by.trim()}]`;
      } else if (!evpApproverUuid) {
        finalNotes = finalNotes
          ? `${finalNotes}\n[Pending EVP Countersignature: Submitted by Procurement Officer]`
          : `[Pending EVP Countersignature: Submitted by Procurement Officer]`;
      }
    }

    // Service-role client required for all writes below:
    // - "Vendor ratings direct writes denied" (WITH CHECK false) blocks INSERT on vendor_ratings.
    // - "Vendors direct status updates denied" (USING false) blocks UPDATE on vendors.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Insert Vendor Rating
    const { data: rating, error: rErr } = await supabaseAdmin
      .from("vendor_ratings")
      .insert({
        vendor_id: data.vendor_id,
        review_period: data.review_period,
        section_a_score: data.section_a_score,
        section_b_score: data.section_b_score,
        section_c_score: data.section_c_score,
        section_d_score: data.section_d_score,
        section_e_score: data.section_e_score ?? null,
        section_f_score: data.section_f_score,
        weighted_score: weightedScore,
        outcome,
        notes: finalNotes,
        reviewed_by: context.userId,
        countersigned_by: data.countersigned_by ?? null,
        evp_approved_by: evpApproverUuid,
      })
      .select("*")
      .single();

    if (rErr) return { ok: false as const, error: rErr.message, code: "insert_rating_failed" };

    // 2. Automatically synchronize vendor status in Master based on evaluation outcome
    if (outcome === "suspended") {
      await supabaseAdmin
        .from("vendors")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", data.vendor_id);
    } else if (outcome === "debarred") {
      if (evpApproverUuid) {
        // Only flip to debarred if authorized by EVP
        await supabaseAdmin
          .from("vendors")
          .update({ status: "debarred", updated_at: new Date().toISOString() })
          .eq("id", data.vendor_id);

        await supabaseAdmin.from("vendor_blacklist").insert({
          vendor_id: data.vendor_id,
          reason:
            finalNotes ||
            `Debarred via Performance Evaluation (Score: ${weightedScore}/100, Period: ${data.review_period})`,
          blacklisted_by: context.userId,
        });

        // Send formal debarment notice to vendor via SMTP
        import("@/server/email/notificationDispatcher")
          .then(({ notifyVendorEmpanelmentStatus }) =>
            notifyVendorEmpanelmentStatus({
              vendorId: data.vendor_id,
              status: "debarred",
              remarks: finalNotes || `Debarred via Performance Evaluation (Score: ${weightedScore}/100, Period: ${data.review_period})`,
            }),
          )
          .catch((e) => console.warn("[Email] Vendor debarment notice failed:", e));
      }
      // If pending EVP countersignature, vendor status in Master remains unchanged until countersigned
    } else if (outcome === "preferred" || outcome === "active" || outcome === "active_notice") {
      // Reinstated or active standing: update status to 'empanelled' and clear blacklist
      await supabaseAdmin
        .from("vendors")
        .update({ status: "empanelled", updated_at: new Date().toISOString() })
        .eq("id", data.vendor_id);

      await supabaseAdmin
        .from("vendor_blacklist")
        .delete()
        .eq("vendor_id", data.vendor_id);
    }

    return {
      ok: true as const,
      rating,
      weightedScore,
      outcome,
      pendingCountersignature: outcome === "debarred" && !evpApproverUuid,
    };
  });

export const countersignDebarment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      rating_id: string;
      evp_reference: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("evp") && !held.includes("admin")) {
      return {
        ok: false as const,
        error: "Debarment countersignature requires the Executive Vice President (EVP) or Admin role.",
      };
    }

    if (!data.evp_reference?.trim()) {
      return {
        ok: false as const,
        error: "Please enter a valid EVP Authorization Reference or Order Number.",
      };
    }

    const { data: rating, error: rErr } = await db
      .from("vendor_ratings")
      .select("id, vendor_id, outcome, weighted_score, review_period, notes")
      .eq("id", data.rating_id)
      .single();

    if (rErr || !rating) {
      return { ok: false as const, error: "Rating record not found." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const updatedNotes = rating.notes
      ? `${rating.notes}\n[EVP Debarment Countersignature Ref: ${data.evp_reference.trim()}]`
      : `[EVP Debarment Countersignature Ref: ${data.evp_reference.trim()}]`;

    // 1. Update rating with EVP approval
    await supabaseAdmin
      .from("vendor_ratings")
      .update({
        evp_approved_by: context.userId,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rating.id);

    // 2. Flip vendor status in master to debarred
    await supabaseAdmin
      .from("vendors")
      .update({ status: "debarred", updated_at: new Date().toISOString() })
      .eq("id", rating.vendor_id);

    // 3. Add to vendor_blacklist
    await supabaseAdmin.from("vendor_blacklist").insert({
      vendor_id: rating.vendor_id,
      reason: updatedNotes,
      blacklisted_by: context.userId,
    });

    return { ok: true as const };
  });

export const listVendorRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { vendor_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from("vendor_ratings")
      .select(
        `
        *,
        vendors (id, name, gst_number, status)
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.vendor_id) query = query.eq("vendor_id", data.vendor_id);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, vendorRatings: list ?? [] };
  });
