# Checkpoint: Gestor Auth Primeiro Acesso Post Runtime Contract

Data: 2026-03-27
Escopo: caracterizacao runtime conservadora apenas do contrato funcional de POST /gestor/primeiroacesso
Suite focal: tests/gestor-auth-primeiro-acesso-post-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-auth-primeiro-acesso-post-runtime-contract.test.js

## Wiring confirmado

- O corredor continua exposto por authRouter em [src/modules/gestor/app/routes/auth.js](src/modules/gestor/app/routes/auth.js)
- A rota canonica do recorte permanece POST /gestor/primeiroacesso
- O owner real continua sendo primeiroAcessoPost em [src/modules/gestor/app/controllers/authController.js](src/modules/gestor/app/controllers/authController.js)

## Limite deliberado do microcorte

- Este checkpoint nao reabre login, logout, auth/context, select-unit, switch-unit, reset-password, esqueci-senha, remember-me, lockout, biometria, debug ou prova estrutural do novo service
- O foco aqui e somente o contrato publico observado de POST /gestor/primeiroacesso

## Contrato observado

- sem sessao, o runtime redireciona para /gestor/login
- com referer de /gestor/primeiroacesso e campos ausentes, o runtime redireciona para /gestor/primeiroacesso?erro=campos
- com referer de /gestor/primeiroacesso e confirmacao divergente, o runtime redireciona para /gestor/primeiroacesso?erro=confirmacao
- com referer de /gestor/primeiroacesso e senha curta, o runtime redireciona para /gestor/primeiroacesso?erro=tamanho
- com senha fraca, o runtime redireciona para /gestor/primeiroacesso?erro=forca
- com sessao stale sem usuario persistido, o runtime redireciona para /gestor/login
- quando o primeiro acesso ja foi concluido, o runtime redireciona para /gestor/dashboard sem alterar a senha existente
- no caminho feliz, o runtime conclui o primeiro acesso, limpa primeiro_acesso e senha_provisoria e redireciona para /gestor/dashboard

## Matriz coberta pela suite

- redirecionamento para login sem sessao
- validacoes publicas de campos, confirmacao, tamanho e forca
- fallback funcional para sessao stale
- redirecionamento para dashboard quando o primeiro acesso ja esta concluido
- caminho feliz com persistencia de nova senha e limpeza das flags de primeiro acesso

## Decisao final

- O contrato funcional observavel de POST /gestor/primeiroacesso ficou congelado localmente neste microcorte
- Nenhum outro fluxo de auth foi reaberto nesta rodada