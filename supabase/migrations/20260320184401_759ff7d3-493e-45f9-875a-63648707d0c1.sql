
-- Allow backoffice users to see other backoffice users' roles
CREATE POLICY "Backoffice can read backoffice roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'backoffice'::app_role) AND role = 'backoffice'::app_role
);
