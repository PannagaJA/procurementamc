/**
 * WhatsApp click-to-chat links (https://wa.me/<number>?text=…). Pure: no React/Supabase.
 * Test: node scripts/verify_whatsapp.mjs
 */

/** Digits in international format for wa.me, or null. A bare 10-digit number is Indian (+91). */
export function toWaNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const local = digits.replace(/^0+/, "");
  if (local.length === 10) return `91${local}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Opens a chat with `phone` with the message filled in; with no number WhatsApp asks for a contact. */
export function waLink(phone: string | null | undefined, text: string): string {
  const n = toWaNumber(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}
