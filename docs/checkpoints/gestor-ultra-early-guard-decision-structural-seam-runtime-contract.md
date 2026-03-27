# Checkpoint: Gestor Ultra Early Guard Decision Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da seam local `resolveUltraEarlyGuardDecision` no ultra-early guard em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-ultra-early-guard-decision-structural-seam.test.js](tests/gestor-ultra-early-guard-decision-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-ultra-early-guard-decision-structural-seam.test.js`

## Wiring estrutural validado

- o middleware ultra-early continua no mesmo ponto e passou a delegar a decisao estrutural para `resolveUltraEarlyGuardDecision`
- o fluxo estrutural atual do middleware permanece com tres saidas distintas: `next()` quando a seam nao se aplica, caminho raw com `X-Guard-Direct` dinamico e caminho html com renderizacao atual
- o ultra-early guard permanece antes do bloco de estaticos no pipeline

## Comportamentos estruturais validados

- a seam continua limitando a elegibilidade a `GET` e `HEAD`
- a seam continua lendo `req.originalUrl` e usando `req.url` como fallback
- a seam continua distinguindo `login` e `primeiroacesso`, mas preserva a elegibilidade estrutural efetiva atual apenas para `primeiroacesso`
- a seam continua extraindo `queryStr`, `raw`, `erro` e derivando `mensagem` para erros estruturais de primeiro acesso
- o middleware continua deixando a execucao raw, a renderizacao html e o fallback para `next()` fora da seam de decisao

## Limite desta prova

- esta suite nao reabre o interceptador global de redirects, rotas publicas diretas ja congeladas, `GET /gestor/login`, `GET /gestor/primeiroacesso`, corredor generico, logout, aliases, redirects paralelos, assets ou root compat geral
- esta suite nao mede paridade funcional completa do guard; ela valida apenas a costura estrutural da decisao local e o fluxo estrutural externo do middleware
- nenhuma outra area de producao foi alterada nesta rodada

## Decisao final

- a seam local `resolveUltraEarlyGuardDecision` ficou validada estruturalmente neste recorte
- com essa prova, o primeiro recorte da subfase do ultra-early guard atinge congelamento intermediario antes de qualquer prova funcional/paridade

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem do [src/server/createServer.js](src/server/createServer.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- o interceptador global de redirects, as rotas publicas diretas ja congeladas, `GET /gestor/login`, `GET /gestor/primeiroacesso`, corredor generico, logout, aliases, redirects paralelos, assets e root compat geral permaneceram intactos