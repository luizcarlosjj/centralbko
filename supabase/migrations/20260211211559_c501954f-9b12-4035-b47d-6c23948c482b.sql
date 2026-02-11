
-- 1. Add pause_started_at to tickets
ALTER TABLE public.tickets ADD COLUMN pause_started_at timestamptz;

-- 2. Create assignment_control table
CREATE TABLE public.assignment_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_assigned_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_control ENABLE ROW LEVEL SECURITY;
-- No direct access policies - only via SECURITY DEFINER trigger

-- Insert initial row
INSERT INTO public.assignment_control (id) VALUES (gen_random_uuid());

-- 3. Create pause_reasons table
CREATE TABLE public.pause_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pause_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pause reasons"
  ON public.pause_reasons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Supervisors can insert pause reasons"
  ON public.pause_reasons FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can update pause reasons"
  ON public.pause_reasons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

-- 4. Create pause_logs table
CREATE TABLE public.pause_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id),
  pause_reason_id uuid NOT NULL REFERENCES public.pause_reasons(id),
  description_text text,
  pause_started_at timestamptz NOT NULL DEFAULT now(),
  pause_ended_at timestamptz,
  paused_seconds integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL
);
ALTER TABLE public.pause_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pause logs"
  ON public.pause_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert pause logs"
  ON public.pause_logs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can update pause logs"
  ON public.pause_logs FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- 5. Create pause_evidences table
CREATE TABLE public.pause_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id),
  pause_log_id uuid NOT NULL REFERENCES public.pause_logs(id),
  file_url text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pause_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pause evidences"
  ON public.pause_evidences FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert pause evidences"
  ON public.pause_evidences FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- 6. Create storage bucket for pause evidences
INSERT INTO storage.buckets (id, name, public) VALUES ('pause-evidences', 'pause-evidences', true);

CREATE POLICY "Authenticated can upload pause evidences"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pause-evidences');

CREATE POLICY "Anyone can view pause evidences"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pause-evidences');

-- 7. Create auto_assign_ticket function (round-robin)
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_analysts uuid[];
  v_last_assigned uuid;
  v_next_analyst uuid;
  v_idx integer;
BEGIN
  -- Get all analysts ordered by user_id
  SELECT array_agg(ur.user_id ORDER BY ur.user_id)
  INTO v_analysts
  FROM public.user_roles ur
  WHERE ur.role = 'analyst';

  -- If no analysts, leave ticket unassigned
  IF v_analysts IS NULL OR array_length(v_analysts, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get last assigned user
  SELECT last_assigned_user_id INTO v_last_assigned
  FROM public.assignment_control
  LIMIT 1;

  -- Find next analyst in round-robin
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

  -- Update the ticket
  UPDATE public.tickets
  SET assigned_analyst_id = v_next_analyst,
      status = 'em_andamento',
      started_at = now()
  WHERE id = NEW.id;

  -- Update assignment control
  UPDATE public.assignment_control
  SET last_assigned_user_id = v_next_analyst,
      updated_at = now();

  RETURN NEW;
END;
$$;

-- 8. Create trigger
CREATE TRIGGER on_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_ticket();
