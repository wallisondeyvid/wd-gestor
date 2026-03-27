# Checkpoint: POST /gestor/unidades/:id/testar-banco Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da nova costura owner -> service de POST /gestor/unidades/:id/testar-banco
Suite focal: tests/gestor-unidades-testar-banco-structural-seam.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-unidades-testar-banco-structural-seam.test.js

## Wiring estrutural validado

- o owner [src/modules/gestor/app/controllers/unidadeController.js](src/modules/gestor/app/controllers/unidadeController.js) nao concentra mais a decisao target-aware principal do alvo
- o owner agora delega a resolucao do alvo para [src/modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js](src/modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js)
- o service fino responde com tres estados estruturais relevantes neste recorte: `not_found`, `forbidden` e `authorized`
- os ramos de BankPort permanecem no owner e so sao alcancados depois da autorizacao do service

## Comportamentos estruturais validados

- quando o service retorna `not_found`, o owner preserva `404` e nao chama `BankPort`
- quando o service retorna `forbidden`, o owner preserva `400` com `Acesso à unidade não autorizado.` e nao chama `BankPort`
- quando o service retorna `authorized` para unidade com `oauth2`, o owner preserva o ramo `BankPort.getOAuthTokenFromConfig`
- no service, alvo ausente encerra em `not_found` sem expandir cluster
- no service, alvo fora do cluster acessivel encerra em `forbidden`
- no service, o fallback para a propria `scopedUnit` permanece valido quando a expansao do cluster volta vazia

## Limite desta prova

- esta suite nao reabre o contrato runtime publico; isso permanece congelado por [tests/gestor-unidades-testar-banco-runtime-contract.test.js](tests/gestor-unidades-testar-banco-runtime-contract.test.js) e [docs/checkpoints/gestor-unidades-testar-banco-runtime-contract.md](docs/checkpoints/gestor-unidades-testar-banco-runtime-contract.md)
- esta suite prova apenas a nova costura estrutural local owner -> service e o guardrail de nao alcancar `BankPort` quando o alvo esta fora do cluster acessivel
- nenhum outro endpoint de Unidades foi aberto nesta rodada

## Decisao final

- a nova costura estrutural local de POST /gestor/unidades/:id/testar-banco ficou validada neste recorte
- com esta prova somada ao runtime contract ja existente, o endpoint atinge congelamento intermediario para esta fase

## Confirmacao explicita

- producao nao foi alterada nesta rodada
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- BankPort e seu wiring permaneceram intactos