import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Paperclip, X, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Ticket, PauseLog } from '@/types/tickets';
import { calculateBusinessSeconds } from '@/lib/business-time';

interface ResolvePendencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  pauseLog: PauseLog;
  onResolved: () => void;
}

const ResolvePendencyDialog: React.FC<ResolvePendencyDialogProps> = ({
  open, onOpenChange, ticket, pauseLog, onResolved,
}) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const f = e.target.files?.[0];
    if (!f) { setFile(null); return; }
    if (f.size > 5 * 1024 * 1024) {
      setFileError('Arquivo muito grande. Máximo: 5MB');
      return;
    }
    if (!f.type.startsWith('image/')) {
      setFileError('Apenas imagens são permitidas.');
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!user || !description.trim() || !file) return;
    setSubmitting(true);

    try {
      // 1. Upload file
      const ext = file.name.split('.').pop()?.toLowerCase();
      const filePath = `${ticket.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('pause-responses')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('pause-responses').getPublicUrl(filePath);

      // 2. Insert pause_response
      const { data: responseData, error: responseError } = await supabase
        .from('pause_responses')
        .insert({
          pause_log_id: pauseLog.id,
          ticket_id: ticket.id,
          description_text: description.trim(),
          responded_by: user.id,
        } as any)
        .select('id')
        .single();
      if (responseError) throw responseError;

      // 3. Insert pause_response_file
      await supabase.from('pause_response_files').insert({
        pause_response_id: (responseData as any).id,
        file_url: urlData.publicUrl,
        uploaded_by: user.id,
      } as any);

      // 4. Close pause_log
      const now = new Date();
      const pausedSecs = calculateBusinessSeconds(new Date(pauseLog.pause_started_at), now);
      await supabase.from('pause_logs').update({
        pause_ended_at: now.toISOString(),
        paused_seconds: pausedSecs,
      } as any).eq('id', pauseLog.id);

      // 5. Update ticket: back to em_andamento
      const totalPausedSecs = (ticket.total_paused_seconds || 0) +
        (ticket.pause_started_at ? calculateBusinessSeconds(new Date(ticket.pause_started_at), now) : 0);

      await supabase.from('tickets').update({
        status: 'em_andamento',
        started_at: now.toISOString(),
        pause_started_at: null,
        total_paused_seconds: totalPausedSecs,
      } as any).eq('id', ticket.id);

      // 6. Insert status log
      await supabase.from('ticket_status_logs').insert({
        ticket_id: ticket.id,
        changed_by: user.id,
        old_status: 'pausado',
        new_status: 'em_andamento',
      });

      toast({ title: 'Pendência resolvida', description: 'O chamado foi retomado automaticamente.' });
      onResolved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao resolver pendência', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver Pendência</DialogTitle>
          <DialogDescription>
            Descreva a resolução e anexe uma imagem comprobatória.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva como a pendência foi resolvida..."
              rows={4}
              maxLength={2000}
            />
          </div>
          <div className="space-y-2">
            <Label>Imagem comprobatória *</Label>
            {!file ? (
              <div
                className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed p-3 transition-colors hover:border-primary/40 border-border bg-muted/30"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Clique para anexar imagem — máx 5MB</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border p-3 border-border bg-muted/10">
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !description.trim() || !file}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {submitting ? 'Enviando...' : 'Enviar Resposta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResolvePendencyDialog;
