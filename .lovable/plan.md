

## Analise do Problema

### Causa Raiz

O card "Meta 2 Dias Úteis" no frontend calcula o tempo usando `calculateBusinessSeconds(created_at, finished_at)` -- ou seja, o **tempo total de negócio decorrido** entre a criação e a finalização do chamado. Isso inclui o tempo em que o chamado esteve **pausado**.

Porém, a meta deveria usar o `total_execution_seconds` armazenado no banco de dados, que representa o **tempo real de execução** (descontando pausas).

**Prova:**
- Consulta no banco: `total_execution_seconds > 63360` retorna **exatamente 2 chamados** (conforme o usuário espera)
- O frontend recalcula com `calculateBusinessSeconds(created_at, finished_at)` que dá valores muito maiores por incluir pausas, resultando em mais chamados "fora da meta"

### Exemplo concreto
- Ticket "Tecnofrio Gravatai": `total_execution_seconds = 60060` (abaixo da meta), mas `calculateBusinessSeconds(created_at, finished_at)` para o intervalo `2026-02-18 00:00 → 2026-02-19 14:41` daria ~21h+ de tempo útil (acima da meta) -- porque inclui todo o tempo pausado

### Mudanças Necessárias

**1. Card "Meta 2 Dias Úteis" (linhas 82-87 do MetricsDashboard.tsx)**
- Trocar `calculateBusinessSeconds(created_at, finished_at)` por `t.total_execution_seconds`
- Comparar `total_execution_seconds <= 63360` para determinar se está dentro da meta

**2. Ranking Backoffice -- Remover "Meta 48h" (linhas 316-320)**
- Remover o bloco que exibe `{b.meta48h}%` e "Meta 48h" no canto superior direito de cada card do ranking

**3. Ranking Backoffice -- Recalcular meta com total_execution_seconds (linhas 118-122)**
- Usar `t.total_execution_seconds <= FORTY_EIGHT_HOURS_BIZ` em vez de `calculateBusinessSeconds`

**4. Linha de rodapé do ranking (linha 347)**
- Manter o texto "{b.within48h} de {b.finalizados} concluídos em até 2 dias úteis" que já usa o valor corrigido

### Resumo das alterações

Arquivo: `src/pages/MetricsDashboard.tsx`
- Linha 82-86: Usar `total_execution_seconds` no cálculo do card global
- Linhas 118-121: Usar `total_execution_seconds` no cálculo por backoffice  
- Linhas 316-320: Remover exibição "Meta 48h" do ranking

Nenhuma alteração necessária no banco de dados ou edge functions.

