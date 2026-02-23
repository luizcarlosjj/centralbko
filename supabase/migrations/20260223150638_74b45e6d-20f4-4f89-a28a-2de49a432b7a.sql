CREATE POLICY "Anyone can view active ticket types"
  ON public.ticket_types FOR SELECT
  USING (active = true);