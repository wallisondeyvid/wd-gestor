# Checkpoint: PUT /gestor/api/funcionarios/:id full foto

## Escopo
- Subcorredor congelado: ramo de foto em `PUT /gestor/api/funcionarios/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario`)
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com transporte de foto e `excluir_foto` em `public/js/funcionarios/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas o ramo de foto do PUT full.
- O recorte inclui: upload/substituição por `req.file` ou `req.files.foto`, gate de blob do ambiente, exclusão por `excluir_foto=true`, preservação da foto quando não há troca nem exclusão, tentativa de remoção do artefato anterior via `deleteFromBlobIfNeeded` quando aplicável e persistência final via `updateFuncionarioByIdWithOps`.
- O recorte exclui explicitamente: anexos, `dependentes_json`, `beneficios_json`, `face_capturas_json`, `fp_capturas_json`, biometria e body core além do mínimo necessário para sustentar o update.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com `excluir_foto=true`: `200` JSON com `success: true` e `data: { updated: true }`, removendo `foto` do documento.
- Upload/substituição de foto com arquivo válido no ambiente atual: `503` JSON com campo `error` textual informando que o blob não está configurado.
- Preservação de foto quando o payload full não pede exclusão nem troca: `200` JSON com `success: true` e `data: { updated: true }`, sem alterar o campo `foto` persistido.
- Falha interna induzida no update persistido: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Com `excluir_foto=true` e foto pré-existente, o documento persistido deixa de manter o campo `foto`.
- Sem exclusão e sem upload, a foto previamente persistida permanece inalterada após o update.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-update-full-foto-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-update-full-foto-runtime-contract.test.js`
- Resultado final congelado: `7` testes passando.

## Observações importantes do runtime
- No ambiente desta rodada, o upload completo de foto não ficou disponível porque o ramo full exigiu blob configurado e respondeu `503` antes da persistência da troca.
- No cenário de upload exercitado, os logs do owner mostraram `req.files?.foto?.length = 1`, `files keys: [ 'foto' ]` e `anexos bruto length: 0`.
- Nos cenários de exclusão e preservação, os logs do owner mostraram `files keys: []` e não abriram o ramo de anexos.
- A preservação de foto no PUT full depende do ramo `else` que remove qualquer tentativa acidental de unset/set nulo de `foto` quando não há upload nem exclusão explícita.

## Decisão final
- Classificação: ponto de congelamento local da subfase full foto.
- Motivo: foi possível congelar o contrato runtime do ramo de foto do PUT full sem tocar em produção e sem reabrir body core, anexos ou biometria.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.