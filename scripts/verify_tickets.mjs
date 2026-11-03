// Tickets module: end-to-end + RLS checks against a real Supabase project.
// Signs in as the seeded test users (local/testing/README.md) and creates tickets tagged
// "[VT-TEST]"; they are deleted with the service-role client at the end (cascades to ticket_updates).
// Run: node --env-file=.env scripts/verify_tickets.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.TEST_PASSWORD || "Password@123";
if (!URL || !ANON || !SERVICE) throw new Error("Need SUPABASE_URL, anon key and SUPABASE_SERVICE_ROLE_KEY");

const TAG = "[VT-TEST]";
const CSE = "Computer Science & Engineering";
const MECH = "Mechanical Engineering";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);

async function login(email) {
  const c = createClient(URL, ANON, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  c.uid = data.user.id;
  return c;
}

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
};
const row = async (id) => (await admin.from("tickets").select("*").eq("id", id).single()).data;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirrors TicketRaiser: number from the RPC, then insert.
async function raise(c, fields) {
  const { data: num, error: rpcErr } = await c.rpc("generate_ticket_number");
  if (rpcErr) throw new Error(`generate_ticket_number: ${rpcErr.message}`);
  const { data, error } = await c
    .from("tickets")
    .insert([
      {
        ticket_number: num,
        name: "VT Tester",
        email: "vt@example.com",
        issue_category: "hardware",
        priority: "medium",
        created_by: c.uid,
        ...fields,
        issue_description: `${TAG} ${fields.issue_description ?? "test ticket"}`,
      },
    ])
    .select()
    .single();
  return { data, error };
}

// Try a status change as `c`; report whether the stored row actually changed.
async function tryStatus(c, id, status, extraFilter) {
  let q = c.from("tickets").update({ status }).eq("id", id);
  if (extraFilter) q = q.eq("status", extraFilter);
  const { error } = await q.select();
  return { changed: (await row(id)).status === status, error };
}

const [faculty, hodCse, hodMech, principal, adm, finance] = await Promise.all(
  [
    "faculty.mech@institution.edu",
    "hod.cse@institution.edu",
    "hod.mech@institution.edu",
    "principal@institution.edu",
    "admin@institution.edu",
    "finance@institution.edu",
  ].map(login),
);

try {
  // ---- Raising -------------------------------------------------------------------------
  const f = await raise(faculty, { department: MECH });
  check("faculty raises a ticket", !f.error && f.data, f.error?.message);
  const fid = f.data.id;
  check("ticket number is TKT-YYYY-NNNN", /^TKT-\d{4}-\d{4,}$/.test(f.data.ticket_number), f.data.ticket_number);
  check("faculty ticket starts pending", f.data.status === "pending", f.data.status);

  const forged = await raise(faculty, { department: MECH, status: "procure-approved" });
  check(
    "client cannot insert a pre-approved ticket",
    forged.error || forged.data.status === "pending",
    forged.data?.status,
  );

  const spoof = await faculty
    .from("tickets")
    .insert([{ ticket_number: `VT-${Date.now()}`, created_by: hodCse.uid, issue_description: `${TAG} spoof` }])
    .select();
  check("cannot raise a ticket as someone else", !!spoof.error, "insert succeeded");

  const h0 = await raise(hodCse, { department: CSE });
  check(
    "HOD ticket routes to Principal even if client omits status",
    h0.data?.status === "pending_principal",
    h0.data?.status ?? h0.error?.message,
  );

  // What the UI sends for a HOD today.
  const h = await raise(hodCse, { department: CSE, status: "pending_principal" });
  check("HOD raises a principal-approval request", h.data?.status === "pending_principal", h.error?.message);
  const hid = h.data.id;

  // ---- Unauthorised status changes ----------------------------------------------------
  let r = await tryStatus(faculty, fid, "completed");
  check("faculty cannot close own ticket", !r.changed);

  r = await tryStatus(hodCse, hid, "service-approved");
  check("HOD cannot self-approve own request", !r.changed);

  r = await tryStatus(hodMech, hid, "service-rejected");
  check("other-department HOD cannot change a CSE ticket", !r.changed);

  const desc = await hodMech.from("tickets").update({ issue_description: `${TAG} hijacked` }).eq("id", hid).select();
  check("other-department HOD cannot edit a CSE ticket", (await row(hid)).issue_description !== `${TAG} hijacked`, JSON.stringify(desc.data));

  r = await tryStatus(adm, hid, "in-progress");
  check("admin cannot skip Principal approval", !r.changed);

  // ---- Principal approval ------------------------------------------------------------
  r = await tryStatus(principal, hid, "service-approved", "pending_principal");
  check("principal approves HOD request", r.changed, r.error?.message);
  const hist = await principal.from("ticket_updates").insert([
    { ticket_id: hid, status_from: "pending_principal", status_to: "service-approved", admin_notes: "VT ok", updated_by: principal.uid },
  ]);
  check("principal can write history row", !hist.error, hist.error?.message);

  r = await tryStatus(principal, hid, "service-rejected");
  check("decided request cannot be flipped afterwards", !r.changed);

  // ---- Admin workflow ----------------------------------------------------------------
  const before = (await row(fid)).updated_at;
  await sleep(1100);
  r = await tryStatus(adm, fid, "in-progress");
  check("admin moves ticket to in-progress", r.changed, r.error?.message);
  check("updated_at advances on update", (await row(fid)).updated_at !== before);
  r = await tryStatus(adm, fid, "resolved");
  check("admin resolves ticket", r.changed, r.error?.message);

  // ---- Read scope --------------------------------------------------------------------
  const sees = async (c, id) => ((await c.from("tickets").select("id").eq("id", id)).data || []).length > 0;
  check("owner sees own ticket", await sees(faculty, fid));
  check("admin sees all tickets", await sees(adm, hid));
  check("principal sees all tickets", await sees(principal, fid));
  check("department HOD sees department ticket", await sees(hodMech, fid));
  check("other user cannot read someone else's ticket", !(await sees(finance, fid)));
  check("faculty cannot read a HOD's ticket", !(await sees(faculty, hid)));
  check("other-department HOD cannot read the ticket", !(await sees(hodCse, fid)));
  const hv = await faculty.from("ticket_updates").select("id").eq("ticket_id", hid);
  check("ticket history is not readable by outsiders", (hv.data || []).length === 0);
  const own = await hodCse.from("tickets").select("id, ticket_updates(status_to)").eq("id", hid).single();
  check("owner sees own ticket history (My Tickets embed)", own.data?.ticket_updates?.length === 1, own.error?.message);

  // ---- Not tickets, but it undermines every role check above ------------------------
  const esc = await faculty.from("user_roles").insert({ user_id: faculty.uid, role: "admin" }).select();
  check("user cannot grant themselves admin", !!esc.error, "admin role inserted");
} catch (e) {
  failures++;
  console.log("FAIL  unexpected error:", e.message);
} finally {
  // faculty.mech is never a real admin, so this only removes an escalation the test caused.
  await admin.from("user_roles").delete().eq("user_id", faculty.uid).eq("role", "admin");
  const { error, count } = await admin.from("tickets").delete({ count: "exact" }).like("issue_description", `${TAG}%`);
  console.log(error ? `cleanup failed: ${error.message}` : `cleanup: removed ${count} test tickets`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall ticket checks passed");
process.exit(failures ? 1 : 0);
