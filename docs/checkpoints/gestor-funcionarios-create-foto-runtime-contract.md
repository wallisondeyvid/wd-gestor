# Checkpoint: POST /gestor/api/funcionarios create foto

## Escopo
- Subcorredor congelado: ramo de foto em `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario` + `uploadFuncionarioFotoToBlob`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com envio multipart do formulário principal em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o ramo de foto do owner `createFuncionario`.
- O recorte inclui: ausência de foto, presença de upload em `req.files.foto`, tentativa de upload pós-criação, gate real do ambiente para blob, catch local do upload de foto e catch externo do create.
- O recorte exclui explicitamente: anexos, `dependentes_json`, `beneficios_json`, biometria/capturas, PUT full, PUT incremental, GETs, delete-post, match e disponíveis.
- O bloco `autoUser` permaneceu apenas como efeito inevitável do owner no caminho de sucesso, sem expansão de escopo para congelar o contrato inteiro de autoUser.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Sucesso sem foto: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`, sem persistência de `foto`.
- Sucesso com upload de foto no ambiente desta rodada: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`; no runtime observado, o owner não falha e não persiste `foto` porque o blob não está configurado.
- Falha local de processamento/upload de foto dentro do create: o owner continua respondendo `201` com `success: true`, `created: true` e `data.autoUser.ok === true`, sem persistência de `foto`.
- Erro interno induzido no create desse recorte: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Quando não há foto no payload, o documento criado permanece sem `foto` persistida.
- Quando há upload em `req.files.foto` no ambiente desta rodada, o owner cria primeiro o funcionário e só depois tenta subir a foto.
- Como o blob não estava configurado nesta rodada, o owner registrou o warning de ignorar upload e preservou o documento criado sem campo `foto`.
- Quando o arquivo de foto é inválido neste ambiente, o create também conclui com sucesso e o documento permanece sem `foto` persistida.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-foto-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-foto-runtime-contract.test.js`.
- Resultado final congelado: `6` testes passando.

## Observações importantes do runtime
- Nos cenários sem upload, os logs do owner mostraram `keys.files = []`, `anexos length bruto = 0` e `req.file? false`.
- Nos cenários com upload de foto, os logs mostraram `keys.files = [ 'foto' ]`, `req.file? false` e `req.files?.foto?.length = 1`, confirmando o ramo multi-field do middleware nesta rota.
- No ambiente desta rodada, o create não devolveu `503` para foto sem blob; em vez disso, registrou `[FUNC][FOTO][create] Blob não configurado; ignorando upload` e seguiu com `201`.
- O catch local de foto não altera o envelope do create; a falha só fica observável pela ausência de `foto` persistida e pelos warnings do runtime.
- O envelope de falha interna genérica do owner permaneceu `Erro interno`, consistente com os microcortes anteriores do create.

## Decisão final
- Classificação: microcorte seguro.
- Motivo: foi possível congelar o contrato runtime da foto no create com recorte local, sem tocar em produção e sem abrir anexos, JSONs de cadastro, biometria ou PUTs.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.