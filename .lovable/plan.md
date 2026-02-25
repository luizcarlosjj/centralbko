

# Plano: Correcao de Dados e Metricas do Sistema de Chamados

## Problemas Identificados

### 1. Meta 48h usa tempo de relogio em vez de tempo util
**Arquivo:** `src/pages/MetricsDashboard.tsx` (linha 80-84)
O calculo atual usa `new Date(finished_at).getTime() - new Date(created_at).getTime()` (milissegundos de relogio). Isso significa que um chamado criado sexta as 17h e finalizado segunda as 09h aparece como ~64h, quando na verdade foram poucas horas uteis. Deve usar `calculateBusinessSeconds` para contar apenas tempo util (08:00-18:00, excluindo almoco e feriados).

### 2. Finalizacao de chamado no BackofficePanel usa tempo de relogio
**Arquivo:** `src/pages/BackofficePanel.tsx` (linhas 200-201)
```typescript
execSeconds += Math.floor((now.getTime() - new Date(ticket.started_at).getTime()) / 1000);
```
Deveria usar `calculateBusinessSeconds(new Date(ticket.started_at), now)` para acumular apenas tempo util de execucao.

### 3. Retomada de pausa no SupervisorPanel usa tempo de relogio
**Arquivo:** `src/pages/SupervisorPanel.tsx` (linhas 203, 210)
O calculo de `pausedSecs` e `additionalPaused` usa `Date.now() - pauseStart` em vez de business time.

### 4. Tempo medio no SupervisorPanel calculado apenas da pagina atual
**Arquivo:** `src/pages/SupervisorPanel.tsx` (linhas 243-245)
O `avgTime` e calculado apenas dos tickets da pagina filtrada/paginada, nao de todos os tickets finalizados. Deve ser um valor global.

### 5. Falta card "Meta 48h" no painel do Backoffice
O usuario solicitou que o BackofficePanel tenha um indicador de "media de conclusao em ate 48h" similar ao que existe no MetricsDashboard.

### 6. Feriados de Carnaval ja estao corretos
O `business-time.ts` calcula corretamente Carnaval como Easter-49 (segunda) e Easter-48 (terca). Para 2026, Pascoa = 5 de abril, entao Carnaval = 16/02 (segunda) e 17/02 (terca). Esses dias ja sao excluidos do calculo de tempo util. Nenhuma alteracao necessaria aqui.

## Alteracoes Planejadas

### Arquivo 1: `src/pages/MetricsDashboard.tsx`
- Importar `calculateBusinessSeconds` de `@/lib/business-time`
- Alterar calculo de Meta 48h para usar `calculateBusinessSeconds(created_at, finished_at)` em vez de diferenca de milissegundos
- 48h uteis = 48 * 3600 = 172800 segundos de negocio

### Arquivo 2: `src/pages/BackofficePanel.tsx`
- Importar `calculateBusinessSeconds` de `@/lib/business-time`
- No `finalizeTicket`, substituir calculo de `execSeconds` por `calculateBusinessSeconds`
- Adicionar card "Meta 48h" no topo do painel com contagem de chamados finalizados pelo backoffice logado em ate 48h uteis, usando query separada para buscar todos finalizados do usuario

### Arquivo 3: `src/pages/SupervisorPanel.tsx`
- Importar `calculateBusinessSeconds`
- No `resumeTicket`, substituir calculo de tempo pausado por business time
- Adicionar query global para tempo medio de todos os finalizados (nao apenas da pagina atual)
- Adicionar card "Meta 48h" aos cards do supervisor

### Detalhes Tecnicos

**Calculo correto de Meta 48h:**
```text
Para cada ticket finalizado:
  businessSecs = calculateBusinessSeconds(created_at, finished_at)
  Se businessSecs <= 172800 (48h uteis) → conta como "dentro da meta"
```

**Card Meta 48h no BackofficePanel:**
- Query adicional para buscar todos os tickets finalizados do usuario logado (com paginacao para superar limite de 1000)
- Calculo local: quantidade concluida em ate 48h uteis / total finalizado
- Exibicao: percentual + contagem absoluta

**Card Meta 48h no SupervisorPanel:**
- Adicionar query global de todos os tickets finalizados (nao paginada)
- Calcular Meta 48h usando `calculateBusinessSeconds` para cada ticket
- Exibir ao lado dos cards existentes

**Arquivos modificados:**
- `src/pages/MetricsDashboard.tsx`
- `src/pages/BackofficePanel.tsx`
- `src/pages/SupervisorPanel.tsx`

Nenhuma alteracao de banco de dados necessaria.

