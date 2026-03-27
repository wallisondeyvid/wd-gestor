# Checkpoint: Gestor Registry Wrapper Parity Runtime Contract

Data: 2026-03-27
Escopo: prova macro minima de paridade OFF/ON do wrapper explicito do Gestor no registry do servidor entre [src/server/createServer.js](src/server/createServer.js) e [src/modules/gestor/index.js](src/modules/gestor/index.js)
Suite focal: [tests/gestor-registry-wrapper-parity.test.js](tests/gestor-registry-wrapper-parity.test.js)
Execucao focal: `node --test .\tests\gestor-registry-wrapper-parity.test.js`

## Paridade macro validada

- com `ENABLE_GESTOR_WRAPPER=0`, o servidor continua montando o Gestor uma unica vez em `/gestor`
- com `ENABLE_GESTOR_WRAPPER=1`, o servidor continua montando o Gestor uma unica vez em `/gestor`
- OFF e ON preservam a mesma assinatura macro de montagem do Gestor no servidor
- o handler montado do Gestor continua valido nos dois modos
- o Gestor continua entrando no servidor como `mounted_app` com assinatura de path relevante nos dois modos

## Limite desta prova

- esta suite nao reabre compatibilidade publica, login, primeiro acesso, aliases, redirects, assets, root compat ou contrato HTTP publico
- esta suite nao prova ainda paridade funcional endpoint a endpoint; ela valida a equivalencia macro minima do mount do Gestor no servidor com o flip OFF/ON
- esta suite nao altera nem cobre corredores funcionais do Gestor

## Decisao final

- a paridade macro minima OFF/ON do wrapper explicito do Gestor no registry ficou validada neste recorte
- com esta prova, o eixo wrapper do registry atinge congelamento intermediario macro antes de qualquer discussao sobre reducao deliberada da compatibilidade publica

## Confirmacao explicita

- producao nao foi alterada nesta rodada
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- compatibilidade publica permaneceu intacta