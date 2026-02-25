import React, { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, AlertCircle, Trash2, FileSpreadsheet, X, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import * as XLSX from 'xlsx';

interface BackofficeUser {
  id: string;
  name: string;
}

// Expected column names (case-insensitive, trimmed)
const EXPECTED_COLUMNS = [
  'solicitante',
  'base',
  'data criação',
  'data conclusão',
  'tempo execução',
  'status',
  'tipo',
  'responsável',
  'nível do setup',
  'time',
];

// Alternative accepted column names
const COLUMN_ALIASES: Record<string, string[]> = {
  solicitante: ['solicitante', 'requester', 'nome solicitante'],
  base: ['base', 'base_name', 'nome da base', 'nome base'],
  'data criação': ['data criação', 'data criacao', 'criação', 'criacao', 'created', 'data abertura', 'abertura'],
  'data conclusão': ['data conclusão', 'data conclusao', 'conclusão', 'conclusao', 'finished', 'data finalização', 'finalização'],
  'tempo execução': ['tempo execução', 'tempo execucao', 'tempo', 'execution_time', 'tempo util'],
  status: ['status', 'situação', 'situacao'],
  tipo: ['tipo', 'type', 'categoria'],
  'responsável': ['responsável', 'responsavel', 'assigned', 'backoffice', 'analista'],
  'nível do setup': ['nível do setup', 'nivel do setup', 'nível setup', 'nivel setup', 'setup level', 'setup'],
  'time': ['time', 'team', 'equipe'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchColumn(header: string): string | null {
  const norm = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(a => norm === a || norm.includes(a))) return key;
  }
  return null;
}

function mapType(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (/quest|pmoc/.test(r)) return "setup_questionario";
  if (/cliente|colaborador|fornecedor/.test(r)) return "cliente";
  if (/equipamento|produto/.test(r)) return "ajuste";
  return "outro";
}

function mapStatus(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes("concluido") || r.includes("cancelado") || r.includes("concluído")) return "finalizado";
  if (r.includes("aguardando")) return "pausado";
  if (r.includes("andamento")) return "em_andamento";
  if (r.includes("não iniciado") || r.includes("nao iniciado")) return "nao_iniciado";
  return "nao_iniciado";
}

