
# Importacao em Massa dos Dados da Planilha Fevereiro 2026

## Resumo

Criar uma edge function que receba os dados mapeados da planilha e insira todos os registros na tabela `tickets` do sistema, associando corretamente os solicitantes (requesters), backoffice responsavel e status.

## Dados Identificados

A aba "Fevereiro2026" (Page 5 da planilha) contem 93 registros validos (linhas 1389 a 1481) com as seguintes colunas mapeadas:

| Coluna Planilha | Campo no Sistema |
|---|---|
| A - Implantador | `requester_name` (solicitante) |
| C - CLIENTE | `base_name` |
| J - Tipo | `type` (mapeado para os tipos do sistema) |
| K - Atribuido a | `assigned_analyst_id` (backoffice responsavel) |
| D - DATA | `created_at` (data de abertura) |
| F - DATA CONCLUSAO | `finished_at` (data de conclusao) |
| G - TEMPO PARA CONCLUSAO | `total_execution_seconds` (convertido de HH:MM para segundos) |
| H - STATUS | `status` (mapeado para os status do sistema) |

## Mapeamento de Status

| Planilha | Sistema |
|---|---|
| Concluido | `finalizado` |
| Cancelado | `finalizado` |
| Aguardando Cliente/ISM | `pausado` |
| Em andamento | `em_andamento` |
| Nao iniciado | `nao_iniciado` |

## Mapeamento de Tipos

| Planilha | Sistema |
|---|---|
| Cliente, Clientes, Colaboradores, Colaborador/Clientes, etc. | `cliente` |
| Questionarios, Quest/pmoc | `setup_questionario` |
| Equipamento, Equipamentos, Produtos, etc. | `ajuste` |
| Tarefas, Outros, Servico | `outro` |
| Tipos combinados (ex: "Cliente/Equipamentos") | `cliente` (prioriza o primeiro) |

## Usuarios no Sistema

- Backoffice unico: **Andre** (ID: `2b9383d5-fc10-4d2e-9e38-1a9e88be1181`) -- todas as linhas exceto a ultima que nao tem backoffice atribuido
- Solicitantes ja cadastrados: todos os nomes da coluna A ja existem na tabela `requesters`

## Plano de Implementacao

### 1. Criar Edge Function `bulk-import-tickets`
- Recebe array de objetos com os dados mapeados
- Usa service role key para bypass de RLS
- Para cada registro:
  - Converte tempo "HH:MM" em segundos para `total_execution_seconds`
  - Atribui `assigned_analyst_id` ao Andre (backoffice)
  - Define `requester_user_id = null` (chamados externos)
  - Define `started_at` = `created_at` para tickets que foram iniciados
  - Define `finished_at` para tickets concluidos
  - Insere `ticket_status_logs` correspondentes

### 2. Criar pagina/script de importacao
- Uma pagina acessivel apenas pelo supervisor
- Contem os dados hardcoded extraidos da planilha (93 registros)
- Botao "Importar Dados" que chama a edge function
- Progress bar e feedback visual
- Protecao contra importacao duplicada

### 3. Arquivos

- **Criar**: `supabase/functions/bulk-import-tickets/index.ts`
- **Criar**: `src/pages/BulkImport.tsx` (pagina de importacao com dados hardcoded)
- **Editar**: `src/App.tsx` (rota `/bulk-import`)
- **Editar**: `supabase/config.toml` (configuracao da nova edge function)

### Detalhes Tecnicos

A edge function:
1. Recebe POST com array de tickets
2. Para cada ticket, faz INSERT na tabela `tickets` com os campos mapeados
3. Para tickets com status `finalizado`, insere um `ticket_status_log` de `nao_iniciado` para `finalizado`
4. Retorna contagem de sucesso/falha

Os 93 registros serao codificados diretamente na pagina de importacao, ja convertidos para o formato correto do sistema, evitando necessidade de parsing de Excel no frontend.
