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

    // Compute weighted score & outcome
    const weightedScore = computeWeightedScore(data);
    const outcome = deriveOutcome(weightedScore);

    // Guard: Debarment requires EVP approval sign-off
    if (
      outcome === "debarred" &&
      !data.evp_approved_by &&
      !held.includes("evp") &&
      !held.includes("admin")
    ) {
      return {
        ok: false as const,
        error: `Debarment outcome (score ${weightedScore} < 40) requires explicit EVP authorization before final recording (SOP Annexure 4).`,
        code: "evp_debarment_authorization_required",
        weightedScore,
        outcome,
      };
    }

    const evpApprover =
      held.includes("evp") || held.includes("admin")
        ? context.userId
        : (data.evp_approved_by ?? null);

    // 1. Insert Vendor Rating
    const { data: rating, error: rErr } = await db
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
        notes: data.notes ?? null,
        reviewed_by: context.userId,
        countersigned_by: data.countersigned_by ?? null,
        evp_approved_by: evpApprover,
      })
      .select("*")
      .single();

    if (rErr) return { ok: false as const, error: rErr.message, code: "insert_rating_failed" };

    // 2. Automatically flip vendor status if suspended or debarred
    if (outcome === "suspended") {
      await db
        .from("vendors")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", data.vendor_id);
    } else if (outcome === "debarred") {
      await db
        .from("vendors")
        .update({ status: "blacklisted", updated_at: new Date().toISOString() })
        .eq("id", data.vendor_id);
    }

    return {
      ok: true as const,
      rating,
      weightedScore,
      outcome,
    };
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
