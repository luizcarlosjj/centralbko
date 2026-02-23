
-- Create requesters table for supervisor to manage public ticket requester options
CREATE TABLE public.requesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.requesters ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read active requesters for the public form
CREATE POLICY "Anyone can view active requesters"
ON public.requesters
FOR SELECT
TO anon, authenticated
USING (active = true);

-- Authenticated users can view all requesters (for management)
CREATE POLICY "Authenticated can view all requesters"
ON public.requesters
FOR SELECT
TO authenticated
USING (true);

-- Only supervisors can insert
CREATE POLICY "Supervisors can insert requesters"
ON public.requesters
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

-- Only supervisors can update
CREATE POLICY "Supervisors can update requesters"
ON public.requesters
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'supervisor'::app_role));
