
-- Drop the broken restrictive policies
DROP POLICY IF EXISTS "Authenticated can insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "Public can insert tickets" ON public.tickets;

-- Create a single permissive policy allowing anyone to insert tickets
CREATE POLICY "Anyone can insert tickets"
ON public.tickets
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
