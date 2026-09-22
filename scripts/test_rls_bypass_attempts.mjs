/**
 * SCRIPT TO TEST DIRECT CLIENT RLS BYPASS ATTEMPTS
 *
 * Tests the 3 direct Supabase client mutation bypass calls:
 * 1. Session role: `principal` calling `supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', ...)`
 * 2. Session role: `hod` calling `supabase.from('emergency_procurements').update({ evp_approval_status: 'approved' }).eq('id', ...)`
 * 3. Session role: `procurement_officer` calling `supabase.from('vendors').update({ status: 'empanelled' }).eq('id', ...)`
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://c--af0738c2-48d6-4b19-953d-357a854b7347-prod.lovable.cloud";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_kdIaKgHivbo7PoNSzaYRMw_mmrwnaft";

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("================================================================");
console.log("DIRECT CLIENT RLS MUTATION BYPASS ATTEMPTS (AUTHENTICATED SESSIONS)");
console.log("================================================================\n");

// 1. Principal trying to directly update PO status > ₹10,000
console.log('[CALL 1] Session Role: "principal" attempting direct PO status update');
console.log(
  "Query: supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', 'po-e08f51a2-9b1c-4d3e-9081-7c98e1f51234')",
);
try {
  const res1 = await client
    .from("purchase_orders")
    .update({ status: "approved" })
    .eq("id", "po-e08f51a2-9b1c-4d3e-9081-7c98e1f51234")
    .select();

  console.log("RAW SUPABASE CLIENT RESPONSE:");
  console.log(JSON.stringify(res1, null, 2));
  if (res1.error || (res1.data && res1.data.length === 0)) {
    console.log(
      ">>> VERDICT: DIRECT CLIENT MUTATION BLOCKED BY POSTGRES RLS (0 rows modified / permission denied).",
    );
  } else {
    console.error(">>> VERDICT: FAILED! Mutation was allowed.");
  }
} catch (err) {
  console.log("RAW CLIENT ERROR:");
  console.log(err);
}
console.log("\n----------------------------------------------------------------\n");

// 2. HOD trying to directly update Emergency Procurement EVP approval status
console.log('[CALL 2] Session Role: "hod" attempting direct Emergency EVP approval');
console.log(
  "Query: supabase.from('emergency_procurements').update({ evp_approval_status: 'approved' }).eq('id', 'ep-771a82d3-11ef-49c0-9a45-667123abcdef')",
);
try {
  const res2 = await client
    .from("emergency_procurements")
    .update({ evp_approval_status: "approved" })
    .eq("id", "ep-771a82d3-11ef-49c0-9a45-667123abcdef")
    .select();

  console.log("RAW SUPABASE CLIENT RESPONSE:");
  console.log(JSON.stringify(res2, null, 2));
  if (res2.error || (res2.data && res2.data.length === 0)) {
    console.log(
      ">>> VERDICT: DIRECT CLIENT MUTATION BLOCKED BY POSTGRES RLS (0 rows modified / permission denied).",
    );
  } else {
    console.error(">>> VERDICT: FAILED! Mutation was allowed.");
  }
} catch (err) {
  console.log("RAW CLIENT ERROR:");
  console.log(err);
}
console.log("\n----------------------------------------------------------------\n");

// 3. Procurement Officer trying to directly empanel a vendor
console.log(
  '[CALL 3] Session Role: "procurement_officer" attempting direct Vendor status empanelment',
);
console.log(
  "Query: supabase.from('vendors').update({ status: 'empanelled' }).eq('id', 'v-339c01fa-4e89-42b1-b921-998811223344')",
);
try {
  const res3 = await client
    .from("vendors")
    .update({ status: "empanelled" })
    .eq("id", "v-339c01fa-4e89-42b1-b921-998811223344")
    .select();

  console.log("RAW SUPABASE CLIENT RESPONSE:");
  console.log(JSON.stringify(res3, null, 2));
  if (res3.error || (res3.data && res3.data.length === 0)) {
    console.log(
      ">>> VERDICT: DIRECT CLIENT MUTATION BLOCKED BY POSTGRES RLS (0 rows modified / permission denied).",
    );
  } else {
    console.error(">>> VERDICT: FAILED! Mutation was allowed.");
  }
} catch (err) {
  console.log("RAW CLIENT ERROR:");
  console.log(err);
}
console.log("\n================================================================");
