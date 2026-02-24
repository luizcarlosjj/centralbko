import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowLeft, Headphones, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { calculateBusinessSeconds } from '@/lib/business-time';
import { STATUS_LABELS, type TicketStatus } from '@/types/tickets';

interface PublicTicket {
  id: string;
  base_name: string;
  status: string;
  analyst_name: string;
  created_at: string;
  started_at: string | null;
  total_execution_seconds: number;
  total_paused_seconds: number;
  finished_at: string | null;
  pause_started_at: string | null;
}

const STATUS_BADGE_VARIANT: Record<string, string> = {
  em_andamento: 'default',
  pausado: 'warning',
  finalizado: 'success',
  nao_iniciado: 'secondary',
};

function getBusinessTime(ticket: PublicTicket): string {
  if (ticket.status === 'finalizado') {
    return formatSeconds(ticket.total_execution_seconds);
  }
  if (!ticket.started_at) return '—';

  const startedAt = new Date(ticket.started_at);
  const now = new Date();
  const totalElapsed = calculateBusinessSeconds(startedAt, now);
  const netSeconds = Math.max(0, totalElapsed - ticket.total_paused_seconds);

  // If paused, subtract current pause duration
  if (ticket.status === 'pausado' && ticket.pause_started_at) {
    const pauseStart = new Date(ticket.pause_started_at);
    const currentPause = calculateBusinessSeconds(pauseStart, now);
    return formatSeconds(Math.max(0, netSeconds - currentPause));
  }

  return formatSeconds(netSeconds);
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return '< 1min';
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_BADGE_VARIANT[status] || 'secondary';
  const label = STATUS_LABELS[status as TicketStatus] || status;
  return (
    <Badge
      variant={variant as any}
      className={
        variant === 'warning'
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          : variant === 'success'
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          : ''
      }
    >
      {label}
    </Badge>
  );
}

const PublicTracking = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedRequester, setSelectedRequester] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [queryRequester, setQueryRequester] = useState('');

  const { data: requesters = [] } = useQuery({
    queryKey: ['public-requesters'],
    queryFn: async () => {
      const { data } = await supabase.from('requesters').select('id, name').eq('active', true).order('name');
      return (data || []) as { id: string; name: string }[];
    },
  });

  const { data: ticketsData, isLoading: loadingTickets, refetch } = useQuery({
    queryKey: ['public-tickets', queryRequester, page],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-public-tickets', {
        body: { requester_name: queryRequester, page },
      });
      if (error) throw error;
      return data as { tickets: PublicTicket[]; total_count: number };
    },
    enabled: !!queryRequester && modalOpen,
  });

  const tickets = ticketsData?.tickets || [];
  const totalCount = ticketsData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const handleConsultar = () => {
    if (!selectedRequester) return;
    setQueryRequester(selectedRequester);
    setPage(0);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(268,52%,14%)] via-[hsl(267,54%,23%)] to-[hsl(270,67%,45%)] p-4">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Headphones className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Acompanhar Chamados</CardTitle>
            <CardDescription>Selecione o solicitante para consultar os chamados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Select value={selectedRequester} onValueChange={setSelectedRequester}>
                <SelectTrigger><SelectValue placeholder="Selecione o solicitante" /></SelectTrigger>
                <SelectContent>
                  {requesters.map(r => (
                    <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleConsultar} disabled={!selectedRequester}>
              <Search className="mr-2 h-4 w-4" />
              Consultar Chamados
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={isMobile ? 'max-w-[95vw] max-h-[90vh] overflow-y-auto' : 'max-w-[90vw] max-h-[85vh] overflow-y-auto'}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>Chamados — {queryRequester}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingTickets}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingTickets ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </DialogTitle>
          </DialogHeader>

          {loadingTickets ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Carregando...</div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum chamado encontrado para este solicitante.
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {tickets.map(t => (
                <Card key={t.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">{t.id.slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">Base:</span> {t.base_name}</div>
                    <div><span className="text-muted-foreground">Responsável:</span> {t.analyst_name}</div>
                    <div><span className="text-muted-foreground">Tempo Útil:</span> {getBusinessTime(t)}</div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Tempo Útil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map(t => (
                  <TableRow key={t.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">{t.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell>{t.base_name}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell>{t.analyst_name}</TableCell>
                    <TableCell>{getBusinessTime(t)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {totalCount} chamado{totalCount !== 1 ? 's' : ''} — Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicTracking;
