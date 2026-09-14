/**
 * Compliance guards (SOP §7, §8.4–§8.7, §9).
 *
 * Every guard throws a typed ProcurementRuleError with a human-readable reason.
 * They take the Supabase client as an argument so they can be exercised against
 * a test double without a live database.
 */
import { ruleError } from './errors';

/** Minimal structural type so these are testable with a stub client. */
export type Db = {
  from: (table: string) => any;
};

export const EMERGENCY_ANNUAL_CAP = 1000000; // ₹10,00,000 institution-wide (SOP §9)
/** A PO may not exceed the approved PR value by more than this fraction (§7.5). */
export const PO_SPLIT_TOLERANCE = 0;

export async function assertPrApproved(db: Db, prId: string): Promise<void> {
  const { data, error } = await db
    .from('purchase_requisitions')
    .select('id, status, pr_number')
    .eq('id', prId)
    .maybeSingle();

  if (error) throw ruleError('pr_lookup_failed', `Could not read the purchase requisition: ${error.message}`);
  if (!data) throw ruleError('pr_not_found', 'The purchase requisition does not exist.');
  if (data.status !== 'approved') {
    throw ruleError(
      'pr_not_approved',
      `Purchase requisition ${data.pr_number ?? prId} is "${data.status}". No procurement step may proceed until it is approved.`,
    );
  }
}

export async function assertVendorEmpanelled(db: Db, vendorId: string): Promise<void> {
  const { data, error } = await db
    .from('vendors')
    .select('id, name, status, empanelment_expiry')
    .eq('id', vendorId)
    .maybeSingle();

  if (error) throw ruleError('vendor_lookup_failed', `Could not read the vendor: ${error.message}`);
  if (!data) throw ruleError('vendor_not_found', 'The vendor does not exist.');
  if (data.status !== 'empanelled') {
    throw ruleError(
      'vendor_not_empanelled',
      `Vendor "${data.name}" is "${data.status}". Only empanelled vendors may be awarded work.`,
    );
  }
  if (data.empanelment_expiry && new Date(data.empanelment_expiry) < new Date()) {
    throw ruleError(
      'vendor_empanelment_expired',
      `Vendor "${data.name}" empanelment expired on ${data.empanelment_expiry}. Renew before awarding work.`,
    );
  }
}

/**
 * Prevents splitting a requirement across multiple POs to stay under a
 * threshold: the sum of all POs raised against a PR may not exceed the
 * approved PR value.
 */
export async function assertNoPoSplitting(db: Db, prId: string, newValue: number): Promise<void> {
  const { data: pr, error: prErr } = await db
    .from('purchase_requisitions')
    .select('id, pr_number, estimated_value')
    .eq('id', prId)
    .maybeSingle();
  if (prErr) throw ruleError('pr_lookup_failed', `Could not read the purchase requisition: ${prErr.message}`);
  if (!pr) throw ruleError('pr_not_found', 'The purchase requisition does not exist.');

  const { data: pos, error: poErr } = await db
    .from('purchase_orders')
    .select('total_value')
    .eq('pr_id', prId);
  // purchase_orders arrives in a later phase; absence must not weaken the guard silently.
  if (poErr && !/does not exist|schema cache/i.test(poErr.message ?? '')) {
    throw ruleError('po_lookup_failed', `Could not read existing purchase orders: ${poErr.message}`);
  }

  const already = (pos ?? []).reduce((s: number, p: any) => s + Number(p.total_value ?? 0), 0);
  const approved = Number(pr.estimated_value ?? 0);
  const projected = already + Number(newValue);

  if (approved > 0 && projected > approved * (1 + PO_SPLIT_TOLERANCE)) {
    throw ruleError(
      'po_splitting',
      `Purchase orders against ${pr.pr_number ?? prId} would total ₹${projected.toLocaleString('en-IN')}, ` +
        `above the approved requisition value of ₹${approved.toLocaleString('en-IN')}. ` +
        `Splitting a requirement across orders is not permitted — raise a deviation approval instead.`,
    );
  }
}

/** Three-way match: PO ↔ GRN ↔ Invoice must agree before payment (§8.7). */
export async function assertThreeWayMatch(
  db: Db,
  poId: string,
  grnId: string,
  invoiceId: string,
): Promise<void> {
  const [po, grn, inv] = await Promise.all([
    db.from('purchase_orders').select('id, total_value').eq('id', poId).maybeSingle(),
    db.from('goods_receipt_notes').select('id, po_id, accepted_value, status').eq('id', grnId).maybeSingle(),
    db.from('invoices').select('id, po_id, grn_id, amount').eq('id', invoiceId).maybeSingle(),
  ]);

  if (!po?.data) throw ruleError('po_not_found', 'Three-way match failed: the purchase order does not exist.');
  if (!grn?.data) throw ruleError('grn_not_found', 'Three-way match failed: the goods receipt note does not exist.');
  if (!inv?.data) throw ruleError('invoice_not_found', 'Three-way match failed: the invoice does not exist.');

  if (grn.data.po_id !== poId) {
    throw ruleError('grn_po_mismatch', 'Three-way match failed: the goods receipt note belongs to a different purchase order.');
  }
  if (inv.data.po_id !== poId || (inv.data.grn_id && inv.data.grn_id !== grnId)) {
    throw ruleError('invoice_po_mismatch', 'Three-way match failed: the invoice does not reference this purchase order and receipt note.');
  }
  if (grn.data.status !== 'accepted') {
    throw ruleError('grn_not_accepted', `Three-way match failed: goods receipt is "${grn.data.status}", not accepted.`);
  }
  if (Number(inv.data.amount) > Number(grn.data.accepted_value ?? 0)) {
    throw ruleError(
      'invoice_exceeds_receipt',
      `Three-way match failed: invoice of ₹${Number(inv.data.amount).toLocaleString('en-IN')} exceeds accepted goods value of ₹${Number(grn.data.accepted_value ?? 0).toLocaleString('en-IN')}.`,
    );
  }
  if (Number(inv.data.amount) > Number(po.data.total_value ?? 0)) {
    throw ruleError(
      'invoice_exceeds_po',
      `Three-way match failed: invoice exceeds the purchase order value of ₹${Number(po.data.total_value ?? 0).toLocaleString('en-IN')}.`,
    );
  }
}

/** Emergency procurement aggregate annual cap of ₹10,00,000 (SOP §9). */
export async function assertEmergencyCapNotExceeded(db: Db, newValue: number): Promise<void> {
  const yearStart = new Date(new Date().getFullYear(), 3, 1); // Indian FY starts 1 April
  const start = yearStart > new Date() ? new Date(yearStart.getFullYear() - 1, 3, 1) : yearStart;

  const { data, error } = await db
    .from('purchase_requisitions')
    .select('estimated_value')
    .eq('is_emergency', true)
    .neq('status', 'rejected')
    .neq('status', 'archived')
    .gte('created_at', start.toISOString());

  if (error) throw ruleError('emergency_lookup_failed', `Could not read the emergency procurement register: ${error.message}`);

  const used = (data ?? []).reduce((s: number, r: any) => s + Number(r.estimated_value ?? 0), 0);
  const projected = used + Number(newValue);
  if (projected > EMERGENCY_ANNUAL_CAP) {
    throw ruleError(
      'emergency_cap_exceeded',
      `Emergency procurement this financial year would reach ₹${projected.toLocaleString('en-IN')}, ` +
        `above the annual cap of ₹${EMERGENCY_ANNUAL_CAP.toLocaleString('en-IN')} (already used ₹${used.toLocaleString('en-IN')}).`,
    );
  }
}
