

# Chamado Sem Login + Retomar Pausa (Analista/Supervisor)

## Resumo

Duas alterações principais:
1. Recriar a opção de abertura de chamado sem login na tela de Login, com campo de solicitante gerenciado pelo supervisor
2. Permitir que o analista (solicitante do chamado) e o supervisor retomem a pausa -- analista via dialog existente, supervisor com um clique

---

## Parte 1 -- Chamado Sem Login

### 1.1 Nova tabela: `requesters`
Tabela para o supervisor cadastrar os nomes de solicitantes disponíveis no formulário público.

| Coluna | Tipo |
|--------|------|
| id | uuid PK default gen_random_uuid() |
| name | text NOT NULL |
| active | boolean default true |
| created_by | uuid NOT NULL |
| created_at | timestamptz default now() |

RLS:
- SELECT: permitir para `anon` e `authenticated` (o formulário público precisa listar os nomes)
- INSERT/UPDATE: somente supervisores (`has_role(auth.uid(), 'supervisor')`)

### 1.2 Ajustar RLS dos tickets para INSERT anônimo
Atualmente o INSERT em tickets exige `has_role(auth.uid(), 'analyst')`. Precisamos adicionar uma nova policy PERMISSIVE para INSERT que permita inserções onde `requester_user_id IS NULL` (chamados públicos). 

Porém, como a policy existente de INSERT e de visibilidade/update sao RESTRICTIVE, a abordagem mais segura e limpa e criar uma **edge function** `create-public-ticket` que use a service role key para inserir o ticket, evitando conflitos de RLS.

### 1.3 Edge Function: `create-public-ticket`
- Recebe: base_name, requester_name (do select), priority, type, description, attachment (file URL)
- Valida campos obrigatórios
- Insere o ticket com `requester_user_id = null` e status `nao_iniciado`
- O trigger `auto_assign_ticket` atribui automaticamente ao backoffice

### 1.4 Nova página: `src/pages/PublicTicketForm.tsx`
- Formulário idêntico ao `NewTicket.tsx` mas sem autenticação
- Campo "Solicitante" como dropdown (`<Select>`) com opções carregadas da tabela `requesters`
- Campo "Nome da Base", Prioridade, Tipo, Descrição, Planilha obrigatória
- Ao enviar, chama a edge function `create-public-ticket`
- Rota: `/public-ticket`

### 1.5 Atualizar Login
- Adicionar botão/link "Chamado sem login" abaixo do botão "Entrar"
- Navega para `/public-ticket`

### 1.6 Atualizar App.tsx
- Adicionar rota pública `/public-ticket` para `PublicTicketForm`

### 1.7 Gestão de Solicitantes pelo Supervisor
- Adicionar nova página ou seção no painel do supervisor para gerenciar a tabela `requesters` (CRUD: nome, ativo/inativo)
- Adicionar link "Solicitantes" na sidebar para role supervisor

---

## Parte 2 -- Retomar Pausa

### 2.1 Analista (solicitante do chamado)
Ja funciona via `ResolvePendencyDialog` no painel do analista -- sem mudanças necessárias.

### 2.2 Supervisor -- Retomar com um clique
No `SupervisorPanel.tsx`, adicionar botao "Retomar" nos chamados com status `pausado`:
- Na coluna de Acoes (ao lado de "Reabrir" para finalizados)
- Um unico clique, sem dialog (hierarquia)
- Logica ao clicar:
  1. Buscar pause_log ativo (pause_ended_at IS NULL)
  2. Fechar o pause_log (pause_ended_at = now, paused_seconds calculado)
  3. Atualizar ticket: status = em_andamento, started_at = now, pause_started_at = null, total_paused_seconds acumulado
  4. Inserir ticket_status_log
  5. Toast de confirmacao

### 2.3 Backoffice -- SEM botao de retomar
O backoffice continua sem poder retomar pausas (ja esta assim, sem mudancas).

---

## Detalhes Tecnicos

### Banco de Dados
1. Migration: criar tabela `requesters` com RLS
2. Nenhuma alteracao na tabela tickets (INSERT publico via edge function)

### Edge Function
- `supabase/functions/create-public-ticket/index.ts`
- CORS headers
- Usa `createClient` com service role key
- Upload do anexo para bucket `ticket-attachments`
- Validacao de campos

### Arquivos alterados/criados
- **Criar**: `src/pages/PublicTicketForm.tsx` (formulario publico)
- **Criar**: `src/pages/RequesterManagement.tsx` (gestao de solicitantes)
- **Criar**: `supabase/functions/create-public-ticket/index.ts`
- **Editar**: `src/App.tsx` (rotas)
- **Editar**: `src/pages/Login.tsx` (botao "Chamado sem login")
- **Editar**: `src/components/AppLayout.tsx` (link "Solicitantes" na sidebar)
- **Editar**: `src/pages/SupervisorPanel.tsx` (botao "Retomar" para pausados)
- **Migration**: criar tabela `requesters`

