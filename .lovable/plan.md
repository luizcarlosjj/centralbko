

## Plano de Ajustes: Meta 48h, Exclusao de Chamados, Pesquisa e Ordenacao

### 1. Correcao da Meta 48h

**Problema:** A meta de 48h esta usando `48 * 3600 = 172.800 segundos`, mas 48h uteis nao correspondem a 48 horas de relogio. Um dia util tem 8h48min (528 minutos = 31.680 segundos), entao 2 dias uteis = 17h36min = 63.360 segundos.

**Alteracao em 3 arquivos:**
- `src/pages/MetricsDashboard.tsx` (linha 81): `FORTY_EIGHT_HOURS_BIZ = 63360`
- `src/pages/SupervisorPanel.tsx` (linha 270): `FORTY_EIGHT_HOURS_BIZ = 63360`
- `src/pages/BackofficePanel.tsx` (linha 168): `FORTY_EIGHT_HOURS_BIZ = 63360`
- Atualizar labels de "48h uteis" para "2 dias uteis (17h36min)" nos textos dos cards

Tambem atualizar a edge function `recalculate-business-time` caso use esse threshold.

### 2. Supervisor pode excluir chamados

**Arquivo:** `src/pages/SupervisorPanel.tsx`

- Adicionar botao "Excluir" com icone `Trash2` na coluna de acoes de cada ticket
- Adicionar dialog de confirmacao (`AlertDialog`) antes de excluir
- Criar funcao `deleteTicket` que:
  1. Deleta registros dependentes na ordem: `pause_response_files`, `pause_responses`, `pause_evidences`, `pause_logs`, `ticket_status_logs`
  2. Deleta o ticket
- Necessaria migration SQL para adicionar policy de DELETE na tabela `tickets` para supervisores, e nas tabelas dependentes

**Migration SQL:**
```sql
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can delete tickets"
  ON public.tickets FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete ticket_status_logs"
  ON public.ticket_status_logs FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_logs"
  ON public.pause_logs FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_evidences"
  ON public.pause_evidences FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_responses"
  ON public.pause_responses FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete pause_response_files"
  ON public.pause_response_files FOR DELETE
  USING (has_role(auth.uid(), 'supervisor'::app_role));
```

### 3. Pesquisa global no BackofficePanel (todas as abas)

**Problema atual:** A busca so funciona na aba "Finalizados". As abas "Nao Atribuidos" e "Em Aberto" nao tem pesquisa.

**Solucao:**
- Mover a barra de busca para fora das tabs, no topo, como campo global
- Aplicar filtro de texto (por ID, base_name, requester_name) em todas as 3 abas:
  - `unassignedTickets` — filtro local
  - `filteredOpen` — adicionar filtro de texto alem dos filtros existentes
  - `finishedTickets` — ja tem, unificar com o campo global

### 4. Ordenacao de colunas no BackofficePanel

**Todas as 3 abas (Nao Atribuidos, Em Aberto, Finalizados):**
- Adicionar estado `sortColumn` e `sortDirection` (asc/desc)
- Colunas ordenaveis: ID, Base, Solicitante, Prioridade, Data, Tempo
- Ao clicar no cabecalho da coluna, alterna a direcao de ordenacao
- Icone `ArrowUpDown` / `ArrowUp` / `ArrowDown` no cabecalho

### 5. Pesquisa e ordenacao nos chamados em aberto (BackofficePanel aba "Em Aberto")

Ja coberto pelos itens 3 e 4 acima. A pesquisa por nome ou codigo sera o campo global, e a ordenacao sera pelas colunas clicaveis.

### 6. Pesquisa e ordenacao no SupervisorPanel

Aplicar o mesmo padrao de pesquisa por texto e ordenacao de colunas na tabela do supervisor.

---

### Resumo de arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `src/pages/MetricsDashboard.tsx` | Meta 48h = 63360s, labels |
| `src/pages/SupervisorPanel.tsx` | Meta 48h = 63360s, botao excluir + dialog, pesquisa, ordenacao |
| `src/pages/BackofficePanel.tsx` | Meta 48h = 63360s, pesquisa global, ordenacao colunas |
| Migration SQL | Policies DELETE para supervisor |

