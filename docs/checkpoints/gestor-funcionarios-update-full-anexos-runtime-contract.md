# Checkpoint: PUT /gestor/api/funcionarios/:id full anexos

## Escopo
- Subcorredor congelado: reconciliação de anexos em `PUT /gestor/api/funcionarios/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario`)
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com serialização de anexos em `public/js/funcionarios/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas a reconciliação de anexos do PUT full.
- O recorte inclui: parse de `anexos_existentes`, parse de `anexos_excluidos`, montagem de `anexosFinal`, concatenação de `req.files.anexos`, tentativa de remoção física dos caminhos excluídos quando informados e persistência final via `updateFuncionarioByIdWithOps`.
- O recorte exclui explicitamente: foto, body core além do mínimo necessário para sustentar o update, `dependentes_json`, `beneficios_json`, `face_capturas_json`, `fp_capturas_json` e `face_imagem`.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso preservando `anexos_existentes` sem `req.files`: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso removendo item listado em `anexos_excluidos`: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso acrescentando novo anexo por `req.files.anexos`: `200` JSON com `success: true` e `data: { updated: true }`.
- Sucesso reconciliando existentes + excluídos + novo upload: `200` JSON com `success: true` e `data: { updated: true }`.
- Falha interna induzida no update persistido: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Quando o request envia apenas `anexos_existentes`, o owner atual persiste exatamente o array informado, sem criar novos itens.
- Quando `anexos_excluidos` referencia um item presente em `anexos_existentes`, o owner remove esse descriptor do array final persistido.
- Quando `req.files.anexos` traz upload novo, o owner atual normaliza o arquivo em descriptor persistível com `nome`, `mime`, `tamanho`, `caminho` e `data_upload`.
- No runtime observado, os arquivos novos foram gravados em `public/uploads/...`, enquanto o descriptor persistido ficou com `caminho` no prefixo `uploads/`.
- Na reconciliação combinada, o array final persistido preserva o existente mantido, exclui o item marcado e concatena o novo descriptor no fim.

## Efeito físico observável congelado
- Quando `anexos_excluidos` informa um `caminho` existente em disco e o request conclui com sucesso, o owner atual tenta remover fisicamente esse arquivo durante a reconciliação.
- Esse efeito foi observável nesta rodada e ficou congelado no caso de sucesso com exclusão.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-update-full-anexos-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-update-full-anexos-runtime-contract.test.js`
- Resultado final congelado: `8` testes passando.

## Observações importantes do runtime
- Nos cenários sem upload, os logs do owner mostraram `files keys: []`, `anexos bruto length: 0` e `anexos_existentes` chegando como string JSON.
- Nos cenários com upload, os logs mostraram `files keys: [ 'anexos' ]`, `anexos bruto length: 1` e mensagem de gravação em disco via `memory->disk` antes da normalização final.
- O runtime observado nesta rodada não exigiu abrir foto nem qualquer coleção JSON auxiliar para validar a reconciliação de anexos do PUT full.
- A divergência relevante desta rodada apareceu apenas no envelope do erro interno induzido: o runtime atual retornou `Erro interno`.

## Decisão final
- Classificação: ponto de congelamento local da subfase full anexos.
- Motivo: foi possível congelar o contrato runtime da reconciliação de anexos do PUT full sem tocar em produção e sem abrir os ramos proibidos desta rodada.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.