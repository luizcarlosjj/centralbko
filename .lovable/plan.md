

## Controle Mensal de Chamados - Plano de Implementacao

### Objetivo
Adicionar um filtro de mes/ano nos paineis do Supervisor e Backoffice que filtre tanto os cards de metricas quanto a listagem de chamados, sem alterar a logica existente.

### Abordagem

Adicionar um **seletor de mes** (Select com opcoes de meses recentes + "Todos") no topo de cada painel, acima dos cards de metricas. Quando um mes e selecionado, todas as queries de dados passam a filtrar por `created_at` dentro do intervalo do mes escolhido.

### Mudancas por Arquivo

**1. `src/pages/SupervisorPanel.tsx`**
- Adicionar estado `filterMonth` (formato `"YYYY-MM"` ou `"all"`)
- Adicionar um Select com os ultimos 12 meses + opcao "Todos os meses" no cabecalho, ao lado do titulo
- Passar o filtro de mes para todas as queries:
  - `supervisor-tickets` -- adicionar `.gte('created_at', monthStart).lt('created_at', monthEnd)`
  - `supervisor-status-counts` -- aplicar mesmo filtro de mes nas 4 sub-queries de contagem
  - `supervisor-all-finished` -- filtrar por `finished_at` no mes selecionado
- Os cards de metricas (Total, Em Andamento, Pausado, Finalizados, Tempo Medio, Meta) passarao a refletir apenas o mes selecionado
- Os filtros existentes (status, prioridade, tipo, analista, data de/ate) continuam funcionando normalmente em conjunto com o filtro mensal

**2. `src/pages/BackofficePanel.tsx`**
- Mesma logica: estado `filterMonth` + Select no cabecalho
- Aplicar filtro de mes nas queries:
  - `analyst-open-tickets` -- filtrar por `created_at` no mes
  - `analyst-finished-tickets` -- filtrar por `created_at` no mes
  - `backoffice-unassigned-tickets` -- filtrar por `created_at` no mes
  - `backoffice-all-finished-meta` -- filtrar por `created_at` no mes (para recalcular meta e media individual)
- Os 5 cards de metricas (Meta Time, Meta Individual, Media Execucao, Em Aberto, Finalizados) refletirao o mes selecionado
- A busca global e ordenacao continuam funcionando normalmente

### Detalhes Tecnicos

- O seletor gera uma lista dos ultimos 12 meses com `date-fns` (ja instalado): `format(subMonths(new Date(), i), 'yyyy-MM')` para value, e label como `format(subMonths(new Date(), i), 'MMMM yyyy', { locale: ptBR })`
- Quando `filterMonth !== 'all'`, calcula-se `monthStart = startOfMonth(parse(...))` e `monthEnd = endOfMonth(parse(...))` e aplica `.gte('created_at', monthStart.toISOString()).lt('created_at', addDays(monthEnd, 1).toISOString())`
- O `filterMonth` e incluido como dependencia nas queryKeys do React Query para invalidacao automatica
- A RPC `get_team_meta_stats` do backoffice nao aceita parametro de mes -- para o Backoffice, o card "Meta Time" continuara mostrando o valor global (ou pode ser substituido por calculo local se necessario)
- Valor padrao: mes atual pre-selecionado

### UI

O seletor de mes sera posicionado na mesma linha do titulo do painel, alinhado a direita, como um Select compacto com icone de calendario. Exemplo:

```text
| Painel do Supervisor          [Marco 2026 v] [Ver Metricas →] |
|                                                                 |
| [Total] [Em Andamento] [Pausa] [Finalizados] [Media] [Meta]    |
```

Nao ha necessidade de migracoes no banco de dados -- tudo e filtrado no frontend via queries existentes.

