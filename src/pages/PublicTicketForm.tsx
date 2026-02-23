import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Paperclip, X, FileSpreadsheet, ArrowLeft, Headphones, Plus, FileText, FileArchive, File } from 'lucide-react';
import { PRIORITY_LABELS, TYPE_LABELS, type TicketPriority, type TicketType } from '@/types/tickets';
import { toast } from '@/hooks/use-toast';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.zip'];
const DANGEROUS_ZIP_EXTENSIONS = ['.exe', '.bat', '.cmd', '.msi', '.scr', '.pif', '.com', '.vbs', '.js', '.ws', '.wsf', '.ps1', '.sh'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 10;

const PublicTicketForm = () => {
  const navigate = useNavigate();
  const [baseName, setBaseName] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [type, setType] = useState<TicketType | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: requesters = [] } = useQuery({
    queryKey: ['public-requesters'],
    queryFn: async () => {
      const { data } = await supabase.from('requesters').select('id, name').eq('active', true).order('name');
      return (data || []) as { id: string; name: string }[];
    },
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
      // Security: check for dangerous file name patterns
      const nameLower = file.name.toLowerCase();
      if (DANGEROUS_ZIP_EXTENSIONS.some(d => nameLower.includes(d))) {
        setFileError(`Arquivo bloqueado por segurança: ${file.name}`);
        return;
      }
      // Security: validate MIME type consistency
      const validMimes: Record<string, string[]> = {
        '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        '.xls': ['application/vnd.ms-excel'],
        '.csv': ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
        '.pdf': ['application/pdf'],
        '.zip': ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
      };
      const expectedMimes = validMimes[ext] || [];
      if (file.type && expectedMimes.length > 0 && !expectedMimes.includes(file.type)) {
        setFileError(`Tipo de arquivo suspeito: ${file.name}. O conteúdo não corresponde à extensão.`);
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priority || !type || !requesterName || attachments.length === 0) return;
    setSubmitting(true);

    try {
      const filesData = await Promise.all(
        attachments.map(async (file) => ({
          base64: await fileToBase64(file),
          name: file.name,
          content_type: file.type,
        }))
      );

      const body = {
        base_name: baseName,
        requester_name: requesterName,
        priority,
        type,
        description,
        attachments: filesData,
      };

      const { data, error } = await supabase.functions.invoke('create-public-ticket', { body });

      if (error || data?.error) {
        toast({ title: 'Erro', description: data?.error || error?.message || 'Erro ao criar chamado', variant: 'destructive' });
      } else {
        toast({ title: 'Chamado criado!', description: `ID: ${(data.ticket_id || '').slice(0, 8).toUpperCase()}` });
        navigate('/login');
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(268,52%,14%)] via-[hsl(267,54%,23%)] to-[hsl(270,67%,45%)] p-4">
      <div className="w-full max-w-lg">
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Headphones className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Abrir Chamado</CardTitle>
            <CardDescription>Preencha os dados para registrar um novo chamado</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Solicitante <span className="text-destructive">*</span></Label>
                <Select value={requesterName} onValueChange={setRequesterName}>
                  <SelectTrigger><SelectValue placeholder="Selecione o solicitante" /></SelectTrigger>
                  <SelectContent>
                    {requesters.map(r => (
                      <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requesters.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum solicitante cadastrado. Peça ao supervisor para cadastrar.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseName">Nome da Base <span className="text-destructive">*</span></Label>
                <Input id="baseName" value={baseName} onChange={e => setBaseName(e.target.value)} required placeholder="Ex: Base São Paulo" maxLength={100} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade <span className="text-destructive">*</span></Label>
                  <Select value={priority} onValueChange={v => setPriority(v as TicketPriority)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo <span className="text-destructive">*</span></Label>
                  <Select value={type} onValueChange={v => setType(v as TicketType)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição <span className="text-destructive">*</span></Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} required placeholder="Descreva o chamado..." rows={4} maxLength={5000} />
              </div>
              <div className="space-y-2">
                <Label>Anexos <span className="text-destructive">*</span></Label>
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2 border-border">
                        {file.name.endsWith('.pdf') ? <FileText className="h-4 w-4 text-destructive shrink-0" /> :
                         file.name.endsWith('.zip') ? <FileArchive className="h-4 w-4 text-amber-500 shrink-0" /> :
                         <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />}
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
                        ? `Arquivos (.xlsx, .xls, .csv, .pdf, .zip) — máx ${MAX_FILE_SIZE_MB}MB cada`
                        : 'Adicionar mais arquivos'}
                    </span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.zip" onChange={handleFileChange} className="hidden" multiple />
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                <p className="text-xs text-muted-foreground">{attachments.length}/{MAX_FILES} arquivos</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !priority || !type || !requesterName || attachments.length === 0}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? 'Enviando...' : 'Enviar Chamado'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/login')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicTicketForm;
