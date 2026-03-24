# Checkpoint: POST /gestor/api/funcionarios create biometria json

## Escopo
- Subcorredor congelado: núcleo biométrico JSON do owner `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado: formulário principal em `views/gestor/funcionarios/funcionarios_index.ejs`, com hiddens biométricos em `views/gestor/funcionarios/abas/aba2_cadastros_biometricos.ejs` e envio do formulário em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas a subfase 1 biométrica do create.
- O recorte inclui: persistência biométrica legada no create, guardrails de tamanho bruto para `face_capturas_json` e `fp_capturas_json`, parse/materialização biométrica observável no create e envelope de erro do owner.
- O recorte exclui explicitamente: `face_imagem`, Blob, `mapBiometriasFaciaisToBlob`, save adicional pós-create, foto comum, anexos, `dependentes_json`, `beneficios_json`, PUT full, PUT incremental, GETs e outros endpoints.
- O bloco `autoUser` permaneceu apenas como efeito inevitável do owner no caminho de sucesso, sem expansão de escopo para congelar o contrato inteiro de autoUser.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Sucesso com `face_capturas_json` válido: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Sucesso com `fp_capturas_json` válido: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Sucesso com ambos válidos: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- `face_capturas_json` inválido com parse tolerante: o owner conclui com `201` JSON e mantém `biometrias_facial` como array vazio.
- `fp_capturas_json` inválido com parse tolerante: o owner conclui com `201` JSON e mantém `biometrias_digitais` como array vazio.
- Guardrail de tamanho bruto em `face_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `201` e mantém `biometrias_facial` como array vazio.
- Guardrail de tamanho bruto em `fp_capturas_json`: quando o payload excede `500000`, o owner descarta o campo, conclui com `201` e mantém `biometrias_digitais` como array vazio.
- Array normalizado facial vazio no create: o owner conclui com `201` e o documento criado fica com `biometrias_facial` como array vazio.
- Array normalizado digital vazio no create: o owner conclui com `201` e o documento criado fica com `biometrias_digitais` como array vazio.
- Erro interno induzido no create desse recorte: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada
- Os campos biométricos legados enviados no create foram persistidos no documento criado: `biometrico`, `biometrico_face`, `fp_template_b64`, `fp_template_sha256`, `fp_imagem`, `fp_dedo`, `face_template_b64` e `face_template_sha256`.
- `face_capturas_json` válido materializa `biometrias_facial` com objetos contendo `hash`, `template_sha256`, `qualidade` e `data_captura` gerada pelo runtime.
- No owner atual do create, `fp_capturas_json` não materializou `biometrias_digitais` como acontece nos owners de update já congelados; o documento criado permaneceu com `biometrias_digitais` vazio mesmo quando o payload digital era válido.
- No runtime observado, o documento criado ficou com `biometrias_facial` e `biometrias_digitais` como arrays vazios quando o recorte não materializou capturas válidas.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-biometria-json-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-biometria-json-runtime-contract.test.js`.
- Resultado final congelado: `12` testes passando.

## Observações importantes do runtime
- O submit desta subfase se sustentou sem `req.file`, sem `req.files`, sem multipart adicional e sem abrir foto comum, anexos, `face_imagem` ou Blob.
- Os logs do owner confirmaram os warnings de guardrail de tamanho no create: `[BIO JSON][create] face_capturas_json excede limite` e `[BIO JSON][create] fp_capturas_json excede limite`.
- Há uma assimetria real entre facial e digital no create atual: o owner implementa parse/materialização de `face_capturas_json`, mas não implementa materialização equivalente para `fp_capturas_json` neste recorte relido.
- Diferente dos owners de update já congelados, o create observável desta rodada persistiu arrays vazios em vez de `unset` efetivo quando não houve materialização biométrica válida.
- O caminho de sucesso inevitavelmente disparou `autoUser` e o fluxo de mailer do projeto; esse efeito foi apenas congelado como observável do owner atual, sem ampliar a rodada.

## Decisão final
- Classificação: subfase 1 do create biométrico congelada como guardrail focal seguro.
- Motivo: foi possível congelar o contrato runtime real da persistência biométrica legada, dos guardrails de tamanho e da materialização JSON observável do create sem tocar produção e sem abrir Blob, `face_imagem` ou save pós-create.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.