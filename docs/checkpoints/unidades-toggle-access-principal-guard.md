## POST /gestor/api/unidades/toggle-access

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente a cobertura do bloqueio de alteracao de acesso quando um diretor contextual tenta atuar sobre uma unidade principal acessivel no proprio cluster.
- Encerrar o micro-passo sem patch de producao, sem novo teste e sem abrir outra frente.

## Estado atual

- A rota do endpoint permanece em src/modules/gestor/app/routes/unidadeApi.js com POST /api/unidades/toggle-access.
- O controller do endpoint permanece em src/modules/gestor/app/controllers/unidadeApiController.js -> toggleAccessUnidades.
- O helper contextual usado pelo fluxo permanece sendo ensureCanAccessUnidade.
- O contexto exercitado na cobertura fechada e diretor contextual com unidade principal acessivel no proprio cluster.
- O bloqueio observado permanece com status 400 e mensagem exata: Diretores não podem alterar o acesso de unidades principais.
- O estado da unidade permaneceu inalterado apos a tentativa bloqueada, preservando os valores anteriores de is_active e ativa.
- Nao houve patch em producao.

## Arquivo alterado

- tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js

## Cobertura validada

- Nome exato do teste novo: POST /gestor/api/unidades/toggle-access bloqueia diretor ao tentar alterar unidade principal acessivel no proprio cluster.
- A cobertura valida o ramo em que o diretor contextual tenta enviar unitIds contendo a unidade principal acessivel do proprio cluster com activate=false.
- O resultado observado e 400, success=false, code=BAD_REQUEST e message=Diretores não podem alterar o acesso de unidades principais.
- A prova tambem registra ausencia de efeito colateral, comparando o estado anterior e posterior da unidade nos campos is_active e ativa.

## Conclusao

- O guard de unidade principal em POST /gestor/api/unidades/toggle-access ja estava correto em producao.
- A lacuna consumida neste corte era apenas de cobertura focal do ramo de bloqueio contextual.
- Este corte fica encerrado como MICRO_PASSO_SEGURO ja consumido.