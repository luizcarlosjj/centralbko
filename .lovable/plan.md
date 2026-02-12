

# Correcao: Audio Silencioso e Login com Dois Cliques

## Problema 1: Audio nao toca no notebook

**Causa raiz:** A Web Audio API bloqueia reproducao de som quando o `AudioContext` e criado sem uma interacao do usuario (click/tap). O codigo atual cria um novo `AudioContext` toda vez que `playTone()` e chamado. Quando o Realtime dispara a notificacao automaticamente (sem clique), o contexto nasce em estado "suspended" e o som nao toca.

**Solucao:** Manter um unico `AudioContext` global e "desbloquea-lo" no primeiro clique do usuario em qualquer lugar da pagina. Quando o Realtime disparar o som, o contexto ja estara ativo.

### Alteracoes em `src/lib/notification-sounds.ts`:
- Criar um singleton de AudioContext (em vez de criar um novo a cada chamada)
- Adicionar funcao `ensureAudioContext()` que faz `ctx.resume()` se estiver suspended
- Registrar um listener global `document.addEventListener('click', resume, { once: true })` para desbloquear o contexto no primeiro clique do usuario
- A funcao `playTone()` passa a reutilizar o contexto global em vez de criar novos

---

## Problema 2: Login precisa de dois cliques

**Causa raiz:** Apos `signInWithPassword()` resolver, o `Login.tsx` chama `navigate('/dashboard')` imediatamente. Porem o `onAuthStateChange` do Supabase ainda nao disparou — o `user` no AuthContext continua `null`. O `ProtectedRoute` ve `user=null` e `loading=false`, e redireciona de volta para `/login`. Somente depois o `onAuthStateChange` atualiza o estado com o usuario autenticado.

**Solucao:** Em vez de navegar dentro do `handleSubmit`, usar um `useEffect` no `Login.tsx` que observa o estado do `user` no AuthContext e navega automaticamente quando o usuario e detectado.

### Alteracoes em `src/pages/Login.tsx`:
- Remover o `navigate('/dashboard')` do `handleSubmit`
- Adicionar `useEffect` que observa `user` e `loading` do AuthContext:
  - Quando `user` existe e `loading` e false, navegar para `/dashboard`
- O `handleSubmit` passa a apenas chamar `signIn()` e tratar erro

---

## Sequencia de Implementacao

1. Atualizar `src/lib/notification-sounds.ts` (singleton AudioContext + desbloqueio)
2. Atualizar `src/pages/Login.tsx` (navegacao reativa via useEffect)

---

## Detalhes Tecnicos

- O singleton de AudioContext e um padrao recomendado pela propria especificacao W3C da Web Audio API
- O `resume()` e uma Promise que resolve quando o contexto esta ativo — compativel com todos os navegadores modernos
- A navegacao via `useEffect` garante que o redirect so acontece apos o AuthContext processar completamente o login (sessao + perfil + role)
- Nenhuma regra de negocio sera alterada
- Nenhuma migracao SQL necessaria

