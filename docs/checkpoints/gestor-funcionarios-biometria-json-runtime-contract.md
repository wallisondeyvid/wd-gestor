# Checkpoint: PUT full + incremental biometria json

## Escopo
- Subcorredor congelado: núcleo biométrico JSON transversal dos owners `PUT /gestor/api/funcionarios/:id` e `PUT /gestor/api/funcionarios/:id/incremental`.
- Owners/runtime relidos: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario` e `updateFuncionarioIncremental`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rotas montadas confirmadas em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado: formulário principal em `views/gestor/funcionarios/funcionarios_index.ejs`, com hiddens e submit do fluxo de funcionários em `public/js/funcionarios/funcionarios_index.js`.
- Consumidor incremental biométrico dedicado não foi observado no escopo autorizado de `public/gestor/js/modals/funcionario_detalhes.js`; o modal segue usando o incremental apenas para foto nesta fronteira autorizada.

## Fronteira congelada
- Esta rodada congela apenas o núcleo biométrico JSON dos dois owners.
- O recorte inclui: `face_capturas_json`, `fp_capturas_json`, guardrails de tamanho bruto, parse tolerante, shape normalizado persistido, mapeamento `idx -> dedo`, `unset` de `biometrias_facial`, `unset` de `biometrias_digitais` e envelopes finais observáveis de sucesso/erro dos dois owners.
- O recorte exclui explicitamente: `face_imagem`, `parseDataUrl`, `mapBiometriasFaciaisToBlob`, upload para Blob, foto, anexos, body core já congelado, `dependentes_json`, `beneficios_json`, POST create e GETs já congelados.

## Contrato runtime congelado
- PUT full sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT incremental sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT full fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- PUT incremental fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- `face_capturas_json` inválido no full: o owner tolera o parse inválido, conclui com `200` JSON e preserva o estado biométrico facial pré-existente.
- `face_capturas_json` inválido no incremental: o owner tolera o parse inválido, conclui com `200` JSON e preserva o estado biométrico facial pré-existente.
- `fp_capturas_json` inválido no full: o owner tolera o parse inválido, conclui com `200` JSON e preserva o estado biométrico digital pré-existente.
- `fp_capturas_json` inválido no incremental: o owner tolera o parse inválido, conclui com `200` JSON e preserva o estado biométrico digital pré-existente.
- `face_capturas_json` válido no full: `200` JSON com `success: true` e `data: { updated: true }`, persistindo `biometrias_facial` com shape normalizado.
- `face_capturas_json` válido no incremental: `200` JSON com `success: true` e `data: { updated: true }`, persistindo `biometrias_facial` com shape normalizado.
- `fp_capturas_json` válido no full: `200` JSON com `success: true` e `data: { updated: true }`, persistindo `biometrias_digitais` com shape normalizado e `idx -> dedo`.
- `fp_capturas_json` válido no incremental: `200` JSON com `success: true` e `data: { updated: true }`, persistindo `biometrias_digitais` com shape normalizado e `idx -> dedo`.
- Array facial normalizado vazio no full: o owner conclui com `200` JSON e faz `unset` silencioso de `biometrias_facial`.
- Array facial normalizado vazio no incremental: o owner conclui com `200` JSON e faz `unset` silencioso de `biometrias_facial`.
- Array digital normalizado vazio no full: o owner conclui com `200` JSON e faz `unset` silencioso de `biometrias_digitais`.
- Array digital normalizado vazio no incremental: o owner conclui com `200` JSON e faz `unset` silencioso de `biometrias_digitais`.
- Erro interno induzido no full: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.
- Erro interno induzido no incremental: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Falha ao atualizar funcionário'`.
- Guardrail de tamanho bruto no full para `face_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `200` e preserva `biometrias_facial` já persistida.
- Guardrail de tamanho bruto no incremental para `face_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `200` e preserva `biometrias_facial` já persistida.
- Guardrail de tamanho bruto no full para `fp_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `200` e preserva `biometrias_digitais` já persistida.
- Guardrail de tamanho bruto no incremental para `fp_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `200` e preserva `biometrias_digitais` já persistida.

## Persistência observada
- A normalização facial observada persiste `hash`, `template_sha256` e `qualidade` numérica quando informados; o cenário congelado não exigiu `imagem`, `template_b64` nem qualquer ramo de Blob.
- A normalização digital observada persiste `hash`, `template_sha256` e converte `idx` válido em `dedo` textual (`0 -> D1`, `4 -> D5`, `9 -> D10`).
- Objetos de captura sem `hash` e sem `imagem` são filtrados; quando o array filtrado fica vazio, o owner não mantém o campo biométrico anterior e faz `unset`.
- Nos cenários de parse inválido e nos guardrails de tamanho bruto, os owners não retornam `400`; o comportamento congelado é ignorar o ramo problemático e concluir o update com `updated: true`.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-biometria-json-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-biometria-json-runtime-contract.test.js`.
- Resultado final congelado: `22` testes passando.

## Observações importantes do runtime
- O submit positivo desta subfase se sustentou sem `req.file`, sem `req.files`, sem multipart e sem abrir qualquer ramo de foto, anexo ou Blob.
- Os logs observáveis do runtime confirmaram os warnings de guardrail de tamanho: `[BIO JSON][update-full] ... excede limite` e `[BIO JSON][incremental] ... excede limite`.
- No incremental, o log de diagnóstico de ops continuou exibindo apenas a chave original de request em `$set` antes do ramo biométrico concluir a normalização; o contrato congelado relevante foi verificado pela persistência final, não por esse snapshot intermediário.
- O envelope de falha interna continua assimétrico entre os owners: full fecha em `Erro interno`, incremental fecha em `Falha ao atualizar funcionário`.

## Decisão final
- Classificação: subfase 1 congelada como guardrail focal seguro.
- Motivo: foi possível congelar o contrato runtime transversal do núcleo biométrico JSON e dos unsets nos dois owners sem tocar produção, sem abrir Blob/`face_imagem` e sem reabrir corredores já fechados.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.