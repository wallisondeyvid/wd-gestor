# Gestor — Compatibilidades no app raiz

## 1) Rotas raiz que redirecionam/espelham para Gestor

- `app.use('/api', ...)` redireciona chamadas legadas para `'/gestor' + originalUrl` com `307` (mantém método/corpo), com exceções para `'/api/escalas'` e `'/api/cep'`.
- `POST /usuarios`, `POST /usuarios/:id/toggle`, `POST /usuarios/:id/update`, `POST /usuarios/:id/delete` redirecionam com `308` para `'/gestor/api/usuarios*'`.
- `GET /reset-password/:token` e `POST /reset-password` redirecionam para `'/gestor/reset-password*'`.

## 2) Rotas públicas sem prefixo que impactam login/primeiro acesso

- Lista `legacyPaths` no app raiz mantém URLs sem prefixo (`/login`, `/primeiroacesso`, `/dashboard`, etc.) redirecionando para `'/gestor' + path` fora de ambiente de teste.
- Em ambiente de teste, essas rotas são mantidas acessíveis (200 em `skipDb` ou rewrite interno para `/gestor/*`).
- Existe também `GET /:seg/login`, `POST /:seg/login`, `GET /:seg/primeiroacesso` e `POST /:seg/primeiroacesso`, com reaproveitamento dos handlers genéricos de auth do Gestor para módulos não-portal.

## 3) Middlewares globais que interferem antes do módulo Gestor

- `session(...)` (cookie `wdg.sid`) é registrado no app raiz antes dos handlers finais.
- `cookieParser()` e `rememberRestore` rodam antes da fase final de roteamento.
- Middleware de reidratação de `req.user` a partir da sessão (quando DB disponível) pode influenciar autorização observada pelas rotas do Gestor.
- Guard de `res.redirect` + guard "ultra-early" para páginas públicas evitam loop em login/primeiro acesso e podem responder direto no root antes de cair no sub-app.
