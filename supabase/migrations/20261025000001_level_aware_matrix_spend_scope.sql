-- Migration: 20261025000001_level_aware_matrix_spend_scope.sql
-- Description: Implement level-aware monthly spend aggregation scopes for Authority Matrix rules (SOP §6, §13).
-- Department-level for HOD, Institution-wide for Principal, Procurement Officer, and Purchase Committee.

-- 1. Add aggregation_scope column to approval_matrix_rules
ALTER TABLE public.approval_matrix_rules
  ADD COLUMN IF NOT EXISTS aggregation_scope text DEFAULT 'department';

-- 2. Populate appropriate level-based scopes for existing rules
UPDATE public.approval_matrix_rules
SET aggregation_scope = 'department'
WHERE approval_role = 'hod';

UPDATE public.approval_matrix_rules
SET aggregation_scope = 'institution'
WHERE approval_role IN ('principal', 'procurement_officer', 'purchase_committee', 'director_admin_finance', 'evp');

-- 3. Add constraint to restrict aggregation_scope to permitted values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_matrix_rules_scope_check'
  ) THEN
    ALTER TABLE public.approval_matrix_rules
      ADD CONSTRAINT approval_matrix_rules_scope_check
      CHECK (aggregation_scope IN ('department', 'institution', 'approver'));
  END IF;
END $$;

-- 4. Update procurement configuration documentation
INSERT INTO public.procurement_config (key, value, description)
VALUES (
  'monthly_aggregation_dimension',
  'level_aware',
  'Level-aware monthly spend aggregation: department-scoped for HODs, institution-wide for central roles (Principal, Procurement Officer, Purchase Committee) per SOP §6.'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

-- 5. Helper function for fast breakdown lookup
CREATE OR REPLACE FUNCTION public.get_monthly_spend_breakdown(
  _month date,
  _category text,
  _department_id uuid DEFAULT NULL
)
RETURNS TABLE (
  department_spend numeric,
  institution_spend numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(CASE WHEN department_id = _department_id THEN total_spent ELSE 0 END), 0) AS department_spend,
    COALESCE(SUM(total_spent), 0) AS institution_spend
  FROM public.department_monthly_spend
  WHERE month = _month AND category = _category;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_spend_breakdown(date, text, uuid) TO authenticated;
