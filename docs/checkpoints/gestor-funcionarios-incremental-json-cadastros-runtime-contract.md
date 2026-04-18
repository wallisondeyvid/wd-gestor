# Checkpoint: PUT /gestor/api/funcionarios/:id/incremental json cadastros

## Escopo
- Subcorredor congelado: serialização consolidada de `dependentes_json` e `beneficios_json` em `PUT /gestor/api/funcionarios/:id/incremental`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionarioIncremental` + `buildUpdateOpsFromBody`)
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com serialização em `public/js/funcionarios/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas o recorte de `dependentes_json` e `beneficios_json` do PUT incremental.
- O recorte inclui: parse desses dois campos em `buildUpdateOpsFromBody`, passagem pelo pipeline de `updateFuncionarioIncremental`, normalização observável do CPF dos dependentes e persistência final via `updateFuncionarioByIdWithOps`.
- O recorte exclui explicitamente: foto, anexos, reconciliação de anexos, body core já congelado além do mínimo necessário para sustentar o request, `face_capturas_json`, `fp_capturas_json`, `face_imagem` e qualquer ramo biométrico.
- Todos os requests deste microcorte permanecem body-only, sem multipart e sem `req.files`.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com `dependentes_json` válido: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso com `beneficios_json` válido: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso com `dependentes_json` + `beneficios_json`: `200` JSON com `success: true` e `data: { updated: true }`.
- `dependentes_json` inválido: o owner atual não responde erro; conclui o update com `200` JSON e persiste `dependentes` como array vazio.
- `beneficios_json` inválido: o owner atual não responde erro; conclui o update com `200` JSON e persiste `beneficios` como array vazio.

## Persistência observada nos sucessos
- Quando `dependentes_json` contém array válido, o owner atual persiste `dependentes` com os campos recebidos, incluindo `nome`, `parentesco`, flags booleanas e `data_nascimento` materializada como `Date`.
- O CPF dos dependentes é normalizado depois do parse: valor formatado como `123.456.789-01` foi persistido como `12345678901`.
- Quando `beneficios_json` contém array válido, o owner atual persiste `beneficios` com `tipo`, `nome`, `tipo_valor`, `valor`, `inicio` e `data_inicio`.
- Quando os dois JSONs são enviados juntos, o owner atual persiste simultaneamente `dependentes` e `beneficios` no mesmo update, sem abrir ramos de arquivo.

## Observações importantes do runtime
- O recorte se sustentou sem `req.files`, sem multipart e sem reabrir foto, anexos, reconciliação ou biometria.
- O tratamento de JSON inválido nesse recorte é silencioso: o owner converte para array vazio em vez de responder `400`.
- O recorte confirma que o último vazio material do incremental estava concentrado apenas nesses dois campos.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-incremental-json-cadastros-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-incremental-json-cadastros-runtime-contract.test.js`

## Decisão final
- Classificação: microcorte seguro.
- Motivo: foi possível congelar o contrato runtime de `dependentes_json` e `beneficios_json` do PUT incremental com um recorte local, sem tocar em produção e sem reabrir os subcorredores já encerrados.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Controller não foi alterado.
- Route não foi alterada.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.