# Escalas: congelamento local de GET /escalas/api/recursos

## Endpoint

- GET /escalas/api/recursos

## Classificação final

- congelamento local

## Motivos

- wiring atual torna escalasApi.new.js o handler vencedor observável
- a suíte tests/escalas.recursos-lista.test.js já congela o contrato atual da listagem
- a suíte tests/escalas.recursos-detalhe.test.js já congela o detalhe por id
- o recorte restante do handler vencedor é curto, linear e semanticamente estável
- novos microrefactors locais seriam fragmentação mecânica

## Evidência

- tests/escalas.recursos-lista.test.js
- 9 testes
- 9 passes
- 0 falhas
- tests/escalas.recursos-detalhe.test.js
- checkpoint já existente: docs/checkpoints/escalas-microcorte-recursos-detalhe-concluido.md

## Observações

- a duplicidade estrutural entre escalasApi.new.js e recursosApi.js continua existindo
- essa duplicidade não deve ser tratada como microcorte local
- o próximo trabalho útil passa a ser fase maior deliberada de ownership/canonicalização da rota

## Encerramento

- não reabrir GET /escalas/api/recursos para microrefactors locais sem evidência nova
- o próximo passo deve ser uma auditoria estrutural da duplicidade de Recursos