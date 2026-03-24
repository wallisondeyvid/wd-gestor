# Checkpoint: PUT full + incremental biometria face_imagem

## Escopo
- Subcorredor congelado: ramo transversal de `face_imagem` nos owners `PUT /gestor/api/funcionarios/:id` e `PUT /gestor/api/funcionarios/:id/incremental`.
- Owners/runtime relidos: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario`, `updateFuncionarioIncremental`, `parseDataUrl`, `uploadFacePreviewToBlob` e `mapBiometriasFaciaisToBlob`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rotas montadas confirmadas em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado: formulário principal em `views/gestor/funcionarios/funcionarios_index.ejs`, com hidden `face_imagem`, hidratação e limpeza em `public/js/funcionarios/funcionarios_index.js`.
- Consumidor incremental dedicado de `face_imagem` não foi observado no escopo autorizado de `public/gestor/js/modals/funcionario_detalhes.js`; o modal segue focado no ramo de foto comum.

## Fronteira congelada
- Esta rodada congela apenas `face_imagem` e os helpers diretamente ligados ao seu ramo.
- O recorte inclui: `face_imagem`, `parseDataUrl`, `uploadFacePreviewToBlob`, `mapBiometriasFaciaisToBlob`, comportamento observável para data URL válida, não-data-url, Blob indisponível e falha de conversão com degradação silenciosa.
- O recorte exclui explicitamente: `face_capturas_json`, `fp_capturas_json`, `biometrias_facial` persistidas por capturas, `biometrias_digitais`, foto comum, anexos, body core, `dependentes_json`, `beneficios_json`, POST create, patch de produção e refactor.

## Contrato runtime congelado
- PUT full sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT incremental sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- PUT full fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- PUT incremental fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- `face_imagem` não-data-url no full: o owner ignora o ramo de conversão Blob, conclui com `200` JSON e persiste o valor bruto enviado.
- `face_imagem` não-data-url no incremental: o owner ignora o ramo de conversão Blob, conclui com `200` JSON e persiste o valor bruto enviado.
- `face_imagem` data-url válida no full com Blob indisponível: o owner não abre a conversão, conclui com `200` JSON e persiste a própria data URL original.
- `face_imagem` data-url válida no incremental com Blob indisponível: o owner não abre a conversão, conclui com `200` JSON e persiste a própria data URL original.
- Falha induzida na conversão facial do full: o ramo degrada silenciosamente, loga warning em `sharp`, conclui com `200` JSON e mantém `face_imagem` como a data URL original enviada.
- Falha induzida na conversão facial do incremental: o ramo degrada silenciosamente, loga warning em `sharp`, conclui com `200` JSON e mantém `face_imagem` como a data URL original enviada.

## Persistência observada
- Quando `face_imagem` não é data URL, o gate `^data:` não abre; o valor bruto segue até a persistência sem transformação.
- Quando `face_imagem` é data URL válida, mas o ambiente não tem Blob disponível, o gate de Blob bloqueia a conversão e o valor persistido continua sendo a própria data URL.
- Quando a conversão é forçada a entrar no ramo e `sharp` falha com buffer inválido, `uploadFacePreviewToBlob` retorna `null`; o owner não responde erro, não limpa o campo e não converte o valor para URL externa.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-biometria-face-imagem-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-biometria-face-imagem-runtime-contract.test.js`.
- Resultado final congelado: `10` testes passando.

## Observações importantes do runtime
- O ramo de `face_imagem` em full e incremental só tenta conversão quando há Blob disponível, `ops.$set.face_imagem` é string e o valor começa com `data:`.
- `parseDataUrl` retorna `null` para valores fora do formato data URL e não levanta erro observável para o request.
- No cenário de falha induzida, o log observável foi `[BIO FACE] sharp falhou: Input buffer contains unsupported image format`; ainda assim o request concluiu com `updated: true`.
- O submit dessa subfase continuou sem `req.file`, sem `req.files`, sem multipart adicional e sem abrir os ramos de foto comum, anexos ou biometria JSON.
- O envelope de sucesso ficou simétrico entre os owners nesse ramo: `200` com `success: true` e `data: { updated: true }`.

## Decisão final
- Classificação: subfase 2 congelada como guardrail focal seguro.
- Motivo: foi possível congelar o contrato runtime do ramo `face_imagem` e da degradação silenciosa ligada a Blob/conversão facial sem tocar produção e sem reabrir os corredores excluídos.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.