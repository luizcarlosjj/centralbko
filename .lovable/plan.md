

# Reestruturação Completa do Sistema de Chamados

## Resumo

Transformar o sistema atual de 2 perfis (Analista + Supervisor) com abertura pública em um sistema de 3 perfis (Analista/Solicitante + Backoffice + Supervisor) com login obrigatório, novo fluxo de pausa bidirecional e contagem de tempo em horário útil brasileiro.

---

## Fase 1 — Banco de Dados e Roles

### 1.1 Alterar enum de roles
- Adicionar `backoffice` ao enum `app_role`
- Renomear o significado do `analyst` (agora é o solicitante)
- Usuários existentes com role `analyst` serao migrados para `backoffice`

```text
ALTER TYPE public.app_role ADD VALUE 'backoffice';
UPDATE public.user_roles SET role = 'backoffice' WHERE role = 'analyst';
```

### 1.2 Nova tabela: `pause_responses`
Para registrar as respostas do analista (solicitante) a uma pendência:

| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| pause_log_id | uuid FK -> pause_logs |
| ticket_id | uuid FK -> tickets |
| description_text | text NOT NULL |
| responded_by | uuid NOT NULL |
| created_at | timestamptz |

Com RLS: insert se `responded_by = auth.uid()`, select para autenticados.

### 1.3 Novo bucket de storage: `pause-responses`
Para os anexos obrigatórios das respostas do analista.

### 1.4 Tabela `pause_response_files`
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| pause_response_id | uuid FK |
| file_url | text NOT NULL |
| uploaded_by | uuid |
| created_at | timestamptz |

### 1.5 Ajustar campo `requester_user_id` na tabela `tickets`
- Adicionar coluna `requester_user_id uuid` (FK referenciando profiles)
- Preencher automaticamente com o ID do analista logado ao criar chamado

### 1.6 Ajustar RLS dos tickets
- Remover policy de INSERT anônimo (`Anyone can insert tickets`)
- Nova policy: INSERT somente para users com role `analyst`
- SELECT: analista vê seus próprios chamados (`requester_user_id = auth.uid()`), backoffice vê chamados atribuídos a ele, supervisor vê todos
- UPDATE: backoffice pode pausar/finalizar, analista pode responder pendência

### 1.7 Ajustar trigger `auto_assign_ticket`
- Round-robin agora entre users com role `backoffice` (não mais `analyst`)

---

## Fase 2 — Tipos e AuthContext

### 2.1 Atualizar `src/types/tickets.ts`
- `AppRole` passa a incluir `'backoffice'`
- Adicionar interfaces `PauseResponse` e `PauseResponseFile`
- Adicionar `requester_user_id` ao `Ticket`
- Atualizar labels de status (nao muda)

### 2.2 Atualizar `AuthContext`
- Reconhecer role `backoffice` além de `analyst` e `supervisor`

---

## Fase 3 — Roteamento e Navegação

### 3.1 Remover rota pública
- Remover `<Route path="/" element={<PublicTicketForm />} />`
- Rota `/` agora redireciona para `/login` ou `/dashboard`

### 3.2 Novo roteamento por role no Dashboard
```text
analyst   -> AnalystPanel (solicitante)
backoffice -> BackofficePanel (antigo AnalystPanel)
supervisor -> SupervisorPanel
```

### 3.3 Atualizar `ProtectedRoute`
- Aceitar `'backoffice'` nas allowedRoles

### 3.4 Atualizar `AppLayout`
- Sidebar mostra itens conforme role:
  - `analyst`: Painel, Abrir Chamado
  - `backoffice`: Painel
  - `supervisor`: Painel, Métricas, Usuários, Motivos de Pausa

### 3.5 Atualizar Login
- Remover link "Abrir chamado público"

---

## Fase 4 — Painel do Backoffice (antigo AnalystPanel)

### 4.1 Renomear `AnalystPanel.tsx` -> `BackofficePanel.tsx`
- Título: "Painel do Backoffice"
- Manter funcionalidades: ver chamados atribuídos, pausar, finalizar
- **Remover** botão "Retomar" — backoffice nao pode mais retomar pausa
- Ao pausar: chamado vai para "Pendentes" do analista solicitante
- Adicionar indicação visual quando um chamado pausado recebeu resposta do analista (notificação)
- Ao receber resposta do analista: chamado volta automaticamente para "Em Andamento" e o tempo recomeça

### 4.2 Ajustar `PauseDialog`
- Sem mudanças funcionais (backoffice continua pausando com motivo + descrição + evidência)

---

## Fase 5 — Painel do Analista (Solicitante) — NOVO

### 5.1 Criar `src/pages/AnalystPanel.tsx` (novo conteúdo)
Layout com 3 colunas (tabs em mobile):

**Coluna 1 — Em Tratamento**
- Chamados abertos pelo analista com status `em_andamento`
- Mostra: status, prioridade, tipo, data abertura, tempo atual, backoffice responsável
- Somente leitura (analista não pode alterar)

