-- New roles (DECISIONS.md Q18). Enum values must be committed before any function or policy
-- uses them, so this runs on its own, before 20261105000002_new_roles_access.sql.
-- 'auditor' already exists on live (from complete_schema.sql); IF NOT EXISTS keeps this idempotent.
-- Apply by hand as reviewed SQL; never via `supabase db push`.
alter type public.app_role add value if not exists 'chairman';
alter type public.app_role add value if not exists 'vice_chairman';
alter type public.app_role add value if not exists 'auditor';
alter type public.app_role add value if not exists 'corporate_office';
