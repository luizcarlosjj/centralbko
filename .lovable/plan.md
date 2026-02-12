

# Correcao de Bugs e Melhorias de Tempo Real

## Diagnostico dos 4 Problemas

### Problema 1: Carregamento infinito apos F5
**Causa raiz:** O `AuthContext.tsx` tem uma condicao de corrida. O `onAuthStateChange` faz `await fetchProfileAndRole()` dentro do callback, o que bloqueia o listener do Supabase. Quando a pagina recarrega e o token e revalidado, o callback trava esperando a resposta do banco, e o `loading` nunca vira `false`. Alem disso, `getSession()` e `onAuthStateChange` competem entre si, podendo setar `loading = false` antes do perfil/role serem carregados.

**Solucao:** Reestruturar o `AuthContext`:
- No `onAuthStateChange`: apenas setar `session` e `user` (sem await, sem fetch)
- Usar um `useEffect` separado que observa `user` e dispara `fetchProfileAndRole`
- Controlar `loading` de forma unificada: so desliga quando tanto a sessao quanto o perfil estiverem resolvidos

### Problema 2: Formato do tempo sem segundos
**Causa raiz:** O `SupervisorPanel.tsx` usa `formatTime` que retorna `Xh Xm` (sem segundos). O `AnalystPanel.tsx` ja tem formato HH:MM:SS mas o tempo exibido e estatico (valor do banco).

**Solucao:** Padronizar `formatTime` com HH:MM:SS em todos os paineis.

### Problema 3: Timer estatico (nao conta em tempo real)
**Causa raiz:** A coluna "Tempo" mostra `total_execution_seconds` do banco, que so e atualizado ao pausar/finalizar. Nao ha nenhum `setInterval` no frontend para calcular o tempo decorrido em tempo real.

**Solucao:** Criar um componente `LiveTimer` que:
- Recebe o ticket como prop
- Se status = `em_andamento` e tem `started_at`: calcula `total_execution_seconds + (now - started_at)` e atualiza a cada segundo via `setInterval`
- Se status = `pausado`: mostra o valor estatico do banco (tempo congelado)
- Se status = `finalizado`: mostra o valor final do banco

### Problema 4: Chamados nao aparecem em tempo real
**Causa raiz:** A `NotificationBell` escuta INSERT de tickets via Realtime, mas os paineis (AnalystPanel, SupervisorPanel) usam React Query com `staleTime` de 30s. Nao ha subscription Realtime para invalidar o cache quando um ticket novo chega ou muda de status.

**Solucao:** Adicionar subscription Supabase Realtime nos paineis que invalida as queries do React Query ao detectar INSERT ou UPDATE na tabela `tickets`.

---

## Alteracoes por Arquivo

### 1. `src/contexts/AuthContext.tsx`
- Remover `await fetchProfileAndRole()` de dentro do `onAuthStateChange`
- Adicionar `useEffect` separado: quando `user` muda, buscar profile e role
- Unificar controle de `loading`: iniciar como `true`, desligar somente quando sessao e perfil estiverem resolvidos
- Tratar caso de `user = null` (logout / sem sessao) desligando loading imediatamente

### 2. `src/components/LiveTimer.tsx` (novo)
- Componente que recebe um `Ticket`
- Usa `useState` + `useEffect` com `setInterval(1000)`
- Calcula tempo real: `base + elapsed` onde `base = total_execution_seconds` e `elapsed = now - started_at` (apenas se em_andamento)
- Formata em HH:MM:SS
- Limpa intervalo no unmount

### 3. `src/pages/AnalystPanel.tsx`
- Substituir a celula de tempo estatica pelo componente `LiveTimer`
- Adicionar `useEffect` com Supabase Realtime subscription na tabela `tickets` (INSERT e UPDATE) que chama `invalidateQueries` para atualizar a lista automaticamente
- Limpar subscription no unmount

### 4. `src/pages/SupervisorPanel.tsx`
- Atualizar `formatTime` para formato HH:MM:SS
- Substituir celula de tempo pelo `LiveTimer` (para tickets em andamento)
- Adicionar Realtime subscription igual ao AnalystPanel

### 5. `src/pages/MetricsDashboard.tsx`
- Adicionar Realtime subscription para invalidar cache de metricas quando tickets mudam

---

## Sequencia de Implementacao

1. Corrigir `AuthContext.tsx` (resolve carregamento infinito)
2. Criar `LiveTimer.tsx` (componente de timer em tempo real)
3. Atualizar `AnalystPanel.tsx` (LiveTimer + Realtime)
4. Atualizar `SupervisorPanel.tsx` (HH:MM:SS + LiveTimer + Realtime)
5. Atualizar `MetricsDashboard.tsx` (Realtime)

---

## Detalhes Tecnicos

- O Realtime do Supabase ja esta habilitado (NotificationBell ja usa `postgres_changes`)
- O `invalidateQueries` do React Query forca re-fetch respeitando o cache, sem duplicar requests
- O `LiveTimer` usa `setInterval` de 1 segundo apenas para tickets `em_andamento`, evitando processamento desnecessario
- Nenhuma regra de negocio sera alterada
- Nenhuma migracao SQL necessaria

