# Checkpoint: Gestor Direct Login Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da seam local do corredor direto GET /gestor/login em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-direct-login-structural-seam.test.js](tests/gestor-direct-login-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-direct-login-structural-seam.test.js`

## Wiring estrutural validado

- a rota direta GET /gestor/login passou a delegar explicitamente para a seam local `renderDirectGestorLogin`
- a precedencia estrutural do corredor direto foi preservada, permanecendo antes do corredor generico `GET /:seg/login`

## Comportamentos estruturais validados

- a seam continua extraindo a query a partir de `req.originalUrl` e chamando `parseErroMensagem(true, queryStr)`
- a seam continua renderizando `gestor/logingestor`
- a seam continua expondo `basePath: '/gestor'` e `moduleLabel: 'WDGestor'`
- a seam continua propagando `erro` e `mensagem` vindos do parse
- a seam continua configurando `Content-Type`, `Cache-Control`, `Pragma`, `Expires` e `X-Server-Direct: login`
- a seam continua respondendo com status 200 no caminho feliz

## Limite desta prova

- esta suite nao reabre `GET /gestor/primeiroacesso`, corredor generico, guards ultra-early, interceptador global de redirects, logout, aliases, redirects paralelos, assets ou root compat geral
- esta suite nao mede paridade funcional completa do corredor; ela valida apenas a costura estrutural local explicitada nesta subfase
- nenhuma outra area de producao foi alterada nesta rodada

## Decisao final

- a seam local do corredor direto GET /gestor/login ficou validada estruturalmente neste recorte
- com essa prova, o recorte atinge congelamento intermediario antes de qualquer prova funcional/paridade desse corredor

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem do [src/server/createServer.js](src/server/createServer.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- `GET /gestor/primeiroacesso`, corredor generico, guards ultra-early, interceptador global de redirects, logout, aliases, redirects paralelos, assets e root compat geral permaneceram intactos