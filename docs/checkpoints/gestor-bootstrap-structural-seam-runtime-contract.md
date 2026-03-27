# Checkpoint: Gestor Bootstrap Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da nova costura de bootstrap entre [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js), [src/modules/gestor/index.js](src/modules/gestor/index.js) e o contrato de montagem consumido pelo app raiz em [src/server/createServer.js](src/server/createServer.js)
Suite focal: [tests/gestor-bootstrap-structural-seam.test.js](tests/gestor-bootstrap-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-bootstrap-structural-seam.test.js`

## Wiring estrutural validado

- [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js) deixou de representar apenas uma instancia singleton implicita e passou a expor uma factory explicita `buildGestorApp`
- o export default de [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js) aponta para essa mesma factory explicita
- [src/modules/gestor/index.js](src/modules/gestor/index.js) preserva `meta.basePath = '/gestor'` e continua expondo `buildModule`
- `buildModule` agora constroi uma nova instancia do sub-app Gestor a cada chamada, preservando o shape express-like esperado pelo app raiz

## Comportamentos estruturais validados

- `buildGestorApp()` retorna app express-like com `use`, `handle` e `locals`
- chamadas repetidas de `buildGestorApp()` retornam instancias distintas
- mutacao em `app.locals` de uma instancia nao vaza para outra instancia criada pela factory
- `buildModule()` continua entregando app express-like montavel pelo contrato atual do servidor raiz
- chamadas repetidas de `buildModule()` retornam instancias distintas do sub-app Gestor
- mutacao em `built.locals` de uma montagem nao vaza para outra montagem

## Limite desta prova

- esta suite nao reabre compatibilidade publica, login, primeiro acesso, aliases, redirects, assets ou contrato HTTP publico
- esta suite nao altera nem revalida o wiring de [src/server/createServer.js](src/server/createServer.js); ela valida apenas que o shape retornado por `buildModule` continua compativel com o contrato de montagem ja consumido ali
- esta suite nao cobre paridade funcional macro; ela cobre apenas a nova seam interna de bootstrap

## Decisao final

- a nova costura estrutural minima de bootstrap do Gestor ficou validada neste recorte
- com esta prova, o recorte atinge congelamento intermediario da seam de construcao do sub-app antes de qualquer prova macro de paridade funcional

## Confirmacao explicita

- producao nao foi alterada nesta rodada
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- createServer e a compatibilidade publica permaneceram intactos