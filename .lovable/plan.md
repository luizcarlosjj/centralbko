

# Refatoracao Visual Completa - Paleta Auvo Tecnologia

## Resumo

Aplicar a identidade visual da Auvo Tecnologia em todo o projeto, implementando dark/light mode com toggle, sidebar de navegacao, e visual SaaS profissional. Nenhuma logica, backend ou autenticacao sera alterada.

---

## 1. Tokens de Cor e Tema (CSS Variables)

Atualizar `src/index.css` com as variaveis CSS mapeadas para a paleta Auvo:

**Light Mode:**
- Background: #E8E9FF (Purple 300)
- Cards: branco com borda sutil
- Primary: #6D26C2 (Purple 500)
- Primary hover: #A38DF2 (Purple 400)
- Sidebar: #E8E9FF com destaques roxos

**Dark Mode (foco principal):**
- Background: #201135 (Purple 700)
- Sidebar: #351B5A (Purple 600)
- Cards: #2A1746 (derivado)
- Primary: #6D26C2
- Hover: #A38DF2
- Textos: branco e rgba(255,255,255,0.7)
- Bordas: rgba(255,255,255,0.08)

Manter tokens de status: success (#22c55e), warning (#f59e0b), destructive (#ef4444), info (#3b82f6).

## 2. Toggle de Tema (Dark/Light)

- Instalar `next-themes` (ja esta no package.json)
- Criar componente `ThemeToggle` com icone Sol/Lua
- Envolver o App com `ThemeProvider` de `next-themes` (class strategy, persistencia em localStorage, respeita prefers-color-scheme)

## 3. Layout com Sidebar

Substituir o header horizontal do `AppLayout` por um layout com sidebar usando os componentes `Sidebar` do shadcn/ui ja existentes:

- Sidebar fixa a esquerda com fundo #351B5A (dark) / claro (light)
- Logo/nome do sistema no topo
- Itens de navegacao com icones Lucide coloridos
- Item ativo com fundo #6D26C2 e barra lateral indicadora
- Hover com brilho roxo sutil
- Nome do usuario e role na parte inferior
- Botao de logout
- Toggle de tema
- SidebarTrigger para colapsar/expandir
- NotificationBell integrado na sidebar (para analistas)

## 4. Refatoracao de Componentes Visuais

### Cards
- Dark: fundo #2A1746, borda rgba(255,255,255,0.08)
- Light: branco, borda sutil
- Sombra moderna com leve elevacao
- Titulos com cor primary

### Botoes
- Primary: #6D26C2, hover #A38DF2
- Rounded-xl, transicoes suaves (transition-all duration-200)
- Elevacao sutil no hover

### Badges de Status
- Nao iniciado: cinza (muted)
- Em andamento: roxo (#6D26C2 bg suave)
- Pausado: amarelo (warning)
- Finalizado: verde (success)
- Fundo suave + texto vibrante

## 5. Paginas - Ajustes Visuais

### Login
- Fundo com gradiente roxo escuro
- Card centralizado com visual premium

### Formulario Publico
- Fundo com gradiente sutil usando a paleta
- Card com bordas arredondadas e sombra

### Dashboard (Analyst/Supervisor)
- Cards de resumo maiores no topo com icones coloridos
- Espacamento p-6 moderno
- Tabelas com hover rows suave

### Metricas
- Graficos usando #6D26C2 e #A38DF2 como cores primarias
- Cards com visual SaaS enterprise

### Gestao de Usuarios
- Mesma linguagem visual dos demais paineis

### NotFound
- Visual consistente com a paleta

## 6. Melhorias Extras

- Skeleton loading com cores da paleta nos estados de carregamento
- Hover com transicoes suaves em todos os elementos interativos (transition-all duration-200)
- Hierarquia tipografica melhorada (titulos maiores, subtitulos em muted-foreground)
- Icones Lucide com cores contextuais

---

## Detalhes Tecnicos

### Arquivos a modificar:
1. `src/index.css` - Variaveis CSS (light e dark)
2. `tailwind.config.ts` - Tokens adicionais se necessario
3. `src/App.tsx` - Envolver com ThemeProvider
4. `src/components/AppLayout.tsx` - Reescrever com Sidebar
5. `src/components/ThemeToggle.tsx` - Novo componente
6. `src/pages/Login.tsx` - Visual atualizado
7. `src/pages/PublicTicketForm.tsx` - Visual atualizado
8. `src/pages/AnalystPanel.tsx` - Cores de badges e cards
9. `src/pages/SupervisorPanel.tsx` - Cores de badges e cards
10. `src/pages/MetricsDashboard.tsx` - Cores de graficos
11. `src/pages/UserManagement.tsx` - Visual consistente
12. `src/pages/NotFound.tsx` - Visual consistente
13. `src/components/NotificationBell.tsx` - Cores atualizadas

### Arquivos novos:
1. `src/components/ThemeToggle.tsx`

### Nenhuma alteracao em:
- Backend / Edge Functions
- Contexts de autenticacao (logica)
- Tipos / modelagem
- Supabase client
- Regras de RLS

