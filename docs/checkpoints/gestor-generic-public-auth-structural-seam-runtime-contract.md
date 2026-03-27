# Checkpoint: Gestor Generic Public Auth Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da seam local do corredor generico `/:seg/login` e `/:seg/primeiroacesso` em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-generic-public-auth-structural-seam.test.js](tests/gestor-generic-public-auth-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-generic-public-auth-structural-seam.test.js`

## Wiring estrutural validado

- as rotas genericas `GET /:seg/login`, `POST /:seg/login`, `GET /:seg/primeiroacesso` e `POST /:seg/primeiroacesso` passaram a delegar para seams locais explicitas em [src/server/createServer.js](src/server/createServer.js)
- o filtro de segmento generico ficou isolado em `resolveGenericPublicSegment`
- a bifurcacao Portal do Morador vs caminho generico ficou isolada em `isPortalMoradorSegment`
- os handoffs e renderizacoes estruturais do corredor ficaram encapsulados em seams locais especificas

## Comportamentos estruturais validados

- o filtro de segmento continua excluindo `gestor` e `escalas`
- `portal-morador` e `portal_morador` continuam seguindo pelo ramo proprio
- `POST /:seg/login` continua entregando Portal para `portalLoginPost` e segmento generico para `genericLogin`
- `GET /:seg/primeiroacesso` continua entregando Portal para `portalPrimeiroAcessoGet` e segmento generico para renderizacao de `gestor/primeiroacesso`
- `POST /:seg/primeiroacesso` continua entregando Portal para `portalPrimeiroAcessoPost` e segmento generico para `genericPrimeiroAcessoPost`
- `GET /:seg/login` continua renderizando `portal-morador/login` no ramo Portal e `gestor/logingestor` no ramo generico, com sinalizacao estrutural coerente por header

## Limite desta prova

- esta suite nao reabre `GET /gestor/login`, logout, guards ultra-early, interceptador global de redirects, aliases, redirects paralelos, assets ou root compat geral
- esta suite nao mede ainda paridade funcional completa do corredor; ela valida apenas a costura estrutural local e os handoffs/renderizacoes estruturais esperados
- nenhum outro corredor publico residual foi aberto nesta rodada

## Decisao final

- a nova seam local do corredor generico `/:seg/login` e `/:seg/primeiroacesso` ficou validada estruturalmente neste recorte
- com esta prova, o recorte atinge congelamento intermediario antes de qualquer prova funcional/paridade desse corredor

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem do [src/server/createServer.js](src/server/createServer.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- `GET /gestor/login`, logout, guards ultra-early, aliases, redirects paralelos, assets e root compat geral permaneceram intactos