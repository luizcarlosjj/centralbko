import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Send, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRIORITY_LABELS, TYPE_LABELS, type TicketPriority, type TicketType } from '@/types/tickets';

const PublicTicketForm = () => {
  const [baseName, setBaseName] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [type, setType] = useState<TicketType | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priority || !type) return;
    setSubmitting(true);

    const { data, error } = await supabase.from('tickets').insert({
      base_name: baseName,
      requester_name: requesterName,
      priority,
      type,
      description,
      status: 'nao_iniciado',
      total_execution_seconds: 0,
      total_paused_seconds: 0,
    }).select('id').single();

    setSubmitting(false);
    if (!error && data) {
      setTicketId(data.id);
    }
  };

  if (ticketId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">Chamado Criado!</CardTitle>
            <CardDescription>
              Seu chamado foi registrado com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Número do chamado</p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground">{ticketId.slice(0, 8).toUpperCase()}</p>
            </div>
            <Button onClick={() => { setTicketId(null); setBaseName(''); setRequesterName(''); setPriority(''); setType(''); setDescription(''); }} className="w-full">
              Abrir Novo Chamado
            </Button>
            <Link to="/login" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
              Acessar painel →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Abrir Chamado</CardTitle>
          <CardDescription>Preencha os dados para registrar um novo chamado</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseName">Nome da Base</Label>
              <Input id="baseName" value={baseName} onChange={(e) => setBaseName(e.target.value)} required placeholder="Ex: Base São Paulo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requesterName">Nome do Solicitante</Label>
              <Input id="requesterName" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required placeholder="Seu nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Descreva o chamado em detalhes..." rows={4} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !priority || !type}>
              <Send className="mr-2 h-4 w-4" />
              {submitting ? 'Enviando...' : 'Enviar Chamado'}
            </Button>
            <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-primary transition-colors">
              Acessar painel →
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicTicketForm;
