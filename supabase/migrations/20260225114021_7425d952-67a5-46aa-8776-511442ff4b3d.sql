
-- Remove round-robin trigger and function (trigger name is on_ticket_created)
DROP TRIGGER IF EXISTS on_ticket_created ON public.tickets;
DROP FUNCTION IF EXISTS public.auto_assign_ticket();

-- Update RLS: backoffice can see unassigned tickets
DROP POLICY IF EXISTS "Role-based ticket visibility" ON public.tickets;
CREATE POLICY "Role-based ticket visibility" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR (has_role(auth.uid(), 'backoffice'::app_role) AND (assigned_analyst_id = auth.uid() OR assigned_analyst_id IS NULL))
    OR (has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );

-- Update RLS: backoffice can update unassigned tickets
DROP POLICY IF EXISTS "Role-based ticket update" ON public.tickets;
CREATE POLICY "Role-based ticket update" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR (has_role(auth.uid(), 'backoffice'::app_role) AND (assigned_analyst_id = auth.uid() OR assigned_analyst_id IS NULL))
    OR (has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );
