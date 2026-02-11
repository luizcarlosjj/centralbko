

# Painel de Gestão de Chamados - Backoffice

## Visão Geral
Sistema web para gestão de chamados substituindo o processo manual via Google Sheets, com controle de tempo, métricas e produtividade. Construído com React + Vite + Tailwind e Supabase externo.

> **Nota técnica:** O Lovable não suporta Next.js. O sistema será uma SPA React que pode ser hospedada em qualquer serviço (Vercel, Netlify, etc.) como site estático, com Supabase externo como backend.

---

## 1. Formulário Público de Abertura de Chamado (Sem Login)
- Página acessível sem autenticação
- Campos: Nome da Base, Nome do Solicitante, Prioridade (Baixa/Média/Alta/Urgente), Tipo (Setup Questionário/Cliente/Ajuste/Outro), Descrição
- ID e data gerados automaticamente
- Status inicial: "Não iniciado"
- Tela de confirmação com o número do chamado após envio

## 2. Autenticação e Perfis
- Login via Supabase Auth (email/senha)
- Dois perfis: **Analista** e **Supervisor**
- Roles armazenados em tabela separada (`user_roles`) com RLS e função `has_role` security definer
- Redirecionamento automático conforme perfil após login

## 3. Painel do Analista
- Lista de chamados disponíveis (não atribuídos) para o analista assumir
- Lista de chamados já assumidos pelo analista
- Ações de status: Não iniciado → Em andamento → Pausado ↔ Em andamento → Finalizado
- **Controle de tempo:** cálculo via timestamps (sem cron), acumulando períodos ativos
- Cada mudança de status registra log (quem, quando, status anterior/novo)
- **Notificações in-app** com ícone de sino e som audível quando um novo chamado é atribuído ou há atualizações relevantes

## 4. Painel do Supervisor
- Visualizar todos os chamados com filtros (data, analista, tipo, prioridade, status)
- **Reabrir chamados finalizados** (exclusivo do supervisor)
- Visão geral com cards resumo: total, em andamento, finalizados, tempo médio

## 5. Dashboard de Métricas (Supervisor)
- **Cards resumo:** Total de chamados, Em andamento, Finalizados, Tempo médio por chamado
- **Gráficos (Recharts):**
  - Chamados por prioridade
  - Chamados por tipo
  - Chamados por analista
  - Evolução por período (linha do tempo)
  - Ranking de produtividade por analista
- Métricas calculadas: tempo médio por tipo, por prioridade, por analista, volume mensal

## 6. Banco de Dados (Supabase Externo)
- **tickets:** id, base_name, requester_name, priority, type, description, status, created_at, started_at, finished_at, total_execution_seconds, total_paused_seconds, assigned_analyst_id
- **ticket_status_logs:** id, ticket_id, changed_by, old_status, new_status, changed_at
- **profiles:** id, name, created_at (vinculado ao auth.users)
- **user_roles:** id, user_id, role (enum: supervisor, analyst)
- RLS: Analista vê apenas seus chamados + chamados não atribuídos; Supervisor vê todos; Público apenas insere

## 7. Controle de Acesso (RLS)
- Formulário público: apenas INSERT em tickets
- Analista: SELECT/UPDATE nos seus chamados e chamados sem atribuição
- Supervisor: acesso total + permissão de reabertura
- Função `has_role()` security definer para evitar recursão em RLS

## Arquivos de Documentação
- Será gerado `DISCOVERY.md` com resumo das decisões e regras de negócio
- Será gerado `CHANGELOG.md` para histórico de aprovações e decisões da conversa

