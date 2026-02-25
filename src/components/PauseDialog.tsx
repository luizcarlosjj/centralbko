import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Upload, X } from 'lucide-react';
import { Ticket, PauseReason } from '@/types/tickets';
import { toast } from '@/hooks/use-toast';
import { compressImage, formatFileSize, CompressionResult } from '@/lib/image-compression';

interface PauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  onPaused: () => void;
}

const PauseDialog: React.FC<PauseDialogProps> = ({ open, onOpenChange, ticket, onPaused }) => {
  const { user } = useAuth();
  const [reasons, setReasons] = useState<PauseReason[]>([]);
  const [selectedReason, setSelectedReason] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from('pause_reasons').select('id, title').eq('active', true).order('title')
        .then(({ data }) => { if (data) setReasons(data as unknown as PauseReason[]); });
      setSelectedReason('');
      setDescriptionText('');
      setFiles([]);
      setCompressionInfo([]);
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);

    for (const file of newFiles) {
      try {
        const result = await compressImage(file);
        setFiles(prev => [...prev, result.file]);
        setCompressionInfo(prev => [...prev, result]);
      } catch (err: any) {
        toast({ title: 'Erro no arquivo', description: err.message, variant: 'destructive' });
      }
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setCompressionInfo(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = selectedReason && descriptionText.trim() && files.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const lastActiveStart = ticket.started_at;
      let newExecSeconds = ticket.total_execution_seconds || 0;
      if (lastActiveStart) {
        const elapsed = Math.floor((now.getTime() - new Date(lastActiveStart).getTime()) / 1000);
        newExecSeconds += elapsed;
      }

      const { data: pauseLog, error: logError } = await supabase.from('pause_logs').insert({
        ticket_id: ticket.id,
        pause_reason_id: selectedReason,
        description_text: descriptionText,
        created_by: user.id,
      } as any).select().single();

      if (logError) throw logError;

      const pauseLogId = (pauseLog as any).id;

      for (const file of files) {
        const sanitizedName = file.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `tickets/${ticket.id}/pauses/${pauseLogId}/${Date.now()}_${sanitizedName}`;
        const { error: uploadError } = await supabase.storage.from('pause-evidences').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('pause-evidences').getPublicUrl(filePath);

        await supabase.from('pause_evidences').insert({
          ticket_id: ticket.id,
          pause_log_id: pauseLogId,
          file_url: urlData.publicUrl,
          uploaded_by: user.id,
        } as any);
      }

      await supabase.from('tickets').update({
        status: 'pausado',
        pause_started_at: now.toISOString(),
        total_execution_seconds: newExecSeconds,
      } as any).eq('id', ticket.id);

      await supabase.from('ticket_status_logs').insert({
        ticket_id: ticket.id,
        changed_by: user.id,
        old_status: 'em_andamento',
        new_status: 'pausado',
      });

      toast({ title: 'Chamado pausado com sucesso' });
      onOpenChange(false);
      onPaused();
    } catch (err: any) {
      toast({ title: 'Erro ao pausar', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar Chamado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo da Pausa *</Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>
                {reasons.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Textarea
              value={descriptionText}
              onChange={e => setDescriptionText(e.target.value)}
              placeholder="Descreva o motivo da pausa..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Comprovação (imagem/print) *</Label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
                <Upload className="h-4 w-4" />
                Anexar arquivo
                <Input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
              </label>
            </div>
            {files.length > 0 && (
              <div className="space-y-1 mt-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate flex-1">{f.name}</span>
                    {compressionInfo[i] && compressionInfo[i].originalSize !== compressionInfo[i].compressedSize && (
                      <span className="text-xs text-success whitespace-nowrap">
                        {formatFileSize(compressionInfo[i].originalSize)} → {formatFileSize(compressionInfo[i].compressedSize)}
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Pausando...' : 'Confirmar Pausa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PauseDialog;
