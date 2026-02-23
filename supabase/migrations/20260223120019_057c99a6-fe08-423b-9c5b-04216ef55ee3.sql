
-- Create ticket_types table
CREATE TABLE public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active types
CREATE POLICY "Authenticated can view ticket types"
  ON public.ticket_types FOR SELECT
  USING (true);

-- Supervisors can insert
CREATE POLICY "Supervisors can insert ticket types"
  ON public.ticket_types FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

-- Supervisors can update
CREATE POLICY "Supervisors can update ticket types"
  ON public.ticket_types FOR UPDATE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Seed with existing types
INSERT INTO public.ticket_types (label, value, description, active, created_by) VALUES
  ('Setup Questionário', 'setup_questionario', 'Configuração de questionários', true, '2b9383d5-fc10-4d2e-9e38-1a9e88be1181'),
  ('Cliente', 'cliente', 'Solicitações de clientes', true, '2b9383d5-fc10-4d2e-9e38-1a9e88be1181'),
  ('Ajuste', 'ajuste', 'Ajustes e correções', true, '2b9383d5-fc10-4d2e-9e38-1a9e88be1181'),
  ('Outro', 'outro', 'Outros tipos', true, '2b9383d5-fc10-4d2e-9e38-1a9e88be1181');
