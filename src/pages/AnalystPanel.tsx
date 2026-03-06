import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp, FileSpreadsheet, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Ticket, PRIORITY_LABELS, STATUS_LABELS, Profile, PauseLog } from '@/types/tickets';
import LiveTimer from '@/components/LiveTimer';
import ResolvePendencyDialog from '@/components/ResolvePendencyDialog';

const TICKET_COLUMNS = 'id, base_name, requester_name, priority, type, status, total_execution_seconds, total_paused_seconds, created_at, started_at, finished_at, pause_started_at, assigned_analyst_id, attachment_url, requester_user_id, description';

const priorityColor: Record<string, string> = {
  baixa: 'bg-info/10 text-info border-info/20',
  media: 'bg-warning/10 text-warning border-warning/20',
  alta: 'bg-destructive/10 text-destructive border-destructive/20',
  urgente: 'bg-destructive text-destructive-foreground',
};

const statusColor: Record<string, string> = {
  em_andamento: 'bg-primary/10 text-primary border-primary/20',
  pausado: 'bg-warning/10 text-warning border-warning/20',
  finalizado: 'bg-success/10 text-success border-success/20',
};

const PAGE_SIZE = 20;

const AnalystPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendencyTicket, setPendencyTicket] = useState<Ticket | null>(null);
  const [activePauseLog, setActivePauseLog] = useState<PauseLog | null>(null);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pauseLogs, setPauseLogs] = useState<Record<string, PauseLog[]>>({});
  const [pauseReasonNames, setPauseReasonNames] = useState<Record<string, string>>({});

  // Fetch backoffice profiles for displaying names
  const { data: profiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name');
      return (data || []) as Profile[];
    },
    staleTime: 60_000,
  });

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['analyst-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const getTypeLabel = (value: string) => ticketTypes.find(t => t.value === value)?.label || value;

  const getProfileName = (id: string | null) => {
    if (!id) return 'Não atribuído';
    return profiles.find(p => p.id === id)?.name || id.slice(0, 8);
  };

  // Não Iniciados
  const { data: notStartedData } = useQuery({
    queryKey: ['analyst-not-started', user?.id],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('requester_user_id', user.id)
        .eq('status', 'nao_iniciado')
        .order('created_at', { ascending: false });
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Em Tratamento
  const { data: inProgressData } = useQuery({
    queryKey: ['analyst-in-progress', user?.id],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('requester_user_id', user.id)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false });
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Finalizados
  const { data: finishedData } = useQuery({
    queryKey: ['analyst-finished', user?.id],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('requester_user_id', user.id)
        .eq('status', 'finalizado')
        .order('finished_at', { ascending: false });
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Pendentes (pausados)
  const { data: pendingData } = useQuery({
    queryKey: ['analyst-pending', user?.id],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('requester_user_id', user.id)
        .eq('status', 'pausado')
        .order('pause_started_at', { ascending: false });
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Pause logs for pending tickets
  const [pauseDetails, setPauseDetails] = useState<Record<string, { log: PauseLog; reason_title: string; evidences: string[] }>>({});

  const fetchPauseDetails = useCallback(async (tickets: Ticket[]) => {
    for (const ticket of tickets) {
      if (pauseDetails[ticket.id]) continue;
      const { data: logs } = await supabase
        .from('pause_logs')
        .select('id, ticket_id, pause_reason_id, description_text, pause_started_at, pause_ended_at, paused_seconds, created_by')
        .eq('ticket_id', ticket.id)
        .is('pause_ended_at', null)
        .limit(1);
      
      if (logs && logs.length > 0) {
        const log = logs[0] as unknown as PauseLog;
        const { data: reason } = await supabase.from('pause_reasons').select('title').eq('id', log.pause_reason_id).single();
        const { data: evidences } = await supabase.from('pause_evidences').select('file_url').eq('pause_log_id', log.id);
        
        setPauseDetails(prev => ({
          ...prev,
          [ticket.id]: {
            log,
            reason_title: (reason as any)?.title || 'Motivo não encontrado',
            evidences: (evidences || []).map((e: any) => e.file_url),
          }
        }));
      }
    }
  }, [pauseDetails]);

  useEffect(() => {
    if (pendingData?.tickets.length) {
      fetchPauseDetails(pendingData.tickets);
    }
  }, [pendingData?.tickets]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analyst-in-progress'] });
    queryClient.invalidateQueries({ queryKey: ['analyst-finished'] });
    queryClient.invalidateQueries({ queryKey: ['analyst-pending'] });
    setPauseDetails({});
  }, [queryClient]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('analyst-panel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        invalidateAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [invalidateAll]);

  const inProgressTickets = inProgressData?.tickets || [];
  const finishedTickets = finishedData?.tickets || [];
  const pendingTickets = pendingData?.tickets || [];

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleExpand = async (ticketId: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticketId)) {
      next.delete(ticketId);
    } else {
      next.add(ticketId);
      if (!pauseLogs[ticketId]) {
        const { data } = await supabase.from('pause_logs').select('id, ticket_id, pause_reason_id, description_text, pause_started_at, pause_ended_at, paused_seconds, created_by').eq('ticket_id', ticketId).order('pause_started_at', { ascending: false });
        if (data) {
          const logs = data as unknown as PauseLog[];
          setPauseLogs(prev => ({ ...prev, [ticketId]: logs }));
          const reasonIds = [...new Set(logs.map(l => l.pause_reason_id))].filter(id => !pauseReasonNames[id]);
          if (reasonIds.length > 0) {
            const { data: reasons } = await supabase.from('pause_reasons').select('id, title').in('id', reasonIds);
            if (reasons) {
              setPauseReasonNames(prev => ({ ...prev, ...Object.fromEntries(reasons.map(r => [r.id, r.title])) }));
            }
          }
        }
      }
    }
    setExpandedRows(next);
  };

  const handleResolvePendency = async (ticket: Ticket) => {
    const detail = pauseDetails[ticket.id];
    if (detail) {
      setActivePauseLog(detail.log);
      setPendencyTicket(ticket);
    }
  };

  const renderExpandedDetails = (ticket: Ticket, colSpan: number) => (
    expandedRows.has(ticket.id) && (
      <TableRow>
        <TableCell colSpan={colSpan} className="bg-muted/30 p-4">
          {ticket.description && (
            <div className="mb-3">
              <p className="text-sm font-medium mb-1">Descrição</p>
              <p className="text-xs text-muted-foreground bg-background rounded p-2 border">{ticket.description}</p>
            </div>
          )}
          <p className="text-sm font-medium mb-2">Histórico de Pausas</p>
          {(pauseLogs[ticket.id] || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma pausa registrada</p>
          ) : (
            <div className="space-y-2">
              {(pauseLogs[ticket.id] || []).map(log => (
                <div key={log.id} className="text-xs border rounded p-2 bg-background">
                  <div className="flex justify-between">
                    <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                    <span>Duração: {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}</span>
                  </div>
                  {pauseReasonNames[log.pause_reason_id] && (
                    <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge></p>
                  )}
                  {log.description_text && <p className="mt-1 text-muted-foreground">{log.description_text}</p>}
                </div>
              ))}
            </div>
          )}
        </TableCell>
      </TableRow>
    )
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Meus Chamados</h1>

        <Tabs defaultValue="in_progress" className="w-full">
          <TabsList>
            <TabsTrigger value="in_progress">Em Tratamento ({inProgressTickets.length})</TabsTrigger>
            <TabsTrigger value="pending">
              Pendentes ({pendingTickets.length})
              {pendingTickets.length > 0 && <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-destructive animate-pulse" />}
            </TabsTrigger>
            <TabsTrigger value="finished">Finalizados ({finishedTickets.length})</TabsTrigger>
          </TabsList>

          {/* Em Tratamento */}
          <TabsContent value="in_progress">
            <Card>
              <CardContent className="pt-6">
                {inProgressTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado em tratamento</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Tempo</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inProgressTickets.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{getTypeLabel(ticket.type)}</TableCell>
                            <TableCell className="text-sm">{getProfileName(ticket.assigned_analyst_id)}</TableCell>
                            <TableCell><LiveTimer ticket={ticket} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          </TableRow>
                          {renderExpandedDetails(ticket, 8)}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pendentes */}
          <TabsContent value="pending">
            <div className="space-y-4">
              {pendingTickets.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-sm text-muted-foreground text-center">Nenhuma pendência</p>
                  </CardContent>
                </Card>
              ) : (
                pendingTickets.map(ticket => {
                  const detail = pauseDetails[ticket.id];
                  return (
                    <Card key={ticket.id} className="border-warning/30">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">
                            <span className="font-mono">{ticket.id.slice(0, 8).toUpperCase()}</span> — {ticket.base_name}
                          </CardTitle>
                          <Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {ticket.description && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Descrição do chamado:</span>
                            <p className="mt-1 bg-muted/30 rounded p-2">{ticket.description}</p>
                          </div>
                        )}
                        {detail ? (
                          <>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Motivo:</span>
                                <p className="font-medium">{detail.reason_title}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Pausado por:</span>
                                <p className="font-medium">{getProfileName(detail.log.created_by)}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Data da pausa:</span>
                                <p className="font-medium">{new Date(detail.log.pause_started_at).toLocaleString('pt-BR')}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Responsável:</span>
                                <p className="font-medium">{getProfileName(ticket.assigned_analyst_id)}</p>
                              </div>
                            </div>
                            {detail.log.description_text && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Descrição da pausa:</span>
                                <p className="mt-1 bg-muted/30 rounded p-2">{detail.log.description_text}</p>
                              </div>
                            )}
                            {detail.evidences.length > 0 && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Evidências:</span>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  {detail.evidences.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                      <ImageIcon className="h-3 w-3" /> Evidência {i + 1}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">Carregando detalhes...</p>
                        )}
                        <Button size="sm" className="w-full" onClick={() => handleResolvePendency(ticket)}>
                          <AlertCircle className="mr-1 h-3 w-3" /> Resolver Pendência
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Finalizados */}
          <TabsContent value="finished">
            <Card>
              <CardContent className="pt-6">
                {finishedTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado finalizado</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Execução</TableHead>
                        <TableHead>Finalizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finishedTickets.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{getTypeLabel(ticket.type)}</TableCell>
                            <TableCell className="text-sm">{getProfileName(ticket.assigned_analyst_id)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_execution_seconds || 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {ticket.finished_at ? `${new Date(ticket.finished_at).toLocaleDateString('pt-BR')} ${new Date(ticket.finished_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '-'}
                            </TableCell>
                          </TableRow>
                          {renderExpandedDetails(ticket, 8)}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {pendencyTicket && activePauseLog && (
        <ResolvePendencyDialog
          open={!!pendencyTicket}
          onOpenChange={(open) => { if (!open) { setPendencyTicket(null); setActivePauseLog(null); } }}
          ticket={pendencyTicket}
          pauseLog={activePauseLog}
          onResolved={invalidateAll}
        />
      )}
    </AppLayout>
  );
};

export default AnalystPanel;
