

## Plano: Vincular Solicitantes a Usuários do Sistema

### Problema Atual
Chamados abertos pelo formulário público usam apenas `requester_name` (texto) e não têm `requester_user_id`. Por isso, o Analista não vê esses chamados no seu painel, pois o filtro usa `requester_user_id = user.id`.

### Solução

**1. Adicionar coluna `user_id` na tabela `requesters`**
- Nova coluna opcional `user_id UUID` referenciando `auth.users(id)`
- Permite associar um solicitante cadastrado a um usuário do sistema

**2. Atualizar a tela de Gerenciar Solicitantes**
- Adicionar um dropdown/select em cada linha da tabela para associar um usuário (perfil analista) ao solicitante
- Carregar a lista de usuários com perfil `analyst` para popular o dropdown
- Botão para salvar/remover a associação

**3. Atualizar a Edge Function `create-public-ticket`**
- Quando um chamado público for criado com um `requester_name` que corresponde a um solicitante vinculado a um usuário, preencher automaticamente o `requester_user_id` do ticket com o `user_id` do solicitante

**4. Resultado**
- Chamados abertos sem login, ao selecionar um solicitante vinculado, aparecerão automaticamente no painel do Analista associado
- O analista poderá ver o histórico, resolver pendências e interagir normalmente com esses chamados

### Detalhes Técnicos

- **Migration SQL**: `ALTER TABLE requesters ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;`
- **RequesterManagement.tsx**: Adicionar coluna "Usuário Vinculado" com Select para escolher entre analistas disponíveis, com opção de desvincular
- **create-public-ticket Edge Function**: Fazer lookup na tabela `requesters` pelo nome selecionado, buscar `user_id` se existir, e inserir no ticket como `requester_user_id`
- Nenhuma alteração necessária no `AnalystPanel.tsx` pois ele já filtra por `requester_user_id`

