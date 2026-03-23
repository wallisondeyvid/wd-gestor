# Escalas: congelamento local de GET /escalas/api/ausencias/relatorio

## Endpoint

- GET /escalas/api/ausencias/relatorio

## Classificação final

- congelamento local

## Motivos

- prólogo já extraído
- suíte dedicada verde
- contrato externo congelado
- restante do handler é corpo específico do relatório
- novo microcorte já seria fragmentação mecânica

## Evidência

- tests/escalas.ausencias-relatorio.test.js
- 11 testes
- 11 passes
- 0 falhas

## Observações

- unidade válida sem funcionários continua gerando PDF
- comportamento foi congelado por suíte, não corrigido

## Encerramento

- não reabrir este endpoint sem evidência nova ou mudança explícita de objetivo