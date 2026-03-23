# Escalas: congelamento local de GET /escalas/api/ausencias

## Escopo congelado

- Endpoint: `GET /escalas/api/ausencias`
- Arquivo de produção: `src/modules/escalas/app/routes/ausencias.js`
- Suíte dedicada: `tests/escalas.ausencias-lista.test.js`

## Veredito

O endpoint entrou em ponto de congelamento local.

Os microcortes úteis desta rodada foram concluídos sem alteração de contrato HTTP:

- extração do parse/normalização da query
- extração da validação de entrada do GET
- extração do ramo assíncrono por unidade

Depois desses cortes, o que restou inline no handler é curto, linear e semanticamente direto. Novas extrações tenderiam a fragmentação mecânica, sem ganho material de legibilidade, isolamento ou segurança.

## Contrato preservado

Permaneceu congelado, sem mudança externa observável:

- auth e redirect sem sessão
- mensagens de erro atuais
- envelope `ok/success`
- filtro por sobreposição
- filtro por tipo
- ramo por `funcionarioId`
- ramo por `unidadeId`
- ordenação atual
- limite atual
- shape atual de `data`
- tratamento 500 atual

## Evidência de segurança

Suíte dedicada existente permaneceu verde no estado final auditado:

- `tests/escalas.ausencias-lista.test.js`
- 12 testes
- 12 passes
- 0 falhas

## Decisão operacional

Não reabrir este endpoint para novos microcortes sem evidência nova de ganho material.

Se houver trabalho futuro em Ausências, ele deve nascer de uma necessidade funcional nova, regressão observada, ou refactor transversal maior claramente justificado, e não de microfatiamento residual do handler atual.