**Coluna 2 — Finalizados**
- Chamados com status `finalizado`
- Mostra: tempo total, backoffice responsável, histórico resumido
- Somente leitura

**Coluna 3 — Pendentes**
- Chamados com status `pausado`
- Mostra: motivo da pausa, descrição, evidências, quem pausou, data da pausa
- Botão "Resolver Pendência" abre dialog obrigatório com:
  - Descrição (obrigatória)
  - Anexo de imagem (obrigatório)
  - Ao salvar: cria `pause_response`, retoma chamado automaticamente, notifica backoffice

### 5.2 Criar `src/components/ResolvePendencyDialog.tsx`
- Dialog com campos obrigatórios: descrição + upload de imagem
- Ao confirmar:
  1. Insere registro em `pause_responses`
  2. Faz upload dos arquivos em `pause-responses` bucket
  3. Insere registros em `pause_response_files`
  4. Fecha o `pause_log` ativo (define `pause_ended_at`)
  5. Atualiza ticket: status `em_andamento`, `started_at = now()`, acumula `total_paused_seconds`
  6. Insere log de status
  7. Dispara notificação para backoffice

### 5.3 Criar formulário de abertura de chamado
- Criar `src/pages/NewTicket.tsx` ou embutir no painel
- Mesmos campos do formulário atual (base, solicitante preenchido automaticamente, prioridade, tipo, descrição, anexo)
- `requester_user_id` preenchido automaticamente com o user logado
- `requester_name` preenchido automaticamente do profile
- Rota protegida para role `analyst`

---

## Fase 6 — Contagem de Tempo em Horário Útil

### 6.1 Criar `src/lib/business-time.ts`
Função `calculateBusinessSeconds(start: Date, end: Date): number`

Regras:
- Segunda a Domingo: 08:00 - 18:00
- Almoço: 12:00 - 13:12
- Tempo útil diário: 8h48min = 31.680 segundos
- Descontar feriados nacionais brasileiros (lista fixa no código para 2025 e 2026)

Feriados nacionais fixos incluídos:
- 1 Jan, 21 Abr, 1 Mai, 7 Set, 12 Out, 2 Nov, 15 Nov, 25 Dez
- Feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) calculados com base na Páscoa

### 6.2 Atualizar `LiveTimer.tsx`
- Usar `calculateBusinessSeconds` em vez de cálculo linear simples
- `computeTime()` passa a calcular apenas tempo útil acumulado

### 6.3 Atualizar lógica de pausa/finalização
- Ao pausar: `total_execution_seconds` acumula apenas tempo útil desde `started_at`
- Ao finalizar: idem
- Ao retomar (via resposta do analista): `total_paused_seconds` acumula apenas tempo útil de pausa

---

## Fase 7 — Notificações

### 7.1 Notificação ao Analista
- Quando um chamado do analista for pausado pelo backoffice
- Via realtime subscription no painel do analista (canal `tickets` com filtro `requester_user_id`)
- Som + browser notification

### 7.2 Notificação ao Backoffice
- Quando o analista responder uma pendência
- Via realtime subscription na tabela `pause_responses`
- Som + browser notification

### 7.3 Mover `NotificationBell` 
- Disponibilizar para `analyst` e `backoffice` na sidebar, com mensagens contextuais por role

---

## Fase 8 — Gerenciamento de Usuários

### 8.1 Atualizar edge function `manage-users`
- Aceitar novo role `backoffice` na criação
- Validar roles: `analyst`, `backoffice`, `supervisor`

### 8.2 Atualizar `UserManagement.tsx`
- Select de perfil com 3 opções: Analista (Solicitante), Backoffice, Supervisor
- Labels atualizados

---

## Fase 9 — Limpeza

- Remover `src/pages/PublicTicketForm.tsx`
- Remover link "Abrir chamado público" do Login
- Atualizar `SupervisorPanel` para mostrar nome do backoffice e solicitante
- Atualizar `MetricsDashboard` para refletir novos roles

---

## Ordem de Implementação

Devido ao tamanho desta reestruturação, a implementação será dividida em etapas sequenciais:

1. Migração do banco (enums, tabelas, RLS, trigger)
2. Tipos TypeScript e AuthContext
3. Roteamento, Login e AppLayout
4. BackofficePanel (renomear antigo AnalystPanel)
5. Novo AnalystPanel (solicitante) com 3 colunas
6. ResolvePendencyDialog + formulário de abertura
7. Business time (calculateBusinessSeconds + LiveTimer)
8. Notificações bidirecionais
9. UserManagement + edge function
10. Limpeza e testes

---

## Riscos e Cuidados

- Migrar users existentes de `analyst` para `backoffice` sem perder dados
- RLS precisa ser revisada cuidadosamente para o novo modelo de 3 roles
- O cálculo de horário útil no frontend é uma aproximação (para precisão total seria necessário backend), mas suficiente para o caso de uso
- Feriados móveis precisam de atualização anual (calculados automaticamente via fórmula da Páscoa)

