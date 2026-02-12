

# Otimizacao de Performance e Reducao de Consumo

## Visao Geral

Otimizacao tecnica completa sem alterar regras de negocio. Foco em: paginacao de listagens, indices no banco, cache com React Query, compressao de imagens antes do upload, e lazy loading de componentes pesados.

---

## 1. Indices no Banco de Dados (SQL Migration)

Criar indices para acelerar as queries mais frequentes:

```text
- tickets(status)
- tickets(assigned_analyst_id)
- tickets(created_at DESC)
- tickets(assigned_analyst_id, status)  -- indice composto para AnalystPanel
- pause_logs(ticket_id)
- pause_logs(ticket_id, pause_ended_at) -- para buscar pausa ativa
- pause_evidences(pause_log_id)
```

---

## 2. Paginacao em Todas as Listagens

### 2.1 AnalystPanel.tsx
- Adicionar paginacao com limite de 20 registros por pagina nas abas "Em Aberto" e "Finalizados"
- Usar `.range(from, to)` do Supabase em vez de carregar tudo
- Buscar contagem total com `{ count: 'exact', head: true }` para exibir total de paginas
- Componente de paginacao na parte inferior de cada aba usando `src/components/ui/pagination.tsx`

### 2.2 SupervisorPanel.tsx
- Mesmo padrao: paginacao de 20 registros
- Mover filtragem para o lado do banco (WHERE clauses via Supabase query builder) em vez de filtrar client-side
- Buscar apenas colunas necessarias: `select('id, base_name, requester_name, priority, type, status, assigned_analyst_id, total_execution_seconds, created_at, finished_at')` em vez de `select('*')`

### 2.3 MetricsDashboard.tsx
- Manter carregamento completo para agregacoes (necessario para calculos de metricas)
- Adicionar `staleTime` via React Query para cachear por 120 segundos
- Selecionar apenas colunas necessarias para metricas: `select('id, status, priority, type, assigned_analyst_id, total_execution_seconds, created_at')`

### 2.4 PauseReasons.tsx
- Adicionar paginacao de 20 registros (menor impacto, mas consistente)

---

## 3. React Query para Cache e Gerenciamento de Estado

### Substituir useState + useEffect por useQuery em todas as paginas:

**AnalystPanel.tsx:**
- `useQuery` para tickets abertos com `staleTime: 30_000` (30s)
- `useQuery` para tickets finalizados com `staleTime: 60_000` (60s)
- `useMutation` para acoes (pausar, retomar, finalizar) com `invalidateQueries` automatico

**SupervisorPanel.tsx:**
- `useQuery` para tickets e analistas com `staleTime: 30_000`
- `useMutation` para reabrir ticket

**MetricsDashboard.tsx:**
- `useQuery` com `staleTime: 120_000` (2 min) -- metricas nao precisam de refresh constante

**PauseReasons.tsx:**
- `useQuery` com `staleTime: 60_000`

Beneficios: elimina re-fetch ao navegar entre abas, cache automatico, deduplicacao de requests.

---

## 4. Compressao de Imagens no Upload (PauseDialog.tsx)

Criar utilitario `src/lib/image-compression.ts`:
- Redimensionar para largura maxima de 1280px
- Qualidade JPEG/WebP: 75%
- Usar Canvas API nativo do browser (sem dependencia externa)
- Limite de 5MB por arquivo (rejeitar acima disso com toast de erro)
- Converter PNG para JPEG quando nao houver transparencia

Atualizar `PauseDialog.tsx`:
- Chamar `compressImage()` antes de cada upload
- Mostrar tamanho original vs comprimido em texto informativo

---

## 5. Lazy Loading de Componentes Pesados

### No App.tsx:
- `React.lazy()` para paginas secundarias:
  - `MetricsDashboard` (contem Recharts -- biblioteca pesada)
  - `PauseReasons`
  - `UserManagement`
- Envolver em `<Suspense>` com fallback de skeleton/spinner
- Manter `Dashboard`, `Login` e `PublicTicketForm` como imports normais (paginas primarias)

---

## 6. Selecao de Colunas Especificas (Evitar SELECT *)

Atualizar todas as queries para buscar apenas colunas usadas:

| Pagina | Query atual | Colunas necessarias |
|--------|------------|-------------------|
| AnalystPanel | `select('*')` em tickets | `id, base_name, requester_name, priority, type, status, total_execution_seconds, total_paused_seconds, created_at, started_at, finished_at, pause_started_at, assigned_analyst_id` |
| SupervisorPanel | `select('*')` em tickets e profiles | tickets: mesmas acima. profiles: `id, name` |
| MetricsDashboard | `select('*')` em tickets e profiles | tickets: `id, status, priority, type, assigned_analyst_id, total_execution_seconds, created_at`. profiles: `id, name` |
| PauseDialog | `select('*')` em pause_reasons | `id, title` |

---

## 7. Debounce em Filtros

Nos paineis com filtros de data (AnalystPanel, SupervisorPanel):
- Adicionar debounce de 400ms nos campos de data para evitar re-fetch a cada keystroke
- Filtros de Select (status, prioridade, tipo) podem ser imediatos pois sao selecao unica

---

## 8. Organizacao de Upload no Storage

Atualizar path de upload no `PauseDialog.tsx`:
- De: `{ticket_id}/{timestamp}_{filename}`
- Para: `tickets/{ticket_id}/pauses/{pause_log_id}/{timestamp}_{filename}`
- Estrutura mais organizada para eventual limpeza

---

## Sequencia de Implementacao

1. **Migration SQL**: criar indices
2. **Criar `src/lib/image-compression.ts`**: utilitario de compressao
3. **Atualizar `PauseDialog.tsx`**: compressao + limite de tamanho
4. **Atualizar `AnalystPanel.tsx`**: React Query + paginacao + colunas especificas
5. **Atualizar `SupervisorPanel.tsx`**: React Query + paginacao server-side + colunas especificas
6. **Atualizar `MetricsDashboard.tsx`**: React Query com staleTime + colunas especificas
7. **Atualizar `PauseReasons.tsx`**: React Query + paginacao
8. **Atualizar `App.tsx`**: lazy loading das paginas secundarias

---

## Detalhes Tecnicos

- React Query ja esta instalado (`@tanstack/react-query`) e configurado no `App.tsx` com `QueryClient`
- Paginacao usa componente existente em `src/components/ui/pagination.tsx`
- Compressao de imagem usa Canvas API nativa -- zero dependencias externas
- Nenhuma regra de negocio sera alterada
- Nenhuma funcionalidade sera removida
- Todas as mudancas sao retrocompativeis

