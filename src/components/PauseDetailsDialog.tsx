import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Ticket } from '@/types/tickets';
import { FileImage, MessageSquare, Tag } from 'lucide-react';

interface PauseDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
}

const PauseDetailsDialog: React.FC<PauseDetailsDialogProps> = ({ open, onOpenChange, ticket }) => {
  const { data: pauseLogs = [], isLoading } = useQuery({
    queryKey: ['pause-details', ticket.id],
    enabled: open,
    queryFn: async () => {
      const { data: logs } = await supabase
        .from('pause_logs')
        .select('id, pause_reason_id, description_text, pause_started_at, pause_ended_at, paused_seconds')
        .eq('ticket_id', ticket.id)
        .order('pause_started_at', { ascending: false });

      if (!logs || logs.length === 0) return [];

      const reasonIds = [...new Set(logs.map(l => l.pause_reason_id))];
      const { data: reasons } = await supabase
        .from('pause_reasons')
        .select('id, title')
        .in('id', reasonIds);

      const logIds = logs.map(l => l.id);
      const { data: evidences } = await supabase
        .from('pause_evidences')
        .select('id, pause_log_id, file_url')
        .in('pause_log_id', logIds);

      const reasonMap = Object.fromEntries((reasons || []).map(r => [r.id, r.title]));
      const evidenceMap: Record<string, { id: string; file_url: string }[]> = {};
      (evidences || []).forEach(e => {
        if (!evidenceMap[e.pause_log_id]) evidenceMap[e.pause_log_id] = [];
        evidenceMap[e.pause_log_id].push(e);
      });

      return logs.map(l => ({
        ...l,
        reason_title: reasonMap[l.pause_reason_id] || 'Desconhecido',
        evidences: evidenceMap[l.id] || [],
      }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pausas — {ticket.id.slice(0, 8).toUpperCase()}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground py-4">Carregando...</p>}

        {!isLoading && pauseLogs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Nenhuma pausa registrada.</p>
        )}

        <div className="space-y-4">
          {pauseLogs.map((log, idx) => (
            <div key={log.id} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Pausa {pauseLogs.length - idx}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.pause_started_at).toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-warning" />
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  {log.reason_title}
                </Badge>
              </div>

              {log.description_text && (
                <div className="flex gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">{log.description_text}</p>
                </div>
              )}

              {log.evidences.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileImage className="h-3.5 w-3.5" />
                    <span>Anexos ({log.evidences.length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {log.evidences.map(ev => (
                      <a
                        key={ev.id}
                        href={ev.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                      >
                        <img
                          src={ev.file_url}
                          alt="Evidência"
                          className="w-full h-24 object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PauseDetailsDialog;
