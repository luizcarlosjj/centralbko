

# Plano: Exportacao de Dados e Backup Completo na Tela de Importacao em Massa

## Contexto

A tela de BulkImport atualmente so permite importar e excluir chamados. O usuario precisa de ferramentas de exportacao para backup e migracao futura.

## Funcionalidades a Implementar

### 1. Botao "Exportar Chamados (Excel)"
- Exporta TODOS os tickets da tabela `tickets` para um arquivo `.xlsx` no formato do modelo existente
- Colunas: Solicitante, Base, Data Criacao (com hora), Data Conclusao (com hora), Hora Abertura, Hora Encerramento, Tempo Execucao, Status, Tipo, Responsavel, Nivel do Setup, Time, Prioridade, Descricao
- Os campos "Hora Abertura" e "Hora Encerramento" serao extraidos de `created_at` e `finished_at` respectivamente (formato HH:MM:SS)
- Busca o nome do responsavel via join com `profiles` usando `assigned_analyst_id`
- Nome do arquivo: `chamados_export_YYYY-MM-DD.xlsx`

### 2. Botao "Exportar Dados do Sistema (SQL)"
- Gera um arquivo `.sql` contendo INSERTs de todas as tabelas de configuracao do sistema:
  - `pause_reasons` (motivos de pausa)
  - `setup_levels` (niveis de setup)
  - `teams` (times)
  - `ticket_types` (tipos de chamado)
  - `requesters` (solicitantes)
  - `profiles` (perfis de usuario)
  - `user_roles` (papeis)
  - `pause_logs` (logs de pausa)
  - `pause_evidences` (evidencias)
  - `pause_responses` + `pause_response_files`
  - `ticket_status_logs` (historico de status)
  - `assignment_control`
- Cada tabela precedida de comentario SQL com nome e quantidade de registros
- Formato: INSERTs individuais com valores escapados
- Nome do arquivo: `backup_sistema_YYYY-MM-DD.sql`

### 3. Atualizacao do Modelo de Planilha
- Adicionar colunas "Hora Abertura" e "Hora Encerramento" ao template
- Atualizar exemplos com horarios (ex: `08:59:52`, `16:30:00`)

## Alteracoes no Layout

A area de cabecalho sera expandida para conter 3 botoes ao lado do titulo:
- **Modelo** (ja existente) - download do template
- **Exportar Chamados** (novo) - icone FileSpreadsheet, cor verde/outline
- **Exportar SQL** (novo) - icone Database, cor outline

## Detalhes Tecnicos

### Arquivo modificado
- `src/pages/BulkImport.tsx`

### Dependencias
- `xlsx` (ja instalado) para gerar o Excel
- Nenhuma nova dependencia necessaria
- O SQL sera gerado como string pura e baixado via `Blob` + `URL.createObjectURL`

### Estrategia de exportacao de chamados
```text
1. Fetch tickets (sem limite de 1000 - paginar se necessario)
2. Fetch profiles para mapear analyst_id -> nome
3. Montar array de linhas
4. Gerar XLSX com xlsx library
5. Trigger download
```

### Estrategia de exportacao SQL
```text
1. Fetch cada tabela sequencialmente
2. Para cada registro, gerar INSERT INTO ... VALUES (...)
3. Escapar aspas simples nos valores string
4. Concatenar tudo em uma string
5. Gerar arquivo .sql via Blob download
```

### Paginacao para superar limite de 1000 registros
- Usar loop com `.range(offset, offset + 999)` ate receber menos de 1000 resultados
- Aplicar para tickets e ticket_status_logs (tabelas que podem exceder 1000)

