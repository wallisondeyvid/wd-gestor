# Checkpoint: Gestor Root API Compat Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da seam local do corredor de compatibilidade publica `/api -> /gestor/api` em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-root-api-compat-structural-seam.test.js](tests/gestor-root-api-compat-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-root-api-compat-structural-seam.test.js`

## Wiring estrutural validado

- o middleware raiz `app.use('/api', ...)` continua sendo o mesmo ponto de entrada do corredor
- a decisao do corredor agora delega explicitamente para `resolveGestorRootApiCompatTarget(req)`
- o middleware preserva o shape estrutural esperado: quando a seam retorna vazio cai em `next()`; quando retorna destino, responde com `redirect(307, target)`

## Comportamentos estruturais validados

- o destino padrao continua sendo `/gestor` + `originalUrl`
- o bypass de `/api/escalas` continua retornando vazio para deixar o corredor seguir
- o bypass de `/api/cep` continua retornando vazio para deixar o corredor seguir
- a excecao contextual de `/api/msg` com `referer` do Portal do Morador continua apontando para `/portal-morador` + `originalUrl`
- fora desse contexto, `/api/msg` continua seguindo para o destino padrao do Gestor

## Limite desta prova

- esta suite nao reabre login, primeiro acesso, aliases, redirects paralelos, assets, root compat geral ou contrato HTTP publico
- esta suite nao mede ainda paridade funcional completa do middleware; ela valida apenas a costura estrutural local e as saidas estruturais esperadas da seam
- nenhum outro corredor publico residual foi aberto nesta rodada

## Decisao final

- a nova seam local do corredor `/api -> /gestor/api` ficou validada estruturalmente neste recorte
- com esta prova, o recorte atinge congelamento intermediario antes de qualquer prova funcional/paridade do middleware

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem do [src/server/createServer.js](src/server/createServer.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- login, primeiro acesso, aliases, redirects paralelos, assets e root compat geral permaneceram intactos