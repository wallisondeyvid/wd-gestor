## GET /gestor/api/usuarios/check-email

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato minimo real de GET /gestor/api/usuarios/check-email.
- Encerrar o micro-passo sem patch de producao, sem novo teste adicional e sem abrir outros fluxos de usuario.

## Caminho canonico

- Caminho canonico: GET /gestor/api/usuarios/check-email.
- Rota: src/modules/gestor/app/routes/userApi.js.
- Controller: src/modules/gestor/app/controllers/userController.js -> checkUsuarioEmail.
- Middlewares reais da rota: requireLogin e requireRole(['admin']).

## Estado atual

- O endpoint permanece em src/modules/gestor/app/routes/userApi.js com GET /api/usuarios/check-email.
- O handler do endpoint permanece em src/modules/gestor/app/controllers/userController.js -> checkUsuarioEmail.
- A rota continua protegida por requireLogin e requireRole(['admin']).
- O contrato minimo agora esta congelado por suite focal propria em tests/gestor-user-check-email.test.js.
- Nao houve patch de producao.

## Contrato minimo agora congelado

- 401 sem sessao: success=false, error="Não autenticado" e code="UNAUTHORIZED".
- 403 sem papel admin: success=false, error="Acesso negado" e code="FORBIDDEN".
- 200 quando o e-mail nao existe globalmente: success=true, data.exists=false, data.email igual ao e-mail consultado, membershipsSummary=[] e blockedUnidadeIds=[].
- 200 com resumo do usuario global e unidades ja vinculadas: success=true, data.exists=true, data.user com id, nome e role coerentes, membershipsCount coerente, membershipsSummary preenchido e blockedUnidadeIds alinhado as unidades ja vinculadas exercitadas no teste.

## Cobertura validada

- Arquivo de teste: tests/gestor-user-check-email.test.js.
- Cenarios agora cobertos na suite focal:
  - GET /gestor/api/usuarios/check-email retorna 401 sem sessao.
  - GET /gestor/api/usuarios/check-email retorna 403 para usuario autenticado sem papel admin.
  - GET /gestor/api/usuarios/check-email informa quando o e-mail ainda nao existe globalmente.
  - GET /gestor/api/usuarios/check-email retorna resumo do usuario global e das unidades ja vinculadas.
- Execucao focal validada: node --test tests/gestor-user-check-email.test.js.

## Conclusao

- GET /gestor/api/usuarios/check-email agora tem contrato minimo real congelado por suite focal propria.
- O corte desta rodada fecha apenas a lacuna de cobertura dos gates de autenticacao e autorizacao, preservando o shape de sucesso ja existente.
- Nao houve alteracao em producao.
- Classificacao final: MICRO_PASSO_SEGURO consumido.