ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS sl_no bigserial,
  ADD COLUMN IF NOT EXISTS specifications text,
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS room_no text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS approval_letter_ref text,
  ADD COLUMN IF NOT EXISTS approval_letter_date date,
  ADD COLUMN IF NOT EXISTS item_photo_url text,
  ADD COLUMN IF NOT EXISTS invoice_photo_url text,
  ADD COLUMN IF NOT EXISTS approval_letter_photo_url text,
  ADD COLUMN IF NOT EXISTS gps_latitude numeric(10,6),
  ADD COLUMN IF NOT EXISTS gps_longitude numeric(10,6),
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2)
    GENERATED ALWAYS AS (coalesce(cost_per_unit,0) * coalesce(quantity_available,0)) STORED;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS category text;

-- Security hardening
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.library_issue_return_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.library_issue_create_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_ticket_number() FROM anon, public;