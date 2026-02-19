import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Paperclip, X, FileSpreadsheet } from 'lucide-react';
import { PRIORITY_LABELS, TYPE_LABELS, type TicketPriority, type TicketType } from '@/types/tickets';
import { toast } from '@/hooks/use-toast';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const NewTicket = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [baseName, setBaseName] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [type, setType] = useState<TicketType | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const file = e.target.files?.[0];
    if (!file) { setAttachment(null); return; }
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`Formato não permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`Arquivo muito grande. Máximo: ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setAttachment(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priority || !type || !user || !profile || !attachment) return;
    setSubmitting(true);

    const id = crypto.randomUUID();
    let attachmentUrl: string | null = null;

    if (attachment) {
      const ext = attachment.name.split('.').pop()?.toLowerCase();
      const filePath = `${id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(filePath, attachment, { contentType: attachment.type });
      if (uploadError) {
        setSubmitting(false);
        setFileError('Erro ao enviar arquivo.');
        return;
      }
      const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
      attachmentUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from('tickets').insert({
      id,
      base_name: baseName,
      requester_name: profile.name,
      requester_user_id: user.id,
      priority,
      type,
      description,
      attachment_url: attachmentUrl,
    } as any);

    setSubmitting(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Chamado criado!', description: `ID: ${id.slice(0, 8).toUpperCase()}` });
      navigate('/dashboard');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Abrir Chamado</CardTitle>
            <CardDescription>Preencha os dados para registrar um novo chamado</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Solicitante</Label>
                <Input value={profile?.name || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseName">Nome da Base</Label>
                <Input id="baseName" value={baseName} onChange={e => setBaseName(e.target.value)} required placeholder="Ex: Base São Paulo" maxLength={100} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={priority} onValueChange={v => setPriority(v as TicketPriority)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={v => setType(v as TicketType)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} required placeholder="Descreva o chamado..." rows={4} maxLength={5000} />
              </div>
              <div className="space-y-2">
                <Label>Planilha <span className="text-destructive">*</span></Label>
                {!attachment ? (
                  <div className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed p-3 border-border bg-muted/30 hover:border-primary/40 transition-colors" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Planilha (.xlsx, .xls, .csv) — máx {MAX_FILE_SIZE_MB}MB</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3 border-border">
                    <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{attachment.name}</span>
                    <button type="button" onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !priority || !type || !attachment}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? 'Enviando...' : 'Enviar Chamado'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default NewTicket;
