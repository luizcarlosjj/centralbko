import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Paperclip, X, FileSpreadsheet, Plus } from 'lucide-react';
import { PRIORITY_LABELS, COMPLEXITY_LABELS, type TicketPriority, type TicketComplexity } from '@/types/tickets';
import { toast } from '@/hooks/use-toast';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.zip', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif', '.rar', '.7z'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 10;

const NewTicket = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [baseName, setBaseName] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [complexity, setComplexity] = useState<TicketComplexity | ''>('');
  const [type, setType] = useState('');
  const [setupLevel, setSetupLevel] = useState('');
  const [team, setTeam] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['new-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const { data: setupLevels = [] } = useQuery({
    queryKey: ['new-ticket-setup-levels'],
    queryFn: async () => {
      const { data } = await supabase.from('setup_levels').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['new-ticket-teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFileError(`Formato não permitido: ${file.name}. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`Arquivo muito grande: ${file.name}. Máximo: ${MAX_FILE_SIZE_MB}MB`);
        return;
      }
    }

    setAttachments(prev => {
      const combined = [...prev, ...files];
      if (combined.length > MAX_FILES) {
        setFileError(`Máximo de ${MAX_FILES} arquivos permitidos.`);
        return prev;
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setFileError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priority || !type || !setupLevel || !team || !complexity || !user || !profile || attachments.length === 0) return;
    setSubmitting(true);

    const id = crypto.randomUUID();
    const uploadedUrls: string[] = [];

    for (const file of attachments) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const filePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) {
        setSubmitting(false);
        setFileError(`Erro ao enviar ${file.name}.`);
        return;
      }
      const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
      uploadedUrls.push(urlData.publicUrl);
    }

    const attachmentUrl = JSON.stringify(uploadedUrls);

    const { error } = await supabase.from('tickets').insert({
      id,
      base_name: baseName,
      requester_name: profile.name,
      requester_user_id: user.id,
      priority,
      complexity,
      type,
      setup_level: setupLevel,
      team,
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
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {ticketTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Complexidade <span className="text-destructive">*</span></Label>
                <Select value={complexity} onValueChange={v => setComplexity(v as TicketComplexity)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMPLEXITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nível do Setup <span className="text-destructive">*</span></Label>
                  <Select value={setupLevel} onValueChange={setSetupLevel}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {setupLevels.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Time <span className="text-destructive">*</span></Label>
                  <Select value={team} onValueChange={setTeam}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} required placeholder="Descreva o chamado..." rows={4} maxLength={5000} />
              </div>
              <div className="space-y-2">
                <Label>Planilhas <span className="text-destructive">*</span></Label>
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border p-2 border-border">
                        <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm truncate flex-1">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                        <button type="button" onClick={() => removeFile(i)}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {attachments.length < MAX_FILES && (
                  <div
                    className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed p-3 border-border bg-muted/30 hover:border-primary/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {attachments.length === 0 ? (
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {attachments.length === 0
                        ? `Planilha (.xlsx, .xls, .csv) — máx ${MAX_FILE_SIZE_MB}MB cada`
                        : 'Adicionar mais arquivos'}
                    </span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.zip,.doc,.docx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.tif,.rar,.7z" onChange={handleFileChange} className="hidden" multiple />
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                <p className="text-xs text-muted-foreground">{attachments.length}/{MAX_FILES} arquivos</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !priority || !type || !setupLevel || !team || attachments.length === 0}>
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
