

# Melhorias de Correcao e Sustentacao

## 1. Responsividade do Select na tela PublicTracking

**Problema:** O `SelectContent` dentro do Dialog pode ficar cortado ou com scroll ruim em mobile.

**Solucao:**
- No `PublicTracking.tsx`, adicionar classes ao `SelectContent` para limitar altura e garantir scroll: `className="max-h-[40vh] overflow-y-auto"`
- Tambem no modal, caso o select de solicitante esteja sendo usado dentro do dialog, garantir `position="popper"` e `sideOffset` adequado

**Arquivo:** `src/pages/PublicTracking.tsx`

---

## 2. Unidades de tempo na tela de Metricas

**Problema:** O `formatTime` atual retorna `HH:MM:SS` sem indicar o que e hora, minuto ou segundo. Fica ambiguo.

**Solucao:** Alterar a funcao `formatTime` no `MetricsDashboard.tsx` para retornar formato legivel:
- Se >= 1 dia (86400s): `Xd Xh Xmin`
- Se >= 1 hora (3600s): `Xh Xmin`
- Se >= 1 minuto: `Xmin`
- Se < 1 minuto: `< 1min`

Isso afeta os cards de "Exec. Media" e "Pausa Media", o ranking backoffice/analista, e as tabelas de pausas.

**Arquivo:** `src/pages/MetricsDashboard.tsx`

---

## 3. Remover Round-Robin e implementar atribuicao manual

**Problema:** Atualmente existe um trigger `auto_assign_ticket` que faz round-robin automatico. O usuario quer atribuicao manual onde o backoffice principal (Andre) recebe tudo e pode reatribuir para outro backoffice.

### 3a. Remover trigger round-robin (migracao SQL)

Criar migracao para:
```sql
DROP TRIGGER IF EXISTS auto_assign_ticket_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.auto_assign_ticket();
```

Os tickets passarao a ser criados com `status = 'nao_iniciado'` e `assigned_analyst_id = NULL` (defaults da tabela).

### 3b. Tela do Backoffice: botao "Assumir" e "Atribuir"

No `BackofficePanel.tsx`:
- Adicionar uma nova aba/secao "Nao Atribuidos" que lista tickets com `status = 'nao_iniciado'` e `assigned_analyst_id IS NULL`
- Botao "Assumir" — atribui o ticket para si mesmo, muda status para `em_andamento` e seta `started_at = now()`
- Botao "Atribuir" — abre um select com lista de backoffices ativos, permite escolher outro backoffice para receber o ticket

Para isso, sera necessario:
- Query adicional para buscar tickets nao atribuidos (acessivel por backoffice)
- Query para listar usuarios com role `backoffice` (para o select de atribuicao)
- Nova RLS policy ou ajustar a existente para que backoffice possa ver tickets nao atribuidos (`assigned_analyst_id IS NULL`)

### 3c. RLS - Permitir backoffice ver tickets nao atribuidos

Atualmente a policy `Role-based ticket visibility` para backoffice exige `assigned_analyst_id = auth.uid()`. Precisamos expandir para incluir `assigned_analyst_id IS NULL`:

```sql
DROP POLICY IF EXISTS "Role-based ticket visibility" ON public.tickets;
CREATE POLICY "Role-based ticket visibility" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR (has_role(auth.uid(), 'backoffice'::app_role) AND (assigned_analyst_id = auth.uid() OR assigned_analyst_id IS NULL))
    OR (has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );
```

Mesma logica para UPDATE policy — backoffice precisa poder atualizar tickets nao atribuidos para assumir:

```sql
DROP POLICY IF EXISTS "Role-based ticket update" ON public.tickets;
CREATE POLICY "Role-based ticket update" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR (has_role(auth.uid(), 'backoffice'::app_role) AND (assigned_analyst_id = auth.uid() OR assigned_analyst_id IS NULL))
    OR (has_role(auth.uid(), 'analyst'::app_role) AND requester_user_id = auth.uid())
  );
```

### 3d. UI do BackofficePanel

Adicionar nova aba "Nao Atribuidos" com:
- Tabela com colunas: ID, Base, Solicitante, Prioridade, Tipo, Data, Acoes
- Acoes: "Assumir" (botao primario) e "Atribuir" (botao outline que abre dialog com select de backoffices)
- Dialog de atribuicao: select com lista de backoffices, botao confirmar

### Detalhes Tecnicos

**Migracao SQL:**
- Drop trigger e funcao round-robin
- Atualizar RLS policies de SELECT e UPDATE na tabela tickets

**Arquivos a modificar:**
1. `src/pages/MetricsDashboard.tsx` — formatTime com unidades claras (d, h, min)
2. `src/pages/PublicTracking.tsx` — responsividade do SelectContent
3. `src/pages/BackofficePanel.tsx` — nova aba "Nao Atribuidos", botoes "Assumir" e "Atribuir", query de backoffices

**Nenhuma alteracao em:**
- Fluxo do analista
- Fluxo do supervisor
- Edge functions existentes

