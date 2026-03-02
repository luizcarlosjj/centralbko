

## Diagnostico do Problema

O seletor de mes gera apenas os **ultimos 12 meses a partir de hoje** (abril 2025 a marco 2026). Porem, existem chamados importados da planilha com datas futuras no campo `created_at` -- outubro, novembro e dezembro de 2026. Esses ~46 chamados nao aparecem em nenhuma opcao do seletor, mas aparecem quando "Todos os meses" esta selecionado (115 total).

Dados observados nas requisicoes:
- Chamados com `created_at` em `2026-10-02`, `2026-11-02`, `2026-12-02` (meses futuros)
- Todos importados da planilha com datas que provavelmente estavam no formato dia/mes e foram interpretados como mes/dia

## Solucao Proposta

Substituir a geracao estatica de 12 meses por uma geracao **dinamica baseada nos dados reais**. Consultar o min/max de `created_at` da tabela `tickets` e gerar opcoes de mes para todo o intervalo existente.

### Mudancas

**1. `src/pages/SupervisorPanel.tsx`**
- Adicionar uma query leve para buscar o range de datas: `select min(created_at), max(created_at) from tickets` (via duas queries ordenadas com limit 1)
- Substituir o loop `for (let i = 0; i < 12; i++)` por um loop que gera meses desde o mais antigo ate o mais recente (ou ate o mes atual, o que for maior)
- Manter o valor padrao como mes atual

**2. `src/pages/BackofficePanel.tsx`**
- Aplicar a mesma logica de geracao dinamica de meses

### Detalhes Tecnicos

- Query para range: duas chamadas `supabase.from('tickets').select('created_at').order('created_at', {ascending: true/false}).limit(1)` para obter min e max
- Gerar meses com `eachMonthOfInterval({ start: minDate, end: maxDate })` do `date-fns`
- Ordenar do mais recente ao mais antigo para manter a UX atual
- Se nenhum ticket existir, fallback para os ultimos 12 meses

