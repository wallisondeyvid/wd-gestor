# Checkpoint: Gestor Public Redirect Interception Decision Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da seam local `resolvePublicRedirectInterceptionDecision` no interceptador global de redirects em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-public-redirect-interception-decision-structural-seam.test.js](tests/gestor-public-redirect-interception-decision-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-public-redirect-interception-decision-structural-seam.test.js`

## Wiring estrutural validado

- o wrapper global de `res.redirect` continua no mesmo ponto e passou a delegar a decisao estrutural para `resolvePublicRedirectInterceptionDecision`
- o fallback final do wrapper para `originalRedirect` continua preservado quando a seam nao produz decisao especial
- a excecao estrutural do Portal do Morador em `primeiroacesso` continua retornando ao `originalRedirect`

## Comportamentos estruturais validados

- a seam continua limitando a interceptacao a `GET` e `HEAD`
- a seam continua ignorando targets fora de `login` e `primeiroacesso`
- a seam continua normalizando `target` sem fragmento e preservando `url` original
- a seam continua distinguindo `login` vs `primeiroacesso`
- a seam continua extraindo `erro` e derivando `mensagem` apenas para `primeiroacesso`
- a seam continua detectando `seg` e projetando `basePath`, incluindo o fallback estrutural para `escalas`

## Limite desta prova

- esta suite nao reabre ultra-early guards, rotas publicas diretas ja congeladas, `GET /gestor/login`, `GET /gestor/primeiroacesso`, corredor generico, logout, aliases, redirects paralelos, assets ou root compat geral
- esta suite nao mede paridade funcional completa do interceptador; ela valida apenas a costura estrutural da decisao local e o fallback estrutural do wrapper
- nenhuma outra area de producao foi alterada nesta rodada

## Decisao final

- a seam local `resolvePublicRedirectInterceptionDecision` ficou validada estruturalmente neste recorte
- com essa prova, o primeiro recorte da frente do interceptador global atinge congelamento intermediario antes de qualquer prova funcional/paridade

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem do [src/server/createServer.js](src/server/createServer.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- ultra-early guards, rotas publicas diretas ja congeladas, `GET /gestor/login`, `GET /gestor/primeiroacesso`, corredor generico, logout, aliases, redirects paralelos, assets e root compat geral permaneceram intactos