function parseDate(raw: string | number | undefined): string | null {
  if (raw === undefined || raw === null || raw === "") return null;

  // Handle Excel serial date numbers
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}T${String(date.H || 8).padStart(2, '0')}:${String(date.M || 0).padStart(2, '0')}:${String(date.S || 0).padStart(2, '0')}`;
    }
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Try DD/MM/YYYY HH:MM:SS or MM/DD/YYYY HH:MM:SS
  const dtMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):?(\d{2})?$/);
  if (dtMatch) {
    let [, p1, p2, yr, h, m, sec] = dtMatch;
    let year = parseInt(yr);
    if (year < 100) year += 2000;
    let month = parseInt(p1);
    let day = parseInt(p2);
    if (month > 12) { month = parseInt(p2); day = parseInt(p1); }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${m}:${sec || '00'}`;
  }

  // Simple date M/D/YY or D/M/YY
  const simple = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (simple) {
    let [, p1, p2, yr] = simple;
    let year = parseInt(yr);
    if (year < 100) year += 2000;
    let month = parseInt(p1);
    let day = parseInt(p2);
    if (month > 12) { month = parseInt(p2); day = parseInt(p1); }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00`;
  }

  // Try ISO-like
  const isoDate = new Date(s);
  if (!isNaN(isoDate.getTime())) {
    return isoDate.toISOString().slice(0, 19);
  }

  return null;
}

interface ParsedRow {
  requester_name: string;
  base_name: string;
  created_at_raw: string | number;
  finished_at_raw: string | number;
  execution_time: string;
  status_raw: string;
  type_raw: string;
  assigned: string;
  setup_level: string;
  team: string;
}

interface ValidationResult {
  valid: boolean;
  rows: ParsedRow[];
  errors: string[];
  warnings: string[];
  columnMapping: Record<string, number>;
  unmappedColumns: string[];
  sheetName: string;
}

function validateAndParseFile(workbook: XLSX.WorkBook): ValidationResult {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const errors: string[] = [];
  const warnings: string[] = [];

  if (rawData.length === 0) {
    return { valid: false, rows: [], errors: ['Planilha vazia - nenhuma linha encontrada.'], warnings: [], columnMapping: {}, unmappedColumns: [], sheetName };
  }

  // Map columns
  const headers = Object.keys(rawData[0]);
  const columnMapping: Record<string, number> = {};
  const unmappedColumns: string[] = [];
  const mappedHeaders: Record<string, string> = {};

  headers.forEach((h, i) => {
    const match = matchColumn(h);
    if (match) {
      columnMapping[match] = i;
      mappedHeaders[match] = h;
    } else {
      unmappedColumns.push(h);
    }
  });

  // Check required columns
  const requiredCols = ['solicitante', 'base', 'status'];
  const missingRequired = requiredCols.filter(c => !(c in columnMapping));
  if (missingRequired.length > 0) {
    errors.push(`Colunas obrigatórias não encontradas: ${missingRequired.join(', ')}`);
    errors.push(`Colunas esperadas: ${EXPECTED_COLUMNS.join(', ')}`);
    errors.push(`Colunas encontradas: ${headers.join(', ')}`);
    return { valid: false, rows: [], errors, warnings, columnMapping, unmappedColumns, sheetName };
  }

  const optionalMissing = EXPECTED_COLUMNS.filter(c => !requiredCols.includes(c) && !(c in columnMapping));
  if (optionalMissing.length > 0) {
    warnings.push(`Colunas opcionais não encontradas: ${optionalMissing.join(', ')}. Valores padrão serão usados.`);
  }

  if (unmappedColumns.length > 0) {
    warnings.push(`Colunas ignoradas: ${unmappedColumns.join(', ')}`);
  }

  // Parse rows
  const rows: ParsedRow[] = [];
  rawData.forEach((row, idx) => {
    const getValue = (col: string): string => {
      const header = mappedHeaders[col];
      if (!header) return '';
      const val = row[header];
      return val !== undefined && val !== null ? String(val).trim() : '';
    };
    const getRawValue = (col: string): string | number => {
      const header = mappedHeaders[col];
      if (!header) return '';
      const val = row[header];
      if (val === undefined || val === null) return '';
      return typeof val === 'number' ? val : String(val).trim();
    };

    const solicitante = getValue('solicitante');
    const base = getValue('base');
    const status = getValue('status');

    if (!solicitante && !base) {
      // Skip empty rows silently
      return;
    }

    if (!solicitante) {
      warnings.push(`Linha ${idx + 2}: Solicitante vazio, usando "Desconhecido"`);
    }
    if (!base) {
      errors.push(`Linha ${idx + 2}: Nome da base é obrigatório`);
      return;
    }

    rows.push({
      requester_name: solicitante || 'Desconhecido',
      base_name: base,
      created_at_raw: getRawValue('data criação'),
      finished_at_raw: getRawValue('data conclusão'),
      execution_time: getValue('tempo execução'),
      status_raw: status || 'Não iniciado',
      type_raw: getValue('tipo') || 'outro',
      assigned: getValue('responsável'),
      setup_level: getValue('nível do setup'),
      team: getValue('time'),
    });
  });

  if (rows.length === 0) {
    errors.push('Nenhuma linha válida encontrada na planilha.');
  }

  return {
    valid: errors.length === 0,
    rows,
    errors,
    warnings,
    columnMapping,
    unmappedColumns,
    sheetName,
  };
}

const BulkImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ successCount: number; errorCount: number; errors: string[] } | null>(null);
  const [backofficeUsers, setBackofficeUsers] = useState<BackofficeUser[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchBackofficeUsers = async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'backoffice');
      if (roles && roles.length > 0) {
        const userIds = roles.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        if (profiles) {
          setBackofficeUsers(profiles.map(p => ({ id: p.id, name: p.name })));
        }
      }
    };
    fetchBackofficeUsers();
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast({ title: 'Formato inválido', description: 'Use arquivos .xlsx, .xls ou .csv', variant: 'destructive' });
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }

    setFile(selected);
    setResult(null);
    setValidation(null);

    try {
      const buffer = await selected.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const result = validateAndParseFile(workbook);
      setValidation(result);
    } catch (err) {
      toast({ title: 'Erro ao ler arquivo', description: (err as Error).message, variant: 'destructive' });
      setFile(null);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearFile = () => {
    setFile(null);
    setValidation(null);
    setResult(null);
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-import-tickets', {
        body: { action: "delete_all" },
      });

      if (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        return;
      }

      toast({
        title: "Registros excluídos",
        description: `${data.deletedCount} tickets importados foram removidos.`,
      });
      setResult(null);
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async () => {
    if (!validation || !validation.valid || validation.rows.length === 0) return;

    setImporting(true);
    setProgress(10);

    try {
      const findUserId = (name: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase().trim();
        if (lower === 'não atribuído' || lower === 'nao atribuido' || lower === 'sem responsável' || lower === 'sem responsavel') return null;
        const match = backofficeUsers.find(u => u.name.toLowerCase().trim() === lower);
        return match ? match.id : null;
      };

      const processedData = validation.rows.map((r) => ({
        requester_name: r.requester_name,
        base_name: r.base_name,
        created_at: parseDate(r.created_at_raw),
        finished_at: parseDate(r.finished_at_raw),
        execution_time: r.execution_time,
        status: mapStatus(r.status_raw),
        type: mapType(r.type_raw || "outro"),
        assigned_analyst_id: findUserId(r.assigned),
        setup_level: r.setup_level || null,
        team: r.team || null,
      }));

      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < processedData.length; i += batchSize) {
        batches.push(processedData.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      let totalError = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        setProgress(10 + Math.round((i / batches.length) * 80));

        const { data, error } = await supabase.functions.invoke('bulk-import-tickets', {
          body: { tickets: batches[i] },
        });

        if (error) {
          allErrors.push(`Batch ${i + 1}: ${error.message}`);
          totalError += batches[i].length;
        } else if (data) {
          totalSuccess += data.successCount || 0;
          totalError += data.errorCount || 0;
          if (data.errors) allErrors.push(...data.errors);
        }
      }

      setProgress(100);
      setResult({ successCount: totalSuccess, errorCount: totalError, errors: allErrors });

      toast({
        title: "Importação concluída",
        description: `${totalSuccess} tickets importados. ${totalError} erros.`,
      });
    } catch (err) {
      toast({ title: "Erro na importação", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Solicitante', 'Base', 'Data Criação', 'Data Conclusão', 'Tempo Execução', 'Status', 'Tipo', 'Responsável', 'Nível do Setup', 'Time'],
      ['João', '123456 - Empresa Exemplo', '01/03/2026', '02/03/2026', '02:30', 'Concluido', 'Cliente', 'André', 'Básico', 'Suporte'],
      ['Maria', '789012 - Outra Empresa', '03/03/2026', '', '', 'Não iniciado', 'Equipamento', 'Não atribuído', 'Avançado', 'Implantação'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Importação');
    XLSX.writeFile(wb, 'modelo_importacao.xlsx');
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Importação em Massa</h1>
            <p className="text-muted-foreground">Envie uma planilha para importar tickets no sistema</p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Modelo
          </Button>
        </div>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle>1. Enviar Planilha</CardTitle>
            <CardDescription>
              Formatos aceitos: .xlsx, .xls, .csv — Colunas obrigatórias: Solicitante, Base, Status. Use "Não atribuído" na coluna Responsável para deixar sem dono.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!file ? (
              <div
                className="flex flex-col items-center justify-center gap-3 cursor-pointer rounded-lg border-2 border-dashed p-8 border-border bg-muted/30 hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">Clique para selecionar um arquivo</p>
                  <p className="text-xs text-muted-foreground mt-1">ou arraste e solte aqui</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border p-3 border-border">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button variant="ghost" size="icon" onClick={clearFile} className="shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Validation Results */}
        {validation && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                2. Validação
                {validation.valid ? (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle className="h-3 w-3 mr-1" /> OK
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertCircle className="h-3 w-3 mr-1" /> Erros
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Aba: "{validation.sheetName}" — {validation.rows.length} linhas válidas encontradas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Errors */}
              {validation.errors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">Erros ({validation.errors.length})</p>
                  {validation.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80">{e}</p>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Avisos ({validation.warnings.length})</p>
                  {validation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-600/80 dark:text-yellow-400/80">{w}</p>
                  ))}
                </div>
              )}

              {/* Column Mapping */}
              <div>
                <p className="text-sm font-medium mb-2">Mapeamento de colunas:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(validation.columnMapping).map(([key]) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />
                      {key}
                    </Badge>
                  ))}
                  {EXPECTED_COLUMNS.filter(c => !(c in validation.columnMapping)).map(key => (
                    <Badge key={key} variant="outline" className="text-xs text-muted-foreground">
                      <X className="h-3 w-3 mr-1" />
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              {validation.rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Pré-visualização ({Math.min(validation.rows.length, 10)} de {validation.rows.length}):</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-lg font-bold">{validation.rows.length}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-lg font-bold">{validation.rows.filter(r => mapStatus(r.status_raw) === 'finalizado').length}</div>
                      <div className="text-xs text-muted-foreground">Finalizados</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-lg font-bold">{validation.rows.filter(r => mapStatus(r.status_raw) === 'pausado').length}</div>
                      <div className="text-xs text-muted-foreground">Pausados</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-lg font-bold">{validation.rows.filter(r => ['em_andamento', 'nao_iniciado'].includes(mapStatus(r.status_raw))).length}</div>
                      <div className="text-xs text-muted-foreground">Em aberto</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-lg font-bold">{validation.rows.filter(r => !r.assigned || r.assigned.toLowerCase().trim() === 'não atribuído' || r.assigned.toLowerCase().trim() === 'nao atribuido').length}</div>
                      <div className="text-xs text-muted-foreground">Não atribuídos</div>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">Solicitante</th>
                          <th className="text-left p-2">Base</th>
                          <th className="text-left p-2">Tipo</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Responsável</th>
                          <th className="text-left p-2">Setup</th>
                          <th className="text-left p-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{r.requester_name}</td>
                            <td className="p-2 max-w-[200px] truncate">{r.base_name}</td>
                            <td className="p-2"><Badge variant="outline" className="text-[10px]">{mapType(r.type_raw)}</Badge></td>
                            <td className="p-2"><Badge variant="secondary" className="text-[10px]">{mapStatus(r.status_raw)}</Badge></td>
                            <td className="p-2">
                              {r.assigned && r.assigned.toLowerCase().trim() !== 'não atribuído' && r.assigned.toLowerCase().trim() !== 'nao atribuido'
                                ? <span className="text-xs">{r.assigned}</span>
                                : <Badge variant="outline" className="text-[10px] text-muted-foreground">Não atribuído</Badge>
                              }
                            </td>
                            <td className="p-2 text-xs">{r.setup_level || '-'}</td>
                            <td className="p-2 text-xs">{r.team || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {importing && (
          <Card>
            <CardContent className="py-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && (
          <Card>
            <CardContent className="py-6 space-y-3">
              <div className="flex items-center gap-2">
                {result.errorCount === 0 ? (
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-medium">
                  {result.successCount} importados com sucesso, {result.errorCount} erros
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto bg-destructive/10 p-3 rounded text-xs">
                  {result.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleImport}
            disabled={importing || deleting || !validation?.valid || validation?.rows.length === 0}
            className="flex-1"
            size="lg"
          >
            <Upload className="h-4 w-4 mr-2" />
            {importing ? 'Importando...' : `Importar ${validation?.rows.length || 0} Registros`}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="lg" disabled={importing || deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? 'Excluindo...' : 'Excluir Importados'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir todos os registros importados?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá remover todos os tickets que foram importados da planilha (descrição "Importado da planilha"). Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAll}>Excluir Todos</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppLayout>
  );
};

export default BulkImport;
