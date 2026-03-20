
-- 1. Add complexity column to tickets
ALTER TABLE public.tickets ADD COLUMN complexity text;

-- 2. Update SELECT RLS policy for tickets to allow backoffice to see ALL tickets
DROP POLICY IF EXISTS "Role-based ticket visibility" ON public.tickets;
CREATE POLICY "Role-based ticket visibility"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  OR (has_role(auth.uid(), 'backoffice'::app_role))
  OR (has_role(auth.uid(), 'analyst'::app_role) AND (requester_user_id = auth.uid()))
);
