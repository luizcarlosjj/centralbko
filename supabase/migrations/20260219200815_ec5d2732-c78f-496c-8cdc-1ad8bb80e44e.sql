
-- Migration 1: Add backoffice enum value and requester_user_id column
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'backoffice';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS requester_user_id uuid REFERENCES public.profiles(id);
