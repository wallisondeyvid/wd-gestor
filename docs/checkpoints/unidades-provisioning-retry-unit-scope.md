# Unidades provisioning retry - unit scope coberto

## Objetivo encerrado

- Cobrir com prova focal o bloqueio contextual de `POST /gestor/api/unidades/:id/provisioning/retry`.

## Estado atual

- Diretor fora do contexto ativo recebe bloqueio antes de qualquer efeito de retry.
- O endpoint não cria status nem eventos de provisioning quando a unidade-alvo está fora do escopo.
- Não foi necessário patch em produção.

## Arquivo alterado

- `tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js`

## Cobertura validada

- `node --test --test-name-pattern "POST /gestor/api/unidades/:id/provisioning/retry bloqueia unidade fora do contexto e nao executa retry" tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js`

## Conclusão

- O fluxo de retry de provisioning já respeita corretamente o unit scope ativo.
- A lacuna restante era apenas de cobertura focal, agora fechada.
