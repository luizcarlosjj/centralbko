# CHANGELOG.md — Histórico de Aprovações e Decisões

## 2026-02-11 — Sessão Inicial

### Decisões Aprovadas pelo Usuário

1. **Stack confirmada:** React + Vite + Tailwind (não Next.js, limitação da plataforma)
2. **SLA:** Sem SLA por enquanto
3. **Reabertura:** Apenas supervisor pode reabrir chamados finalizados
4. **Atribuição:** Analista assume chamado manualmente (não supervisor)
5. **Edição pelo Supervisor:** Não permitida
6. **Notificações:** In-app exclusivas ao analista com sonoridade marcante
7. **Backend:** Supabase externo (não Lovable Cloud)

### Arquitetura Aprovada

- Formulário público em `/`
- Login em `/login`
- Dashboard em `/dashboard` (redireciona conforme role)
- Métricas em `/metrics` (supervisor only)
- Tabelas: `tickets`, `ticket_status_logs`, `profiles`, `user_roles`
- RLS com função `has_role()` security definer

### Implementação Inicial

- Criados: tipos, cliente Supabase, contexto de auth, rotas protegidas
- Páginas: formulário público, login, painel analista, painel supervisor, dashboard métricas
- Componentes: layout, notificações in-app com som
- Design system atualizado com cores semânticas (success, warning, info)
- Documentação: DISCOVERY.md e CHANGELOG.md
