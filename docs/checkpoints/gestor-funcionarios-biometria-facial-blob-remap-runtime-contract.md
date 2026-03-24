# Checkpoint: PUT full + incremental remapeamento Blob facial em face_capturas_json

## Escopo
- Subcorredor congelado: remapeamento Blob das imagens faciais dentro de `face_capturas_json` nos owners `PUT /gestor/api/funcionarios/:id` e `PUT /gestor/api/funcionarios/:id/incremental`.
- Owners/runtime relidos: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario`, `updateFuncionarioIncremental`, `parseDataUrl`, `uploadFacePreviewToBlob`, `mapBiometriasFaciaisToBlob` e `canUseBlob`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rotas montadas confirmadas em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado no formulário de funcionários com hidden `face_capturas_json` em `views/gestor/funcionarios/abas/aba2_cadastros_biometricos.ejs` e hidratação/submissão em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o remapeamento Blob do campo `imagem` dentro dos itens normalizados de `face_capturas_json`.
- O recorte inclui: gate de Blob disponível, chamada real ao cliente Blob, remapeamento bem-sucedido para URL pública, falha induzida com degradação silenciosa e persistência final em `biometrias_facial`.
- O recorte exclui explicitamente: parsing/base envelope de `face_capturas_json` já congelado antes, `face_imagem` direto já congelado antes, `fp_capturas_json`, `biometrias_digitais`, foto comum, anexos, body core, `dependentes_json`, `beneficios_json`, patch de produção e refactor.

## Contrato runtime congelado
- PUT full sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT incremental sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT full fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- PUT incremental fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- `face_capturas_json` válido no full com Blob indisponível: o owner conclui com `200` JSON e persiste `biometrias_facial[0].imagem` como a data URL original.
- `face_capturas_json` válido no incremental com Blob indisponível: o owner conclui com `200` JSON e persiste `biometrias_facial[0].imagem` como a data URL original.
- Remapeamento Blob facial bem-sucedido no full: o owner conclui com `200` JSON e persiste `biometrias_facial[0].imagem` como URL pública Blob.
- Remapeamento Blob facial bem-sucedido no incremental: o owner conclui com `200` JSON e persiste `biometrias_facial[0].imagem` como URL pública Blob.
- Falha induzida em `mapBiometriasFaciaisToBlob` no full: o helper absorve a falha do cliente Blob, loga warning observável, conclui com `200` JSON e mantém `biometrias_facial[0].imagem` como a data URL original.
- Falha induzida em `mapBiometriasFaciaisToBlob` no incremental: o helper absorve a falha do cliente Blob, loga warning observável, conclui com `200` JSON e mantém `biometrias_facial[0].imagem` como a data URL original.

## Persistência observada
- Quando Blob não está disponível, o branch de remapeamento não abre; o item facial já normalizado segue para persistência com `imagem` original em data URL.
- Quando a API Blob responde sucesso, `mapBiometriasFaciaisToBlob` substitui apenas `imagem` por URL pública e preserva `hash`, `template_sha256` e `qualidade` normalizada.
- Quando a API Blob responde `forbidden`, o helper captura `BlobAccessError`, registra `[BIO FACE] falha upload Blob: Vercel Blob: Access denied, please provide a valid token for this resource.` e persiste o item facial sem remapeamento.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-biometria-facial-blob-remap-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-biometria-facial-blob-remap-runtime-contract.test.js`.
- Resultado final congelado: `10` testes passando.

## Observações importantes do runtime
- Para congelar o caso de sucesso sem tocar produção, a suíte apontou `VERCEL_BLOB_API_URL` para um stub HTTP local, preservando o caminho real do pacote `@vercel/blob` em vez de mockar branches internos do controller.
- O remapeamento bem-sucedido continua dependente de três gates: Blob disponível, `imagem` iniciando com `data:` e resposta bem-sucedida da API Blob.
- O envelope de sucesso permaneceu simétrico entre os dois owners nesse microcorte: `200` com `success: true` e `data: { updated: true }`.
- A falha induzida no cliente Blob não vaza erro para o request; a degradação é silenciosa e local ao item facial.

## Decisão final
- Classificação: último microcorte biométrico remanescente congelado como guardrail focal seguro.
- Motivo: foi possível caracterizar e congelar, sem alterar produção, tanto o remapeamento Blob bem-sucedido quanto a degradação silenciosa do ramo `face_capturas_json` nos dois owners.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.