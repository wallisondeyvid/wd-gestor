# Checkpoint: PUT /gestor/api/funcionarios/:id full json cadastros

## Escopo
- Subcorredor congelado: serialização consolidada de `dependentes_json` e `beneficios_json` em `PUT /gestor/api/funcionarios/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario` + `buildUpdateOpsFromBody`)
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com serialização em `public/js/funcionarios/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas o recorte de `dependentes_json` e `beneficios_json` do PUT full.
- O recorte inclui: parse desses dois campos em `buildUpdateOpsFromBody`, passagem pelo pipeline de `updateFuncionario`, normalização observável do CPF dos dependentes, persistência final via `updateFuncionarioByIdWithOps` e envelopes de erro do update.
- O recorte exclui explicitamente: foto, anexos, body core já congelado além do mínimo necessário para sustentar o request, `face_capturas_json`, `fp_capturas_json`, `face_imagem` e qualquer ramo do PUT incremental.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com `dependentes_json` válido: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso com `beneficios_json` válido: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso com `dependentes_json` + `beneficios_json`: `200` JSON com `success: true` e `data: { updated: true }`.
- `dependentes_json` inválido: o owner atual não responde erro; conclui o update com `200` JSON e persiste `dependentes` como array vazio.
- `beneficios_json` inválido: o owner atual não responde erro; conclui o update com `200` JSON e persiste `beneficios` como array vazio.
- Falha interna induzida no update persistido: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Quando `dependentes_json` contém array válido, o owner atual persiste `dependentes` com os campos recebidos, incluindo `nome`, `parentesco`, flags booleanas e `data_nascimento` materializada como `Date`.
- O CPF dos dependentes é normalizado depois do parse: valor formatado como `123.456.789-01` foi persistido como `12345678901`.
- Quando `beneficios_json` contém array válido, o owner atual persiste `beneficios` com `tipo`, `nome`, `tipo_valor`, `valor`, `inicio` e `data_inicio`.
- `data_nascimento` e `data_inicio` ficaram observáveis como datas persistidas no documento; a verificação estável do runtime precisou ser congelada em ISO UTC, não em `String(date)` local.
- Quando os dois JSONs são enviados juntos, o owner atual persiste simultaneamente `dependentes` e `beneficios` no mesmo update, sem abrir ramos de arquivo.

## Observações importantes do runtime
- Nos cenários exercitados, os logs do owner mostraram `req.file? false`, `files keys: []` e `anexos bruto length: 0`.
- O request desse microcorte se sustentou sem `req.files`, sem multipart e sem reabrir foto, anexos ou biometria.
- O tratamento de JSON inválido nesse recorte é silencioso: o owner converte para array vazio em vez de responder `400`.
- A divergência inicial desta rodada esteve apenas na suíte nova: o `origem` do membership precisou ser encurtado para respeitar o limite do schema, sem qualquer alteração de produção.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-update-full-json-cadastros-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-update-full-json-cadastros-runtime-contract.test.js`
- Resultado final congelado: `10` testes passando.

## Decisão final
- Classificação: microcorte seguro.
- Motivo: foi possível congelar o contrato runtime de `dependentes_json` e `beneficios_json` do PUT full com um recorte local, sem tocar em produção e sem abrir foto, anexos, biometria ou o corredor incremental.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Controller não foi alterado.
- Route não foi alterada.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.