# Remoção de /login (rota raiz)

Data: 2025-09-20

## Alteração
A rota raiz `/login` (GET e POST) foi descontinuada. O único endpoint suportado agora para autenticação do módulo Gestor é:

- GET /gestor/login
- POST /gestor/login

Rotas relacionadas atualizadas:
- Redirecionamentos de erro/estado agora apontam para `/gestor/login?erro=...`
- Logout redireciona para `/gestor/login`
- Reset de senha (success) referencia `/gestor/login`

## Motivações
1. Padronização multi-módulo (`/<modulo>/login`).
2. Redução de ambiguidade entre módulos presentes e futuros.
3. Facilitar deprecação e hardening (superfície menor).

## Impactos
- Links antigos para `/login` retornarão 404 (ou view inexistente). Atualize bookmarks e documentação externa.
- E-mails enviados antes desta mudança contendo `/login?erro=...` podem levar a rota inexistente; usuários devem manualmente ajustar para `/gestor/login`.
  - Mitigação sugerida: enviar comunicado aos usuários ou manter redirect temporário via proxy / CDN se necessário.

## Escopos Não Afetados
- Módulo Escalas mantém `/escalas/login` inalterado.
- APIs de recuperação avançada continuam operacionais com prefixo `/gestor/`.

## Passos Seguintes (Opcional)
- Remover código de flags `PREFER_GESTOR_PREFIX` e `DISABLE_ROOT_AUTH_ROUTES` se não forem mais necessárias.
- Adicionar monitoramento de acessos 404 a `/login` para avaliar necessidade de redirect temporário.

## Checklist Interno
- [x] GET /login removido
- [x] POST /login removido
- [x] Middleware `requireLogin` redireciona para `/gestor/login`
- [x] Auth controller erros => `/gestor/login?erro=...`
- [x] Logout => `/gestor/login`
- [x] Reset password success => `/gestor/login`
- [x] Documentação de migração atualizada (ver MIGRATION_AUTH_PATHS.md)
