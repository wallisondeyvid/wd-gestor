# Checkpoint: PUT /gestor/api/funcionarios/:id full body core

## Escopo
- Subcorredor congelado: núcleo body-only de `PUT /gestor/api/funcionarios/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionario`)
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com fallback de envio em `public/gestor/js/pages/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas o caminho body-only do PUT full.
- O recorte inclui: coerção do body, normalização de datas, validações de PIS/PASEP e CPF, normalização de `salario_base`, regra de `pcd='N'`, canonização contextual de `unidade_id`, filtro por schema, proteção de requireds, persistência por `updateFuncionarioByIdWithOps` e envelopes de erro do update.
- O recorte exclui explicitamente: foto, `anexos_existentes`, `anexos_excluidos`, novos anexos, `dependentes_json`, `beneficios_json`, `face_capturas_json`, `fp_capturas_json` e `face_imagem`.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com update escalar mínimo body-only: `200` JSON com `success: true` e `data: { updated: true }`.
- `unidade_id` divergente do contexto no body: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- PIS inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'PIS inválido'` e `campo: 'pis'`.
- CPF inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'CPF inválido'` e `campo: 'cpf'`.
- Duplicidade de CPF na mesma unidade: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'Já existe um funcionário cadastrado com este CPF nesta empresa.'` e `path: 'cpf'`.
- Falha interna induzida no update persistido: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Comportamento observável de limpeza/unset congelado
- Quando o body-only envia `pcd: 'N'`, o owner atual conclui o update com `data.updated === true`.
- No runtime observado, após o update bem-sucedido, o documento persiste `pcd = 'N'` e não mantém `tipo_deficiencia` nem `cid`.

## Persistência observada no sucesso mínimo
- O nome foi atualizado no tenant da unidade ativa contextual.
- `salario_base` enviado como string PT-BR (`1.234,56`) foi persistido como número `1234.56`.
- Os cenários exercitados permaneceram body-only, sem upload de arquivos e sem uso de `req.files`.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-update-full-body-core-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-update-full-body-core-runtime-contract.test.js`
- Resultado final congelado: `10` testes passando.

## Observações importantes do runtime
- Nos cenários exercitados, os logs do owner mostraram `req.file? false`, `req.files` vazio e `anexos bruto length: 0`.
- A divergência relevante desta rodada apareceu apenas no envelope do erro interno induzido: o runtime atual retornou `Erro interno`.
- O caso de duplicidade de CPF no PUT full foi observado como erro `11000` no update persistido, traduzido pelo owner para `400 BAD_REQUEST` com `path: 'cpf'`.

## Decisão final
- Classificação: ponto de congelamento local da subfase full body core.
- Motivo: foi possível congelar o contrato runtime do núcleo body-only do PUT full sem tocar nos ramos proibidos e sem exigir patch de produção.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.