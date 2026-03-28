# Checkpoint: Gestor Require Login Classifier Structural Seam Runtime Contract

Data: 2026-03-28
Escopo: prova estrutural focal da nova costura local entre [src/modules/gestor/app/middlewares/requireLogin.js](src/modules/gestor/app/middlewares/requireLogin.js) e [src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js](src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js)
Suite focal: [tests/gestor-require-login-classifier-structural-seam.test.js](tests/gestor-require-login-classifier-structural-seam.test.js)
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-require-login-classifier-structural-seam.test.js

## Wiring estrutural validado

- [src/modules/gestor/app/middlewares/requireLogin.js](src/modules/gestor/app/middlewares/requireLogin.js) continua no mesmo ponto do sub-app e passou a delegar a classificacao semantica da entrada autenticada para [src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js](src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js)
- o middleware permanece dono da adaptacao estrutural final do contrato atual: redirect, resposta JSON, next() e projecao final de req.user
- o classificador permanece cego a res, next, status code, rotas e persistencia de sessao

## Comportamentos estruturais validados

- o classificador preserva retorno estruturado minimo por estagio para selecao pendente, bypass de Escalas, rota publica, nao autenticado, primeiro acesso, fallback transitorio e fallback por funcionario
- o middleware preserva o mapeamento estrutural de selecao pendente para resposta JSON 409 em API protegida
- o middleware preserva o mapeamento estrutural de rota protegida sem sessao para redirect ao login
- o middleware preserva next() e a projecao final de req.user no fallback sem banco, fora do classificador

## Limite desta prova

- esta suite nao reabre [src/modules/gestor/app/controllers/authController.js](src/modules/gestor/app/controllers/authController.js), [src/modules/gestor/app/routes/auth.js](src/modules/gestor/app/routes/auth.js) ou [src/modules/gestor/app/routes/pagesRouter.js](src/modules/gestor/app/routes/pagesRouter.js)
- esta suite nao mede paridade funcional completa do auth do Gestor; ela valida apenas a costura estrutural entre middleware e classificador
- esta suite nao altera contrato HTTP publico, persistencia de sessao, bootstrap, registry, app raiz, UnitProvisioning ou qualquer corredor funcional congelado

## Decisao final

- a nova costura local requireLogin -> classifyRequireLoginEntry.service.js ficou validada estruturalmente neste recorte
- com esta prova, o primeiro recorte da boundary de autenticacao, sessao e contexto atinge congelamento intermediario

## Confirmacao explicita

- producao nao foi alterada nesta rodada alem dos dois arquivos ja mudados anteriormente: [src/modules/gestor/app/middlewares/requireLogin.js](src/modules/gestor/app/middlewares/requireLogin.js) e [src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js](src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js)
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados