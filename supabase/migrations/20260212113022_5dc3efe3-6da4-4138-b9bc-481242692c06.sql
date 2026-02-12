
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
  -- Get all analysts ordered by user_id
  SELECT array_agg(ur.user_id ORDER BY ur.user_id)
  INTO v_analysts
  FROM public.user_roles ur
  WHERE ur.role = 'analyst';

  -- If no analysts, leave ticket unassigned
  IF v_analysts IS NULL OR array_length(v_analysts, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get last assigned user and control row id
  SELECT id, last_assigned_user_id INTO v_control_id, v_last_assigned
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

  -- Update assignment control with WHERE clause
  UPDATE public.assignment_control
  SET last_assigned_user_id = v_next_analyst,
      updated_at = now()
  WHERE id = v_control_id;

  RETURN NEW;
END;
$function$;
