import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Paperclip, X, Save, FileSpreadsheet, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Ticket, PRIORITY_LABELS, TicketPriority } from '@/types/tickets';

interface EditTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  onSaved: () => void;
}

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.zip', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif', '.rar', '.7z'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 10;

function parseExistingUrls(attachmentUrl: string | null): string[] {
  if (!attachmentUrl) return [];
  try {
    const parsed = JSON.parse(attachmentUrl);
    return Array.isArray(parsed) ? parsed : [attachmentUrl];
  } catch {
    return attachmentUrl ? [attachmentUrl] : [];
  }
}

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url.split('/').pop() || 'Arquivo');
    return decoded.replace(/^[0-9a-f]{8,}-/, '').replace(/^\d+-/, '');
  } catch {
    return 'Arquivo';
  }
}

const EditTicketDialog: React.FC<EditTicketDialogProps> = ({ open, onOpenChange, ticket, onSaved }) => {
  const [baseName, setBaseName] = useState(ticket.base_name);
  const [priority, setPriority] = useState<string>(ticket.priority);
  const [type, setType] = useState<string>(ticket.type);
  const [description, setDescription] = useState(ticket.description);
  const [existingUrls, setExistingUrls] = useState<string[]>(parseExistingUrls(ticket.attachment_url));
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setBaseName(ticket.base_name);
      setPriority(ticket.priority);
      setType(ticket.type);
      setDescription(ticket.description);
      setExistingUrls(parseExistingUrls(ticket.attachment_url));
      setNewFiles([]);
      setFileError('');
    }
  }, [open, ticket]);

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['edit-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const totalFiles = existingUrls.length + newFiles.length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFileError(`Formato não permitido: ${file.name}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`Arquivo muito grande: ${file.name}. Máximo: ${MAX_FILE_SIZE_MB}MB`);
        return;
      }
    }

    if (totalFiles + files.length > MAX_FILES) {
      setFileError(`Máximo de ${MAX_FILES} arquivos permitidos.`);
      return;
    }

    setNewFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingFile = (index: number) => {
    setExistingUrls(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!baseName.trim() || !priority || !type || !description.trim()) return;
    setSubmitting(true);

    try {
      // Upload new files
      const uploadedUrls: string[] = [];
      for (const file of newFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const filePath = `${ticket.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('ticket-attachments')
          .upload(filePath, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
      }

      const allUrls = [...existingUrls, ...uploadedUrls];
      const attachmentUrl = allUrls.length > 0 ? JSON.stringify(allUrls) : null;

      const { error } = await supabase.from('tickets').update({
        base_name: baseName.trim(),
        priority,
        type,
        description: description.trim(),
        attachment_url: attachmentUrl,
      } as any).eq('id', ticket.id);

      if (error) throw error;

      toast({ title: 'Chamado atualizado com sucesso' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Chamado — {ticket.id.slice(0, 8).toUpperCase()}</DialogTitle>
          <DialogDescription>Edite os dados do chamado antes de ser atribuído.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Base</Label>
            <Input value={baseName} onChange={e => setBaseName(e.target.value)} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ticketTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={5000} />
          </div>
          <div className="space-y-2">
            <Label>Anexos ({totalFiles}/{MAX_FILES})</Label>
            {existingUrls.length > 0 && (
              <div className="space-y-1.5">
                {existingUrls.map((url, i) => (
                  <div key={`existing-${i}`} className="flex items-center gap-2 rounded-lg border p-2 border-border">
                    <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{getFileName(url)}</span>
                    <button type="button" onClick={() => removeExistingFile(i)}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {newFiles.length > 0 && (
              <div className="space-y-1.5">
                {newFiles.map((file, i) => (
                  <div key={`new-${i}`} className="flex items-center gap-2 rounded-lg border p-2 border-border bg-primary/5">
                    <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                    <button type="button" onClick={() => removeNewFile(i)}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {totalFiles < MAX_FILES && (
              <div
                className="flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed p-3 border-border bg-muted/30 hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {totalFiles === 0 ? <Paperclip className="h-4 w-4 text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">
                  {totalFiles === 0 ? `Anexar arquivo — máx ${MAX_FILE_SIZE_MB}MB` : 'Adicionar mais arquivos'}
                </span>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.zip,.doc,.docx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.tif,.rar,.7z" onChange={handleFileChange} className="hidden" multiple />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>
          <Button onClick={handleSave} disabled={submitting || !baseName.trim() || !priority || !type || !description.trim()} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {submitting ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditTicketDialog;
