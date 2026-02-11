

# Ajustes Funcionais e Melhorias Operacionais

## Visao Geral

Este plano implementa 10 mudancas estruturais no sistema de chamados: atribuicao automatica round-robin, contagem de tempo desde a criacao, motivo obrigatorio para pausa com upload de evidencia, e reorganizacao das abas do painel do analista.

---

## 1. Novas Tabelas e Migracoes SQL

### Tabela `assignment_control`
Controla o round-robin de atribuicao automatica.

```text
assignment_control
  id             uuid (PK, default gen_random_uuid())
  last_assigned_user_id  uuid (nullable)
  updated_at     timestamptz (default now())
```

### Tabela `pause_reasons`
Motivos de pausa gerenciados pelo Supervisor.

```text
pause_reasons
  id          uuid (PK)
  title       text (not null)
  description text
  active      boolean (default true)
  created_by  uuid (not null)
  created_at  timestamptz (default now())
```

### Tabela `pause_logs`
Registro de cada pausa com motivo e tempos.

```text
pause_logs
  id               uuid (PK)
  ticket_id        uuid (FK tickets)
  pause_reason_id  uuid (FK pause_reasons)
  description_text text
  pause_started_at timestamptz (default now())
  pause_ended_at   timestamptz (nullable)
  paused_seconds   integer (default 0)
  created_by       uuid (not null)
```

### Tabela `pause_evidences`
Anexos de comprovacao de pausa.

```text
pause_evidences
  id              uuid (PK)
  ticket_id       uuid (FK tickets)
  pause_log_id    uuid (FK pause_logs)
  file_url        text (not null)
  uploaded_by     uuid (not null)
  created_at      timestamptz (default now())
```

### Coluna nova em `tickets`
- Adicionar `pause_started_at` (timestamptz, nullable) para rastrear inicio de pausa ativa.

### Storage Bucket
- Criar bucket `pause-evidences` (publico) para armazenar prints/imagens.

### Funcao de Round-Robin (Database Trigger)
Como o formulario publico e anonimo, a atribuicao automatica sera feita via **trigger no banco** (nao no frontend):

1. Funcao `auto_assign_ticket()` (SECURITY DEFINER):
   - Busca todos analistas ativos em `user_roles` WHERE role = 'analyst', ordenados por `user_id`
   - Busca `last_assigned_user_id` de `assignment_control`
   - Seleciona o proximo analista na sequencia (round-robin)
   - Atualiza o ticket com `assigned_analyst_id`, `status = 'em_andamento'`, `started_at = now()`
   - Atualiza `assignment_control.last_assigned_user_id`

2. Trigger `on_ticket_created` AFTER INSERT em `tickets` que chama `auto_assign_ticket()`

3. Inserir registro inicial em `assignment_control` (1 linha, sem last_assigned)

### Politicas RLS

- `pause_reasons`: SELECT para authenticated; INSERT/UPDATE para supervisor (via `has_role`)
- `pause_logs`: SELECT para authenticated; INSERT para analyst do ticket
- `pause_evidences`: SELECT para authenticated; INSERT para analyst do ticket
- `assignment_control`: sem acesso direto (apenas via trigger SECURITY DEFINER)

---

## 2. Alteracoes no Frontend

### 2.1 Formulario Publico (`PublicTicketForm.tsx`)
- Remover `status: 'nao_iniciado'` do insert (o trigger cuida disso)
- Manter o insert simples; o banco faz a atribuicao

### 2.2 Tipos (`src/types/tickets.ts`)
- Remover `nao_iniciado` do `TicketStatus` (nao existe mais como status inicial)
- Adicionar interfaces `PauseReason`, `PauseLog`, `PauseEvidence`
- Atualizar `STATUS_LABELS` (remover "Nao Iniciado")
- Adicionar campo `pause_started_at` ao tipo `Ticket`

### 2.3 Painel do Analista (`AnalystPanel.tsx`) -- Reestruturacao Completa

**Remover:**
- Aba "Disponíveis" (nao existem mais chamados nao atribuidos)
- Funcao `assumeTicket` (atribuicao e automatica)
- Botao "Iniciar" (chamados ja comecam em andamento)

