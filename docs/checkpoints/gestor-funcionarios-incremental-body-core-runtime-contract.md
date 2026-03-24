# Checkpoint: PUT /gestor/api/funcionarios/:id/incremental body core

## Escopo
- Subcorredor congelado: núcleo body-only do remanescente de `PUT /gestor/api/funcionarios/:id/incremental`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionarioIncremental`)
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Fronteira congelada
- Esta rodada congela apenas o caminho body-only do owner incremental.
- O recorte inclui: coerção do body, normalização de datas, validações de PIS/PASEP e CPF, normalização de `salario_base`, regra de `pcd='N'`, filtro por schema, proteção de requireds, persistência por `updateFuncionarioByIdWithOps` e envelopes de erro do update.
- O recorte exclui explicitamente: foto, anexos, `dependentes_json`, `beneficios_json`, `face_capturas_json`, `fp_capturas_json` e `face_imagem`.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com update escalar mínimo body-only: `200` JSON com `success: true` e `data: { updated: true }`.
- PIS inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'PIS inválido'` e `campo: 'pis'`.
- CPF inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'CPF inválido'` e `campo: 'cpf'`.
- Duplicidade de CPF na mesma unidade: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'Já existe um funcionário cadastrado com este CPF nesta empresa.'` e `path: 'cpf'`.
- Falha interna induzida no update persistido: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Falha ao atualizar funcionário'`.

## Comportamento observável de limpeza/unset congelado
- Quando o body-only envia `pcd: 'N'`, o owner monta `ops.$set.pcd = 'N'` e `ops.$unset` com `tipo_deficiencia` e `cid`.
- No runtime observado, após o update bem-sucedido, o documento persiste `pcd = 'N'` e não mantém `tipo_deficiencia` nem `cid`.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-incremental-body-core-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-incremental-body-core-runtime-contract.test.js`
- Resultado final congelado: `9` testes passando.

## Observações importantes do runtime
- O recorte body-only não depende de `req.files`; no runtime congelado, `req.files` permaneceu vazio nos cenários exercitados.
- O envelope de erro genérico do update interno preserva `message: 'Falha ao atualizar funcionário'` quando a falha é induzida em `findOneAndUpdate`.
- O comportamento de limpeza com `pcd='N'` foi observado no log de ops como `set: ['pcd']` e `unset: ['tipo_deficiencia', 'cid']` antes da persistência.

## Decisão final
- Classificação: ponto de congelamento local da subfase body core.
- Motivo: foi possível congelar o contrato runtime do núcleo body-only sem tocar nos ramos já fechados e sem abrir coleções JSON ou biometria.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.