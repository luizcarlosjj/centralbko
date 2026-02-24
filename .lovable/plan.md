
# Painel de Consulta Publica de Tickets

## Resumo
Criar um fluxo publico (sem login) para que solicitantes possam acompanhar o status dos seus chamados. O fluxo consiste em: botao na tela de login -> pagina de selecao de solicitante -> modal com tabela de resultados.

## Componentes e Arquivos

### 1. Botao na Tela de Login (`src/pages/Login.tsx`)
- Adicionar botao outline "Acompanhar Tickets" abaixo do botao "Chamado sem login"
- Navega para `/public-tracking`
- Icone: `Search` do lucide-react

### 2. Nova Rota (`src/App.tsx`)
- Adicionar rota publica `/public-tracking` com lazy loading, mesmo padrao das rotas publicas existentes

### 3. Nova Pagina: `src/pages/PublicTracking.tsx`
- Layout visual identico ao `PublicTicketForm` (gradient background, card centralizado)
- Titulo: "Acompanhar Chamados"
- Componentes internos:
  - **Select searchable** com lista de solicitantes ativos (query na tabela `requesters` com RLS ja existente para anon)
  - **Botao** "Consultar Chamados"
  - **Botao ghost** "Voltar ao Login"
- Ao clicar em consultar, abre o modal de resultados

### 4. Modal de Resultados (dentro de `PublicTracking.tsx`)
- Usar componente `Dialog` existente com `max-w-[90vw]` no desktop
- Conteudo:
  - Titulo com nome do solicitante selecionado
  - **Desktop**: Tabela com colunas:
    - ID (8 primeiros chars, uppercase)
    - Base
    - Status (badge colorido)
    - Responsavel (nome do backoffice via join com profiles)
    - Tempo Util (calculado com `calculateBusinessSeconds`)
  - **Mobile**: Cards empilhados verticalmente com as mesmas informacoes
  - Paginacao de 20 registros
  - Botao de refresh manual

### 5. Query de Dados
- Buscar da tabela `tickets` filtrando por `requester_name = solicitante selecionado`
- Campos: `id, base_name, status, assigned_analyst_id, created_at, started_at, total_execution_seconds, total_paused_seconds, finished_at, pause_started_at`
- Join com `profiles` para nome do responsavel
- Ordenar por `created_at` desc
- Paginacao server-side com `.range()`

### 6. Seguranca - RLS
- Atualmente a tabela `tickets` exige autenticacao para SELECT (policy `Role-based ticket visibility`)
- Sera necessario criar uma **nova RLS policy** para permitir SELECT anonimo com campos restritos
- Policy: `Anyone can view tickets by requester name` - SELECT para `anon` role, restringindo via funcao/view ou liberando SELECT simples
- **Alternativa mais segura**: Criar uma **Edge Function** `get-public-tickets` que usa o service_role para buscar os dados e retorna apenas os campos permitidos. Isso evita expor a tabela tickets diretamente para anonimos.

## Decisao de Arquitetura: Edge Function vs RLS

Recomendo usar uma **Edge Function** (`get-public-tickets`) pelos seguintes motivos:
- Nao expoe a tabela `tickets` para usuarios anonimos
- Controle total dos campos retornados (sem risco de vazar dados internos)
- Nao precisa alterar RLS existente (zero impacto no sistema)
- Permite fazer o join com `profiles` server-side

### 7. Edge Function: `supabase/functions/get-public-tickets/index.ts`
- Recebe: `{ requester_name: string, page: number }`
- Valida input
- Busca tickets filtrados por `requester_name` com paginacao (20 por pagina)
- Faz join com `profiles` para nome do responsavel
- Retorna apenas: `id, base_name, status, analyst_name, created_at, started_at, total_execution_seconds, total_paused_seconds, finished_at, pause_started_at`
- Retorna `total_count` para paginacao

## Detalhes Tecnicos

### Calculo de Tempo Util
- Reutilizar `calculateBusinessSeconds` de `src/lib/business-time.ts`
- Para tickets em andamento: calcular tempo desde `started_at` ate agora, subtraindo pausas
- Para finalizados: usar `total_execution_seconds`
- Formatar em `Xh Xmin`

### Responsividade
- Usar `useIsMobile()` hook existente
- Desktop: componente `Table` padrao
- Mobile: cards com layout vertical usando `Card` existente

### Status Badges
- Reutilizar o mesmo mapeamento de cores ja usado no `SupervisorPanel`:
  - `em_andamento` -> primary
  - `pausado` -> warning  
  - `finalizado` -> success
  - `nao_iniciado` -> secondary

### Arquivos a Criar
1. `src/pages/PublicTracking.tsx` - Pagina principal com select + modal + tabela
2. `supabase/functions/get-public-tickets/index.ts` - Edge Function segura

### Arquivos a Modificar
1. `src/pages/Login.tsx` - Adicionar botao "Acompanhar Tickets"
2. `src/App.tsx` - Adicionar rota `/public-tracking`

### Nenhuma alteracao em
- Logica de tickets existente
- Fluxos internos (analyst, backoffice, supervisor)
- RLS policies existentes
- Tabelas do banco de dados
