
CREATE POLICY "Supervisors can delete tickets"
  ON public.tickets FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete ticket_status_logs"
  ON public.ticket_status_logs FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_logs"
  ON public.pause_logs FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_evidences"
  ON public.pause_evidences FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_responses"
  ON public.pause_responses FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_response_files"
  ON public.pause_response_files FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));
