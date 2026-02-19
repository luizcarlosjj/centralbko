
-- Migration 2: New tables, RLS, trigger, storage

-- pause_responses table
CREATE TABLE IF NOT EXISTS public.pause_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pause_log_id uuid NOT NULL REFERENCES public.pause_logs(id),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id),
  description_text text NOT NULL,
  responded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pause_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can insert pause responses"
  ON public.pause_responses FOR INSERT TO authenticated
  WITH CHECK (responded_by = auth.uid());
CREATE POLICY "Authenticated can view pause responses"
  ON public.pause_responses FOR SELECT TO authenticated USING (true);

-- pause_response_files table
CREATE TABLE IF NOT EXISTS public.pause_response_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pause_response_id uuid NOT NULL REFERENCES public.pause_responses(id),
  file_url text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pause_response_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can insert pause response files"
  ON public.pause_response_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Authenticated can view pause response files"
  ON public.pause_response_files FOR SELECT TO authenticated USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('pause-responses', 'pause-responses', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload pause response files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pause-responses');
CREATE POLICY "Anyone can view pause response files"
  ON storage.objects FOR SELECT USING (bucket_id = 'pause-responses');

-- Drop old ticket policies
DROP POLICY IF EXISTS "Anyone can insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "Analyst can view own and unassigned tickets" ON public.tickets;
DROP POLICY IF EXISTS "Analyst can update own tickets" ON public.tickets;

-- New ticket INSERT policy: only analysts (solicitantes)
CREATE POLICY "Analysts can insert tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'analyst'::app_role)
    AND requester_user_id = auth.uid()
  );

-- New ticket SELECT policy
CREATE POLICY "Role-based ticket visibility"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    OR (public.has_role(auth.uid(), 'backoffice'::app_role) AND assigned_analyst_id = auth.uid())
    OR (public.has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );

-- New ticket UPDATE policy
CREATE POLICY "Role-based ticket update"
  ON public.tickets FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    OR (public.has_role(auth.uid(), 'backoffice'::app_role) AND assigned_analyst_id = auth.uid())
    OR (public.has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );

-- Update pause_logs update policy to allow analysts to close pauses
DROP POLICY IF EXISTS "Authenticated can update pause logs" ON public.pause_logs;
CREATE POLICY "Authenticated can update pause logs"
  ON public.pause_logs FOR UPDATE TO authenticated USING (true);

-- Update auto_assign_ticket to use backoffice role
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_analysts uuid[];
  v_last_assigned uuid;
  v_next_analyst uuid;
  v_idx integer;
  v_control_id uuid;
BEGIN
  SELECT array_agg(ur.user_id ORDER BY ur.user_id)
  INTO v_analysts
  FROM public.user_roles ur
  WHERE ur.role = 'backoffice';

  IF v_analysts IS NULL OR array_length(v_analysts, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, last_assigned_user_id INTO v_control_id, v_last_assigned
  FROM public.assignment_control LIMIT 1;

  IF v_last_assigned IS NULL THEN
    v_next_analyst := v_analysts[1];
  ELSE
    v_idx := array_position(v_analysts, v_last_assigned);
    IF v_idx IS NULL OR v_idx >= array_length(v_analysts, 1) THEN
      v_next_analyst := v_analysts[1];
    ELSE
      v_next_analyst := v_analysts[v_idx + 1];
    END IF;
  END IF;

  UPDATE public.tickets
  SET assigned_analyst_id = v_next_analyst, status = 'em_andamento', started_at = now()
  WHERE id = NEW.id;

  UPDATE public.assignment_control
  SET last_assigned_user_id = v_next_analyst, updated_at = now()
  WHERE id = v_control_id;

  RETURN NEW;
END;
$function$;
