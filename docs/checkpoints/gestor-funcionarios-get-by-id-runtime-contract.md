# Checkpoint: GET /gestor/api/funcionarios/:id

## Escopo
- Endpoint congelado: `GET /gestor/api/funcionarios/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`getFuncionario`)
- Consumidor vivo principal: tela de funcionários do Gestor, via fluxo de edição e detalhes já auditado nas rodadas anteriores
- Mount real do corredor permanece em `src/modules/gestor/app/gestor-app.js`

## Owner runtime atual
- Método e caminho congelados: `GET /gestor/api/funcionarios/:id`
- Owner runtime direto: `getFuncionario` em `src/modules/gestor/app/controllers/funcionarioApiController.js`
- Gate de entrada: `requireLogin` + `requireUnitScope` no router de funcionários
- Persistência efetiva: `findFuncionarioByIdPopulateRefs(id, canonicalUnitId)`

## Consumidor vivo principal
- O contrato foi congelado para o fluxo vivo já observado nas rodadas anteriores: carregamento de funcionário por id para detalhes e edição na tela de funcionários do Gestor.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-get-by-id-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-get-by-id-runtime-contract.test.js`
- Resultado final congelado: `6` testes passando.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Não encontrado'`.
- ID inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'` e `message: 'ID inválido'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Não encontrado'`.
- Sucesso: `200` JSON com `success: true` e payload encapsulado em `data`, preservando `_id`, `nome`, `cpf`, `email`, `foto`, `foto_url`, `foto_url_api` e `foto_urls`.
- Falha interna induzida: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'forced get-by-id failure'`.

## Observação de runtime sobre foto
- Quando `foto` é uma URL HTTP pública, o owner atual enriquece o payload com `foto_url` e `foto_url_api`.
- No runtime congelado pela suíte, `foto_url` e `foto_url_api` foram observados com caminho duplicado: `/gestor/api/funcionarios/api/funcionarios/:id/foto`.
- `foto_urls` foi observado como array contendo o caminho duplicado da API e a URL pública original de `foto`.

## Classificação final
- Decisão: ponto de congelamento local.
- Motivo: o owner ficou claro, o contrato montado foi congelado por suíte dedicada e não apareceu microrefactor local, pequeno e proporcional que justificasse tocar em produção nesta etapa.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes não foram alterados nesta rodada.
- Apenas este checkpoint foi criado porque ele não existia.