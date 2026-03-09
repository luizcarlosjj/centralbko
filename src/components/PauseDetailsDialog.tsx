import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Ticket } from '@/types/tickets';
import { FileImage, MessageSquare, Tag, CheckCircle2, FileText, Download, Clock } from 'lucide-react';

interface PauseDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url.split('/').pop() || 'Arquivo');
    return decoded.replace(/^[0-9a-f]{8,}-/, '').replace(/^\d+-/, '');
  } catch {
    return 'Arquivo';
  }
}

function isImageUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif'].includes(ext);
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

      // Fetch pause responses (analyst resolution)
      const { data: responses } = await supabase
        .from('pause_responses')
        .select('id, pause_log_id, description_text, responded_by, created_at')
        .in('pause_log_id', logIds)
        .order('created_at', { ascending: true });

      // Fetch response files
      const responseIds = (responses || []).map(r => r.id);
      let responseFiles: { id: string; pause_response_id: string; file_url: string }[] = [];
      if (responseIds.length > 0) {
        const { data: files } = await supabase
          .from('pause_response_files')
          .select('id, pause_response_id, file_url')
          .in('pause_response_id', responseIds);
        responseFiles = files || [];
      }

      // Fetch responder names
      const responderIds = [...new Set((responses || []).map(r => r.responded_by))];
      let responderMap: Record<string, string> = {};
      if (responderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', responderIds);
        responderMap = Object.fromEntries((profiles || []).map(p => [p.id, p.name]));
      }

      const reasonMap = Object.fromEntries((reasons || []).map(r => [r.id, r.title]));
      const evidenceMap: Record<string, { id: string; file_url: string }[]> = {};
      (evidences || []).forEach(e => {
        if (!evidenceMap[e.pause_log_id]) evidenceMap[e.pause_log_id] = [];
        evidenceMap[e.pause_log_id].push(e);
      });

      const responseMap: Record<string, { id: string; description_text: string; responder_name: string; created_at: string; files: { id: string; file_url: string }[] }[]> = {};
      (responses || []).forEach(r => {
        if (!responseMap[r.pause_log_id]) responseMap[r.pause_log_id] = [];
        const files = responseFiles.filter(f => f.pause_response_id === r.id);
        responseMap[r.pause_log_id].push({
          id: r.id,
          description_text: r.description_text,
          responder_name: responderMap[r.responded_by] || 'Desconhecido',
          created_at: r.created_at,
          files,
        });
      });

      return logs.map(l => ({
        ...l,
        reason_title: reasonMap[l.pause_reason_id] || 'Desconhecido',
        evidences: evidenceMap[l.id] || [],
        responses: responseMap[l.id] || [],
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
                <div className="flex items-center gap-2">
                  {log.paused_seconds > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(log.paused_seconds)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.pause_started_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-warning" />
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  {log.reason_title}
                </Badge>
                {log.pause_ended_at && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                    Resolvida
                  </Badge>
                )}
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
                    <span>Anexos da pausa ({log.evidences.length})</span>
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

              {/* Respostas do analista */}
              {log.responses.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Resposta do Solicitante</span>
                    </div>
                    {log.responses.map(resp => (
                      <div key={resp.id} className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{resp.responder_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(resp.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{resp.description_text}</p>

                        {resp.files.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {resp.files.map(f => (
                              <a
                                key={f.id}
                                href={f.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-md border border-border bg-background hover:bg-muted/50 transition-colors group"
                              >
                                {isImageUrl(f.file_url) ? (
                                  <img src={f.file_url} alt="Evidência" className="h-10 w-10 rounded object-cover shrink-0" loading="lazy" />
                                ) : (
                                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="text-xs truncate flex-1">{getFileName(f.file_url)}</span>
                                <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PauseDetailsDialog;
