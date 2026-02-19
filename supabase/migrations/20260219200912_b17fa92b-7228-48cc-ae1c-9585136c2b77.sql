
-- Migrate existing analyst users to backoffice role
UPDATE public.user_roles SET role = 'backoffice' WHERE role = 'analyst';
