-- Clean all ticket-related data, keep users/profiles/roles intact
DELETE FROM public.pause_response_files;
DELETE FROM public.pause_responses;
DELETE FROM public.pause_evidences;
DELETE FROM public.pause_logs;
DELETE FROM public.ticket_status_logs;
DELETE FROM public.tickets;
UPDATE public.assignment_control SET last_assigned_user_id = NULL, updated_at = now();