**Nova estrutura de abas (side-by-side):**

```text
[ Em Aberto (X) ] [ Finalizados (Y) ]
```

**Aba "Em Aberto":**
- Mostra chamados do analista com status `em_andamento` ou `pausado`
- Filtros: Status, Prioridade, Tipo, Data
- Acoes: Pausar (abre dialog), Retomar, Finalizar

**Aba "Finalizados":**
- Mostra chamados do analista com status `finalizado`
- Somente leitura (sem botoes de acao)
- Mostra: tempo total execucao, tempo pausado, data finalizacao
- Expande para mostrar historico de pausas (pause_logs)

### 2.4 Dialog de Pausa (novo componente `PauseDialog.tsx`)
Ao clicar "Pausar":
1. Abre dialog modal
2. Campos obrigatorios:
   - Dropdown: motivo (busca de `pause_reasons` ativos)
   - Textarea: descricao textual
   - Upload: pelo menos 1 imagem/print
3. Botao "Confirmar Pausa" so habilitado quando todos preenchidos
4. Ao confirmar:
   - Faz upload do(s) arquivo(s) para `pause-evidences/{ticket_id}/`
   - Cria registro em `pause_logs`
   - Cria registro(s) em `pause_evidences`
   - Atualiza ticket: `status = 'pausado'`, `pause_started_at = now()`, acumula `total_execution_seconds`
   - Registra em `ticket_status_logs`

### 2.5 Logica de Retomar
Ao clicar "Retomar":
- Busca `pause_log` ativo (sem `pause_ended_at`)
- Calcula `paused_seconds` = now() - pause_started_at
- Atualiza `pause_logs.pause_ended_at` e `pause_logs.paused_seconds`
- Atualiza ticket: `status = 'em_andamento'`, `started_at = now()`, limpa `pause_started_at`, acumula `total_paused_seconds`

### 2.6 Logica de Finalizar
- Acumula tempo de execucao restante
- Se pausado, primeiro fecha a pausa ativa
- Seta `finished_at`, calcula tempo final

### 2.7 Painel do Supervisor -- Gestao de Motivos de Pausa
Adicionar no `SupervisorPanel.tsx` ou criar pagina separada `/pause-reasons`:
- Tabela com motivos existentes (titulo, descricao, status ativo/inativo)
- Botao "Novo Motivo" abre dialog com titulo + descricao
- Botao toggle ativar/desativar em cada motivo
- Botao editar para alterar titulo/descricao

Adicionar link na sidebar do Supervisor para essa pagina.

### 2.8 Atualizacao do Supervisor Panel
- Remover status "Nao Iniciado" dos filtros
- Funcao `reopenTicket` agora reabre como `em_andamento` (nao mais `nao_iniciado`)

---

## 3. Sequencia de Implementacao

1. **Migracao SQL**: criar tabelas, bucket, funcao trigger, RLS, inserir registro inicial assignment_control
2. **Atualizar tipos** em `src/types/tickets.ts`
3. **Criar componente `PauseDialog.tsx`** com upload + formulario
4. **Criar pagina `PauseReasons.tsx`** para supervisor gerenciar motivos
5. **Reescrever `AnalystPanel.tsx`** com novas abas e logica
6. **Atualizar `SupervisorPanel.tsx`** (remover nao_iniciado, ajustar reabrir)
7. **Atualizar `PublicTicketForm.tsx`** (remover status do insert)
8. **Atualizar `App.tsx`** (adicionar rota /pause-reasons)
9. **Atualizar `AppLayout.tsx`** (adicionar link na sidebar)

---

## Detalhes Tecnicos Adicionais

- O trigger de auto-assign roda como SECURITY DEFINER, portanto tem acesso a `user_roles` mesmo para inserts anonimos
- O bucket `pause-evidences` sera publico para facilitar visualizacao das imagens
- RLS no bucket: INSERT para authenticated, SELECT para authenticated
- A funcao de round-robin lida com qualquer numero de analistas (2, 3, 4+)
- Se nao houver analistas cadastrados, o ticket fica sem atribuicao (fallback seguro)

