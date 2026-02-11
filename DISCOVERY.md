# DISCOVERY.md — Painel de Gestão de Chamados

## Resumo das Decisões

### Stack
- **Frontend:** React + Vite + Tailwind CSS + TypeScript (SPA)
- **Backend:** Supabase externo (PostgreSQL + Auth + RLS)
- **Deploy:** Hospedagem própria (Vercel, Netlify, etc.)
- **Gráficos:** Recharts

### Regras de Negócio

| Decisão | Resultado |
|---------|-----------|
| SLA por prioridade | Não implementado nesta fase |
| Reabertura de chamados | Apenas Supervisor |
| Atribuição de chamados | Analista assume manualmente |
| Edição de chamados pelo Supervisor | Não permitida |
| Notificações | In-app exclusivas ao Analista, com som audível |

### Perfis de Usuário
- **Público:** Acesso ao formulário de abertura (sem login)
- **Analista:** Login obrigatório, gerencia seus chamados, controle de tempo
- **Supervisor:** Login obrigatório, visualiza todos, métricas, reabre chamados

### Controle de Tempo
- Baseado em timestamps (sem cron)
- Tempo acumula em períodos "Em andamento"
- Pausas não contam
- Cálculo: soma de (timestamp_retomada - timestamp_inicio) para cada período ativo

### Banco de Dados
- `tickets` — chamados com controle de tempo
- `ticket_status_logs` — histórico de mudanças de status
- `profiles` — dados do usuário (vinculado a auth.users)
- `user_roles` — papéis (analyst/supervisor) com RLS e função `has_role` security definer

### RLS
- Público: apenas INSERT em tickets
- Analista: SELECT/UPDATE nos seus chamados + não atribuídos
- Supervisor: acesso total
- Função `has_role()` security definer para evitar recursão
