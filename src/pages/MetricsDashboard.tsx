import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Ticket, PRIORITY_LABELS, TYPE_LABELS, Profile } from '@/types/tickets';
import { ClipboardList, Clock, CheckCircle, PlayCircle } from 'lucide-react';

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(199, 89%, 48%)'];

const MetricsDashboard = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [analysts, setAnalysts] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [ticketsRes, analystsRes] = await Promise.all([
        supabase.from('tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);
      if (ticketsRes.data) setTickets(ticketsRes.data);
      if (analystsRes.data) setAnalysts(analystsRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const total = tickets.length;
  const inProgress = tickets.filter(t => t.status === 'em_andamento').length;
  const finished = tickets.filter(t => t.status === 'finalizado').length;
  const finishedTickets = tickets.filter(t => t.status === 'finalizado');
  const avgTime = finished > 0
    ? Math.round(finishedTickets.reduce((a, t) => a + (t.total_execution_seconds || 0), 0) / finished)
    : 0;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // By priority
  const byPriority = Object.entries(PRIORITY_LABELS).map(([key, label]) => ({
    name: label,
    value: tickets.filter(t => t.priority === key).length,
  }));

  // By type
  const byType = Object.entries(TYPE_LABELS).map(([key, label]) => ({
    name: label,
    value: tickets.filter(t => t.type === key).length,
  }));

  // By analyst
  const byAnalyst = analysts.map(a => ({
    name: a.name,
    total: tickets.filter(t => t.assigned_analyst_id === a.id).length,
    finalizados: tickets.filter(t => t.assigned_analyst_id === a.id && t.status === 'finalizado').length,
    tempoMedio: (() => {
      const at = finishedTickets.filter(t => t.assigned_analyst_id === a.id);
      return at.length > 0 ? Math.round(at.reduce((s, t) => s + (t.total_execution_seconds || 0), 0) / at.length) : 0;
    })(),
  }));

  // Timeline: tickets per day (last 30 days)
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const dailyMap = new Map<string, number>();
  tickets
    .filter(t => new Date(t.created_at) >= last30)
    .forEach(t => {
      const day = new Date(t.created_at).toLocaleDateString('pt-BR');
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    });
  const timeline = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, chamados: count })).reverse();

  // Ranking productivity
  const ranking = [...byAnalyst].sort((a, b) => b.finalizados - a.finalizados);

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard de Métricas</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{total}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle>
              <PlayCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{inProgress}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Finalizados</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-success">{finished}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{formatTime(avgTime)}</p></CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* By Priority */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Chamados por Prioridade</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* By Type */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Chamados por Tipo</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* By Analyst */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Chamados por Analista</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byAnalyst}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="hsl(221, 83%, 53%)" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="finalizados" fill="hsl(142, 71%, 45%)" name="Finalizados" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Evolução por Período</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="chamados" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Ranking */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Ranking de Produtividade</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ranking.map((a, i) => (
                <div key={a.name} className="flex items-center gap-4 rounded-lg border p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.finalizados} finalizados · {a.total} total · Tempo médio: {formatTime(a.tempoMedio)}
                    </p>
                  </div>
                </div>
              ))}
              {ranking.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum analista encontrado</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default MetricsDashboard;
