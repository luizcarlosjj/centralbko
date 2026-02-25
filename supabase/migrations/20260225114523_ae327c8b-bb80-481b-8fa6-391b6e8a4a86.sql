
-- Create setup_levels table
CREATE TABLE public.setup_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.setup_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active setup levels" ON public.setup_levels
  FOR SELECT USING (active = true);

CREATE POLICY "Authenticated can view setup levels" ON public.setup_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Supervisors can insert setup levels" ON public.setup_levels
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update setup levels" ON public.setup_levels
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Create teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active teams" ON public.teams
  FOR SELECT USING (active = true);

CREATE POLICY "Authenticated can view teams" ON public.teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Supervisors can insert teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update teams" ON public.teams
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Add new columns to tickets
ALTER TABLE public.tickets ADD COLUMN setup_level text;
ALTER TABLE public.tickets ADD COLUMN team text;
