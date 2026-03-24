# Checkpoint: POST /gestor/api/funcionarios create anexos

## Escopo
- Subcorredor congelado: ramo de anexos em `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario` + `mapFiles`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com colocação manual de anexos no `FormData` em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o ramo de anexos do owner `createFuncionario`.
- O recorte inclui: ausência de `req.files.anexos`, presença de um ou múltiplos anexos, normalização via `mapFiles(...)`, persistência final dos descriptors no documento criado e envelope de erro do create.
- O recorte exclui explicitamente: foto, biometria/capturas, `face_imagem`, `dependentes_json`, `beneficios_json`, PUT full, PUT incremental, GETs, delete-post, match e disponíveis.
- O bloco `autoUser` permaneceu apenas como efeito inevitável do owner no caminho de sucesso, sem expansão de escopo para congelar o contrato inteiro de autoUser.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Sucesso sem `req.files.anexos`: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado, `data.autoUser.ok === true` e `anexos` persistidos como array vazio.
- Sucesso com um anexo válido: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Sucesso com múltiplos anexos válidos: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Shape persistido do descriptor de anexo: o create conclui com `201` e persiste objetos contendo `nome`, `mime`, `tamanho`, `caminho` e `data_upload`.
- Caminho persistido no prefixo esperado: o create conclui com `201` e persiste `caminho` iniciado por `uploads/`.
- Erro interno induzido no create desse recorte: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Quando não há `req.files.anexos`, o owner cria o documento com `anexos` vazio.
- Quando `req.files.anexos` contém upload novo, `mapFiles(...)` grava o buffer em `public/uploads/...`, normaliza o arquivo e persiste descriptor com `nome`, `mime`, `tamanho`, `caminho` e `data_upload`.
- No runtime observado, o arquivo físico foi gravado em `public/uploads/...`, enquanto o descriptor persistido ficou com `caminho` no prefixo `uploads/`.
- Quando múltiplos anexos válidos são enviados, o owner persiste um descriptor por arquivo no array final, preservando a ordem de envio observada na suíte.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-anexos-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-anexos-runtime-contract.test.js`.
- Resultado final congelado: `8` testes passando.

## Observações importantes do runtime
- Nos cenários sem upload, os logs do owner mostraram `keys.files = []`, `anexos length bruto = 0` e `req.file? false`.
- Nos cenários com upload, os logs mostraram `keys.files = [ 'anexos' ]`, `anexos length bruto` compatível com a quantidade enviada e mensagens `memory->disk` gravando em `public/uploads/...` antes da persistência.
- O caminho de sucesso inevitavelmente disparou `autoUser` e o fluxo de mailer do projeto; esse efeito foi apenas congelado como observável do owner atual, sem ampliar a rodada.
- O envelope de falha interna genérica do create permaneceu `Erro interno`, consistente com o checkpoint base do create.

## Decisão final
- Classificação: microcorte seguro.
- Motivo: foi possível congelar o contrato runtime dos anexos do create com um recorte local, sem tocar em produção e sem abrir foto, biometria, JSONs de cadastros ou PUTs.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.