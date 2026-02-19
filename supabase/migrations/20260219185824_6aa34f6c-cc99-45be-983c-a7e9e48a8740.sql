
-- Add attachment_url column to tickets
ALTER TABLE public.tickets ADD COLUMN attachment_url text;

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', true);

-- Allow anyone to upload to ticket-attachments (public form uses anon)
CREATE POLICY "Anyone can upload ticket attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-attachments');

-- Allow anyone to view ticket attachments
CREATE POLICY "Anyone can view ticket attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-attachments');
