
# Correção: 404 no Vercel + Logout do Analista

## Problema 1: Erro 404 ao dar F5 no Vercel

O projeto usa React Router (roteamento no lado do cliente). Quando o usuário acessa diretamente uma URL como `/login` ou faz refresh (F5), o servidor Vercel tenta encontrar um arquivo nesse caminho, mas ele nao existe -- todo o roteamento acontece dentro do `index.html`.

**Solucao:** Criar um arquivo `vercel.json` na raiz do projeto com uma regra de rewrite que direciona todas as rotas para `index.html`.

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Apos criar esse arquivo e fazer o deploy novamente, o F5 em qualquer rota vai funcionar corretamente.

## Problema 2: Analista nao consegue fazer logout

O botao de logout esta na sidebar (`AppLayout.tsx`), e a funcao `handleSignOut` chama `signOut()` do contexto de autenticacao seguido de `navigate('/login')`.

Possivel causa: o `signOut` do Supabase dispara o `onAuthStateChange` no `AuthContext`, que limpa o estado do usuario. Isso pode causar um re-render antes do `navigate` ser executado, fazendo com que o `ProtectedRoute` redirecione para `/login` antes do navigate completar, ou o componente desmonte e o navigate nunca execute.

**Solucao:** Ajustar a funcao `signOut` no `AuthContext` para garantir que a navegacao aconteca de forma confiavel, e verificar se o botao de logout esta visivel e clicavel para o analista.

Alteracao em `src/contexts/AuthContext.tsx`:
- Na funcao `signOut`, limpar o estado (profile, role, user, session) ANTES de chamar `supabase.auth.signOut()` para evitar race conditions com o `onAuthStateChange`.

Alteracao em `src/components/AppLayout.tsx`:
- Adicionar tratamento de erro no `handleSignOut` para garantir que a navegacao aconteca mesmo se o signOut falhar.

---

## Detalhes Tecnicos

### Arquivo novo:
- `vercel.json` -- configuracao de rewrites para SPA

### Arquivos a modificar:
1. `src/contexts/AuthContext.tsx` -- Ajustar ordem de limpeza no signOut
2. `src/components/AppLayout.tsx` -- Adicionar try/catch no handleSignOut

### Nenhuma alteracao em:
- Backend / Edge Functions
- Modelagem de banco
- Regras de RLS
- Logica de negocio
