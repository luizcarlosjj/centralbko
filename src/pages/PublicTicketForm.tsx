import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Send, Headphones } from 'lucide-react';
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

    const id = crypto.randomUUID();

    const { error } = await supabase.from('tickets').insert({
      id,
      base_name: baseName,
      requester_name: requesterName,
      priority,
      type,
      description,
      status: 'nao_iniciado',
      total_execution_seconds: 0,
      total_paused_seconds: 0,
    } as any);

    setSubmitting(false);
    if (!error) {
      setTicketId(id);
    }
  };

  if (ticketId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #351B5A 0%, #201135 100%)' }}>
        <Card className="w-full max-w-md text-center shadow-xl border border-gray-200" style={{ backgroundColor: '#ffffff', color: '#333' }}>
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
              <CheckCircle className="h-8 w-8" style={{ color: '#22c55e' }} />
            </div>
            <CardTitle className="text-2xl" style={{ color: '#1a1a2e' }}>Chamado Criado!</CardTitle>
            <CardDescription style={{ color: '#666' }}>
              Seu chamado foi registrado com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#f3f4f6' }}>
              <p className="text-sm" style={{ color: '#888' }}>Número do chamado</p>
              <p className="mt-1 font-mono text-lg font-bold" style={{ color: '#1a1a2e' }}>{ticketId.slice(0, 8).toUpperCase()}</p>
            </div>
            <Button onClick={() => { setTicketId(null); setBaseName(''); setRequesterName(''); setPriority(''); setType(''); setDescription(''); }} className="w-full transition-all duration-200 hover:shadow-lg" style={{ backgroundColor: '#6D26C2', color: '#fff' }}>
              Abrir Novo Chamado
            </Button>
            <Link to="/login" className="block text-sm transition-colors" style={{ color: '#888' }}>
              Acessar painel →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #351B5A 0%, #201135 100%)' }}>
      <Card className="w-full max-w-lg shadow-xl border border-gray-200" style={{ backgroundColor: '#ffffff', color: '#333' }}>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(109,38,194,0.1)' }}>
              <Headphones className="h-5 w-5" style={{ color: '#6D26C2' }} />
            </div>
            <div>
              <CardTitle className="text-2xl" style={{ color: '#1a1a2e' }}>Abrir Chamado</CardTitle>
              <CardDescription style={{ color: '#666' }}>Preencha os dados para registrar um novo chamado</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseName" style={{ color: '#444' }}>Nome da Base</Label>
              <Input id="baseName" value={baseName} onChange={(e) => setBaseName(e.target.value)} required placeholder="Ex: Base São Paulo" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#333' }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requesterName" style={{ color: '#444' }}>Nome do Solicitante</Label>
              <Input id="requesterName" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required placeholder="Seu nome completo" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#333' }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#444' }}>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                  <SelectTrigger style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#333' }}><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#444' }}>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                  <SelectTrigger style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#333' }}><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" style={{ color: '#444' }}>Descrição</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Descreva o chamado em detalhes..." rows={4} style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#333' }} />
            </div>
            <Button type="submit" className="w-full transition-all duration-200 hover:shadow-lg" disabled={submitting || !priority || !type} style={{ backgroundColor: '#6D26C2', color: '#fff' }}>
              <Send className="mr-2 h-4 w-4" />
              {submitting ? 'Enviando...' : 'Enviar Chamado'}
            </Button>
            <Link to="/login" className="block text-center text-sm transition-colors" style={{ color: '#888' }}>
              Acessar painel →
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicTicketForm;
