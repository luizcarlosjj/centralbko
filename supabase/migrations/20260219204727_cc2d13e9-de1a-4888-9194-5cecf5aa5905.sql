-- Allow supervisors to read all user roles for metrics/management
CREATE POLICY "Supervisors can read all roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
);
