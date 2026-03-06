

## Filtro Mensal no Dashboard de Metricas

### Abordagem

Aplicar o mesmo padrao ja usado no SupervisorPanel e BackofficePanel: adicionar um seletor de mes dinamico no topo da pagina que filtra todos os dados (cards, rankings, graficos) pelo mes selecionado. Mes atual como padrao.

### Mudancas em `src/pages/MetricsDashboard.tsx`

1. **Imports**: Adicionar `format, parse, startOfMonth, endOfMonth, addDays, eachMonthOfInterval, subMonths` de `date-fns`, `ptBR` de `date-fns/locale/pt-BR`, `CalendarIcon` de `lucide-react`, e os componentes `Select/SelectTrigger/SelectValue/SelectContent/SelectItem`.

2. **Query de range de datas**: Adicionar query `ticket-date-range` (mesmo padrao dos outros paineis) para buscar min/max `created_at` e gerar opcoes de meses dinamicamente.

3. **Estado `filterMonth`**: Valor padrao `format(new Date(), 'yyyy-MM')`. Calcular `monthDateRange` com start/end ISO strings.

4. **Filtrar a query principal `metrics-tickets`**: Adicionar `filterMonth` na queryKey e aplicar `.gte('created_at', start).lt('created_at', end)` quando nao for `'all'`.

5. **Adaptar graficos diarios/semanais**: Remover o filtro hardcoded de "ultimos 30 dias" (`last30`) e usar todos os tickets ja filtrados pela query (que ja vem filtrados pelo mes). Os graficos diarios e semanais mostrarao dados do mes selecionado em vez de sempre os ultimos 30 dias.

6. **UI do seletor**: Posicionar ao lado do titulo "Dashboard de Metricas", alinhado a direita, com icone de calendario -- mesmo visual dos outros paineis.

Nenhuma outra logica sera alterada -- rankings, calculos de meta, formatacao, tudo continua identico, apenas operando sobre o subconjunto filtrado pelo mes.

