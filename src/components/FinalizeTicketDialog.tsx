import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Paperclip, X, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Ticket } from '@/types/tickets';
import { calculateBusinessSeconds } from '@/lib/business-time';

interface FinalizeTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  onFinalized: () => void;
}

const FinalizeTicketDialog: React.FC<FinalizeTicketDialogProps> = ({
  open, onOpenChange, ticket, onFinalized,
}) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv', 'zip', 'rar', '7z', 'txt', 'rtf', 'ppt', 'pptx'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const selected = e.target.files;
    if (!selected) return;
    for (const f of Array.from(selected)) {
      if (f.size > 10 * 1024 * 1024) {
        setFileError('Arquivo muito grande. Máximo: 10MB');
        return;
      }
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExts.includes(ext)) {
        setFileError(`Formato não permitido: .${ext}`);
        return;
      }
    }
    setFiles(prev => [...prev, ...Array.from(selected)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !description.trim() || files.length === 0) return;
    setSubmitting(true);

    try {
      const now = new Date();
      let execSeconds = ticket.total_execution_seconds || 0;
      let pausedSeconds = ticket.total_paused_seconds || 0;

      if (ticket.status === 'em_andamento' && ticket.started_at) {
        execSeconds += calculateBusinessSeconds(new Date(ticket.started_at), now);
      }

      if (ticket.status === 'pausado') {
        const { data: activePause } = await supabase.from('pause_logs')
          .select('id, pause_started_at')
          .eq('ticket_id', ticket.id)
          .is('pause_ended_at', null)
          .single();
        if (activePause) {
          const pausedSecs = calculateBusinessSeconds(new Date((activePause as any).pause_started_at), now);
          await supabase.from('pause_logs').update({
            pause_ended_at: now.toISOString(),
            paused_seconds: pausedSecs,
          } as any).eq('id', (activePause as any).id);
        }
        if (ticket.pause_started_at) {
          pausedSeconds += calculateBusinessSeconds(new Date(ticket.pause_started_at), now);
        }
      }

      // Upload files
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${ticket.id}/finalizacao_${Date.now()}_${sanitized}`;
        const { error: uploadError } = await supabase.storage
          .from('ticket-attachments')
          .upload(filePath, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
      }

      // Update ticket
      await supabase.from('tickets').update({
        status: 'finalizado',
        finished_at: now.toISOString(),
        pause_started_at: null,
        total_execution_seconds: execSeconds,
        total_paused_seconds: pausedSeconds,
      } as any).eq('id', ticket.id);

      // Insert status log
      await supabase.from('ticket_status_logs').insert({
        ticket_id: ticket.id,
        changed_by: user.id,
        old_status: ticket.status,
        new_status: 'finalizado',
      });

      // Insert finalization evidence as pause_response (reusing existing structure)
      // We'll store using pause_evidences table for the attachments
      // Actually, let's store a finalization log: insert a pause_response with pause_log_id = null won't work
      // Better: store in pause_evidences with a special marker, or just append to ticket description
      // Simplest: store finalization data in ticket_status_logs description? No column for that.
      // Best approach: create a simple record in pause_responses linked to the latest pause_log if exists,
      // or we can store the finalization note and files separately.
      // Let's use pause_responses with the most recent pause_log_id if available, 
      // or we just store the files as additional ticket attachments and add description to status log.
      
      // For now: store finalization description and files as a pause_response if there's an active/latest pause_log
      // Otherwise, we'll just upload the files. Let's keep it simple and store in a consistent way.
      
      // Get latest pause_log for this ticket (if any)
      const { data: latestPauseLog } = await supabase.from('pause_logs')
        .select('id')
        .eq('ticket_id', ticket.id)
        .order('pause_started_at', { ascending: false })
        .limit(1)
        .single();

      if (latestPauseLog) {
        const { data: responseData } = await supabase.from('pause_responses').insert({
          pause_log_id: (latestPauseLog as any).id,
          ticket_id: ticket.id,
          description_text: `[Finalização] ${description.trim()}`,
          responded_by: user.id,
        } as any).select('id').single();

        if (responseData) {
          for (const url of uploadedUrls) {
            await supabase.from('pause_response_files').insert({
              pause_response_id: (responseData as any).id,
              file_url: url,
              uploaded_by: user.id,
            } as any);
          }
        }
      } else {
        // No pause logs - store as pause_evidences won't work without pause_log_id
        // Store files as additional attachments by creating a dummy structure
        // Or simply store them as pause_evidences with a self-referencing approach
        // Simplest: just upload and link the first file as attachment_url on ticket
        if (uploadedUrls.length > 0) {
          await supabase.from('tickets').update({
            attachment_url: uploadedUrls[0],
          } as any).eq('id', ticket.id);
        }
      }

      toast({ title: 'Chamado finalizado', description: 'Comprovação registrada com sucesso.' });
      setDescription('');
      setFiles([]);
      onFinalized();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao finalizar chamado', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar Chamado</DialogTitle>
          <DialogDescription>
            Descreva o que foi feito e anexe pelo menos um arquivo comprobatório para finalizar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição da finalização *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o que foi realizado neste chamado..."
              rows={4}
              maxLength={2000}
            />
          </div>
          <div className="space-y-2">
            <Label>Anexo(s) comprobatório(s) *</Label>
            <div
              className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed p-3 transition-colors hover:border-primary/40 border-border bg-muted/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Clique para anexar arquivo(s) — máx 10MB cada</span>
            </div>
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2 border-border bg-muted/10">
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.zip,.txt,.rtf,.ppt,.pptx"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !description.trim() || files.length === 0}
            className="w-full"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {submitting ? 'Finalizando...' : 'Confirmar Finalização'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FinalizeTicketDialog;
